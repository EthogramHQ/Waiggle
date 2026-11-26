// La page de tri des Éclaireuses, côté base (R20, docs/scenarios/refonte.md, « La page de tri » ;
// plan R20, choix 9) : le haut de la page, « Lancer le mois », les missions de la semaine, la liste
// des retours, le statut et les notes d'un retour, et « Retirer ». Les routes
// (routes/scout-triage.ts) ne font que vérifier l'administrateur et la forme des demandes, puis
// appellent ces fonctions.
//
// « Corrigé » est définitif (contrat, `scout_report_fixed`) : c'est le seul statut qui paie (50
// pollen et 10 miel) et qui prévient l'Éclaireuse. « Gardé de côté » et les autres ne disent rien.
import { randomUUID } from 'node:crypto'
import {
  programEndOf,
  SCOUT_HEARD_HONEY,
  SCOUT_TRIAGE_PAGE_SIZE,
  type ScoutMissionsInput,
  ScoutReportAdmin,
  ScoutReportPage,
  type ScoutReportPatch,
  type ScoutReportsQuery,
  ScoutTriage,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { award } from '../game/award'
import { writeNotice, writeNotices } from '../game/notices'
import { currentHandleOf } from '../handles/load'
import { avatarUrlOf, mediaUrl } from '../profile/me'
import { isProgramOver, loadScoutProgram, lockScouts, scoutPlaces } from './join'

const s = schema.scout
const r = schema.scoutReport
const m = schema.scoutMission

/** Ce qui nomme un membre dans la page de tri : son nom, son pseudo actuel, sa photo. */
const memberColumns = {
  id: schema.user.id,
  name: schema.user.name,
  handle: schema.memberHandle.handle,
  avatarKey: schema.profile.avatarKey,
}

type MemberColumns = { id: string; name: string; handle: string | null; avatarKey: string | null }

/**
 * Le membre tel que la page le montre. Un compte pas encore vérifié n'a ni profil ni pseudo : son
 * pseudo vaut alors « » et l'appli le montre « en attente » (relecture de sécurité A1), plutôt
 * qu'une erreur.
 */
const memberOf = (row: MemberColumns, publicApiUrl: string) => ({
  id: row.id,
  name: row.name,
  handle: row.handle ?? '',
  avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey),
})

/** Une date de la base, ou null, écrite en texte ISO pour le JSON. */
const iso = (date: Date | null) => (date === null ? null : date.toISOString())

// ─── Le haut de la page ──────────────────────────────────────────────────────────────────────────

/**
 * Le haut de la page de tri, à l'heure `now` : le mois, les places, les missions de la semaine et
 * toutes les Éclaireuses, retirées comprises, avec leur nombre de retours. Quatre requêtes, quel
 * que soit le nombre d'Éclaireuses :
 * - le mois, par la clé primaire de `scout_program` ;
 * - les places (`scoutPlaces`, scouts/join.ts) ;
 * - les missions de la semaine, par l'index unique (week, position) de `scout_mission`, qui les rend
 *   dans l'ordre ;
 * - les Éclaireuses : la table `scout` entière (une trentaine de lignes), chacune jointe à son
 *   compte (clé primaire), son profil (clé primaire) et son pseudo actuel (index partiel
 *   member_handle_current_idx). Le nombre de ses retours est une sous-requête par Éclaireuse, qui
 *   compte dans l'index scout_report_member_idx (member_id, created_at) sans lire la table.
 */
export const loadTriage = async (
  db: Database,
  now: Date,
  publicApiUrl: string,
): Promise<ScoutTriage> => {
  const week = weekOf(now)
  const program = await loadScoutProgram(db)
  const places = await scoutPlaces(db, now)
  const missions = await db
    .select({ id: m.id, position: m.position, textFr: m.textFr, textEn: m.textEn })
    .from(m)
    .where(eq(m.week, week))
    .orderBy(m.position)
  const scouts = await db
    .select({
      ...memberColumns,
      joinedAt: s.joinedAt,
      removedAt: s.removedAt,
      // La colonne écrite avec le nom de sa table (`sql.raw`) : sinon la sous-requête pourrait la
      // lire dans `scout_report`, qui a aussi une colonne member_id (pieges/drizzle-pglite.md).
      reports: sql<number>`(select count(*)::int from scout_report sr
        where sr.member_id = ${sql.raw('"scout"."member_id"')})`,
    })
    .from(s)
    .innerJoin(schema.user, eq(schema.user.id, s.memberId))
    .leftJoin(schema.profile, eq(schema.profile.userId, s.memberId))
    .leftJoin(schema.memberHandle, currentHandleOf(s.memberId))
    .orderBy(s.joinedAt, s.memberId)
  return ScoutTriage.parse({
    program: { startedAt: iso(program?.startedAt ?? null), endsAt: iso(program?.endsAt ?? null) },
    places,
    week,
    missions,
    scouts: scouts.map((row) => ({
      member: memberOf(row, publicApiUrl),
      joinedAt: row.joinedAt.toISOString(),
      removedAt: iso(row.removedAt),
      reports: row.reports,
    })),
  })
}

