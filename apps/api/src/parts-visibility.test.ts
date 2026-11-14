// Tests d'intégration de R9 (7d) : ce que les autres membres voient d'une partie retirée seule par la
// modération (une photo, la couverture, la description, le prompt, le lien de la démo, les outils,
// la bio, les outils favoris, la photo de profil). Rien, sur aucune route, comme si elle n'avait
// jamais été là ; son auteur, lui, la relit dans `removedParts`, et lui seul ouvre le fichier d'une
// photo retirée. Scénario : docs/scenarios/refonte.md, « R9 », « Retirer une partie » ; relecture
// de sécurité du plan (sec-P1 : la valeur sort de sa colonne ; sec-P6 : la couverture est la 1re
// photo visible).
//
// Chaque retrait passe par l'API, comme dans l'appli : un membre signale la partie
// (POST /v1/reports avec `part`), puis l'administrateur la retire (POST /v1/moderation/decisions).
// Ce que la décision écrit (colonne vidée, photo marquée, clé de la photo de profil déplacée) n'est
// donc pas supposé ici : seul compte ce que les lectures montrent ensuite.
//
// Quatre membres : Inès (l'autrice), Max (un autre membre, qui signale), Léa (une autre lectrice),
// Louis (l'administrateur).
import { randomUUID } from 'node:crypto'
import {
  ErrorResponse,
  Member,
  Project,
  ProjectUpdate,
  ProjectUpdatePage,
  type ReportPart,
  type ReportTarget,
  ReportTargetPreview,
  TesterCall,
  TesterCallPage,
  TesterMedia,
  TesterMessage,
  TesterMessagePage,
  ToolList,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let max: string
let lea: string
let louis: string
let inesId: string
let maxId: string

const EXPLANATION = 'Cette partie ne respecte pas les règles de la communauté.'

/** Avance la fausse horloge d'une seconde : chaque geste a sa propre date. */
const later = () => vi.setSystemTime(Date.now() + 1000)

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API (la limite de débit garde la fonction Date.now
  // qu'elle trouve à ce moment-là).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

// ─── Les gestes ──────────────────────────────────────────────────────────────────────────────────

/** Un membre signale une seule partie d'un contenu (la feuille « Signaler », R9). */
const reportPart = async (cookie: string, target: ReportTarget, part: ReportPart) => {
  later()
  const res = await act.send('POST', '/v1/reports', cookie, { target, part, reason: 'other' })
  expect(res.status, `report of ${target.kind} ${part.field}`).toBe(201)
}

/**
 * Retire une partie, comme la modération : un signalement de cette partie (par Max, sauf pour un
 * contenu de Max), puis la décision de Louis.
 */
const removePart = async (target: ReportTarget, part: ReportPart, reporter = max) => {
  await reportPart(reporter, target, part)
  later()
  await act.decide(louis, {
    action: 'remove',
    target,
    part,
    ground: 'rules',
    explanation: EXPLANATION,
  })
}

/** Lit une route et rend sa réponse brute (200 attendu) : on y cherche ce qui ne doit plus y être. */
const rawText = async (path: string, cookie: string) => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, `GET ${path}`).toBe(200)
  return res.text()
}

const projectOf = async (id: string, cookie: string) =>
  Project.parse(JSON.parse(await rawText(`/v1/projects/${id}`, cookie)))

const memberOf = async (id: string, cookie: string) =>
  Member.parse(JSON.parse(await rawText(`/v1/members/${encodeURIComponent(id)}`, cookie)))

/** Envoie une photo de profil ; rend le nom de son fichier, tel qu'il paraît dans les adresses. */
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
  return { path: new URL(url).pathname, file: new URL(url).pathname.split('/').pop() ?? '' }
}

/** Les photos d'un projet, lues en base : leur identifiant et leur clé de stockage. */
const mediaRows = (projectId: string) =>
  ctx.db
    .select({ id: schema.projectMedia.id, key: schema.projectMedia.storageKey })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.projectId, projectId))

