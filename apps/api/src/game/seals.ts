// Les sceaux de cire (R19, plan, choix 8) : évalués après chaque entrée payée du grand livre, dans la
// transaction du geste (after-award.ts). Un sceau se gagne une fois (clé primaire `(member_id,
// code)` de la table `seal`) et reste, même si la modération retire ensuite le contenu qui l'a fait
// gagner : on ne le recalcule jamais à la baisse. Les règles (premières fois, paliers, semaines
// butinées, ruche de 5, catégories) vivent dans le contrat (`MILESTONE_SEALS`, `CATEGORY_SEAL_TARGET`).
//
// Seules les entrées non révoquées comptent : un contenu déjà retiré ne fait gagner aucun sceau. Les
// entrées du rattrapage (`backfill`) comptent pour les paliers, pas pour les semaines butinées (les
// séries partent de zéro au lancement, comme `loadForagedWeeks`).
import {
  CATEGORY_SEAL_TARGET,
  type Gesture,
  type LedgerGesture,
  MILESTONE_SEALS,
  OTHER_CATEGORY,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, count, countDistinct, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { AwardedEntry } from './after-award'
import type { Tx } from './award'
import { writeNotices } from './notices'
import { isForaging, loadForagedWeeks } from './weeks'

const p = schema.pollenEntry
const s = schema.seal

/** Les gestes dont un projet testé ou commenté compte pour le sceau de sa catégorie. */
const CATEGORY_GESTURES = ['tester', 'comment'] as const satisfies readonly Gesture[]

/** Les gestes d'une ruche : un membre qui crée, invite ou rejoint peut faire passer une ruche à 5. */
const HIVE_GESTURES: readonly LedgerGesture[] = [
  'hive_created',
  'invitation_accepted',
  'invitation_joined',
]

/**
 * Pose ces sceaux à ces membres, s'ils ne les ont pas encore, et écrit l'avis « Nouveau sceau » de
 * chacun gagné ici. « on conflict do nothing » sur la clé primaire : un sceau déjà là n'est ni
 * réécrit ni redaté, et deux gestes simultanés ne l'annoncent qu'une fois (`returning` ne rend que
 * les lignes écrites). Rend les sceaux gagnés. R20 : aussi le sceau des Éclaireuses, donné à
 * l'entrée (scouts/join.ts), qui ne se calcule pas.
 */
export const grantSeals = async (
  tx: Tx,
  grants: readonly { memberId: string; code: string }[],
  now: Date,
) => {
  if (grants.length === 0) return []
  const earned = await tx
    .insert(s)
    .values(grants.map((grant) => ({ ...grant, earnedAt: now })))
    .onConflictDoNothing()
    .returning({ memberId: s.memberId, code: s.code })
  await writeNotices(
    tx,
    earned.map((row) => ({ memberId: row.memberId, notice: { kind: 'seal', code: row.code } })),
    now,
  )
  return earned
}

/**
 * Le sceau de catégorie que ce geste peut faire gagner : la catégorie principale du projet testé ou
 * commenté (jamais « Autre », ni la seconde catégorie), une fois 3 projets différents de cette
 * catégorie testés ou commentés. Une requête : les entrées « testeur » et « commentaire » non
 * révoquées du membre (index `pollen_entry_once_idx`, (member_id, gesture, …), lu par ses deux
 * premières colonnes), jointes à leur projet par sa clé primaire ; `count(distinct …)` compte les
 * projets, pas les gestes (deux commentaires sur la même soupe n'en font qu'un).
 */
const categorySeal = async (tx: Tx, entry: AwardedEntry): Promise<string | null> => {
  if (!(CATEGORY_GESTURES as readonly string[]).includes(entry.gesture) || !entry.projectId) {
    return null
  }
  const [target] = await tx
    .select({ category: schema.project.primaryCategory })
    .from(schema.project)
    .where(eq(schema.project.id, entry.projectId))
  const category = target?.category ?? null
  if (category === null || category === OTHER_CATEGORY) return null
  const [row] = await tx
    .select({ projects: countDistinct(p.projectId) })
    .from(p)
    .innerJoin(schema.project, eq(schema.project.id, p.projectId))
    .where(
      and(
        eq(p.memberId, entry.memberId),
        inArray(p.gesture, [...CATEGORY_GESTURES]),
        isNull(p.revokedAt),
        eq(schema.project.primaryCategory, category),
      ),
    )
  return (row?.projects ?? 0) >= CATEGORY_SEAL_TARGET ? category : null
}

const Creators = z.object({ rows: z.array(z.object({ creator: z.string() })) })

/**
 * Les créateurs qui gagnent « Une ruche de 5 » avec ce geste de ruche : ceux des ruches de ce
 * membre qui comptent maintenant 5 membres au moins, créateur compris (et toujours membre), et qui
 * ne sont pas des comptes d'exemple. Le sceau va au créateur même quand un autre a invité le
 * cinquième : c'est l'entrée de l'invité (ou de l'inviteur) qui le déclenche. Index : les ruches du
 * membre par `hive_member_user_idx`, puis la clé primaire de `hive_member` (hive_id, user_id) pour
 * compter et pour le créateur, celle d'`example_account`.
 */
const hiveSizeWinners = async (tx: Tx, memberId: string, target: number) => {
  const result = Creators.parse(
    await tx.execute(sql`
      select h.created_by as creator
      from hive_member mine
      join hive h on h.id = mine.hive_id
      where mine.user_id = ${memberId} and h.created_by is not null
        and (select 1 from hive_member c
             where c.hive_id = h.id and c.user_id = h.created_by limit 1) is not null
        and (select 1 from example_account e where e.user_id = h.created_by limit 1) is null
        and (select count(*) from hive_member all_members where all_members.hive_id = h.id) >= ${target}
    `),
  )
  return [...new Set(result.rows.map((row) => row.creator))]
}

/**
 * Évalue les sceaux que cette entrée peut faire gagner, et les pose (avec leur avis). Seuls les
 * sceaux touchés par le geste sont lus : une première fois ou un palier de ce geste, les semaines
 * butinées après un geste qui aide, la ruche de 5 après un geste de ruche, la catégorie après un
 * test ou un commentaire. Les sceaux déjà gagnés sont lus d'abord (clé primaire de `seal`) pour ne
 * rien recompter. Rend les sceaux gagnés.
 */
export const evaluateSeals = async (tx: Tx, entry: AwardedEntry) => {
  const { memberId, gesture, now } = entry
  const owned = new Set(
    (await tx.select({ code: s.code }).from(s).where(eq(s.memberId, memberId))).map(
      (row) => row.code,
    ),
  )
  const grants: { memberId: string; code: string }[] = []

  // Les premières fois et les paliers d'un geste (« Premier envol », « 10 projets testés ») : le
  // nombre de ses entrées non révoquées, par `pollen_entry_once_idx` (member_id, gesture, …).
  const counted = MILESTONE_SEALS.flatMap((seal) =>
    seal.rule.kind === 'count' && seal.rule.gesture === gesture && !owned.has(seal.code)
      ? [{ code: seal.code, target: seal.rule.target }]
      : [],
  )
  if (counted.length > 0) {
    const [row] = await tx
      .select({ n: count() })
      .from(p)
      .where(and(eq(p.memberId, memberId), eq(p.gesture, gesture), isNull(p.revokedAt)))
    const n = row?.n ?? 0
    for (const seal of counted) if (n >= seal.target) grants.push({ memberId, code: seal.code })
  }

  // Les semaines butinées (« 10 semaines butinées ») : le compte de « Ma récolte », pauses comprises.
  const weekly = MILESTONE_SEALS.flatMap((seal) =>
    seal.rule.kind === 'weeks' && !owned.has(seal.code)
      ? [{ code: seal.code, target: seal.rule.target }]
      : [],
  )
  if (isForaging(gesture) && weekly.length > 0) {
    const { count: weeks } = await loadForagedWeeks(tx, memberId, now)
    for (const seal of weekly) if (weeks >= seal.target) grants.push({ memberId, code: seal.code })
  }

  // « Une ruche de 5 » : pour le créateur de la ruche, qui n'est pas toujours celui qui gagne ici.
  if (HIVE_GESTURES.includes(gesture)) {
    for (const seal of MILESTONE_SEALS) {
      if (seal.rule.kind !== 'hiveSize') continue
      for (const creator of await hiveSizeWinners(tx, memberId, seal.rule.target)) {
        if (creator !== memberId || !owned.has(seal.code))
          grants.push({ memberId: creator, code: seal.code })
      }
    }
  }

  const category = await categorySeal(tx, entry)
  if (category !== null && !owned.has(category)) grants.push({ memberId, code: category })

  return grantSeals(tx, grants, now)
}
