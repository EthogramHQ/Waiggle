// « Ma récolte » (R19, plan, choix 4, 6, 11, 12 et 15) : tout ce que GET /v1/me/harvest montre à un
// membre de son propre jeu. Rien n'y est stocké d'avance : le niveau, le titre, le pollen de la
// semaine et les semaines butinées se calculent à la lecture depuis le grand livre (`pollen_entry`),
// le solde depuis `honey_entry`. Les défis de la semaine naissent à cette lecture (challenges.ts).
// Le titre, les familles obtenues, les réglages et les sceaux se lisent par les fonctions de la page
// d'un membre (member.ts) : la récolte et la page montrent toujours le même titre.
//
// Un nombre fixe de requêtes, quel que soit le passé du membre ou son nombre de ruches : le compte
// d'exemple, le pollen par famille, celui de la semaine, le miel, les réglages, les sceaux, les
// semaines butinées, le défi perso (3 au plus), les ruches et leurs défis (4).
import {
  FAMILIES,
  Family,
  type GameSettingsUpdate,
  type Harvest,
  levelFor,
  levelProgress,
  TITLE_THRESHOLD,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { shownName } from '../hives/load'
import { lockMembers } from './award'
import { choosePersonalChallenge, hiveChallengesOf, personalChallengeOf } from './challenges'
import { honeyStateOf } from './honey'
import {
  decorationOf,
  type FamilyPollen,
  familyPollenOf,
  gameSettingsOf,
  isScoutTitleHolder,
  obtainedFamiliesOf,
  sealsOf,
  titleOf,
} from './member'
import { loadForagedWeeks } from './weeks'

const p = schema.pollenEntry

/** Le pollen total d'un membre (toutes familles), qui donne son niveau. */
export const totalOf = (pollen: FamilyPollen) =>
  FAMILIES.reduce((sum, family) => sum + pollen[family].total, 0)

/**
 * Le pollen de la semaine en cours, famille par famille (les absentes à 0), en une requête : la
 * somme des entrées non révoquées de ce membre et de ce lundi, groupées par famille. Index :
 * `pollen_entry_member_week_idx` (member_id, week), lu sur ses deux colonnes.
 */
const weekPollenOf = async (db: Database, memberId: string, now: Date) => {
  const rows = await db
    .select({ family: p.family, amount: sql<number>`coalesce(sum(${p.amount}), 0)::int` })
    .from(p)
    .where(and(eq(p.memberId, memberId), eq(p.week, weekOf(now)), isNull(p.revokedAt)))
    .groupBy(p.family)
  const byFamily = Object.fromEntries(FAMILIES.map((family) => [family, 0])) as Record<
    Family,
    number
  >
  for (const row of rows) {
    const family = Family.safeParse(row.family)
    if (family.success) byFamily[family.data] = row.amount
  }
  return byFamily
}

/** Vrai pour un compte d'exemple (clé primaire de example_account). */
const isExample = async (db: Database, memberId: string) => {
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
  const [pollen, byFamily, honey, settings, seals, weeks, personalChallenge, isScout, hives] =
    await Promise.all([
      familyPollenOf(db, memberId, now),
      weekPollenOf(db, memberId, now),
      honeyStateOf(db, memberId),
      gameSettingsOf(db, memberId),
      sealsOf(db, memberId),
      loadForagedWeeks(db, memberId, now),
      personalChallengeOf(db, memberId, now),
      isScoutTitleHolder(db, memberId),
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
  return {
    level,
    total,
    cells,
    toNext,
    title: titleOf(pollen, settings, isScout),
    obtainedFamilies: obtainedFamiliesOf(pollen),
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
    seals,
    decoration: decorationOf(settings),
    ownedDecorations: honey.owned,
    settings: {
      titleForm: settings.titleForm,
      pinnedFamily: settings.pinnedFamily,
      inRankings: settings.inRankings,
      harvestNotices: settings.harvestNotices,
    },
    levelSeen: settings.levelSeen,
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
      // R20 : `scout` s'épingle si l'on est Éclaireuse non retirée (clé primaire de `scout`) ; une
      // famille, si elle est obtenue. Le même refus 422 dans les deux cas.
      if (pinned === 'scout') {
        if (!(await isScoutTitleHolder(tx, memberId))) return 'family_not_obtained'
      } else if (pinned !== null && pollen[pinned].total < TITLE_THRESHOLD) {
        return 'family_not_obtained'
      }
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
