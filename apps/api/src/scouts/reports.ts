// Les retours des Éclaireuses dans la base (R20, docs/scenarios/refonte.md, « Le retour normé »,
// « Les missions de la semaine », « Mes retours ») : ranger un retour et payer son pollen, relire
// « Mes retours », en supprimer un. Les routes (routes/scout-reports.ts) vérifient la session,
// l'état d'Éclaireuse et le quota avant d'appeler ces fonctions.
import {
  LanguageSchema,
  SCOUT_MY_REPORTS_MAX,
  type ScoutContext,
  ScoutPlatform,
  ScoutReport,
  type ScoutReportInput,
  ScoutReportKind,
  ScoutScheme,
  ScoutSeverity,
  ScoutStatus,
  screenPathOf,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import type { Language } from '@ruche/i18n'
import { and, desc, eq } from 'drizzle-orm'
import { award } from '../game/award'
import { mediaUrl } from '../profile/me'

const r = schema.scoutReport
const m = schema.scoutMission

type ReportRow = typeof schema.scoutReport.$inferSelect
type MissionText = { id: string; textFr: string; textEn: string | null } | null

/** Le texte d'une mission dans la langue du lecteur, le français à défaut (non traduite). */
const missionTextOf = (mission: MissionText, language: Language) =>
  mission === null
    ? null
    : {
        id: mission.id,
        text: language === 'en' && mission.textEn ? mission.textEn : mission.textFr,
      }

/**
 * Le contexte rangé en colonnes, rendu à sa forme du contrat ; null si la case était décochée (les
 * colonnes sont alors toutes vides). Les listes fermées sont relues par Zod : une valeur inattendue
 * en base ferait une erreur ici plutôt qu'une réponse fausse.
 */
const contextOf = (row: ReportRow): ScoutContext | null => {
  if (
    row.screen === null ||
    row.platform === null ||
    row.width === null ||
    row.language === null ||
    row.scheme === null
  ) {
    return null
  }
  return {
    screen: row.screen,
    platform: ScoutPlatform.parse(row.platform),
    width: row.width,
    appVersion: row.appVersion,
    language: LanguageSchema.parse(row.language),
    scheme: ScoutScheme.parse(row.scheme),
  }
}

/**
 * Un retour tel que son autrice le voit (contrat `ScoutReport`). Jamais la note privée de
 * l'administrateur : `ScoutReport` est un `strictObject`, et `parse` refuserait une clé de plus.
 */
export const toScoutReport = (
  row: ReportRow,
  mission: MissionText,
  language: Language,
  publicApiUrl: string,
): ScoutReport =>
  ScoutReport.parse({
    id: row.id,
    kind: ScoutReportKind.parse(row.kind),
    severity: row.severity === null ? null : ScoutSeverity.parse(row.severity),
    text: row.text,
    mission: missionTextOf(mission, language),
    context: contextOf(row),
    mediaUrl: row.mediaKey === null ? null : mediaUrl(publicApiUrl, row.mediaKey),
    status: ScoutStatus.parse(row.status),
    fixedNote: row.fixedNote,
    createdAt: row.createdAt.toISOString(),
    fixedAt: row.fixedAt?.toISOString() ?? null,
  })

/** La clé de stockage de la capture d'un retour : le dossier `scouts`, et l'id du retour. */
export const scoutMediaKey = (reportId: string) => `scouts/${reportId}.webp`

/** Ce que rend l'envoi : le retour rangé et le pollen gagné, ou une mission hors de la semaine. */
export type SendOutcome =
  | { kind: 'sent'; report: ScoutReport; pollen: number }
  | { kind: 'mission_invalid' }

/**
 * Range un retour (plan, choix 6). Une transaction : tout est écrit, ou rien.
 * 1. La mission citée, si elle est de la semaine en cours : une lecture par la clé primaire de
 *    `scout_mission`, `for share` (un verrou partagé sur la ligne jusqu'à la fin de la
 *    transaction : l'administrateur ne peut pas l'effacer entre cette lecture et l'insertion, ce
 *    qui ferait échouer la clé étrangère). Une autre semaine, ou inconnue : le même refus.
 * 2. Le retour, avec son contexte en colonnes ; l'écran perd ce qui suit « ? » ou « # ».
 * 3. Le pollen du retour (25, 4 par jour : `award` compte le plafond) ; la chose payée une fois est
 *    le retour lui-même.
 * 4. La mission, si elle n'est pas encore faite : `on conflict do nothing` sur la clé primaire
 *    (member_id, mission_id) de `scout_mission_done`, et `returning` dit si la ligne est neuve ;
 *    alors 30 pollen, payés une fois par mission (la clé de la chose est l'id de la mission : un
 *    retour supprimé puis une réponse de plus ne paient pas deux fois).
 */
export const sendScoutReport = (
  db: Database,
  input: {
    id: string
    memberId: string
    report: ScoutReportInput
    mediaKey: string | null
    language: Language
    publicApiUrl: string
    now: Date
  },
): Promise<SendOutcome> =>
  db.transaction(async (tx) => {
    const { id, memberId, report, now } = input
    let mission: MissionText = null
    if (report.missionId !== undefined) {
      const [row] = await tx
        .select({ id: m.id, textFr: m.textFr, textEn: m.textEn })
        .from(m)
        .where(and(eq(m.id, report.missionId), eq(m.week, weekOf(now))))
        .for('share')
      if (!row) return { kind: 'mission_invalid' } as const
      mission = row
    }
    const context = report.context
    const [row] = await tx
      .insert(r)
      .values({
        id,
        memberId,
        kind: report.kind,
        severity: report.severity ?? null,
        text: report.text,
        missionId: mission?.id ?? null,
        screen: context ? screenPathOf(context.screen) : null,
        platform: context?.platform ?? null,
        width: context?.width ?? null,
        appVersion: context?.appVersion ?? null,
        language: context?.language ?? null,
        scheme: context?.scheme ?? null,
        mediaKey: input.mediaKey,
        status: 'sent',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('scout report not stored')

    let pollen = await award(tx, {
      memberId,
      gesture: 'scout_report',
      sourceKind: 'scout_report',
      sourceId: id,
      sourceKey: id,
      now,
    })
    if (mission !== null) {
      const fresh = await tx
        .insert(schema.scoutMissionDone)
        .values({ memberId, missionId: mission.id, reportId: id, createdAt: now })
        .onConflictDoNothing()
        .returning({ missionId: schema.scoutMissionDone.missionId })
      if (fresh.length > 0) {
        pollen += await award(tx, {
          memberId,
          gesture: 'scout_mission',
          sourceKind: 'scout_mission',
          sourceId: mission.id,
          sourceKey: mission.id,
          now,
        })
      }
    }
    return {
      kind: 'sent',
      report: toScoutReport(row, mission, input.language, input.publicApiUrl),
      pollen,
    } as const
  })

/**
 * « Mes retours » (plan, choix 7) : les siens, les plus récents d'abord, 100 au plus, avec le texte
 * de leur mission. Une requête : l'index `scout_report_member_idx` (member_id, created_at desc)
 * trouve ses lignes déjà dans l'ordre et s'arrête à 100 ; la mission se lit par sa clé primaire
 * (« left join » : pas de mission, ou une mission effacée depuis). L'id départage deux retours de
 * la même milliseconde, pour un ordre stable.
 */
export const listMyScoutReports = async (
  db: Database,
  memberId: string,
  language: Language,
  publicApiUrl: string,
) => {
  const rows = await db
    .select({ report: r, mission: { id: m.id, textFr: m.textFr, textEn: m.textEn } })
    .from(r)
    .leftJoin(m, eq(m.id, r.missionId))
    .where(eq(r.memberId, memberId))
    .orderBy(desc(r.createdAt), desc(r.id))
    .limit(SCOUT_MY_REPORTS_MAX)
  return rows.map((row) => toScoutReport(row.report, row.mission, language, publicApiUrl))
}

/**
 * Supprime son retour (plan, choix 7 ; relecture A5) : une requête, par la clé primaire, qui ne
 * touche la ligne que si elle est à elle, et rend la clé de sa capture (`returning`). La base efface
 * avec elle, par ses clés étrangères « on delete cascade », la mission faite et l'avis « Ta danse a
 * été entendue ». Rend false si rien n'a été supprimé (pas le sien, ou inconnu) ; sinon, la clé du
 * fichier à effacer (ou null).
 */
export const deleteMyScoutReport = async (db: Database, memberId: string, reportId: string) => {
  const [row] = await db
    .delete(r)
    .where(and(eq(r.id, reportId), eq(r.memberId, memberId)))
    .returning({ mediaKey: r.mediaKey })
  return row === undefined ? false : { mediaKey: row.mediaKey }
}