/** Ajoute une photo à un projet (galerie, couverture verticale ou en attente d'une mise à jour). */
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
  return added
}

/** Publie une mise à jour d'une ligne, avec ses photos déjà envoyées. */
const publishUpdate = async (cookie: string, projectId: string, photoIds: string[] = []) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
    title: null,
    version: null,
    lines: [{ family: 'new', text: 'Les prévisions arrivent maintenant à 7 h.' }],
    photos: photoIds.map((id) => ({ id, description: null })),
    beforeAfter: false,
  })
  expect(res.status, 'update').toBe(201)
  return ProjectUpdate.parse(await res.json())
}

/** Envoie une image du coin des testeurs (photo d'un appel ou capture d'un message). */
const uploadTesterImage = async (cookie: string, projectId: string, kind: 'call' | 'capture') => {
  later()
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array(await jpegImage(800, 600))], 'image.jpg', { type: 'image/jpeg' }),
  )
  form.append('kind', kind)
  const res = await ctx.request(`/v1/projects/${projectId}/testers/media`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  expect(res.status, `tester ${kind}`).toBe(201)
  const { id } = TesterMedia.parse(await res.json())
  const [row] = await ctx.db
    .select({ key: schema.testerMedia.storageKey })
    .from(schema.testerMedia)
    .where(eq(schema.testerMedia.id, id))
  if (!row) throw new Error(`no tester media ${id}`)
  return { id, key: row.key }
}

/** Un projet « Testable » d'Inès, avec sa démo, et Max parmi ses testeurs. */
const testableProjectWithMax = async () => {
  later()
  const project = await act.publish(ines, 'Météo', {
    status: 'testable',
    demoUrl: 'https://meteo.example.com/',
  })
  later()
  expect((await act.send('POST', `/v1/projects/${project.id}/testers`, max)).status).toBe(204)
  return project
}

