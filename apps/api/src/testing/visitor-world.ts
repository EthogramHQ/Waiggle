// Les gestes communs aux tests des lectures sans compte (tranche R12) : envoyer une photo, publier
// une mise à jour, retirer un contenu ou une partie par la modération, suspendre, mettre en vitrine,
// et lire une route comme un visiteur. Chaque geste passe par l'API, comme dans l'appli ; seul ce
// que les lectures montrent ensuite compte. Rien ici n'est utilisé en production.
import { randomUUID } from 'node:crypto'
import { ProjectUpdate, type ReportPart, type ReportTarget } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { expect, vi } from 'vitest'
import type { activity } from './activity'
import type { TestContext } from './context'
import { avatarForm, jpegImage, visualForm } from './images'

/** Avance la fausse horloge d'une seconde : chaque geste a sa propre date. */
export const later = () => vi.setSystemTime(Date.now() + 1000)

/** Un identifiant bien formé qui ne désigne rien (projet, mise à jour ou membre). */
export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

/** L'explication d'un retrait, assez longue pour le contrat. */
const EXPLANATION = 'Ce contenu ne respecte pas les règles de la communauté.'

/**
 * Une réponse réduite à ce qui la distingue : statut, corps, et les en-têtes qu'un 404 « caché »
 * doit partager avec celui d'un identifiant inconnu (relecture de sécurité B3).
 */
export type Answer = {
  status: number
  body: string
  cacheControl: string | null
  contentType: string | null
}

export const answerOf = async (res: Response): Promise<Answer> => ({
  status: res.status,
  body: await res.text(),
  cacheControl: res.headers.get('cache-control'),
  contentType: res.headers.get('content-type'),
})

/**
 * Un 200 lu par un visiteur ne va jamais dans un cache partagé (décision 3 de la relecture du plan) :
 * un en-tête est posé, sans `public`, avec `private`, `no-cache` ou `no-store`, et une durée de
 * 60 secondes au plus s'il en donne une.
 */
export const expectNoSharedCache = (cacheControl: string | null, where: string) => {
  expect(cacheControl, `${where}: Cache-Control`).not.toBeNull()
  const value = cacheControl ?? ''
  expect(value, where).not.toMatch(/\bpublic\b/)
  expect(value, where).not.toMatch(/\bimmutable\b/)
  expect(value, where).toMatch(/\b(private|no-cache|no-store)\b/)
  const maxAge = value.match(/\bmax-age=(\d+)/)?.[1]
  if (maxAge !== undefined) expect(Number(maxAge), where).toBeLessThanOrEqual(60)
}

/** Un fichier qui n'a jamais existé, dans le même dossier que `path`. */
export const unknownFileBeside = (path: string) =>
  `${path.slice(0, path.lastIndexOf('/'))}/${randomUUID()}.webp`

