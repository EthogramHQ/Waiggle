// Le jeu dans l'export des données du membre (R19, choix 18 ; RGPD art. 15 et 20) : les entrées de
// son pollen, ses sceaux, les mouvements de son miel, ses défis perso, ses réglages et sa décoration.
// Jamais l'autre membre d'une entrée (`counterpart_id`), ni l'identifiant de la chose qui l'a
// rapportée (`source_id`, `source_key`) : une réaction reçue appartient à qui l'a posée.
import {
  Family,
  type GameExport,
  HoneyReason,
  LedgerGesture,
  PersonalChallengeCode,
  PollenSourceKind,
  SealCode,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { asc, eq } from 'drizzle-orm'
import { decorationOf, gameSettingsOf } from './member'

const pe = schema.pollenEntry
const he = schema.honeyEntry
const pc = schema.personalChallenge

/**
 * Le bloc `game` de l'export, en cinq petites requêtes lancées ensemble (Promise.all), chacune
 * servie par un index qui commence par `member_id` :
 * - le grand livre : `pollen_entry_member_week_idx` (member_id, week), toutes ses entrées, retirées
 *   comprises (avec leur date de retrait) ;
 * - les sceaux : la clé primaire de `seal` (member_id, code) ;
 * - le miel : `honey_entry_once_idx` (member_id, source_key) ;
 * - les défis perso : la clé primaire de `personal_challenge` (member_id, week) ;
 * - les réglages : la clé primaire de `member_game`.
 * Les colonnes lues sont nommées une à une : `counterpart_id`, `source_id` et `source_key` ne sont
 * jamais lues, donc ne peuvent pas sortir.
 */
export const gameExportOf = async (db: Database, memberId: string): Promise<GameExport> => {
  const [pollen, seals, honey, challenges, settings] = await Promise.all([
    db
      .select({
        gesture: pe.gesture,
        family: pe.family,
        amount: pe.amount,
        sourceKind: pe.sourceKind,
        day: pe.day,
        week: pe.week,
        createdAt: pe.createdAt,
        revokedAt: pe.revokedAt,
      })
      .from(pe)
      .where(eq(pe.memberId, memberId))
      .orderBy(asc(pe.createdAt), asc(pe.id)),
    db
      .select({ code: schema.seal.code, earnedAt: schema.seal.earnedAt })
      .from(schema.seal)
      .where(eq(schema.seal.memberId, memberId))
      .orderBy(asc(schema.seal.earnedAt), asc(schema.seal.code)),
    db
      .select({ amount: he.amount, reason: he.reason, createdAt: he.createdAt })
      .from(he)
      .where(eq(he.memberId, memberId))
      .orderBy(asc(he.createdAt), asc(he.id)),
    db
      .select({
        week: pc.week,
        offered: pc.offered,
        chosen: pc.chosen,
        completedAt: pc.completedAt,
      })
      .from(pc)
      .where(eq(pc.memberId, memberId))
      .orderBy(asc(pc.week)),
    gameSettingsOf(db, memberId),
  ])

  return {
    // .parse revérifie chaque valeur lue (les contraintes de la base disent la même chose) : une
    // valeur inattendue est une erreur à signaler, pas une donnée à exporter.
    pollen: pollen.map((row) => ({
      gesture: LedgerGesture.parse(row.gesture),
      family: Family.parse(row.family),
      amount: row.amount,
      sourceKind: PollenSourceKind.parse(row.sourceKind),
      day: row.day,
      week: row.week,
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    })),
    seals: seals.map((row) => ({
      code: SealCode.parse(row.code),
      earnedAt: row.earnedAt.toISOString(),
    })),
    honey: honey.map((row) => ({
      amount: row.amount,
      reason: HoneyReason.parse(row.reason),
      createdAt: row.createdAt.toISOString(),
    })),
    challenges: challenges.map((row) => ({
      week: row.week,
      offered: row.offered.map((code) => PersonalChallengeCode.parse(code)),
      // `none` (« Pas cette semaine ») s'exporte comme « aucun » : null, comme le dit le contrat.
      chosen:
        row.chosen === null || row.chosen === 'none'
          ? null
          : PersonalChallengeCode.parse(row.chosen),
      completedAt: row.completedAt?.toISOString() ?? null,
    })),
    settings: {
      titleForm: settings.titleForm,
      pinnedFamily: settings.pinnedFamily,
      inRankings: settings.inRankings,
      harvestNotices: settings.harvestNotices,
      // Jamais décoré : null (la page du membre montre alors Miel, Lisse).
      decoration: settings.decorated ? decorationOf(settings) : null,
      levelSeen: settings.levelSeen,
    },
  }
}