// ─── « Lancer le mois » ──────────────────────────────────────────────────────────────────────────

/**
 * Lance le mois à l'heure `now`, jusqu'à minuit de Paris au soir du 30e jour (`programEndOf` du
 * contrat). Rend faux s'il était déjà lancé : « insert … on conflict do nothing returning » n'écrit
 * pas la seconde ligne (la clé primaire `id = 1` la refuse) et ne rend alors rien. Deux lancements
 * simultanés n'en écrivent qu'un, sans verrou.
 */
export const launchProgram = async (db: Database, now: Date): Promise<boolean> => {
  const written = await db
    .insert(schema.scoutProgram)
    .values({ id: 1, startedAt: now, endsAt: programEndOf(now) })
    .onConflictDoNothing()
    .returning({ id: schema.scoutProgram.id })
  return written.length > 0
}

// ─── Les missions de la semaine ──────────────────────────────────────────────────────────────────

/**
 * Une semaine où ranger un instant les missions gardées pendant qu'on les renumérote : l'index
 * unique (week, position) refuserait d'échanger deux places d'un coup (PostgreSQL vérifie chaque
 * ligne aussitôt), et les places ne vont que de 1 à 3. Ce lundi de l'an 2000 n'est jamais une vraie
 * semaine, et rien n'y reste : la transaction les en sort avant de finir.
 */
const PARKING_WEEK = '2000-01-03'

/**
 * Écrit les missions de la semaine en cours, dans l'ordre donné (place 1, 2, 3). Une mission qui
 * cite son `id` est gardée (son texte peut changer) ; une mission de la semaine absente de la liste
 * est effacée : ses « faites » partent avec (cascade), ses retours gardent leur texte et perdent le
 * lien (`set null`). Rend `unknown_mission` si un `id` n'est pas une mission de cette semaine (rien
 * n'est écrit).
 *
 * La première fois qu'une semaine reçoit des missions (aucune avant, au moins une après), chaque
 * Éclaireuse active reçoit l'avis « N missions cette semaine » (sauf « Ma récolte » coupée) ; l'index
 * unique (member_id, code) de `game_notice` n'en garde qu'un par membre et par semaine.
 *
 * Une transaction, sous le verrou des Éclaireuses : deux enregistrements simultanés passent l'un
 * après l'autre, et le second voit les missions du premier.
 */
export const saveMissions = (
  db: Database,
  input: ScoutMissionsInput,
  now: Date,
): Promise<'saved' | 'unknown_mission'> =>
  db.transaction(async (tx) => {
    await lockScouts(tx)
    const week = weekOf(now)
    const existing = await tx.select({ id: m.id }).from(m).where(eq(m.week, week))
    const existingIds = new Set(existing.map((row) => row.id))
    const keptIds = input.missions.flatMap((mission) => (mission.id ? [mission.id] : []))
    if (keptIds.some((id) => !existingIds.has(id))) return 'unknown_mission'

    const goneIds = [...existingIds].filter((id) => !keptIds.includes(id))
    if (goneIds.length > 0) await tx.delete(m).where(inArray(m.id, goneIds))
    if (keptIds.length > 0) {
      await tx.update(m).set({ week: PARKING_WEEK }).where(inArray(m.id, keptIds))
    }
    for (const [index, mission] of input.missions.entries()) {
      const values = {
        week,
        position: index + 1,
        textFr: mission.textFr,
        textEn: mission.textEn ?? null,
      }
      if (mission.id) {
        await tx.update(m).set(values).where(eq(m.id, mission.id))
      } else {
        await tx.insert(m).values({ id: randomUUID(), ...values, createdAt: now })
      }
    }

    if (existing.length === 0 && input.missions.length > 0) {
      // Les Éclaireuses actives : non retirées, et le mois pas fini (fini, plus personne ne l'est).
      if (isProgramOver(await loadScoutProgram(tx), now)) return 'saved'
      const active = await tx.select({ memberId: s.memberId }).from(s).where(isNull(s.removedAt))
      await writeNotices(
        tx,
        active.map(({ memberId }) => ({
          memberId,
          notice: { kind: 'scout_missions', week, count: input.missions.length },
        })),
        now,
      )
    }
    return 'saved'
  })

// ─── La liste des retours ────────────────────────────────────────────────────────────────────────

