// L'attribution du pollen (R19, plan, choix 2) : le seul fichier de l'API qui écrit le grand livre
// `pollen_entry` et pose l'en-tête `Waiggle-Pollen` (game.static.test.ts le vérifie). Chaque route
// de geste (réagir, commenter, devenir testeur…) appelle `award` dans sa transaction, puis
// `setPollen` sur sa réponse ; la modération appelle `revokeFor` et `restoreFor` ; la purge de nuit,
// `clearCounterparts`. Ainsi un plafond, le verrou ou la règle des comptes d'exemple ne peuvent pas
// être oubliés par une route : ils sont ici, une fois.
import { randomUUID } from 'node:crypto'
import {
  CHALLENGE_POLLEN,
  dayOf,
  type Family,
  GESTURES,
  type Gesture,
  type LedgerGesture,
  POLLEN_GESTURES,
  POLLEN_HEADER,
  type PollenSourceKind,
  RECEIVE_DAILY_CAP,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNotNull, isNull, lt, or, type SQL, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { z } from 'zod'
import { activeSuspensionSql } from '../suspension/load'
import { afterAward } from './after-award'
import { creditForagedWeek, isForaging, weekShift } from './weeks'

/** Une transaction de Drizzle : le même objet que `db`, mais dont tout se valide ou s'annule ensemble. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const p = schema.pollenEntry

/** Les gestes reçus (`receive_*`), comptés ensemble dans le plafond de 50 par jour. */
const RECEIVED_GESTURES = GESTURES.filter((gesture) => POLLEN_GESTURES[gesture].receive)

/** Ce qui a rapporté une entrée, et « la chose » qui ne paie qu'une fois. */
type AwardSource = {
  /** Le membre qui gagne. */
  memberId: string
  /**
   * Ce qui a rapporté. Une réception porte la même source que le geste qui l'a fait recevoir (le
   * commentaire, la réaction, le message de retour) : retirer le contenu révoque les deux.
   */
  sourceKind: PollenSourceKind
  sourceId: string
  /**
   * La chose payée une seule fois pour ce membre et ce geste (index unique `pollen_entry_once_idx`) :
   * `<projet>:<sorte>` pour une réaction, `<fil>:<jour de Paris>` pour un retour, `photo` pour le
   * profil… Un geste défait puis refait retrouve la même clé et ne rapporte rien.
   */
  sourceKey: string
  /**
   * L'autre membre du geste : l'auteur du projet pour qui agit, qui agit pour l'auteur qui reçoit.
   * S'il est un compte d'exemple, personne ne gagne rien. Jamais sa suspension (relecture S2).
   */
  counterpartId?: string | null
  /** Le projet où le geste a lieu : un projet retiré révoque ce que son auteur y a reçu. */
  projectId?: string | null
  /** L'heure du geste, celle de l'API (jamais `now()` de SQL) : son jour et sa semaine de Paris. */
  now: Date
}

/**
 * Ce que `award` reçoit : un geste du tableau du scénario, ou `challenge`, le pollen d'un défi perso
 * réussi (20, hors plafonds), qui prend la famille du geste du défi.
 */
export type AwardInput = AwardSource &
  ({ gesture: Gesture } | { gesture: 'challenge'; family: Family })

/**
 * Prend le verrou de jeu de ces membres jusqu'à la fin de la transaction (relecture de sécurité
 * S1). Deux gestes du même membre en même temps passent l'un après l'autre : le second compte le
 * plafond après l'écriture du premier, et deux réactions simultanées au plafond n'en paient qu'une.
 *
 * `pg_advisory_xact_lock(n)` verrouille un nombre (pas une ligne) jusqu'à la fin de la transaction ;
 * `hashtextextended('game:<id>', 0)` change l'identifiant en ce nombre. Les identifiants sont triés :
 * si Léa réagit chez Max pendant que Max réagit chez Léa, les deux transactions demandent les
 * verrous dans le même ordre, et l'une attend l'autre au lieu de s'interbloquer. Un verrou déjà pris
 * par la transaction se reprend sans attendre : `award` peut être appelé deux fois (qui agit, puis
 * qui reçoit). Toujours pris après les verrous de la route (paire, projet, ruche, invitation).
 */
export const lockMembers = async (tx: Tx, memberIds: readonly string[]) => {
  for (const id of [...new Set(memberIds)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`game:${id}`}, 0))`)
  }
}

/** La ligne lue par `award` avant d'écrire : les deux comptes, puis les compteurs du jour. */
const AccountState = z.object({
  rows: z.array(
    z.object({
      member_example: z.boolean(),
      counterpart_example: z.boolean(),
      suspended: z.boolean(),
    }),
  ),
})
const DayState = z.object({ gesture_count: z.number(), received: z.number() })

/**
 * Attribue le pollen d'un geste, dans la transaction du geste ; rend le pollen gagné (0 si rien).
 * Refuse sans erreur :
 * - un compte d'exemple, qu'il soit le membre ou l'autre membre (« ne fait gagner personne ») ;
 * - un membre suspendu (le passé reste, choix 9) ;
 * - le plafond du jour de ce geste atteint (compté dans le grand livre, jour de Paris) ;
 * - pour une réception, le plafond commun de 50 par jour, dépassé par ce montant (50 tout juste
 *   passe ; une réception qui dépasserait n'est pas payée, même en partie) ;
 * - une chose déjà payée (même membre, geste et clé), même si l'entrée a été révoquée depuis.
 * Puis, dans la même transaction : le miel de la semaine butinée (weeks.ts) et les suites de
 * l'entrée (after-award.ts : défis, sceaux, niveau).
 */
export const award = async (tx: Tx, input: AwardInput): Promise<number> => {
  const { memberId, now } = input
  const counterpartId = input.counterpartId ?? null

  // Une requête pour les deux comptes. `exists (…)` s'arrête à la première ligne : la clé primaire
  // d'`example_account`, et pour la suspension l'index partiel `account_suspension_open_idx`
  // (« user_id where lifted_at is null »), dont la condition est contenue dans celle-ci. Les
  // identifiants entrent en paramètres liés ; `sql.raw` ne reçoit que l'alias écrit ici.
  const state = AccountState.parse(
    await tx.execute(sql`
      select
        exists (select 1 from ${schema.exampleAccount} e where e.user_id = ${memberId}) as member_example,
        (${counterpartId}::text is not null and exists (
          select 1 from ${schema.exampleAccount} e where e.user_id = ${counterpartId}
        )) as counterpart_example,
        exists (
          select 1 from ${schema.accountSuspension} s
          where s.user_id = ${memberId} and ${activeSuspensionSql('s', now)}
        ) as suspended
    `),
  ).rows[0]
  if (!state || state.member_example || state.counterpart_example || state.suspended) return 0

  await lockMembers(tx, counterpartId === null ? [memberId] : [memberId, counterpartId])

  const gesture: LedgerGesture = input.gesture
  const rule = input.gesture === 'challenge' ? null : POLLEN_GESTURES[input.gesture]
  const family = input.gesture === 'challenge' ? input.family : (rule?.family ?? 'forager')
  const amount = rule?.amount ?? CHALLENGE_POLLEN
  const day = dayOf(now)
  const week = weekOf(now)

  if (rule && (rule.dailyCap !== null || rule.receive)) {
    // Les compteurs du jour, en une requête par l'index `pollen_entry_member_day_idx` (member_id,
    // day) : quelques dizaines de lignes au plus. `filter (where …)` restreint un agrégat à une
    // partie des lignes : le nombre d'entrées de ce geste, et la somme de tout ce qui a été reçu.
    // Les entrées révoquées comptent : un contenu retiré ne rend pas la place du jour.
    const [today] = await tx
      .select({
        gesture_count: sql<number>`count(*) filter (where ${p.gesture} = ${gesture})`.mapWith(
          Number,
        ),
        received:
          sql<number>`coalesce(sum(${p.amount}) filter (where ${inArray(p.gesture, RECEIVED_GESTURES)}), 0)`.mapWith(
            Number,
          ),
      })
      .from(p)
      .where(and(eq(p.memberId, memberId), eq(p.day, day)))
    const counters = DayState.parse(today ?? { gesture_count: 0, received: 0 })
    if (rule.dailyCap !== null && counters.gesture_count >= rule.dailyCap) return 0
    if (rule.receive && counters.received + amount > RECEIVE_DAILY_CAP) return 0
  }

  // « on conflict do nothing » : si l'index unique `pollen_entry_once_idx` trouve déjà cette
  // chose pour ce membre et ce geste, rien n'est écrit, sans erreur ni transaction abandonnée ;
  // `returning` ne rend alors aucune ligne.
  const id = randomUUID()
  const sourceKey = input.sourceKey
  const projectId = input.projectId ?? null
  const written = await tx
    .insert(p)
    .values({
      id,
      memberId,
      gesture,
      family,
      amount,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      sourceKey,
      counterpartId,
      projectId,
      day,
      week,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: p.id })
  if (written.length === 0) return 0

  if (isForaging(gesture)) await creditForagedWeek(tx, memberId, week, now)
  await afterAward(tx, {
    id,
    memberId,
    gesture,
    family,
    amount,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceKey,
    counterpartId,
    projectId,
    day,
    week,
    now,
  })
  return amount
}

/**
 * Pose l'en-tête `Waiggle-Pollen: <n>` sur la réponse d'un geste qui a rapporté (choix 5) ; rien
 * pour 0 : l'appli n'affiche alors aucun « +pollen ». À appeler après la transaction, avec le
 * pollen gagné par le membre qui fait la demande (jamais celui reçu par l'autre).
 */
export const setPollen = (c: Context, amount: number) => {
  if (Number.isInteger(amount) && amount > 0) c.header(POLLEN_HEADER, String(amount))
}

/** Les gestes du profil, un par partie que la modération peut retirer. */
const PROFILE_GESTURES = {
  avatar: 'profile_photo',
  bio: 'profile_bio',
  favoriteTools: 'profile_tool',
} as const satisfies Record<string, Gesture>

/**
 * Le contenu qu'un retrait de modération vise (choix 9 et relecture S5) :
 * - un contenu (`comment`, `update`, `tester_message`…) : les entrées dont il est la source, celles
 *   de son auteur et ce que l'auteur du projet a reçu à cause de lui ;
 * - un projet : sa publication et ce que son auteur y a reçu, jamais le pollen des autres (leurs
 *   réactions, commentaires, retours et suivis restent les leurs) ;
 * - une partie d'un profil (photo, bio, outils) : le pollen de cette partie.
 */
export type PollenSource =
  | { kind: Exclude<PollenSourceKind, 'project' | 'profile'>; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'profile'; memberId: string; part: keyof typeof PROFILE_GESTURES }

/**
 * La condition SQL des entrées d'un contenu. Index : `pollen_entry_source_idx` (source_kind,
 * source_id) pour un contenu et un profil ; pour un projet, `pollen_entry_project_idx` (les
 * réceptions) et le même index de source (la publication), combinés par PostgreSQL (« BitmapOr »).
 */
const entriesOf = (source: PollenSource): SQL | undefined => {
  switch (source.kind) {
    case 'project':
      return or(
        and(eq(p.sourceKind, 'project'), eq(p.sourceId, source.id), eq(p.gesture, 'publish')),
        and(eq(p.projectId, source.id), inArray(p.gesture, RECEIVED_GESTURES)),
      )
    case 'profile':
      return and(
        eq(p.sourceKind, 'profile'),
        eq(p.sourceId, source.memberId),
        eq(p.gesture, PROFILE_GESTURES[source.part]),
      )
    default:
      return and(eq(p.sourceKind, source.kind), eq(p.sourceId, source.id))
  }
}

/**
 * Révoque le pollen d'un contenu retiré par la modération, dans la transaction du retrait : les
 * entrées restent (le passé ne s'efface pas), mais ne comptent plus (`revoked_at`). Le niveau peut
 * donc baisser (relecture juridique J5). Un sceau déjà gagné reste. Rend le nombre d'entrées
 * révoquées.
 */
export const revokeFor = async (tx: Tx, source: PollenSource, now: Date) => {
  const revoked = await tx
    .update(p)
    .set({ revokedAt: now })
    .where(and(entriesOf(source), isNull(p.revokedAt)))
    .returning({ id: p.id })
  return revoked.length
}

/**
 * Rend le pollen d'un contenu rétabli par la modération (« restore »). Limite connue : une
 * réception révoquée à la fois par le retrait de son commentaire et par celui de son projet revient
 * dès que l'un des deux est rétabli.
 */
export const restoreFor = async (tx: Tx, source: PollenSource) => {
  const restored = await tx
    .update(p)
    .set({ revokedAt: null })
    .where(and(entriesOf(source), isNotNull(p.revokedAt)))
    .returning({ id: p.id })
  return restored.length
}

/**
 * La purge de nuit (relecture juridique J3) : l'autre membre d'un geste s'efface du grand livre une
 * fois la semaine suivante finie (les entrées de la semaine W le perdent le lundi de W+2). La ligne
 * reste, avec son pollen. Index : `pollen_entry_counterpart_week_idx`, partiel sur les lignes qui
 * ont encore un autre membre, rangé par semaine. Rend le nombre d'entrées changées.
 */
export const clearCounterparts = async (db: Pick<Database, 'update'>, now: Date) => {
  const cleared = await db
    .update(p)
    .set({ counterpartId: null })
    .where(and(isNotNull(p.counterpartId), lt(p.week, weekShift(weekOf(now), -1))))
    .returning({ id: p.id })
  return cleared.length
}
