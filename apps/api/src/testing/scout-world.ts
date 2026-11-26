// Les outils des tests des Éclaireuses côté administrateur et données (R20, « Les Éclaireuses ») :
// inscrire un membre, en faire une Éclaireuse, envoyer un retour (multipart, comme la feuille de la
// Goutte), lire et trier la page de l'administrateur, lire ce que la base garde. Rien ici n'est
// utilisé en production.
//
// Devenir Éclaireuse par le code a ses propres tests (scouts.join.test.ts). Ici, on pose la ligne
// directement en base (`makeScout`), par les colonnes que fixe le plan (choix 1 : table `scout`,
// `member_id`, `joined_at`, `via`, `removed_at`, `show_drop`) : ces tests ne dépendent ainsi ni du
// code des Éclaireuses ni de sa configuration. Tant que la table n'existe pas, l'écriture échoue
// (« Failed query ») : c'est la bonne raison du rouge.
//
// L'identifiant d'un membre est lu dans le JSON brut de GET /v1/me, sans `Me.parse` : le contrat y
// ajoute `scout`, que l'API ne renvoie pas encore ; sinon chaque test tomberait dans son
// `beforeEach`, avant d'atteindre la règle qu'il vérifie.
import {
  NotificationPage,
  ScoutReport,
  ScoutReportPage,
  type ScoutReportsQuery,
  ScoutTriage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { expect } from 'vitest'
import type { activity } from './activity'
import type { TestContext } from './context'

/** Un membre inscrit et vérifié : son cookie, son identifiant, de quoi se reconnecter. */
export type ScoutTestMember = { cookie: string; id: string; email: string; password: string }

/** L'adresse e-mail et le mot de passe tirés du nom, sans accents (l'inscription refuse « inès@… »). */
const credentialsOf = (name: string) => {
  const local = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
  return { email: `${local}@example.com`, password: `${local}-long-password` }
}

/**
 * Inscrit un membre depuis sa propre adresse IP (le quota d'inscription par IP s'arrête à six) et
 * ouvre son lien de vérification.
 */
export const scoutMember = async (
  ctx: TestContext,
  name: string,
  ip: string,
): Promise<ScoutTestMember> => {
  const { email, password } = credentialsOf(name)
  await ctx.signUp({ name, email, password }, { 'x-real-ip': ip })
  const sent = ctx.mailer.sent.findLast((mail) => mail.to === email)
  const link = sent?.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error(`no verification link for ${email}`)
  const url = new URL(link)
  const cookie = ctx.cookiesFrom(await ctx.request(url.pathname + url.search))
  const me = await ctx.request('/v1/me', { headers: { cookie } })
  if (me.status !== 200) throw new Error(`GET /v1/me: ${me.status}`)
  const { id } = (await me.json()) as { id: string }
  return { cookie, id, email, password }
}

/** Inscrit une personne sans ouvrir son lien : son adresse reste non vérifiée. Rend son identifiant. */
export const unverifiedMember = async (ctx: TestContext, name: string, ip: string) => {
  const { email, password } = credentialsOf(name)
  await ctx.signUp({ name, email, password }, { 'x-real-ip': ip })
  const [row] = await ctx.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  if (!row) throw new Error(`no account for ${email}`)
  return row.id
}

/** Une date pour une colonne `timestamp` sans fuseau : le texte ISO, lu en temps universel. */
const utc = (date: Date) => sql`${date.toISOString()}::timestamptz at time zone 'UTC'`

/** Fait de ce membre une Éclaireuse, entrée à `joinedAt` (maintenant par défaut), Goutte affichée. */
export const makeScout = (ctx: TestContext, memberId: string, joinedAt = new Date()) =>
  ctx.db.execute(
    sql`insert into scout (member_id, joined_at, via, show_drop)
        values (${memberId}, ${utc(joinedAt)}, 'settings', true)`,
  )

/** Un nombre lu en SQL brut (`count(*)::int as n`). */
const countOf = async (ctx: TestContext, query: ReturnType<typeof sql>) => {
  const result = (await ctx.db.execute(query)) as unknown as { rows: { n: number }[] }
  return result.rows[0]?.n ?? 0
}

/** Ce que la base garde des Éclaireuses pour ce membre : sa ligne, ses retours, ses missions faites. */
export const scoutRowsOf = async (ctx: TestContext, memberId: string) => ({
  scout: await countOf(
    ctx,
    sql`select count(*)::int as n from scout where member_id = ${memberId}`,
  ),
  reports: await countOf(
    ctx,
    sql`select count(*)::int as n from scout_report where member_id = ${memberId}`,
  ),
  missionsDone: await countOf(
    ctx,
    sql`select count(*)::int as n from scout_mission_done where member_id = ${memberId}`,
  ),
})

/** Le miel d'un membre pour une raison donnée (`honey_entry.reason`), en nombre d'entrées et en total. */
export const honeyFor = async (ctx: TestContext, memberId: string, reason: string) => {
  const result = (await ctx.db.execute(
    sql`select count(*)::int as n, coalesce(sum(amount), 0)::int as total
        from honey_entry where member_id = ${memberId} and reason = ${reason}`,
  )) as unknown as { rows: { n: number; total: number }[] }
  return result.rows[0] ?? { n: 0, total: 0 }
}

/** Les fichiers des captures des Éclaireuses dans le stockage (dossier `scouts/`). */
export const scoutFiles = (ctx: TestContext) =>
  [...ctx.storage.files.keys()].filter((key) => key.startsWith('scouts/'))

/** Un retour « Bug, Gênant », sans mission ni contexte : le plus simple qui soit valide. */
export const BUG = { kind: 'bug', severity: 'annoying', text: 'Le bouton Publier ne répond pas.' }

/** Le contexte joint par la feuille, case cochée. */
export const CONTEXT = {
  screen: '/projects',
  platform: 'web',
  width: 1280,
  appVersion: 'a1b2c3d',
  language: 'fr',
  scheme: 'day',
} as const

export const scoutWorld = (ctx: TestContext, act: ReturnType<typeof activity>) => {
  /**
   * Envoie un retour (POST /v1/me/scout/reports), en multipart comme l'appli : la partie `report`
   * (le JSON, en texte) et, si elle est donnée, la capture dans la partie `file`. Réponse brute.
   */
  const sendReport = (cookie: string, report: object = BUG, capture?: Uint8Array) => {
    const form = new FormData()
    form.append('report', JSON.stringify(report))
    if (capture) {
      form.append(
        'file',
        new File([new Uint8Array(capture)], 'capture.jpg', { type: 'image/jpeg' }),
      )
    }
    return ctx.request('/v1/me/scout/reports', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
  }

  /** Envoie un retour qui doit être accepté (201) et le rend. */
  const report = async (cookie: string, body: object = BUG, capture?: Uint8Array) => {
    const res = await sendReport(cookie, body, capture)
    expect(res.status, `POST /v1/me/scout/reports: ${await res.clone().text()}`).toBe(201)
    return ScoutReport.parse(await res.json())
  }

  /** Supprime un de ses retours (DELETE /v1/me/scout/reports/{id} → 204). */
  const deleteReport = async (cookie: string, reportId: string) => {
    const res = await act.send('DELETE', `/v1/me/scout/reports/${reportId}`, cookie)
    expect(res.status, `DELETE report: ${await res.clone().text()}`).toBe(204)
  }

  /** Le haut de la page de tri (GET /v1/moderation/scouts), qui doit répondre 200. */
  const triage = async (cookie: string) => {
    const res = await act.send('GET', '/v1/moderation/scouts', cookie)
    expect(res.status, `GET /v1/moderation/scouts: ${await res.clone().text()}`).toBe(200)
    return ScoutTriage.parse(await res.json())
  }

  /** « Lancer le mois » (POST /v1/moderation/scouts/program), réponse brute. */
  const launch = (cookie: string) => act.send('POST', '/v1/moderation/scouts/program', cookie)

  /** Les missions de la semaine (PUT /v1/moderation/scouts/missions), réponse brute. */
  const putMissions = (cookie: string, missions: unknown) =>
    act.send('PUT', '/v1/moderation/scouts/missions', cookie, { missions })

  /** Les missions, qui doivent être acceptées ; rend les missions de la semaine, lues dans le tri. */
  const setMissions = async (cookie: string, missions: object[]) => {
    const res = await putMissions(cookie, missions)
    expect(res.ok, `PUT missions: ${res.status} ${await res.clone().text()}`).toBe(true)
    return (await triage(cookie)).missions
  }

  /** Une page des retours (GET /v1/moderation/scouts/reports), qui doit répondre 200. */
  const reports = async (cookie: string, query: ScoutReportsQuery = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
    )
    const path = `/v1/moderation/scouts/reports${params.size > 0 ? `?${params}` : ''}`
    const res = await act.send('GET', path, cookie)
    expect(res.status, `GET ${path}: ${await res.clone().text()}`).toBe(200)
    return ScoutReportPage.parse(await res.json())
  }

  /** Change un retour (PATCH /v1/moderation/scouts/reports/{id}), réponse brute. */
  const patchReport = (cookie: string, reportId: string, body: unknown) =>
    act.send('PATCH', `/v1/moderation/scouts/reports/${reportId}`, cookie, body)

  /** Un changement qui doit réussir. */
  const setReport = async (cookie: string, reportId: string, body: object) => {
    const res = await patchReport(cookie, reportId, body)
    expect(res.ok, `PATCH report: ${res.status} ${await res.clone().text()}`).toBe(true)
  }

  /** « Retirer » (DELETE /v1/moderation/scouts/{memberId}), réponse brute. */
  const removeScout = (cookie: string, memberId: string, body?: unknown) =>
    act.send('DELETE', `/v1/moderation/scouts/${memberId}`, cookie, body)

  /** Le retour, tel que l'administrateur le lit dans sa liste (toutes pages confondues : 30 au plus ici). */
  const adminReport = async (cookie: string, reportId: string) =>
    (await reports(cookie)).reports.find((item) => item.id === reportId)

  /** La première page de l'Activité de ce membre. */
  const notices = async (cookie: string) => {
    const res = await act.send('GET', '/v1/notifications', cookie)
    expect(res.status).toBe(200)
    return NotificationPage.parse(await res.json()).items
  }

  /** `Me.scout`, lu dans le JSON brut de GET /v1/me. */
  const meScout = async (cookie: string) => {
    const res = await act.send('GET', '/v1/me', cookie)
    expect(res.status).toBe(200)
    return ((await res.json()) as { scout?: unknown }).scout
  }

  return {
    sendReport,
    report,
    deleteReport,
    triage,
    launch,
    putMissions,
    setMissions,
    reports,
    patchReport,
    setReport,
    removeScout,
    adminReport,
    notices,
    meScout,
  }
}