export const visitorGestures = (ctx: TestContext, act: ReturnType<typeof activity>) => {
  /** Lit une route comme un visiteur sans compte (aucun cookie, son adresse IP). */
  const asVisitor = async (path: string, ip?: string) => answerOf(await ctx.visitor(path, {}, ip))

  /** Lit une route comme un visiteur et attend 200 ; rend le corps déjà lu en JSON. */
  const visitorJson = async (path: string): Promise<unknown> => {
    const answer = await asVisitor(path)
    expect(answer.status, `GET ${path} as a visitor: ${answer.body.slice(0, 120)}`).toBe(200)
    return JSON.parse(answer.body)
  }

  /** Les photos d'un projet, lues en base : leur identifiant et leur clé de stockage. */
  const mediaRows = (projectId: string) =>
    ctx.db
      .select({ id: schema.projectMedia.id, key: schema.projectMedia.storageKey })
      .from(schema.projectMedia)
      .where(eq(schema.projectMedia.projectId, projectId))

  /**
   * Ajoute une photo à un projet (galerie, couverture verticale, ou en attente d'une mise à jour) ;
   * rend son identifiant et son adresse sous /media.
   */
  const uploadVisual = async (
    cookie: string,
    projectId: string,
    slot?: 'gallery' | 'portrait' | 'update',
  ) => {
    const known = new Set((await mediaRows(projectId)).map((row) => row.id))
    later()
    const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
      method: 'POST',
      headers: { cookie },
      // La couverture verticale doit être en hauteur (415 sinon).
      body: visualForm(
        await (slot === 'portrait' ? jpegImage(600, 1000) : jpegImage(800, 600)),
        slot,
      ),
    })
    expect(res.status, `visual ${slot ?? 'gallery'}`).toBe(201)
    const added = (await mediaRows(projectId)).find((row) => !known.has(row.id))
    if (!added) throw new Error('no new photo')
    return { id: added.id, path: `/media/${added.key}` }
  }

  /** Envoie une photo de profil ; rend son adresse sous /media. */
  const uploadAvatar = async (cookie: string) => {
    later()
    const res = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie },
      body: avatarForm(await jpegImage(600, 600, '#c0563b')),
    })
    expect(res.ok, `avatar: ${res.status}`).toBe(true)
    const url = (await act.me(cookie)).avatarUrl
    if (!url) throw new Error('no avatar after the upload')
    return new URL(url).pathname
  }

  /** Publie une mise à jour d'une ligne, avec ses photos déjà envoyées. */
  const publishUpdate = async (
    cookie: string,
    projectId: string,
    photoIds: string[] = [],
    text = 'Les prévisions arrivent maintenant à 7 h.',
  ) => {
    later()
    const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
      title: null,
      version: null,
      lines: [{ family: 'new', text }],
      photos: photoIds.map((id) => ({ id, description: null })),
      beforeAfter: false,
    })
    expect(res.status, 'update').toBe(201)
    return ProjectUpdate.parse(await res.json())
  }

  /** Un membre signale (une partie d'un) contenu, puis l'administrateur le retire. */
  const remove = async (
    reporter: string,
    admin: string,
    target: ReportTarget,
    part?: ReportPart,
  ) => {
    later()
    const reported = await act.send('POST', '/v1/reports', reporter, {
      target,
      ...(part && { part }),
      reason: 'other',
    })
    expect(reported.status, `report of ${target.kind}`).toBe(201)
    later()
    await act.decide(admin, {
      action: 'remove',
      target,
      ...(part && { part }),
      ground: 'rules',
      explanation: EXPLANATION,
    })
  }

  /** L'administrateur suspend un membre pour 7 jours. */
  const suspend = async (admin: string, memberId: string) => {
    later()
    const res = await act.send('POST', '/v1/moderation/decisions', admin, {
      action: 'suspend',
      memberId,
      duration: '7d',
      ground: 'rules',
      explanation: EXPLANATION,
    })
    expect(res.status, 'suspension').toBe(201)
  }

  /** L'administrateur règle la vitrine entière (PUT /v1/moderation/showcase, `ShowcaseOrder`). */
  const setShowcase = async (admin: string, projectIds: string[]) => {
    later()
    const res = await act.send('PUT', '/v1/moderation/showcase', admin, { projectIds })
    expect([200, 204], `PUT /v1/moderation/showcase: ${res.status}`).toContain(res.status)
  }

  /** Change la visibilité d'un projet, par l'API, et attend 200. */
  const setVisibility = async (
    cookie: string,
    projectId: string,
    body: { visibility: string; hiveId?: string },
  ) => {
    later()
    const res = await act.send('PATCH', `/v1/projects/${projectId}`, cookie, body)
    expect(res.status, `PATCH visibility ${body.visibility}: ${await res.clone().text()}`).toBe(200)
  }

  return {
    asVisitor,
    visitorJson,
    uploadVisual,
    uploadAvatar,
    publishUpdate,
    remove,
    suspend,
    setShowcase,
    setVisibility,
  }
}