/**
 * Une page de retours, les plus récents d'abord (date, puis identifiant pour départager deux
 * retours du même instant), filtrée par statut, sorte et gravité, après le curseur s'il y en a un.
 * Une requête : 31 lignes lues pour savoir s'il reste une page. Sans filtre, l'index
 * scout_report_created_idx (created_at desc, id desc) donne les lignes dans l'ordre à partir du
 * curseur ; filtrée par statut, scout_report_status_idx (status, created_at desc). Chaque retour est
 * joint à son autrice (clés primaires, pseudo par member_handle_current_idx) et à sa mission (clé
 * primaire). Le texte de la mission est dans la langue de l'administrateur, le français à défaut.
 */
export const loadReportPage = async (
  db: Database,
  filters: Omit<ScoutReportsQuery, 'cursor'>,
  cursor: CursorContent | null,
  english: boolean,
  publicApiUrl: string,
): Promise<ScoutReportPage> => {
  const conditions: SQL[] = []
  if (filters.status) conditions.push(eq(r.status, filters.status))
  if (filters.kind) conditions.push(eq(r.kind, filters.kind))
  if (filters.severity) conditions.push(eq(r.severity, filters.severity))
  if (cursor) conditions.push(after(cursor, r.createdAt, r.id))
  const rows = await selectReports(db, and(...conditions), SCOUT_TRIAGE_PAGE_SIZE + 1)
  const page = rows.slice(0, SCOUT_TRIAGE_PAGE_SIZE)
  const last = page.at(-1)
  const nextCursor =
    rows.length > SCOUT_TRIAGE_PAGE_SIZE && last
      ? encodeCursor({ at: last.report.createdAt.toISOString(), id: last.report.id })
      : null
  return ScoutReportPage.parse({
    reports: page.map((row) => adminReportOf(row, english, publicApiUrl)),
    nextCursor,
  })
}

/**
 * Un retour, tel que la page de tri le montre (la réponse de PATCH) ; null s'il n'existe pas. Une
 * requête, par la clé primaire de scout_report.
 */
export const loadAdminReport = async (
  db: Database,
  id: string,
  english: boolean,
  publicApiUrl: string,
): Promise<ScoutReportAdmin | null> => {
  const [row] = await selectReports(db, eq(r.id, id), 1)
  return row ? ScoutReportAdmin.parse(adminReportOf(row, english, publicApiUrl)) : null
}

/** Les retours qui remplissent `where`, avec leur autrice et leur mission, les plus récents d'abord. */
const selectReports = (db: Database, where: SQL | undefined, limit: number) =>
  db
    .select({
      report: r,
      author: memberColumns,
      missionFr: m.textFr,
      missionEn: m.textEn,
    })
    .from(r)
    .innerJoin(schema.user, eq(schema.user.id, r.memberId))
    .leftJoin(schema.profile, eq(schema.profile.userId, r.memberId))
    .leftJoin(schema.memberHandle, currentHandleOf(r.memberId))
    .leftJoin(m, eq(m.id, r.missionId))
    .where(where)
    .orderBy(desc(r.createdAt), desc(r.id))
    .limit(limit)

type ReportRow = Awaited<ReturnType<typeof selectReports>>[number]

/** Une ligne lue en un retour de la page de tri (validé ensuite par le contrat). */
const adminReportOf = (
  { report, author, missionFr, missionEn }: ReportRow,
  english: boolean,
  publicApiUrl: string,
) => ({
  id: report.id,
  kind: report.kind,
  severity: report.severity,
  text: report.text,
  mission:
    report.missionId !== null && missionFr !== null
      ? { id: report.missionId, text: english && missionEn !== null ? missionEn : missionFr }
      : null,
  // Le contexte est joint en entier ou pas du tout : sans écran, la case était décochée.
  context:
    report.screen === null
      ? null
      : {
          screen: report.screen,
          platform: report.platform,
          width: report.width,
          appVersion: report.appVersion,
          language: report.language,
          scheme: report.scheme,
        },
  mediaUrl: report.mediaKey === null ? null : mediaUrl(publicApiUrl, report.mediaKey),
  status: report.status,
  fixedNote: report.fixedNote,
  createdAt: report.createdAt.toISOString(),
  fixedAt: iso(report.fixedAt),
  author: memberOf(author, publicApiUrl),
  adminNote: report.adminNote,
  updatedAt: report.updatedAt.toISOString(),
})

// ─── Le statut et les notes d'un retour ──────────────────────────────────────────────────────────

/** Une note vide efface la note (le contrat a déjà retiré les blancs du début et de la fin). */
const noteOf = (note: string | null) => (note === null || note === '' ? null : note)

