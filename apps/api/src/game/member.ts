// Le jeu d'un membre tel que sa page le montre à tout membre connecté (R19, choix 15 :
// `Member.game`) : son niveau et les alvéoles de son rayon, son titre, ses sceaux et sa décoration.
// Jamais son miel, ni ses réglages, ni ses semaines butinées. Les réglages et le titre se lisent
// ici une fois, pour la page, l'export (game/export.ts) et quiconque en a besoin.
import {
  DEFAULT_DECORATION,
  type Decoration,
  DecorationPattern,
  DecorationTint,
  FAMILIES,
  Family,
  type GameTitle,
  levelProgress,
  type MemberGame,
  SealCode,
  TITLE_THRESHOLD,
  TITLE_WINDOW_DAYS,
  type TitleForm,
  TitleForm as TitleFormSchema,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { isExampleAccountSql } from '../accounts/example'
import { blockedWith } from '../blocks/visibility'

const pe = schema.pollenEntry
const mg = schema.memberGame
const DAY_MS = 24 * 60 * 60 * 1000

/** Les réglages du jeu d'un membre, avec la décoration brute (`decorated` : faux s'il n'a rien choisi). */
export type StoredGameSettings = {
  titleForm: TitleForm
  pinnedFamily: Family | null
  inRankings: boolean
  harvestNotices: boolean
  levelSeen: number
  decorated: boolean
  tint: DecorationTint
  pattern: DecorationPattern
}

type SettingsRow = {
  titleForm: string
  pinnedFamily: string | null
  inRankings: boolean
  harvestNotices: boolean
  levelSeen: number
  decorationTint: string | null
  decorationPattern: string | null
}

/**
 * Une ligne de `member_game` (ou son absence) devenue des réglages typés. Pas de ligne : les valeurs
 * par défaut (titre au féminin, selon ses gestes, dans les classements, « Ma récolte » allumée,
 * jamais décoré, niveau 1 vu). .parse revérifie chaque liste fermée (la base dit la même chose).
 */
const settingsFrom = (row: SettingsRow | undefined): StoredGameSettings => ({
  titleForm: TitleFormSchema.parse(row?.titleForm ?? 'f'),
  pinnedFamily: row?.pinnedFamily ? Family.parse(row.pinnedFamily) : null,
  inRankings: row?.inRankings ?? true,
  harvestNotices: row?.harvestNotices ?? true,
  levelSeen: row?.levelSeen ?? 1,
  decorated: Boolean(row?.decorationTint && row.decorationPattern),
  tint: DecorationTint.parse(row?.decorationTint ?? DEFAULT_DECORATION.tint),
  pattern: DecorationPattern.parse(row?.decorationPattern ?? DEFAULT_DECORATION.pattern),
})

const settingsColumns = {
  titleForm: mg.titleForm,
  pinnedFamily: mg.pinnedFamily,
  inRankings: mg.inRankings,
  harvestNotices: mg.harvestNotices,
  levelSeen: mg.levelSeen,
  decorationTint: mg.decorationTint,
  decorationPattern: mg.decorationPattern,
}

/** Les réglages du jeu d'un membre, lus par la clé primaire de `member_game`. */
export const gameSettingsOf = async (
  db: Database,
  memberId: string,
): Promise<StoredGameSettings> => {
  const [row] = await db.select(settingsColumns).from(mg).where(eq(mg.memberId, memberId))
  return settingsFrom(row)
}

/** La décoration montrée : celle choisie, ou Miel, Lisse. */
export const decorationOf = (settings: StoredGameSettings): Decoration => ({
  tint: settings.tint,
  pattern: settings.pattern,
})

/** Le pollen d'un membre par famille, depuis toujours et sur les 28 derniers jours. */
export type FamilyPollen = Record<Family, { total: number; recent: number }>

/**
 * Le pollen non retiré d'un membre, par famille, en une requête : depuis toujours (`total`) et
 * depuis 28 jours (`recent`, pour le titre). `sum(…) filter (where …)` : une somme qui ne compte que
 * les lignes de la condition, dans le même passage que l'autre. L'index
 * `pollen_entry_member_week_idx` (member_id, week) trouve les entrées du membre par sa première
 * colonne.
 */
export const familyPollenOf = async (
  // `Pick<Database, 'select'>` : la base ou une transaction (PATCH /v1/me/game relit sous verrou).
  db: Pick<Database, 'select'>,
  memberId: string,
  now: Date,
): Promise<FamilyPollen> => {
  const since = new Date(now.getTime() - TITLE_WINDOW_DAYS * DAY_MS)
  const rows = await db
    .select({
      family: pe.family,
      total: sql<number>`coalesce(sum(${pe.amount}), 0)::int`,
      recent: sql<number>`coalesce(sum(${pe.amount}) filter (where ${pe.createdAt} > ${sql.param(since, pe.createdAt)}), 0)::int`,
    })
    .from(pe)
    .where(and(eq(pe.memberId, memberId), isNull(pe.revokedAt)))
    .groupBy(pe.family)
  const out = Object.fromEntries(FAMILIES.map((family) => [family, { total: 0, recent: 0 }]))
  for (const row of rows) out[Family.parse(row.family)] = { total: row.total, recent: row.recent }
  return out as FamilyPollen
}

/** Les familles « obtenues » (100 pollen depuis toujours) : celles qu'on peut épingler. */
export const obtainedFamiliesOf = (pollen: FamilyPollen): Family[] =>
  FAMILIES.filter((family) => pollen[family].total >= TITLE_THRESHOLD)

/**
 * Le titre (choix 12) : la famille épinglée si elle est obtenue ; sinon celle de plus de pollen sur
 * les 28 derniers jours (à égalité, l'ordre de FAMILIES : Butineuse, Bâtisseuse, Gardienne,
 * Danseuse) ; null sans pollen depuis 28 jours. Une famille épinglée puis perdue (pollen retiré par la
 * modération) laisse revenir le titre selon les gestes.
 */
export const titleOf = (pollen: FamilyPollen, settings: StoredGameSettings): GameTitle | null => {
  const pinned = settings.pinnedFamily
  if (pinned && pollen[pinned].total >= TITLE_THRESHOLD) {
    return { family: pinned, form: settings.titleForm, pinned: true }
  }
  let best: Family | null = null
  for (const family of FAMILIES) {
    if (pollen[family].recent > 0 && (!best || pollen[family].recent > pollen[best].recent)) {
      best = family
    }
  }
  return best ? { family: best, form: settings.titleForm, pinned: false } : null
}

/** Les sceaux gagnés, les plus récents d'abord ; la clé primaire de `seal` (member_id, code). */
export const sealsOf = async (db: Database, memberId: string) => {
  const rows = await db
    .select({ code: schema.seal.code, earnedAt: schema.seal.earnedAt })
    .from(schema.seal)
    .where(eq(schema.seal.memberId, memberId))
    .orderBy(desc(schema.seal.earnedAt), schema.seal.code)
  return rows.map((row) => ({
    code: SealCode.parse(row.code),
    earnedAt: row.earnedAt.toISOString(),
  }))
}

/**
 * Le jeu de `memberId` vu par `viewerId`, ou null : pour un compte d'exemples (il ne gagne rien,
 * choix 15) et pour un membre bloqué dans un sens ou dans l'autre (la route le dit déjà ; redit ici,
 * pour qu'aucun appelant ne l'oublie). Trois requêtes, quel que soit le membre : son état et ses
 * réglages (clés primaires de `user`, `member_game`, `example_account`, index de `member_block`),
 * puis, ensemble, son pollen par famille et ses sceaux.
 */
export const loadMemberGame = async (
  db: Database,
  viewerId: string,
  memberId: string,
  now: Date = new Date(),
): Promise<MemberGame | null> => {
  const [row] = await db
    .select({
      ...settingsColumns,
      // Le membre sans ligne de réglages : la jointure externe rend des colonnes nulles.
      hasSettings: sql<boolean>`${mg.memberId} is not null`,
      example: isExampleAccountSql(schema.user.id),
      blocked: blockedWith(viewerId, schema.user.id),
    })
    .from(schema.user)
    .leftJoin(mg, eq(mg.memberId, schema.user.id))
    .where(eq(schema.user.id, memberId))
  if (!row || row.example || row.blocked) return null
  const settings = settingsFrom(
    row.hasSettings
      ? {
          // La jointure externe type ces colonnes « peut-être nulles » ; la ligne existe ici.
          titleForm: row.titleForm ?? 'f',
          pinnedFamily: row.pinnedFamily,
          inRankings: row.inRankings ?? true,
          harvestNotices: row.harvestNotices ?? true,
          levelSeen: row.levelSeen ?? 1,
          decorationTint: row.decorationTint,
          decorationPattern: row.decorationPattern,
        }
      : undefined,
  )
  const [pollen, seals] = await Promise.all([
    familyPollenOf(db, memberId, now),
    sealsOf(db, memberId),
  ])
  const total = FAMILIES.reduce((sum, family) => sum + pollen[family].total, 0)
  const { level, cells } = levelProgress(total)
  return {
    level,
    cells,
    title: titleOf(pollen, settings),
    seals,
    decoration: decorationOf(settings),
  }
}
