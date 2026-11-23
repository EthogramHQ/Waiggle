// Les défis de la semaine (R19, plan, choix 7) : le défi perso (trois proposés chaque lundi, un
// choisi ou « Pas cette semaine ») et le défi de ruche (un par semaine pour une ruche de 3 membres
// au moins). Aucune tâche planifiée : un défi naît à la première lecture de sa semaine (« Ma
// récolte », la page de la ruche), tiré par `challengeFor` du contrat, toujours le même pour un
// membre (ou une ruche) et une semaine ; il est gardé en base dès cette lecture, pour qu'un
// changement de la liste ne change pas une semaine commencée. Le lundi suivant, une autre ligne naît ;
// l'ancienne n'est plus lue (la purge de nuit l'efface ensuite).
//
// L'avancée se calcule à la lecture, depuis le grand livre de la semaine (`pollen_entry`) : seules
// les entrées payées et non révoquées comptent, et pour le défi perso celles d'après son choix
// (`chosen_at`). Un geste plafonné n'écrit pas d'entrée, il ne compte donc pas. La réussite, elle, est notée une fois (`completed_at`), dans la transaction du geste
// (after-award.ts) : 10 miel et 20 pollen pour le défi perso, 10 miel à chaque participant et un avis
// à chaque membre pour le défi de ruche.
import { randomUUID } from 'node:crypto'
import {
  type ChallengeDefinition,
  challengeFor,
  familyOf,
  HIVE_CHALLENGE_MIN_MEMBERS,
  HIVE_CHALLENGES,
  type HiveChallenge,
  HiveChallengeCode,
  HONEY,
  OFFERED_CHALLENGES,
  PERSONAL_CHALLENGES,
  PersonalChallengeCode,
  type PersonalChallengeState,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, count, countDistinct, eq, gte, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { AwardedEntry } from './after-award'
import { award, lockMembers, type Tx } from './award'
import { writeNotices } from './notices'

const p = schema.pollenEntry
const pc = schema.personalChallenge
const hc = schema.hiveChallenge
const hm = schema.hiveMember

/** Une base qui lit et écrit : la base elle-même, ou une transaction. */
type Writer = Pick<Database, 'select' | 'insert' | 'execute'>

/** Les définitions par code (le geste compté, la cible). */
const PERSONAL_BY_CODE = new Map<string, ChallengeDefinition>(
  PERSONAL_CHALLENGES.map((challenge) => [challenge.code, challenge]),
)
const HIVE_BY_CODE = new Map<string, ChallengeDefinition>(
  HIVE_CHALLENGES.map((challenge) => [challenge.code, challenge]),
)

/** La clé du miel et du pollen d'un défi perso réussi : une fois par membre et par semaine. */
const personalKey = (week: string) => `challenge:${week}`
/** La clé du miel d'un défi de ruche réussi : une fois par membre, ruche et semaine. */
const hiveKey = (hiveId: string, week: string) => `hive:${hiveId}:${week}`

// ─── Le défi perso ────────────────────────────────────────────────────────────────────────────────

/** Les trois défis proposés à ce membre cette semaine, dans l'ordre du tirage. */
export const offeredChallenges = (memberId: string, week: string) =>
  challengeFor(memberId, week, PERSONAL_CHALLENGES)
    .slice(0, OFFERED_CHALLENGES)
    .map((challenge) => challenge.code)

/**
 * La ligne du défi perso de la semaine, créée à la première lecture. « on conflict do nothing » sur
 * la clé primaire (member_id, week) : deux lectures simultanées n'en tirent qu'un, sans erreur.
 * Puis la ligne, par la même clé primaire.
 */
const personalRowOf = async (db: Writer, memberId: string, now: Date, forUpdate = false) => {
  const week = weekOf(now)
  await db
    .insert(pc)
    .values({ memberId, week, offered: offeredChallenges(memberId, week), createdAt: now })
    .onConflictDoNothing()
  const query = db
    .select()
    .from(pc)
    .where(and(eq(pc.memberId, memberId), eq(pc.week, week)))
  // « for update » verrouille la ligne jusqu'à la fin de la transaction : un second choix
  // simultané attend le premier, puis voit le défi déjà choisi.
  const [row] = forUpdate ? await query.for('update') : await query
  return row
}

/**
 * L'avancée d'un défi perso : les entrées de la semaine du geste compté (index
 * `pollen_entry_member_week_idx`, (member_id, week)). « Réagis à 5 projets » compte des projets
 * différents (`count(distinct project_id)`) ; « de tes proches » ne garde que les gestes sur le
 * projet d'un membre suivi (l'autre membre de l'entrée, l'auteur du projet ; clé primaire de
 * `member_follow`, (follower_id, member_id)). Seuls comptent les gestes faits depuis le choix
 * (`created_at >= chosen_at`, décision du 23/11) : un défi choisi jeudi ne compte pas ceux de lundi,
 * et choisir un défi déjà fait ne le réussit pas. L'index lit les entrées de la semaine du membre
 * (quelques dizaines), la condition sur l'heure les trie ensuite. `chosenAt` null (une ligne écrite
 * sans heure, jamais par l'API) : toute la semaine, comme avant la décision.
 */
const personalProgress = async (
  db: Pick<Database, 'select'>,
  memberId: string,
  challenge: ChallengeDefinition,
  week: string,
  chosenAt: Date | null,
) => {
  const followed = db
    .select({ id: schema.memberFollow.memberId })
    .from(schema.memberFollow)
    .where(eq(schema.memberFollow.followerId, memberId))
  const [row] = await db
    .select({ n: challenge.distinctProjects ? countDistinct(p.projectId) : count() })
    .from(p)
    .where(
      and(
        eq(p.memberId, memberId),
        eq(p.week, week),
        eq(p.gesture, challenge.gesture),
        isNull(p.revokedAt),
        chosenAt === null ? undefined : gte(p.createdAt, chosenAt),
        challenge.followedAuthors ? inArray(p.counterpartId, followed) : undefined,
      ),
    )
  return row?.n ?? 0
}

/**
 * Le défi perso de la semaine, pour « Ma récolte » (`Harvest.personalChallenge`) : créé à la
 * première lecture. Trois requêtes au plus : la création, la ligne, l'avancée d'un défi en cours.
 */
export const personalChallengeOf = async (
  db: Writer,
  memberId: string,
  now: Date,
): Promise<PersonalChallengeState> => {
  const row = await personalRowOf(db, memberId, now)
  const offered = z
    .array(PersonalChallengeCode)
    .parse(row?.offered ?? offeredChallenges(memberId, weekOf(now)))
  if (!row || row.chosen === null) return { state: 'choose', offered }
  if (row.chosen === 'none') return { state: 'none', offered }
  const code = PersonalChallengeCode.parse(row.chosen)
  if (row.completedAt !== null) return { state: 'done', code }
  const challenge = PERSONAL_BY_CODE.get(code)
  if (!challenge) return { state: 'choose', offered }
  const progress = await personalProgress(db, memberId, challenge, row.week, row.chosenAt)
  return {
    state: 'active',
    code,
    progress: Math.min(progress, challenge.target),
    target: challenge.target,
  }
}

/**
 * Note le défi perso réussi s'il est choisi, en cours, et atteint : 10 miel et 20 pollen (geste
 * `challenge`, famille du geste du défi, hors plafonds), une fois. « update … where completed_at is
 * null returning » ne rend la ligne qu'à la transaction qui la change : le défi ne paie qu'une fois.
 * Appelé sous le verrou de jeu du membre (après un geste, ou après un choix). `gesture` : le geste qui
 * vient d'être payé ; un autre geste ne fait pas avancer ce défi.
 */
const settlePersonal = async (
  tx: Tx,
  memberId: string,
  week: string,
  now: Date,
  gesture?: string,
) => {
  const [row] = await tx
    .select({ chosen: pc.chosen, chosenAt: pc.chosenAt, completedAt: pc.completedAt })
    .from(pc)
    .where(and(eq(pc.memberId, memberId), eq(pc.week, week)))
  if (!row || row.completedAt !== null || row.chosen === null) return
  const challenge = PERSONAL_BY_CODE.get(row.chosen)
  if (!challenge || (gesture !== undefined && challenge.gesture !== gesture)) return
  const progress = await personalProgress(tx, memberId, challenge, week, row.chosenAt)
  if (progress < challenge.target) return
  const done = await tx
    .update(pc)
    .set({ completedAt: now })
    .where(and(eq(pc.memberId, memberId), eq(pc.week, week), isNull(pc.completedAt)))
    .returning({ week: pc.week })
  if (done.length === 0) return
  await tx
    .insert(schema.honeyEntry)
    .values({
      id: randomUUID(),
      memberId,
      amount: HONEY.challenge,
      reason: 'challenge',
      sourceKey: personalKey(week),
      createdAt: now,
    })
    .onConflictDoNothing()
  await award(tx, {
    memberId,
    gesture: 'challenge',
    family: familyOf(challenge.gesture),
    sourceKind: 'personal_challenge',
    sourceId: week,
    sourceKey: personalKey(week),
    now,
  })
}

/**
 * Choisit le défi perso de la semaine (`PATCH /v1/me/game`, `personalChallenge`), dans la
 * transaction de la route. Rend `'invalid_challenge'` (422) pour un code hors des trois proposés,
 * ou un second choix de la semaine (« Pas cette semaine » compris, une fois un défi choisi) ; null
 * sinon. « Pas cette semaine » se défait en choisissant un des trois ; le redire ne change rien.
 * Le choix d'un défi note son heure (`chosen_at`) : il ne compte que les gestes faits depuis
 * (décision du 23/11). « Pas cette semaine » la laisse à null : rien n'est compté, et un défi choisi
 * ensuite part de l'heure de ce second choix.
 *
 * Le verrou de jeu du membre d'abord, puis la ligne : le même ordre que les gestes (award prend le
 * verrou, puis after-award lit la ligne), pour que les deux ne s'attendent jamais l'un l'autre.
 */
export const choosePersonalChallenge = async (
  tx: Tx,
  memberId: string,
  choice: PersonalChallengeCode | 'none',
  now: Date,
): Promise<'invalid_challenge' | null> => {
  await lockMembers(tx, [memberId])
  const row = await personalRowOf(tx, memberId, now, true)
  if (!row) return 'invalid_challenge'
  if (row.chosen !== null && row.chosen !== 'none') return 'invalid_challenge'
  if (choice !== 'none' && !row.offered.includes(choice)) return 'invalid_challenge'
  await tx
    .update(pc)
    .set({ chosen: choice, chosenAt: choice === 'none' ? null : now })
    .where(and(eq(pc.memberId, memberId), eq(pc.week, row.week)))
  // Un geste de la même milliseconde que le choix compte (« depuis », bornes comprises) : sans ce
  // dernier compte, un tel geste, payé avant que le défi soit choisi, ne le réussirait jamais.
  if (choice !== 'none') await settlePersonal(tx, memberId, row.week, now)
  return null
}

// ─── Le défi de ruche ─────────────────────────────────────────────────────────────────────────────

/** Le défi tiré pour cette ruche cette semaine : le premier de la liste mélangée. */
const drawnFor = (hiveId: string, week: string) => {
  const [drawn] = challengeFor(hiveId, week, HIVE_CHALLENGES)
  if (!drawn) throw new Error('the list of hive challenges is empty')
  return drawn
}

/**
 * « Le geste compté par le défi de cette ligne », en SQL : un `case` qui traduit chaque code de la
 * liste du contrat en son geste. Codes et gestes entrent en paramètres liés.
 */
const gestureOfCode = (column: SQL): SQL =>
  sql`(case ${column} ${sql.join(
    HIVE_CHALLENGES.map((challenge) => sql`when ${challenge.code} then ${challenge.gesture}`),
    sql` `,
  )} end)`

const ProgressRows = z.object({
  rows: z.array(
    z.object({
      hive_id: z.string(),
      progress: z.number(),
      participants: z.array(z.string()).nullable(),
    }),
  ),
})

/**
 * L'avancée des défis de ces ruches pour la semaine, et qui y a participé, en une requête. Un geste
 * compte quand son auteur et celui du projet sont membres de la ruche (aujourd'hui) : on part des
 * membres (clé primaire de `hive_member`, lue par hive_id), puis leurs entrées de la semaine
 * (`pollen_entry_member_week_idx`), du geste du défi, non révoquées ; le projet par sa clé
 * primaire, et son auteur dans la ruche par la clé primaire de `hive_member`. Participant : l'auteur
 * d'au moins un geste compté (l'auteur du projet qui le reçoit ne participe pas par là).
 */
const hiveProgress = async (
  db: Pick<Database, 'execute'>,
  hiveIds: readonly string[],
  week: string,
) => {
  const progress = new Map<string, { progress: number; participants: string[] }>()
  if (hiveIds.length === 0) return progress
  const result = ProgressRows.parse(
    await db.execute(sql`
      select c.hive_id, count(e.id)::int as progress,
        array_agg(distinct e.member_id) as participants
      from hive_challenge c
      join hive_member actor on actor.hive_id = c.hive_id
      join pollen_entry e on e.member_id = actor.user_id and e.week = c.week
        and e.gesture = ${gestureOfCode(sql.raw('c.code'))} and e.revoked_at is null
      join project pr on pr.id = e.project_id
      where c.hive_id in (${sql.join(
        hiveIds.map((id) => sql`${id}`),
        sql`, `,
      )}) and c.week = ${week}
        and (select 1 from hive_member author
             where author.hive_id = c.hive_id and author.user_id = pr.author_id limit 1) is not null
      group by c.hive_id
    `),
  )
  for (const row of result.rows) {
    progress.set(row.hive_id, { progress: row.progress, participants: row.participants ?? [] })
  }
  return progress
}

/**
 * Les ruches de cette liste qui ont 3 membres au moins aujourd'hui : une requête groupée par la clé
 * primaire de `hive_member` (hive_id, …), lue par son début.
 */
const eligibleHives = async (db: Pick<Database, 'select'>, hiveIds: readonly string[]) => {
  if (hiveIds.length === 0) return []
  const rows = await db
    .select({ hiveId: hm.hiveId, n: count() })
    .from(hm)
    .where(inArray(hm.hiveId, [...hiveIds]))
    .groupBy(hm.hiveId)
  return rows.filter((row) => row.n >= HIVE_CHALLENGE_MIN_MEMBERS).map((row) => row.hiveId)
}

/** Crée le défi de la semaine de ces ruches, s'il n'existe pas encore (une insertion, sans erreur). */
const createHiveChallenges = async (
  db: Writer,
  hiveIds: readonly string[],
  week: string,
  now: Date,
) => {
  if (hiveIds.length === 0) return
  await db
    .insert(hc)
    .values(
      hiveIds.map((hiveId) => {
        const drawn = drawnFor(hiveId, week)
        return { hiveId, week, code: drawn.code, target: drawn.target, createdAt: now }
      }),
    )
    .onConflictDoNothing()
}

/**
 * Le défi de la semaine de chacune de ces ruches (la page d'une ruche, « Ma récolte »), pour un
 * lecteur dont la route a vérifié qu'il en est membre. Seulement les ruches de 3 membres au moins
 * aujourd'hui : une ruche passée sous 3 n'a plus de défi (même gardé en base). Le défi naît à cette
 * lecture. Un nombre fixe de requêtes, quel que soit le nombre de ruches : les membres comptés, la
 * création, les défis (clé primaire (hive_id, week)), l'avancée. `isNew` : aucun geste encore
 * (l'appli écrit « Nouveau », jamais « 0 sur 5 ») ; un défi réussi montre sa cible atteinte.
 */
export const hiveChallengesOf = async (
  db: Writer,
  hiveIds: readonly string[],
  now: Date,
): Promise<Map<string, HiveChallenge>> => {
  const week = weekOf(now)
  const eligible = await eligibleHives(db, hiveIds)
  const challenges = new Map<string, HiveChallenge>()
  if (eligible.length === 0) return challenges
  await createHiveChallenges(db, eligible, week, now)
  const rows = await db
    .select()
    .from(hc)
    .where(and(inArray(hc.hiveId, eligible), eq(hc.week, week)))
  const progress = await hiveProgress(
    db,
    rows.map((row) => row.hiveId),
    week,
  )
  for (const row of rows) {
    const code = HiveChallengeCode.safeParse(row.code)
    if (!code.success) continue
    const done = row.completedAt !== null
    const counted = Math.min(progress.get(row.hiveId)?.progress ?? 0, row.target)
    challenges.set(row.hiveId, {
      hiveId: row.hiveId,
      code: code.data,
      progress: done ? row.target : counted,
      target: row.target,
      done,
      isNew: !done && counted === 0,
    })
  }
  return challenges
}

const SharedHives = z.object({ rows: z.array(z.object({ hive_id: z.string() })) })

/**
 * Fait avancer les défis de ruche que ce geste touche, et note ceux qu'il réussit (after-award.ts).
 * Les ruches touchées : celles dont l'auteur du geste et celui du projet sont tous deux membres (les
 * ruches du membre par `hive_member_user_idx`, l'auteur dans chacune par la clé primaire de
 * `hive_member`, le projet par sa clé primaire), de 3 membres au moins. Leur défi de la semaine est
 * créé s'il manque (le même tirage qu'à la lecture), puis ses lignes sont verrouillées (« for
 * update », dans l'ordre des identifiants : deux gestes de deux ruches communes ne s'interbloquent
 * pas) avant de compter (relecture de sécurité S1). Un défi atteint est noté réussi une fois :
 * 10 miel à chaque participant (sans prendre leur verrou : « on conflict do nothing » suffit), et
 * un avis à chaque membre, avec 10 ou 0 miel.
 */
const settleHives = async (tx: Tx, entry: AwardedEntry) => {
  const { memberId, projectId, gesture, week, now } = entry
  if (projectId === null || !HIVE_CHALLENGES.some((challenge) => challenge.gesture === gesture)) {
    return
  }
  const shared = SharedHives.parse(
    await tx.execute(sql`
      select mine.hive_id
      from hive_member mine
      join project pr on pr.id = ${projectId}
      where mine.user_id = ${memberId}
        and (select 1 from hive_member author
             where author.hive_id = mine.hive_id and author.user_id = pr.author_id limit 1) is not null
    `),
  ).rows.map((row) => row.hive_id)
  const eligible = await eligibleHives(tx, shared)
  if (eligible.length === 0) return
  await createHiveChallenges(tx, eligible, week, now)
  const rows = await tx
    .select()
    .from(hc)
    .where(and(inArray(hc.hiveId, eligible), eq(hc.week, week), isNull(hc.completedAt)))
    .orderBy(hc.hiveId)
    .for('update')
  const touched = rows.filter((row) => HIVE_BY_CODE.get(row.code)?.gesture === gesture)
  const progress = await hiveProgress(
    tx,
    touched.map((row) => row.hiveId),
    week,
  )
  for (const row of touched) {
    const counted = progress.get(row.hiveId)
    if (!counted || counted.progress < row.target) continue
    const done = await tx
      .update(hc)
      .set({ completedAt: now })
      .where(and(eq(hc.hiveId, row.hiveId), eq(hc.week, week), isNull(hc.completedAt)))
      .returning({ hiveId: hc.hiveId })
    if (done.length === 0) continue
    const participants = new Set(counted.participants)
    if (participants.size > 0) {
      await tx
        .insert(schema.honeyEntry)
        .values(
          [...participants].map((participant) => ({
            id: randomUUID(),
            memberId: participant,
            amount: HONEY.hiveChallenge,
            reason: 'hive_challenge',
            sourceKey: hiveKey(row.hiveId, week),
            createdAt: now,
          })),
        )
        .onConflictDoNothing()
    }
    const members = await tx.select({ userId: hm.userId }).from(hm).where(eq(hm.hiveId, row.hiveId))
    await writeNotices(
      tx,
      members.map((member) => ({
        memberId: member.userId,
        notice: {
          kind: 'hive_challenge',
          hiveId: row.hiveId,
          code: row.code,
          honey: participants.has(member.userId) ? HONEY.hiveChallenge : 0,
        },
      })),
      now,
    )
  }
}

/**
 * Les suites d'une entrée pour les défis (after-award.ts) : le défi perso du membre, s'il compte ce
 * geste, puis les défis des ruches qu'il partage avec l'auteur du projet. Jamais pour le pollen
 * d'un défi lui-même (`challenge`).
 */
export const advanceChallenges = async (tx: Tx, entry: AwardedEntry) => {
  if (entry.gesture === 'challenge') return
  await settlePersonal(tx, entry.memberId, entry.week, entry.now, entry.gesture)
  await settleHives(tx, entry)
}