/** Max envoie un retour avec une capture dans son fil du projet d'Inès. */
const feedbackWithCapture = async (projectId: string) => {
  const capture = await uploadTesterImage(max, projectId, 'capture')
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/threads/${maxId}/messages`, max, {
    kind: 'feedback',
    outcome: 'no',
    device: 'phone',
    text: 'Le vent du soir n’apparaît pas.',
    captureId: capture.id,
  })
  expect(res.status, 'message').toBe(201)
  return { message: TesterMessage.parse(await res.json()), capture }
}

/** Un fichier : son statut et son corps (le corps d'un 404 se compare à celui d'un fichier inconnu). */
const fetchFile = async (path: string, cookie: string) => {
  const res = await ctx.request(path, { headers: { cookie } })
  return { status: res.status, body: await res.text() }
}

/** Un fichier qui n'a jamais existé, dans le même dossier que `path`. */
const unknownBeside = (path: string) =>
  `${path.slice(0, path.lastIndexOf('/'))}/${randomUUID()}.webp`

// ─── Les règles de la relecture de sécurité ──────────────────────────────────────────────────────

describe('a removed part, for the other members', () => {
  it('never shows a removed avatar to another member, on any route that shows the member', async () => {
    const avatar = await uploadAvatar(ines)
    // Les lieux où Max (et Léa, pour les suggestions) rencontre Inès : sa page, son projet, son
    // commentaire, la mention, la recherche, les fils, la page d'un outil, une notification, le
    // coin des testeurs du projet de Max.
    later()
    const potager = await act.publish(max, 'Potager', {
      status: 'testable',
      demoUrl: 'https://potager.example.com/',
    })
    later()
    await act.followMember(inesId, max)
    later()
    const meteo = await act.publish(ines, 'Météo', { tools: ['Claude'] })
    later()
    const comment = await act.comment(meteo.id, ines, 'Les prévisions arrivent chaque matin.')
    later()
    await act.comment(potager.id, ines, 'Bravo pour le potager !')
    later()
    expect((await act.send('POST', `/v1/projects/${potager.id}/testers`, ines)).status).toBe(204)
    // Un retour d'Inès : son fil paraît dans la liste des fils de Max.
    later()
    const feedback = await act.send(
      'POST',
      `/v1/projects/${potager.id}/threads/${inesId}/messages`,
      ines,
      {
        kind: 'feedback',
        outcome: 'yes',
        device: 'phone',
        text: 'Tout marche chez moi.',
        captureId: null,
      },
    )
    expect(feedback.status).toBe(201)
    const routes: [string, string][] = [
      [`/v1/members/${inesId}`, max],
      [`/v1/projects/${meteo.id}`, max],
      [`/v1/projects/${meteo.id}/comments`, max],
      [`/v1/comments/${comment.id}/context`, max],
      [`/v1/members/mentionable?${new URLSearchParams({ q: 'ines', projectId: potager.id })}`, max],
      ['/v1/search?q=morel', max],
      ['/v1/feed/discover', lea],
      ['/v1/feed/following', max],
      ['/v1/tags/claude', max],
      ['/v1/notifications', max],
      [`/v1/projects/${potager.id}/testers`, max],
      [`/v1/projects/${potager.id}/threads`, max],
      ['/v1/suggestions/members', lea],
    ]
    const showing = async () => {
      const found: string[] = []
      for (const [path, cookie] of routes) {
        const text = await rawText(path, cookie)
        if (text.includes(avatar.file) || text.includes('withheld')) found.push(path)
      }
      return found
    }
    // Témoin : avant le retrait, chacune de ces routes montre bien la photo d'Inès.
    expect(await showing()).toEqual(routes.map(([path]) => path))

    await removePart({ kind: 'member', id: inesId }, { field: 'avatar' })

    expect(await showing()).toEqual([])
    // Inès, elle, la retrouve dans les parties retirées de sa page, servie à elle seule.
    const own = await memberOf(inesId, ines)
    expect(own.removedParts).toEqual([
      expect.objectContaining({ field: 'avatar', imageUrl: expect.any(String) }),
    ])
    expect((await memberOf(inesId, max)).removedParts).toEqual([])
  })

  it('hides a removed description from the search, in the results and in the excerpt', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', {
      description: 'Une carte des vents du Mistralou, mise à jour chaque matin.',
    })
    const search = () => rawText('/v1/search?q=mistralou', max)
    // Témoin : la description seule fait trouver le projet, avec son extrait.
    const before = await search()
    expect(before).toContain(meteo.id)
    expect(before).toContain('Mistralou')

    await removePart({ kind: 'project', id: meteo.id }, { field: 'description' })

    const after = await search()
    expect(after).not.toContain(meteo.id)
    expect(after).not.toContain('Mistralou')
    // Le reste du projet reste visible, sans sa description.
    const seen = await projectOf(meteo.id, max)
    expect(seen.title).toBe('Météo')
    expect(seen.description).toBe('')
    expect(seen.removedParts).toEqual([])
    // Inès la relit dans `removedParts`, pour la remplacer.
    expect((await projectOf(meteo.id, ines)).removedParts).toEqual([
      expect.objectContaining({
        field: 'description',
        mediaId: null,
        value: 'Une carte des vents du Mistralou, mise à jour chaque matin.',
        removal: expect.objectContaining({ ground: 'rules', explanation: EXPLANATION }),
      }),
    ])
  })

  it('drops a project from the testable feed and refuses a new tester once its demo link is removed', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', {
      status: 'testable',
      demoUrl: 'https://meteo.example.com/',
    })
    const testable = () => rawText('/v1/feed/discover?testers=true', max)
    // Témoin : le projet cherche des testeurs.
    expect(await testable()).toContain(meteo.id)

    await removePart({ kind: 'project', id: meteo.id }, { field: 'demoUrl' })

    expect(await testable()).not.toContain(meteo.id)
    expect(await rawText('/v1/feed/discover', max)).not.toContain('meteo.example.com')
    expect((await projectOf(meteo.id, max)).demoUrl).toBeNull()
    const join = await act.send('POST', `/v1/projects/${meteo.id}/testers`, max)
    expect(join.status).toBe(409)
    expect(ErrorResponse.parse(await join.json()).error.code).toBe('not_testable')
    expect((await projectOf(meteo.id, ines)).removedParts).toEqual([
      expect.objectContaining({ field: 'demoUrl', value: 'https://meteo.example.com/' }),
    ])
  })

  it('does not list a project on the page of a tool removed from it', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', { tools: ['Claude', 'Lovable'] })
    const claudeCount = async () =>
      ToolList.parse(JSON.parse(await rawText('/v1/tools', max))).tools.find(
        (tool) => tool.slug === 'claude',
      )?.projectCount
    // Témoin : la page de l'outil le liste, et la liste des outils le compte.
    expect(await rawText('/v1/tags/claude', max)).toContain(meteo.id)
    const counted = await claudeCount()
    expect(counted).toBeGreaterThan(0)

    await removePart({ kind: 'project', id: meteo.id }, { field: 'tools' })

    expect(await rawText('/v1/tags/claude', max)).not.toContain(meteo.id)
    expect(await rawText('/v1/tags/lovable', max)).not.toContain(meteo.id)
    expect(await claudeCount()).toBe((counted ?? 0) - 1)
    expect((await projectOf(meteo.id, max)).tools).toEqual([])
    expect((await projectOf(meteo.id, ines)).removedParts).toEqual([
      expect.objectContaining({ field: 'tools', value: expect.arrayContaining(['Claude']) }),
    ])
  })

  it('shows the next photo as the cover of the card, the page and the notification when the cover is removed', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const first = await uploadVisual(ines, meteo.id)
    const second = await uploadVisual(ines, meteo.id)
    // Max suit le projet : la mise à jour d'Inès lui arrive en notification, avec la couverture.
    later()
    expect((await act.send('POST', `/v1/projects/${meteo.id}/follow`, max)).status).toBe(204)
    await publishUpdate(ines, meteo.id)
    const lists = () =>
      Promise.all([
        // Léa ne suit pas le projet : il est dans son fil « Découvrir ».
        rawText('/v1/feed/discover', lea),
        rawText(`/v1/members/${inesId}`, lea),
        rawText('/v1/notifications', max),
      ])
    // Témoin : la 1re photo est la couverture partout.
    for (const text of await lists()) expect(text).toContain(first.key)
    expect((await projectOf(meteo.id, max)).visuals.map((visual) => visual.id)).toEqual([
      first.id,
      second.id,
    ])

    await removePart({ kind: 'project', id: meteo.id }, { field: 'cover', mediaId: first.id })

    for (const text of await lists()) {
      expect(text).not.toContain(first.key)
      expect(text).toContain(second.key)
    }
    expect((await projectOf(meteo.id, max)).visuals.map((visual) => visual.id)).toEqual([second.id])
    expect((await projectOf(meteo.id, ines)).removedParts).toEqual([
      expect.objectContaining({ mediaId: first.id, value: null }),
    ])
  })

  it('shows the next photo as the thumbnail of the context of a reported comment, in the moderation queue', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const first = await uploadVisual(ines, meteo.id)
    const second = await uploadVisual(ines, meteo.id)
    const comment = await act.comment(meteo.id, max, 'Un commentaire signalé')
    later()
    const reported = await act.send('POST', '/v1/reports', lea, {
      target: { kind: 'comment', id: comment.id },
      reason: 'other',
    })
    expect(reported.status).toBe(201)
    // Témoin : la 1re photo est la miniature du contexte.
    expect(await rawText('/v1/moderation/reports', louis)).toContain(first.key)

    await removePart({ kind: 'project', id: meteo.id }, { field: 'cover', mediaId: first.id })

    const queue = await rawText('/v1/moderation/reports', louis)
    expect(queue).not.toContain(first.key)
    expect(queue).toContain(second.key)
  })

  it('serves a removed avatar, photo, portrait cover, update photo or capture to its author only, with the 404 of an unknown file', async () => {
    const avatar = await uploadAvatar(ines)
    const meteo = await testableProjectWithMax()
    const photo = await uploadVisual(ines, meteo.id)
    const portrait = await uploadVisual(ines, meteo.id, 'portrait')
    const pending = await uploadVisual(ines, meteo.id, 'update')
    const update = await publishUpdate(ines, meteo.id, [pending.id])
    const { message, capture } = await feedbackWithCapture(meteo.id)
    const inesFiles = [
      avatar.path,
      `/media/${photo.key}`,
      `/media/${portrait.key}`,
      `/media/${pending.key}`,
    ]
    // Témoin : avant les retraits, Max ouvre les fichiers d'Inès, et Inès la capture de Max.
    for (const path of inesFiles) expect((await fetchFile(path, max)).status, path).toBe(200)
    expect((await fetchFile(`/media/${capture.key}`, ines)).status).toBe(200)

    await removePart({ kind: 'member', id: inesId }, { field: 'avatar' })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: photo.id })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'cover', mediaId: portrait.id })
    await removePart({ kind: 'update', id: update.id }, { field: 'photo', mediaId: pending.id })
    await removePart(
      { kind: 'message', id: message.id },
      { field: 'photo', mediaId: capture.id },
      ines,
    )

    // Pour l'autre membre : le même 404 qu'un fichier qui n'a jamais existé.
    const hiddenFrom = async (path: string, cookie: string) => {
      const unknown = await fetchFile(unknownBeside(path), cookie)
      expect(unknown.status).toBe(404)
      expect(await fetchFile(path, cookie), path).toEqual(unknown)
    }
    for (const path of inesFiles) await hiddenFrom(path, max)
    await hiddenFrom(`/media/${capture.key}`, ines)
    // Pour son auteur : le fichier s'ouvre encore (la photo de profil, à sa nouvelle adresse).
    for (const path of inesFiles.slice(1))
      expect((await fetchFile(path, ines)).status, path).toBe(200)
    expect((await fetchFile(`/media/${capture.key}`, max)).status).toBe(200)
    const withheld = (await memberOf(inesId, ines)).removedParts.find(
      (part) => part.field === 'avatar',
    )?.imageUrl
    if (!withheld) throw new Error('no removed avatar for its author')
    const withheldPath = new URL(withheld).pathname
    expect((await fetchFile(withheldPath, ines)).status).toBe(200)
    await hiddenFrom(withheldPath, max)
  })
})

// ─── Ce que l'auteur change ensuite ──────────────────────────────────────────────────────────────

describe('a removed part, after the author edits the content', () => {
  it('keeps a removed photo hidden when the author adds a photo, reorders the gallery or describes another photo', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const kept = await uploadVisual(ines, meteo.id)
    const removed = await uploadVisual(ines, meteo.id)
    await removePart({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: removed.id })
    const seenByMax = async () =>
      (await projectOf(meteo.id, max)).visuals.map((visual) => visual.id)
    expect(await seenByMax()).toEqual([kept.id])

    // Elle ajoute une photo.
    const added = await uploadVisual(ines, meteo.id)
    expect(await seenByMax()).toEqual([kept.id, added.id])
    // Elle change l'ordre de sa galerie (tel qu'elle la voit).
    later()
    const order = (await projectOf(meteo.id, ines)).visuals.map((visual) => visual.id).reverse()
    const reordered = await act.send('PATCH', `/v1/projects/${meteo.id}`, ines, {
      visualOrder: order,
    })
    expect(reordered.status).toBe(200)
    expect(await seenByMax()).toEqual([added.id, kept.id])
    // Elle décrit une autre photo.
    later()
    const described = await act.send('PATCH', `/v1/projects/${meteo.id}/visuals/${kept.id}`, ines, {
      description: 'La carte des vents au lever du jour',
    })
    expect(described.status).toBe(200)

    expect(await seenByMax()).toEqual([added.id, kept.id])
    expect(await rawText(`/v1/projects/${meteo.id}`, max)).not.toContain(removed.key)
    expect((await projectOf(meteo.id, ines)).removedParts).toEqual([
      expect.objectContaining({ field: 'photo', mediaId: removed.id }),
    ])
  })

  it('keeps a removed description hidden when the author changes only the title', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', {
      description: 'Une carte des vents du Mistralou, mise à jour chaque matin.',
    })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'description' })

    later()
    const renamed = await act.send('PATCH', `/v1/projects/${meteo.id}`, ines, {
      title: 'Météo du matin',
    })
    expect(renamed.status).toBe(200)

    const seen = await projectOf(meteo.id, max)
    expect(seen.title).toBe('Météo du matin')
    expect(seen.description).toBe('')
    expect((await projectOf(meteo.id, ines)).removedParts).toEqual([
      expect.objectContaining({
        field: 'description',
        value: 'Une carte des vents du Mistralou, mise à jour chaque matin.',
      }),
    ])
  })
})

// ─── Les autres routes qui montrent le contenu d'un autre (inventaire, PART_PROOFS) ──────────────

describe('a removed part, route by route', () => {
  it('hides a removed description and prompt from the page of the project, and gives them to its author only', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo', {
      description: 'Une carte des vents, mise à jour chaque matin.',
      prompts: ['Dessine les vents du jour sur une carte de France.'],
    })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'description' })
    await removePart({ kind: 'project', id: meteo.id }, { field: 'prompt' })

    const seen = await projectOf(meteo.id, max)
    expect(seen.description).toBe('')
    expect(seen.prompts).toEqual([])
    expect(seen.removedParts).toEqual([])
    const own = await projectOf(meteo.id, ines)
    expect(own.removedParts.map((part) => part.field).sort()).toEqual(['description', 'prompt'])
    expect(own.removedParts.find((part) => part.field === 'prompt')?.value).toEqual([
      'Dessine les vents du jour sur une carte de France.',
    ])
  })

  it('hides a removed bio and removed favorite tools from the page of the member, and gives them back to her in removedParts', async () => {
    later()
    await act.updateProfile(ines, {
      bio: 'J’aime les cartes et le vent.',
      favoriteTools: ['Claude'],
    })
    await removePart({ kind: 'member', id: inesId }, { field: 'bio' })
    await removePart({ kind: 'member', id: inesId }, { field: 'favoriteTools' })

    const seen = await memberOf(inesId, max)
    expect(seen.bio).toBe('')
    expect(seen.favoriteTools).toEqual([])
    expect(seen.removedParts).toEqual([])
    const own = await memberOf(inesId, ines)
    expect(own.removedParts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'bio', value: 'J’aime les cartes et le vent.' }),
        expect.objectContaining({ field: 'favoriteTools', value: ['Claude'] }),
      ]),
    )
  })

  it('hides a removed update photo from the timeline and the page of the project, and keeps it for its author', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const before = await uploadVisual(ines, meteo.id, 'update')
    const after = await uploadVisual(ines, meteo.id, 'update')
    const update = await publishUpdate(ines, meteo.id, [before.id, after.id])
    await removePart({ kind: 'update', id: update.id }, { field: 'photo', mediaId: before.id })

    const timeline = ProjectUpdatePage.parse(
      JSON.parse(await rawText(`/v1/projects/${meteo.id}/updates`, max)),
    )
    expect(timeline.items[0]?.photos.map((photo) => photo.id)).toEqual([after.id])
    expect(timeline.items[0]?.removedParts).toEqual([])
    expect((await projectOf(meteo.id, max)).latestUpdate?.photos.map((photo) => photo.id)).toEqual([
      after.id,
    ])
    const own = ProjectUpdatePage.parse(
      JSON.parse(await rawText(`/v1/projects/${meteo.id}/updates`, ines)),
    )
    expect(own.items[0]?.removedParts).toEqual([
      expect.objectContaining({ field: 'photo', mediaId: before.id }),
    ])
  })

  it('hides a removed call photo from the testers, and keeps the call and its photo for its author', async () => {
    const meteo = await testableProjectWithMax()
    const photo = await uploadTesterImage(ines, meteo.id, 'call')
    later()
    const created = await act.send('POST', `/v1/projects/${meteo.id}/calls`, ines, {
      text: 'Testez la carte des vents.',
      photoId: photo.id,
      photoDescription: null,
    })
    expect(created.status).toBe(201)
    const call = TesterCall.parse(await created.json())
    // Témoin : Max, testeur, voit la photo de l'appel.
    expect(await rawText(`/v1/projects/${meteo.id}/calls`, max)).toContain(photo.key)

    await removePart({ kind: 'call', id: call.id }, { field: 'photo', mediaId: photo.id })

    const seen = await rawText(`/v1/projects/${meteo.id}/calls`, max)
    expect(seen).toContain('Testez la carte des vents.')
    expect(seen).not.toContain(photo.key)
    expect(seen).not.toContain(photo.id)
    const own = TesterCallPage.parse(
      JSON.parse(await rawText(`/v1/projects/${meteo.id}/calls`, ines)),
    )
    expect(own.items[0]?.removedParts).toEqual([
      expect.objectContaining({ field: 'photo', mediaId: photo.id }),
    ])
  })

  it('hides a removed capture from the other person of the thread, and keeps it for its author', async () => {
    const meteo = await testableProjectWithMax()
    const { message, capture } = await feedbackWithCapture(meteo.id)
    const thread = `/v1/projects/${meteo.id}/threads/${maxId}/messages`
    // Témoin : Inès, autrice du projet, voit la capture de Max.
    expect(await rawText(thread, ines)).toContain(capture.key)

    await removePart(
      { kind: 'message', id: message.id },
      { field: 'photo', mediaId: capture.id },
      ines,
    )

    const seen = await rawText(thread, ines)
    expect(seen).toContain('Le vent du soir n’apparaît pas.')
    expect(seen).not.toContain(capture.key)
    expect(seen).not.toContain(capture.id)
    const own = TesterMessagePage.parse(JSON.parse(await rawText(thread, max)))
    expect(own.items[0]?.removedParts).toEqual([
      expect.objectContaining({ field: 'photo', mediaId: capture.id }),
    ])
  })

  it('does not offer a removed photo in the report sheet of another member', async () => {
    later()
    const meteo = await act.publish(ines, 'Météo')
    const kept = await uploadVisual(ines, meteo.id)
    const removed = await uploadVisual(ines, meteo.id)
    const sheet = async (cookie: string) =>
      ReportTargetPreview.parse(
        JSON.parse(
          await rawText(
            `/v1/reports/target?${new URLSearchParams({ kind: 'project', id: meteo.id })}`,
            cookie,
          ),
        ),
      )
    const photos = async (cookie: string) =>
      (await sheet(cookie)).parts
        .filter((part) => part.mediaId !== null)
        .map((part) => [part.mediaId, part.position])
    // Témoin : la feuille propose les deux photos.
    expect(await photos(lea)).toEqual(
      expect.arrayContaining([
        [kept.id, 1],
        [removed.id, 2],
      ]),
    )

    await removePart({ kind: 'project', id: meteo.id }, { field: 'photo', mediaId: removed.id })

    const left = await photos(lea)
    expect(left.map(([id]) => id)).not.toContain(removed.id)
    expect(left.map(([id]) => id)).toContain(kept.id)
    expect(JSON.stringify(await sheet(lea))).not.toContain(removed.key)
  })
})
