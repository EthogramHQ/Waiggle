// La part « Éclaireuse » de l'export des données d'un membre (R20, RGPD art. 15 et 20) : son entrée
// (dates, retrait et son motif), tous ses retours (avec le contexte joint, la note de
// l'administrateur, le mot « Corrigé » et l'adresse de la capture) et le nombre de missions
// répondues. Un membre qui n'a jamais été Éclaireuse n'a pas cette part (null). Une Éclaireuse
// retirée garde la sienne : ce sont ses données. Le nombre de requêtes est fixe : trois, quel que
// soit le nombre de retours.
import {
  ScoutContext,
  ScoutExport,
  ScoutReportKind,
  ScoutSeverity,
  ScoutStatus,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { asc, count, eq } from 'drizzle-orm'
import { mediaUrl } from '../profile/me'

type Reader = Pick<Database, 'select'>

/**
 * Le contexte joint à un retour, ou null s'il n'y en a pas. Les six colonnes sont toutes remplies
 * ou toutes vides (l'API les écrit ensemble) : `ScoutContext.safeParse` le vérifie, et une ligne
 * incomplète (écrite à la main) donne null plutôt qu'une erreur dans l'export.
 */
const contextOf = (row: {
  screen: string | null
  platform: string | null
  width: number | null
  appVersion: string | null
  language: string | null
  scheme: string | null
}): ScoutContext | null => {
  const parsed = ScoutContext.safeParse({
    screen: row.screen,
    platform: row.platform,
    width: row.width,
    appVersion: row.appVersion,
    language: row.language,
    scheme: row.scheme,
  })
  return parsed.success ? parsed.data : null
}

/**
 * Ce que les Éclaireuses savent de ce membre, ou null s'il n'a jamais été Éclaireuse.
 *
 * Index : sa ligne `scout` par la clé primaire (member_id) ; ses retours par `scout_report_member_idx`
 * (member_id, created_at desc), lu à l'envers pour aller du plus ancien au plus récent ; le texte de
 * la mission par un `left join` sur la clé primaire de `scout_mission` (null si elle a été effacée par
 * la purge) ; ses missions répondues par la clé primaire de `scout_mission_done` (member_id,
 * mission_id), dont `member_id` est la première colonne. Jamais la note d'un autre membre : toutes
 * les lectures portent sur `member_id`.
 */
export const scoutExportOf = async (
  db: Reader,
  memberId: string,
  publicApiUrl: string,
): Promise<ScoutExport | null> => {
  const [entry] = await db
    .select({
      joinedAt: schema.scout.joinedAt,
      removedAt: schema.scout.removedAt,
      removalReason: schema.scout.removalReason,
    })
    .from(schema.scout)
    .where(eq(schema.scout.memberId, memberId))
  if (!entry) return null

  const r = schema.scoutReport
  const rows = await db
    .select({
      kind: r.kind,
      severity: r.severity,
      text: r.text,
      screen: r.screen,
      platform: r.platform,
      width: r.width,
      appVersion: r.appVersion,
      language: r.language,
      scheme: r.scheme,
      status: r.status,
      fixedNote: r.fixedNote,
      adminNote: r.adminNote,
      mediaKey: r.mediaKey,
      mission: schema.scoutMission.textFr,
      createdAt: r.createdAt,
      fixedAt: r.fixedAt,
    })
    .from(r)
    .leftJoin(schema.scoutMission, eq(schema.scoutMission.id, r.missionId))
    .where(eq(r.memberId, memberId))
    .orderBy(asc(r.createdAt), asc(r.id))

  const [done] = await db
    .select({ n: count() })
    .from(schema.scoutMissionDone)
    .where(eq(schema.scoutMissionDone.memberId, memberId))

  return ScoutExport.parse({
    joinedAt: entry.joinedAt.toISOString(),
    removedAt: entry.removedAt?.toISOString() ?? null,
    removalReason: entry.removalReason,
    reports: rows.map((row) => ({
      kind: ScoutReportKind.parse(row.kind),
      severity: row.severity === null ? null : ScoutSeverity.parse(row.severity),
      text: row.text,
      context: contextOf(row),
      status: ScoutStatus.parse(row.status),
      fixedNote: row.fixedNote,
      adminNote: row.adminNote,
      captureUrl: row.mediaKey ? mediaUrl(publicApiUrl, row.mediaKey) : null,
      mission: row.mission,
      createdAt: row.createdAt.toISOString(),
      fixedAt: row.fixedAt?.toISOString() ?? null,
    })),
    missionsDone: done?.n ?? 0,
  })
}