/**
 * Change un retour : son statut, la note privée de l'administrateur, la note pour l'Éclaireuse.
 * Rend `not_found` (retour inconnu), `scout_report_fixed` (un retour corrigé ne change plus de
 * statut), `not_fixed` (une note pour l'Éclaireuse sur un retour qui n'est pas corrigé) ou `ok`.
 *
 * Passer à « Corrigé » (relecture de sécurité A4) : « update … where status <> 'fixed'
 * returning » ne rend la ligne qu'une fois, si bien que deux clics simultanés ne paient et
 * n'annoncent qu'une fois. La ligne rendue paie 50 pollen (`award`, geste `scout_heard`), puis, si
 * `award` a payé (ni compte d'exemple ni Éclaireuse suspendue), 10 miel, et écrit l'avis « Ta danse
 * a été entendue ». Le tout dans une transaction ; la ligne du retour est d'abord verrouillée
 * (« select … for update ») pour lire son statut sans qu'un autre changement passe entre-temps.
 */
/**
 * Ce que rend un changement fait (R21) : l'Éclaireuse du retour, et si sa danse vient d'être
 * entendue (« Corrigé » : l'avis, le pollen et le miel sont écrits), pour lui signaler les deux.
 */
export type PatchOutcome = { memberId: string; heard: boolean }

export const patchReport = (
  db: Database,
  id: string,
  patch: ScoutReportPatch,
  now: Date,
): Promise<PatchOutcome | 'not_found' | 'scout_report_fixed' | 'not_fixed'> =>
  db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: r.status, memberId: r.memberId })
      .from(r)
      .where(eq(r.id, id))
      .for('update')
    if (!current) return 'not_found'
    if (patch.status !== undefined && current.status === 'fixed') return 'scout_report_fixed'
    const fixing = patch.status === 'fixed'
    if (patch.fixedNote !== undefined && !fixing && current.status !== 'fixed') return 'not_fixed'

    const changed = await tx
      .update(r)
      .set({
        updatedAt: now,
        ...(patch.status !== undefined && { status: patch.status }),
        ...(fixing && { fixedAt: now }),
        ...(patch.adminNote !== undefined && { adminNote: noteOf(patch.adminNote) }),
        ...(patch.fixedNote !== undefined && { fixedNote: noteOf(patch.fixedNote) }),
      })
      .where(fixing ? and(eq(r.id, id), ne(r.status, 'fixed')) : eq(r.id, id))
      .returning({ id: r.id })
    if (!fixing || changed.length === 0) return { memberId: current.memberId, heard: false }

    const pollen = await award(tx, {
      memberId: current.memberId,
      gesture: 'scout_heard',
      sourceKind: 'scout_report',
      sourceId: id,
      sourceKey: id,
      now,
    })
    if (pollen > 0) {
      // L'index unique honey_entry_once_idx (membre, `scout:<id>`) refuse un second miel sans
      // erreur (« on conflict do nothing »).
      await tx
        .insert(schema.honeyEntry)
        .values({
          id: randomUUID(),
          memberId: current.memberId,
          amount: SCOUT_HEARD_HONEY,
          reason: 'scout_heard',
          sourceKey: `scout:${id}`,
          createdAt: now,
        })
        .onConflictDoNothing()
    }
    // L'avis part toujours (la danse a bien été entendue), mais il ne garde le miel que s'il a été
    // versé : une Éclaireuse suspendue ne lit pas « +50 pollen · +10 miel » (relecture juridique L1).
    const honey = pollen > 0 ? SCOUT_HEARD_HONEY : null
    await writeNotice(tx, current.memberId, { kind: 'scout_heard', reportId: id, honey }, now)
    return { memberId: current.memberId, heard: true }
  })

// ─── « Retirer » ─────────────────────────────────────────────────────────────────────────────────

/**
 * Retire une Éclaireuse, pour un abus, avec son motif (relecture juridique J1) : `removed_at` et le
 * motif sur sa ligne, puis l'avis « retirée », que « Ma récolte » ne coupe pas. Sa place se libère
 * (les places ne comptent que les non retirées) ; ses retours, son pollen et son sceau restent.
 * Rend `not_found` (pas Éclaireuse, ou inconnu), `scout_removed` (déjà retirée) ou `removed`. Une
 * transaction ; la ligne est verrouillée par sa clé primaire (« for update »), pour qu'un double clic
 * n'écrive pas deux avis.
 */
export const removeScout = (
  db: Database,
  memberId: string,
  reason: string,
  now: Date,
): Promise<'removed' | 'not_found' | 'scout_removed'> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({ removedAt: s.removedAt })
      .from(s)
      .where(eq(s.memberId, memberId))
      .for('update')
    if (!row) return 'not_found'
    if (row.removedAt !== null) return 'scout_removed'
    await tx
      .update(s)
      .set({ removedAt: now, removalReason: reason })
      .where(eq(s.memberId, memberId))
    await writeNotice(tx, memberId, { kind: 'scout_removed', reason }, now)
    return 'removed'
  })
