// « Ma récolte » (R19, plan, choix 4, 6, 11, 12 et 15) : tout ce que GET /v1/me/harvest montre à un
// membre de son propre jeu. Rien n'y est stocké d'avance : le niveau, le titre, le pollen de la
// semaine et les semaines butinées se calculent à la lecture depuis le grand livre (`pollen_entry`),
// le solde depuis `honey_entry`. Les défis de la semaine naissent à cette lecture (challenges.ts).
//
// Un nombre fixe de requêtes, quel que soit le passé du membre ou son nombre de ruches : le compte
// d'exemple, le pollen par famille, le miel, les réglages, les sceaux, les semaines butinées, le
// défi perso (3 au plus), les ruches et leurs défis (4).
import {
  DEFAULT_DECORATION,
  DecorationPattern,
  DecorationTint,
  FAMILIES,
  Family,
  type GameSettings,
  type GameSettingsUpdate,
  type GameTitle,
  type Harvest,
  levelFor,
  levelProgress,
  TITLE_THRESHOLD,
  TITLE_WINDOW_DAYS,
  TitleForm,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { shownName } from '../hives/load'
import { lockMembers } from './award'
import { choosePersonalChallenge, hiveChallengesOf, personalChallengeOf } from './challenges'
import { honeyStateOf } from './honey'
import { loadForagedWeeks } from './weeks'

const p = schema.pollenEntry
const DAY_MS = 24 * 60 * 60 * 1000

/** Le pollen d'un membre par famille : depuis toujours, cette semaine, et sur les 28 derniers jours. */
export type FamilyPollen = Record<Family, { total: number; week: number; recent: number }>

/**
 * Le pollen d'un membre, famille par famille, en une requête : `sum(amount)` de ses entrées non
 * révoquées, groupées par famille ; `filter (where …)` ajoute à la même lecture la somme de la
 * semaine en cours et celle des 28 derniers jours. Les entrées du rattrapage comptent (ce sont des
 * gestes réels, à leur date d'origine). Index : `pollen_entry_member_week_idx` (member_id, week),
 * lu par son début : seules les lignes de ce membre. La date entre par un opérateur lié à la colonne
 * (`gt`), jamais écrite dans le texte SQL (piège de la charte : heure locale). `db` peut être une
 * transaction (PATCH /v1/me/game relit le total sous verrou).
 */
export const familyPollenOf = async (
  db: Pick<Database, 'select'>,
  memberId: string,
  now: Date,
): Promise<FamilyPollen> => {
  const since = new Date(now.getTime() - TITLE_WINDOW_DAYS * DAY_MS)
  const rows = await db
    .select({
      family: p.family,
      total: sql<number>`sum(${p.amount})`.mapWith(Number),
      week: sql<number>`coalesce(sum(${p.amount}) filter (where ${eq(p.week, weekOf(now))}), 0)`.mapWith(
        Number,
      ),
      recent:
        sql<number>`coalesce(sum(${p.amount}) filter (where ${gt(p.createdAt, since)}), 0)`.mapWith(
          Number,
        ),
    })
    .from(p)
    .where(and(eq(p.memberId, memberId), isNull(p.revokedAt)))
    .groupBy(p.family)
  const pollen = Object.fromEntries(
    FAMILIES.map((family) => [family, { total: 0, week: 0, recent: 0 }]),
  ) as FamilyPollen
  for (const row of rows) {
    const family = Family.safeParse(row.family)
    if (family.success)
      pollen[family.data] = { total: row.total, week: row.week, recent: row.recent }
  }
  return pollen
}

/** Le pollen total d'un membre (toutes familles), qui donne son niveau. */
export const totalOf = (pollen: FamilyPollen) =>
  FAMILIES.reduce((sum, family) => sum + pollen[family].total, 0)

/** Les familles « obtenues » : 100 pollen au moins depuis toujours ; elles peuvent s'épingler. */
export const obtainedFamilies = (pollen: FamilyPollen): Family[] =>
  FAMILIES.filter((family) => pollen[family].total >= TITLE_THRESHOLD)

/**
 * Le titre d'un membre (choix 12) : la famille épinglée, si elle est toujours obtenue (une
 * révocation de la modération peut la faire repasser sous 100) ; sinon la famille de plus de pollen
 * sur les 28 derniers jours, la première de `FAMILIES` en cas d'égalité ; null sans aucun pollen
 * récent (un nouveau membre, ou qui n'a rien fait depuis 28 jours).
 */
export const titleOf = (
  pollen: FamilyPollen,
  settings: Pick<GameSettings, 'titleForm' | 'pinnedFamily'>,
): GameTitle | null => {
  const form = settings.titleForm
  const pinned = settings.pinnedFamily
  if (pinned !== null && pollen[pinned].total >= TITLE_THRESHOLD) {
    return { family: pinned, form, pinned: true }
  }
  let best: Family | null = null
  for (const family of FAMILIES) {
    const recent = pollen[family].recent
    if (recent > 0 && (best === null || recent > pollen[best].recent)) best = family
  }
  return best === null ? null : { family: best, form, pinned: false }
}

/** Les réglages du jeu et la décoration d'un membre, ou les valeurs par défaut sans ligne. */
export type GameRow = {
  settings: GameSettings
  decoration: Harvest['decoration']
  levelSeen: number
}

/**
 * La ligne `member_game` d'un membre (clé primaire), ramenée aux formes du contrat. Pas de ligne :
 * titre au féminin, selon ses gestes, dans les classements, « Ma récolte » allumée, Miel et Lisse,
 * niveau 1 vu. Les valeurs passent par les schémas du contrat : une valeur inattendue en base
 * redevient celle par défaut au lieu de sortir telle quelle.
 */
export const gameRowOf = async (
  db: Pick<Database, 'select'>,
  memberId: string,
): Promise<GameRow> => {
  const [row] = await db
    .select()
    .from(schema.memberGame)
    .where(eq(schema.memberGame.memberId, memberId))
  const pinned = Family.safeParse(row?.pinnedFamily)
  const tint = DecorationTint.safeParse(row?.decorationTint)
  const pattern = DecorationPattern.safeParse(row?.decorationPattern)
  return {
    settings: {
      titleForm: TitleForm.catch('f').parse(row?.titleForm),
      pinnedFamily: pinned.success ? pinned.data : null,
      inRankings: row?.inRankings ?? true,
      harvestNotices: row?.harvestNotices ?? true,
    },
    decoration:
      tint.success && pattern.success
        ? { tint: tint.data, pattern: pattern.data }
        : { ...DEFAULT_DECORATION },
    levelSeen: row?.levelSeen ?? 1,
  }
}

/** Vrai pour un compte d'exemple (clé primaire de example_account). */
const isExample = async (db: Pick<Database, 'select'>, memberId: string) => {
  const [row] = await db
    .select({ userId: schema.exampleAccount.userId })
    .from(schema.exampleAccount)
    .where(eq(schema.exampleAccount.userId, memberId))
  return row !== undefined
}

/**
 * « Ma récolte » d'un membre, ou null pour un compte d'exemple (la route répond 404 : un compte
 * d'exemple ne joue pas). Les lectures partent ensemble (`Promise.all`) ; aucune n'est dans une
 * transaction (sous PGlite, une lecture par `db` pendant une transaction attendrait sans fin).
 *
 * Les ruches du membre : `hive_member_user_idx` (user_id), puis la clé primaire de hive pour le nom
 * montré (null si la modération l'a retiré). Leurs défis : `hiveChallengesOf`, qui ne garde que les
 * ruches de 3 membres au moins, dans l'ordre où le membre les a rejointes.
 */
export const loadHarvest = async (
  db: Database,
  memberId: string,
  now: Date,
): Promise<Harvest | null> => {
  if (await isExample(db, memberId)) return null
  const [pollen, honey, game, seals, weeks, personalChallenge, hives] = await Promise.all([
    familyPollenOf(db, memberId, now),
    honeyStateOf(db, memberId),
    gameRowOf(db, memberId),
    // Les sceaux, les plus récents d'abord : clé primaire de seal (member_id, code), par son début.
    db
      .select({ code: schema.seal.code, earnedAt: schema.seal.earnedAt })
      .from(schema.seal)
      .where(eq(schema.seal.memberId, memberId))
      .orderBy(desc(schema.seal.earnedAt), schema.seal.code),
    loadForagedWeeks(db, memberId, now),
    personalChallengeOf(db, memberId, now),
    db
      .select({
        id: schema.hive.id,
        name: schema.hive.name,
        nameRemovalId: schema.hive.nameRemovalId,
      })
      .from(schema.hiveMember)
      .innerJoin(schema.hive, eq(schema.hive.id, schema.hiveMember.hiveId))
      .where(eq(schema.hiveMember.userId, memberId))
      .orderBy(schema.hiveMember.joinedAt, schema.hive.id),
  ])
  const challenges = await hiveChallengesOf(
    db,
    hives.map((hive) => hive.id),
    now,
  )

  const total = totalOf(pollen)
  const { level, cells, toNext } = levelProgress(total)
  const byFamily = Object.fromEntries(
    FAMILIES.map((family) => [family, pollen[family].week]),
  ) as Record<Family, number>
  return {
    level,
    total,
    cells,
    toNext,
    title: titleOf(pollen, game.settings),
    obtainedFamilies: obtainedFamilies(pollen),
    week: { total: FAMILIES.reduce((sum, family) => sum + byFamily[family], 0), byFamily },
    weeks,
    // Un solde ne descend jamais sous zéro (chaque débit est vérifié sous verrou) ; `max` le garde
    // dans la forme du contrat même si une ligne était corrigée à la main.
    honey: Math.max(0, honey.balance),
    personalChallenge,
    hiveChallenges: hives.flatMap((hive) => {
      const challenge = challenges.get(hive.id)
      return challenge ? [{ ...challenge, hiveName: shownName(hive) }] : []
    }),
    seals: seals.map((seal) => ({ code: seal.code, earnedAt: seal.earnedAt.toISOString() })),
    decoration: game.decoration,
    ownedDecorations: honey.owned,
    settings: game.settings,
    levelSeen: game.levelSeen,
  }
}

/** Les refus de PATCH /v1/me/game (422), dans l'ordre où ils sont vérifiés. */
export type SettingsRefusal = 'invalid_level_seen' | 'family_not_obtained' | 'invalid_challenge'

/**
 * Change les réglages du jeu d'un membre et choisit son défi perso (PATCH /v1/me/game) ; rend null
 * si c'est fait, ou le premier refus. Tout ou rien : un refus n'écrit aucun réglage.
 *
 * Une transaction, sous le verrou de jeu du membre (`lockMembers`, pris aussi par
 * `choosePersonalChallenge` : un verrou déjà tenu se reprend sans attendre). Le pollen est relu
 * dessous : un geste qui passe un niveau en même temps attend, et `levelSeen` se compare au niveau
 * à jour. Puis le défi (challenges.ts), puis les réglages en un « upsert » sur la clé primaire de
 * member_game (la ligne naît au premier réglage). Un champ absent du corps ne change pas.
 */
export const updateGameSettings = (
  db: Database,
  memberId: string,
  patch: GameSettingsUpdate,
  now: Date,
): Promise<SettingsRefusal | null> =>
  db.transaction(async (tx) => {
    await lockMembers(tx, [memberId])
    if (patch.levelSeen !== undefined || (patch.pinnedFamily ?? null) !== null) {
      const pollen = await familyPollenOf(tx, memberId, now)
      if (patch.levelSeen !== undefined && patch.levelSeen > levelFor(totalOf(pollen))) {
        return 'invalid_level_seen'
      }
      const pinned = patch.pinnedFamily ?? null
      if (pinned !== null && pollen[pinned].total < TITLE_THRESHOLD) return 'family_not_obtained'
    }
    if (patch.personalChallenge !== undefined) {
      const refused = await choosePersonalChallenge(tx, memberId, patch.personalChallenge, now)
      if (refused) return refused
    }
    const { personalChallenge: _challenge, ...settings } = patch
    if (Object.keys(settings).length > 0) {
      await tx
        .insert(schema.memberGame)
        .values({ memberId, ...settings })
        .onConflictDoUpdate({ target: schema.memberGame.memberId, set: settings })
    }
    return null
  })
