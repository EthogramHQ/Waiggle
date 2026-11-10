// Tests d'intégration de la tranche 3b-1 : les visuels des projets (galerie et couverture
// verticale), et les médias réservés aux membres. Scénarios : docs/scenarios/phase-1.md, tranche 3b-1.
// Deux membres : Léa (l'autrice) et Max.
import {
  AccountExport,
  DiscoverFeedPage,
  ErrorResponse,
  Me,
  Project,
  ProjectUpdate,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { avatarForm, jpegImage, photoWithGps, visualForm } from './testing/images'

let ctx: TestContext
let lea: string // cookie de session de Léa
let max: string // cookie de session de Max

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

beforeEach(async () => {
  ctx = await createTestContext()
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
})

afterEach(async () => {
  await ctx.close()
})

const sendJson = (method: string, path: string, cookie: string, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: { cookie, ...(body !== undefined && { 'content-type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

/** Léa (ou un autre) publie un projet ; renvoie le projet. */
const publish = async (visibility: 'public' | 'private' = 'public', cookie = lea) => {
  const res = await sendJson('POST', '/v1/projects', cookie, {
    title: 'Mon agent de recettes',
    primaryCategory: 'other',
    pitch: 'Un menu avec ce qu’il y a au frigo.',
    visibility,
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

const upload = (projectId: string, form: FormData, cookie = lea) =>
  ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  })

/** Ajoute une photo à la galerie (ou en couverture verticale) et renvoie le projet à jour. */
const addPhoto = async (projectId: string, slot?: 'gallery' | 'portrait', bytes?: Uint8Array) => {
  const photo = bytes ?? (slot === 'portrait' ? await jpegImage(900, 1600) : await photoWithGps())
  const res = await upload(projectId, visualForm(photo, slot))
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

const read = async (projectId: string, cookie = lea) =>
  Project.parse(await (await sendJson('GET', `/v1/projects/${projectId}`, cookie)).json())

/** Ouvre l'adresse d'un média, avec ou sans session. */
const open = (url: string, cookie: string | null) =>
  ctx.request(new URL(url).pathname, { headers: cookie ? { cookie } : {} })

const storedVisuals = () => [...ctx.storage.files.keys()].filter((k) => k.startsWith('visuals/'))

describe('adding photos to my project', () => {
  it('puts the photo in the gallery, cleaned, with its size and its ThumbHash', async () => {
    const project = await publish()

    const updated = await addPhoto(project.id)

    expect(updated.visuals).toHaveLength(1)
    const [photo] = updated.visuals
    expect(photo).toMatchObject({ kind: 'image', width: 1200, height: 800 })
    expect(photo?.url).toMatch(/^http:\/\/localhost:3000\/media\/visuals\/[0-9a-f-]+\.webp$/)
    const image = await open(photo?.url ?? '', lea)
    const info = await sharp(new Uint8Array(await image.arrayBuffer())).metadata()
    expect(info).toMatchObject({ format: 'webp', width: 1200, height: 800 })
    expect(info.exif).toBeUndefined()
  })

  it('keeps the photos in the order they were added: the first one is the cover', async () => {
    const project = await publish()
    await addPhoto(project.id, 'gallery', await jpegImage(1000, 600, '#ff0000'))
    const updated = await addPhoto(project.id, 'gallery', await jpegImage(1000, 600, '#0000ff'))

    expect(updated.visuals.map((v) => v.width)).toEqual([1000, 1000])
    expect(updated.visuals[0]?.id).not.toBe(updated.visuals[1]?.id)
    expect((await read(project.id)).visuals).toEqual(updated.visuals)
  })

  it('refuses a seventh photo, and keeps no file of it', async () => {
    const project = await publish()
    for (let i = 0; i < 6; i++) await addPhoto(project.id)

    const res = await upload(project.id, visualForm(await photoWithGps()))

    expect(res.status).toBe(409)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('too_many_visuals')
    expect(storedVisuals()).toHaveLength(6)
  })

  it('refuses a file that is not an image, even if it claims to be one', async () => {
    const project = await publish()
    const fake = new TextEncoder().encode('<script>alert(1)</script>')

    const res = await upload(project.id, visualForm(fake, 'gallery', 'image/png', 'photo.png'))

    expect(res.status).toBe(415)
    expect(storedVisuals()).toHaveLength(0)
  })

  it('refuses a file larger than 5 MB', async () => {
    const project = await publish()

    const res = await upload(project.id, visualForm(new Uint8Array(5 * 1024 * 1024 + 1)))

    expect(res.status).toBe(413)
  })

  it('refuses an unknown slot', async () => {
    const project = await publish()

    const res = await upload(project.id, visualForm(await photoWithGps(), 'landscape'))

    expect(res.status).toBe(400)
  })

  it('blocks a 31st upload within an hour', async () => {
    const project = await publish()
    const photo = await jpegImage(400, 300)
    for (let i = 0; i < 30; i++) {
      // Une photo ajoutée puis retirée : on reste sous les 6, seule la limite horaire compte.
      const added = Project.parse(await (await upload(project.id, visualForm(photo))).json())
      const id = added.visuals[0]?.id ?? ''
      await sendJson('DELETE', `/v1/projects/${project.id}/visuals/${id}`, lea)
    }

    expect((await upload(project.id, visualForm(photo))).status).toBe(429)
  })

  it('cannot exceed six photos, even with uploads arriving at the same time', async () => {
    const project = await publish()
    for (let i = 0; i < 5; i++) await addPhoto(project.id)

    const photo = await jpegImage(400, 300)
    const results = await Promise.all([
      upload(project.id, visualForm(photo)),
      upload(project.id, visualForm(photo)),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect((await read(project.id)).visuals).toHaveLength(6)
    expect(storedVisuals()).toHaveLength(6)
  })
})

describe('the vertical cover', () => {
  it('is kept apart from the gallery', async () => {
    const project = await publish()

    const updated = await addPhoto(project.id, 'portrait')

    expect(updated.visuals).toHaveLength(0)
    expect(updated.portraitCover).toMatchObject({ kind: 'image', width: 900, height: 1600 })
  })

  it('must be taller than wide', async () => {
    const project = await publish()

    const res = await upload(project.id, visualForm(await jpegImage(1600, 900), 'portrait'))

    expect(res.status).toBe(415)
  })

  it('replaces the previous one, whose file is deleted', async () => {
    const project = await publish()
    const first = await addPhoto(project.id, 'portrait')

    const second = await addPhoto(project.id, 'portrait')

    expect(second.portraitCover?.id).not.toBe(first.portraitCover?.id)
    expect(storedVisuals()).toHaveLength(1)
  })

  it('does not count in the six photos of the gallery', async () => {
    const project = await publish()
    for (let i = 0; i < 6; i++) await addPhoto(project.id)

    const updated = await addPhoto(project.id, 'portrait')

    expect(updated.visuals).toHaveLength(6)
    expect(updated.portraitCover).not.toBeNull()
  })
})

describe('ordering and removing photos', () => {
  it('applies a new order sent with the project changes', async () => {
    const project = await publish()
    await addPhoto(project.id)
    await addPhoto(project.id)
    const withThree = await addPhoto(project.id)
    const reversed = withThree.visuals.map((v) => v.id).reverse()

    const res = await sendJson('PATCH', `/v1/projects/${project.id}`, lea, {
      visualOrder: reversed,
    })

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).visuals.map((v) => v.id)).toEqual(reversed)
  })

  it('refuses an order that forgets a photo or names one that is not in the gallery', async () => {
    const project = await publish()
    await addPhoto(project.id)
    const withTwo = await addPhoto(project.id)
    const portrait = await addPhoto(project.id, 'portrait')
    const [a, b] = withTwo.visuals.map((v) => v.id)

    const missing = await sendJson('PATCH', `/v1/projects/${project.id}`, lea, {
      visualOrder: [a],
    })
    const foreign = await sendJson('PATCH', `/v1/projects/${project.id}`, lea, {
      visualOrder: [a, portrait.portraitCover?.id],
    })

    expect(missing.status).toBe(400)
    expect(foreign.status).toBe(400)
    expect((await read(project.id)).visuals.map((v) => v.id)).toEqual([a, b])
  })

  it('removes a photo and its file', async () => {
    const project = await publish()
    const withOne = await addPhoto(project.id)
    const id = withOne.visuals[0]?.id ?? ''

    const res = await sendJson('DELETE', `/v1/projects/${project.id}/visuals/${id}`, lea)

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).visuals).toEqual([])
    expect(storedVisuals()).toHaveLength(0)
  })

  it('counts removals aimed at an unknown project in the hourly limit', async () => {
    // Le quota passe avant la recherche du projet (audit du 25/10/2026, C7) : chaque demande
    // compte, même celle qui ne trouve rien, comme pour les autres changements d'un projet.
    const project = await publish()
    const withOne = await addPhoto(project.id)
    const id = withOne.visuals[0]?.id ?? ''
    // L'ajout de la photo ne compte pas dans ce quota-là (il a le sien).
    for (let i = 0; i < 60; i++) {
      const res = await sendJson('DELETE', `/v1/projects/${crypto.randomUUID()}/visuals/${id}`, lea)
      expect(res.status).toBe(404)
    }

    // La 61e demande de l'heure, sur sa vraie photo, est refusée ; la photo reste.
    expect((await sendJson('DELETE', `/v1/projects/${project.id}/visuals/${id}`, lea)).status).toBe(
      429,
    )
    expect(storedVisuals()).toHaveLength(1)
  })

  it('deletes every file together with the project', async () => {
    const project = await publish()
    await addPhoto(project.id)
    await addPhoto(project.id, 'portrait')

    expect((await sendJson('DELETE', `/v1/projects/${project.id}`, lea)).status).toBe(204)

    expect(storedVisuals()).toHaveLength(0)
    expect(await ctx.db.select().from(schema.projectMedia)).toHaveLength(0)
  })

  it('deletes every file together with my account', async () => {
    const project = await publish()
    await addPhoto(project.id)
    await addPhoto(project.id, 'portrait')

    await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: lea, 'content-type': 'application/json' },
      body: JSON.stringify({ password: leaAccount.password }),
    })

    expect(storedVisuals()).toHaveLength(0)
  })
})

describe('only the author changes the photos', () => {
  it('refuses another member on a public project, and keeps a private one hidden', async () => {
    const visible = await publish('public')
    const hidden = await publish('private')
    const photo = await photoWithGps()

    expect((await upload(visible.id, visualForm(photo), max)).status).toBe(403)
    expect((await upload(hidden.id, visualForm(photo), max)).status).toBe(404)
    expect(storedVisuals()).toHaveLength(0)
  })

  it('refuses another member who tries to remove or reorder a photo', async () => {
    const project = await publish()
    const withOne = await addPhoto(project.id)
    const id = withOne.visuals[0]?.id ?? ''

    const removal = await sendJson('DELETE', `/v1/projects/${project.id}/visuals/${id}`, max)
    const order = await sendJson('PATCH', `/v1/projects/${project.id}`, max, { visualOrder: [id] })

    expect(removal.status).toBe(403)
    expect(order.status).toBe(403)
    expect((await read(project.id)).visuals).toHaveLength(1)
  })

  it('refuses a visitor without an account', async () => {
    const project = await publish()

    expect((await upload(project.id, visualForm(await photoWithGps()), '')).status).toBe(401)
  })

  it('refuses to remove a photo without an account, or from a hidden project', async () => {
    const hidden = await publish('private')
    const id = (await addPhoto(hidden.id)).visuals[0]?.id ?? ''

    const anonymous = await ctx.request(`/v1/projects/${hidden.id}/visuals/${id}`, {
      method: 'DELETE',
    })
    const other = await sendJson('DELETE', `/v1/projects/${hidden.id}/visuals/${id}`, max)

    expect(anonymous.status).toBe(401)
    expect(other.status).toBe(404)
    expect(storedVisuals()).toHaveLength(1)
  })

  it('cannot remove a photo of another project through one of mine', async () => {
    const maxProject = await publish('public', max)
    const maxPhoto = await ctx.request(`/v1/projects/${maxProject.id}/visuals`, {
      method: 'POST',
      headers: { cookie: max },
      body: visualForm(await photoWithGps()),
    })
    const foreignId = Project.parse(await maxPhoto.json()).visuals[0]?.id ?? ''
    const mine = await publish()

    const res = await sendJson('DELETE', `/v1/projects/${mine.id}/visuals/${foreignId}`, lea)

    expect(res.status).toBe(404)
    expect((await read(maxProject.id)).visuals).toHaveLength(1)
    expect(storedVisuals()).toHaveLength(1)
  })

  it('refuses an order that names a photo of another project', async () => {
    const maxProject = await publish('public', max)
    const maxPhoto = await ctx.request(`/v1/projects/${maxProject.id}/visuals`, {
      method: 'POST',
      headers: { cookie: max },
      body: visualForm(await photoWithGps()),
    })
    const foreignId = Project.parse(await maxPhoto.json()).visuals[0]?.id ?? ''
    const mine = await publish()
    const own = (await addPhoto(mine.id)).visuals[0]?.id ?? ''

    const res = await sendJson('PATCH', `/v1/projects/${mine.id}`, lea, {
      visualOrder: [foreignId],
    })
    const mixed = await sendJson('PATCH', `/v1/projects/${mine.id}`, lea, {
      visualOrder: [own, foreignId],
    })

    expect(res.status).toBe(400)
    expect(mixed.status).toBe(400)
  })
})

describe('races', () => {
  it('keeps a single vertical cover when two arrive at the same time', async () => {
    const project = await publish()
    const tall = await jpegImage(900, 1600)

    const results = await Promise.all([
      upload(project.id, visualForm(tall, 'portrait')),
      upload(project.id, visualForm(tall, 'portrait')),
    ])

    expect(results.map((r) => r.status)).toEqual([201, 201])
    expect((await read(project.id)).portraitCover).not.toBeNull()
    expect(await ctx.db.select().from(schema.projectMedia)).toHaveLength(1)
    expect(storedVisuals()).toHaveLength(1)
  })

  it('answers « not found » when the project disappears during an upload, and keeps no file', async () => {
    const project = await publish()
    // Le projet est supprimé juste après le traitement de l'image, avant son enregistrement.
    const put = ctx.storage.put.bind(ctx.storage)
    ctx.storage.put = async (key, data) => {
      await put(key, data)
      await ctx.db.delete(schema.project)
    }

    const res = await upload(project.id, visualForm(await photoWithGps()))

    expect(res.status).toBe(404)
    expect(storedVisuals()).toHaveLength(0)
  })

  it('answers an anonymous photo upload at once, without waiting for the file', async () => {
    const project = await publish()
    // Un envoi « par morceaux » qui ne se termine jamais : la session est vérifiée avant de lire.
    const endless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const res = await ctx.request(`/v1/projects/${project.id}/visuals`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: endless,
      duplex: 'half',
    } as RequestInit)

    expect(res.status).toBe(401)
    await endless.cancel()
  }, 5_000)

  it('answers another member at once too, without reading the file', async () => {
    const project = await publish()
    const endless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const res = await ctx.request(`/v1/projects/${project.id}/visuals`, {
      method: 'POST',
      headers: { cookie: max, 'content-type': 'multipart/form-data; boundary=x' },
      body: endless,
      duplex: 'half',
    } as RequestInit)

    expect(res.status).toBe(403)
    await endless.cancel()
  }, 5_000)
})

describe('photos are only shown to members who can see the project', () => {
  it('shows the photos of a public project to every member, not to visitors', async () => {
    const project = await publish('public')
    const url = (await addPhoto(project.id)).visuals[0]?.url ?? ''

    expect((await open(url, lea)).status).toBe(200)
    expect((await open(url, max)).status).toBe(200)
    expect((await open(url, null)).status).toBe(404)
  })

  it('shows the photos of a private project to its author only', async () => {
    const project = await publish('private')
    const url = (await addPhoto(project.id)).visuals[0]?.url ?? ''

    expect((await open(url, lea)).status).toBe(200)
    expect((await open(url, max)).status).toBe(404)
  })

  it('hides the photos of a project that becomes private, even from someone who kept the address', async () => {
    const project = await publish('public')
    const url = (await addPhoto(project.id)).visuals[0]?.url ?? ''
    expect((await open(url, max)).status).toBe(200)

    await sendJson('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })

    expect((await open(url, max)).status).toBe(404)
  })

  it('never lets a shared cache keep a photo, and never runs anything found in it', async () => {
    const project = await publish()
    const url = (await addPhoto(project.id)).visuals[0]?.url ?? ''

    const res = await open(url, lea)

    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toContain('private')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
  })

  it('only serves files that exist, under a strict name', async () => {
    const traversal = await ctx.request('/media/visuals/..%2F..%2Fetc%2Fpasswd', {
      headers: { cookie: lea },
    })
    const unknown = await ctx.request('/media/visuals/00000000-0000-4000-8000-000000000000.webp', {
      headers: { cookie: lea },
    })

    expect(traversal.status).toBe(404)
    expect(unknown.status).toBe(404)
  })
})

describe('avatars are only shown to members', () => {
  it('serves an avatar to a member, never to a visitor without an account', async () => {
    const res = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { cookie: lea },
      body: avatarForm(await photoWithGps()),
    })
    const url = Me.parse(await res.json()).avatarUrl ?? ''

    expect((await open(url, max)).status).toBe(200)
    expect((await open(url, null)).status).toBe(404)
    expect((await open(url, max)).headers.get('cache-control')).toContain('private')
  })
})

describe('my data export', () => {
  it('lists the photos of my projects', async () => {
    const project = await publish('private')
    await addPhoto(project.id)
    await addPhoto(project.id, 'portrait')

    const res = await sendJson('GET', '/v1/me/export', lea)
    const data = AccountExport.parse(await res.json())

    expect(data.projects[0]?.visuals).toHaveLength(1)
    expect(data.projects[0]?.portraitCover).not.toBeNull()
  })
})

// --- Tranche R6a : la description de chaque photo ---
// PATCH /v1/projects/{id}/visuals/{visualId} { description } : l'auteur décrit une photo, lue par
// les lecteurs d'écran à la place de « Photo 1 sur 3 ». Scénario : docs/scenarios/refonte.md,
// section R6a (« Les photos ») ; relecture du plan : sec-B1 (les réponses de DELETE), sec-A1 (le
// quota avant le corps), sec-A3 (la petite limite de taille), jur-J13 (export et effacement).

/** Décrit une photo (ou essaie). */
const describePhoto = (projectId: string, visualId: string, body: unknown, cookie = lea) =>
  sendJson('PATCH', `/v1/projects/${projectId}/visuals/${visualId}`, cookie, body)

/** Un projet de Léa (ou d'un autre) avec une photo ; rend le projet et l'identifiant de la photo. */
const projectWithPhoto = async (visibility: 'public' | 'private' = 'public', cookie = lea) => {
  const project = await publish(visibility, cookie)
  const res = await upload(project.id, visualForm(await photoWithGps()), cookie)
  expect(res.status).toBe(201)
  const visualId = Project.parse(await res.json()).visuals[0]?.id ?? ''
  return { projectId: project.id, visualId }
}

/**
 * Les descriptions présentes en base, toutes photos confondues. SQL brut : la colonne
 * `project_media.description` n'est pas encore dans le schéma typé quand ces tests sont écrits.
 */
const storedDescriptions = async () =>
  (
    (await ctx.db.execute(
      sql`select description from project_media where description is not null`,
    )) as unknown as { rows: { description: string }[] }
  ).rows.map((row) => row.description)

const idOf = async (cookie: string) =>
  Me.parse(await (await sendJson('GET', '/v1/me', cookie)).json()).id

describe('describing a photo (R6a)', () => {
  it('lets the author describe a photo, and shows the description to the others', async () => {
    const { projectId, visualId } = await projectWithPhoto()
    await addPhoto(projectId)

    const res = await describePhoto(projectId, visualId, {
      description: 'Le frigo ouvert, trois tomates et un reste de riz.',
    })

    expect(res.status).toBe(200)
    const project = Project.parse(await res.json())
    expect(project.visuals.map((v) => [v.id, v.description])).toEqual([
      [visualId, 'Le frigo ouvert, trois tomates et un reste de riz.'],
      [project.visuals[1]?.id, null], // l'autre photo reste sans description, à sa place
    ])
    const seenByMax = await read(projectId, max)
    expect(seenByMax.visuals[0]?.description).toBe(
      'Le frigo ouvert, trois tomates et un reste de riz.',
    )
  })

  it('clears the description with an empty text', async () => {
    const { projectId, visualId } = await projectWithPhoto()
    expect((await describePhoto(projectId, visualId, { description: 'Le frigo' })).status).toBe(200)

    const res = await describePhoto(projectId, visualId, { description: '   ' })

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).visuals[0]?.description).toBeNull()
    expect(await storedDescriptions()).toEqual([])
  })

  it('refuses a description longer than 250 characters, with invisible characters, or with other fields', async () => {
    const { projectId, visualId } = await projectWithPhoto()
    // Témoin : 250 caractères passent.
    const longest = 'é'.repeat(250)
    expect((await describePhoto(projectId, visualId, { description: longest })).status).toBe(200)

    const zeroWidthSpace = String.fromCodePoint(0x200b)
    for (const body of [
      { description: 'é'.repeat(251) },
      { description: `Le frigo${zeroWidthSpace} ouvert` },
      { description: 'Le frigo', position: 3 },
      {},
    ]) {
      expect((await describePhoto(projectId, visualId, body)).status).toBe(400)
    }
    expect(await storedDescriptions()).toEqual([longest])
  })

  it('refuses another member on a public project', async () => {
    const { projectId, visualId } = await projectWithPhoto()

    const res = await describePhoto(projectId, visualId, { description: 'Piraté' }, max)

    expect(res.status).toBe(403)
    expect(await storedDescriptions()).toEqual([])
  })

  it('answers the same « not found » to a PATCH on a photo of an unknown, private, removed or blocked author’s project', async () => {
    const body = { description: 'Piraté' }
    const reference = await describePhoto(crypto.randomUUID(), crypto.randomUUID(), body, max)
    expect(reference.status).toBe(404)
    const expected = await reference.json()
    const expectSameNotFound = async (res: Response, what: string) => {
      expect(res.status, what).toBe(404)
      expect(await res.json(), what).toEqual(expected)
    }

    const hidden = await projectWithPhoto('private')
    await expectSameNotFound(
      await describePhoto(hidden.projectId, hidden.visualId, body, max),
      'private',
    )

    const removed = await projectWithPhoto()
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, removed.projectId))
    await expectSameNotFound(
      await describePhoto(removed.projectId, removed.visualId, body, max),
      'removed',
    )

    const blocked = await projectWithPhoto()
    // Témoin : sans blocage, Max voit ce projet public ; il est seulement « refusé ».
    expect((await describePhoto(blocked.projectId, blocked.visualId, body, max)).status).toBe(403)
    const [leaId, maxId] = [await idOf(lea), await idOf(max)]
    const act = activity(ctx)
    await act.block(maxId, lea)
    await expectSameNotFound(
      await describePhoto(blocked.projectId, blocked.visualId, body, max),
      'the author blocked the member',
    )
    await act.unblock(maxId, lea)
    await act.block(leaId, max)
    await expectSameNotFound(
      await describePhoto(blocked.projectId, blocked.visualId, body, max),
      'the member blocked the author',
    )

    expect(await storedDescriptions()).toEqual([])
  })

  it('answers 409 « removed » when I describe a photo of my project removed by the moderation', async () => {
    const { projectId, visualId } = await projectWithPhoto()
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, projectId))

    const res = await describePhoto(projectId, visualId, { description: 'Le frigo' })

    expect(res.status).toBe(409)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('removed')
    expect(await storedDescriptions()).toEqual([])
  })

  it('still lets me remove a photo of my project removed by the moderation, while describing it answers 409', async () => {
    // sec-A1 : la règle 7a (je peux toujours retirer ce qui est à moi) vaut pour le DELETE, pas pour
    // le PATCH. La description publique du PATCH doit le dire elle-même, sans renvoyer au DELETE.
    const { projectId, visualId } = await projectWithPhoto()
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, projectId))

    expect((await describePhoto(projectId, visualId, { description: 'Le frigo' })).status).toBe(409)
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, { description?: string }>>
    }
    const patch = doc.paths['/v1/projects/{id}/visuals/{visualId}']?.patch?.description ?? ''
    expect(patch).toContain('409')
    expect(patch).not.toMatch(/removal of a photo/i)

    const res = await sendJson('DELETE', `/v1/projects/${projectId}/visuals/${visualId}`, lea)
    expect(res.status).toBe(200)
  })

  it('answers « not found » to a malformed photo identifier and to a photo of another project reached through mine', async () => {
    const mine = await projectWithPhoto()
    const maxs = await projectWithPhoto('public', max)
    // Témoin : sa propre photo, par son propre projet, se décrit.
    expect(
      (await describePhoto(mine.projectId, mine.visualId, { description: 'Le frigo' })).status,
    ).toBe(200)

    const malformed = await describePhoto(mine.projectId, 'not-a-photo', { description: 'X' })
    const foreign = await describePhoto(mine.projectId, maxs.visualId, { description: 'Piraté' })

    expect(malformed.status).toBe(404)
    expect(foreign.status).toBe(404)
    expect((await read(maxs.projectId, max)).visuals[0]?.description).toBeNull()
    expect(await storedDescriptions()).toEqual(['Le frigo'])
  })

  it('counts a PATCH with a malformed body in the hourly limit of changes', async () => {
    // sec-A1 : le quota « changements d'un projet » passe avant la lecture du corps et avant la
    // recherche du projet : chaque demande compte, mal formée ou visant un projet inconnu.
    const { projectId, visualId } = await projectWithPhoto()
    for (let i = 0; i < 30; i++) {
      expect((await describePhoto(projectId, visualId, { description: 42 })).status).toBe(400)
    }
    for (let i = 0; i < 30; i++) {
      const res = await describePhoto(crypto.randomUUID(), visualId, { description: 'Le frigo' })
      expect(res.status).toBe(404)
    }

    // La 61e demande de l'heure, valide et sur sa vraie photo, est refusée.
    const res = await describePhoto(projectId, visualId, { description: 'Le frigo' })
    expect(res.status).toBe(429)
    expect(await storedDescriptions()).toEqual([])
  })

  it('refuses a photo description body larger than 16 KB', async () => {
    // sec-A3 : une description pèse au plus 250 caractères ; la petite limite (16 Ko) suffit,
    // celle des projets (256 Ko) laisserait lire au serveur un corps inutilement gros.
    const { projectId, visualId } = await projectWithPhoto()

    const res = await describePhoto(projectId, visualId, { description: 'a'.repeat(20 * 1024) })

    expect(res.status).toBe(413)
    // Témoin : la même route, avec un corps ordinaire, répond.
    expect((await describePhoto(projectId, visualId, { description: 'Le frigo' })).status).toBe(200)
  })

  it('refuses a suspended author, and lets her describe again once the suspension is gone', async () => {
    const { projectId, visualId } = await projectWithPhoto()
    // Léa est suspendue, sans fin : la ligne que lit la garde de suspension (tranche 7c).
    await ctx.db.insert(schema.accountSuspension).values({
      id: crypto.randomUUID(),
      userId: await idOf(lea),
      startsAt: new Date(),
      endsAt: null,
    })

    const refused = await describePhoto(projectId, visualId, { description: 'Le frigo' })
    expect(refused.status).toBe(403)
    expect(ErrorResponse.parse(await refused.json()).error.code).toBe('suspended')
    expect(await storedDescriptions()).toEqual([])

    // Témoin : sans la suspension, la même demande passe.
    await ctx.db.delete(schema.accountSuspension)
    expect((await describePhoto(projectId, visualId, { description: 'Le frigo' })).status).toBe(200)
  })

  it('cannot be triggered from another website', async () => {
    const { projectId, visualId } = await projectWithPhoto()
    const describeFrom = (origin?: string) =>
      ctx.request(`/v1/projects/${projectId}/visuals/${visualId}`, {
        method: 'PATCH',
        headers: { cookie: lea, 'content-type': 'application/json', ...(origin && { origin }) },
        body: JSON.stringify({ description: 'Le frigo' }),
      })

    expect((await describeFrom('https://evil.example')).status).toBe(403)
    expect(await storedDescriptions()).toEqual([])
    // Témoin : la même demande, sans origine étrangère, passe.
    expect((await describeFrom()).status).toBe(200)
  })

  it('refuses a visitor without an account', async () => {
    const { projectId, visualId } = await projectWithPhoto()

    const anonymous = await ctx.request(`/v1/projects/${projectId}/visuals/${visualId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Le frigo' }),
    })

    expect(anonymous.status).toBe(401)
    expect(await storedDescriptions()).toEqual([])
    // Témoin : avec sa session, l'autrice décrit sa photo.
    expect((await describePhoto(projectId, visualId, { description: 'Le frigo' })).status).toBe(200)
  })
})

describe('photo descriptions in my data (R6a, jur-J13)', () => {
  it('puts the categories, the month, the difficulty and each photo description in the export', async () => {
    const created = await sendJson('POST', '/v1/projects', lea, {
      title: 'Le télescope qui raconte',
      pitch: 'Il nomme les étoiles que vise la lunette.',
      primaryCategory: 'science',
      secondaryCategory: 'learning',
      startedOn: '2024-03',
      difficulty: 'hard',
      visibility: 'private',
    })
    expect(created.status).toBe(201)
    const projectId = Project.parse(await created.json()).id
    await addPhoto(projectId)
    const withTwo = await addPhoto(projectId)
    const [first, second] = withTwo.visuals.map((v) => v.id) as [string, string]
    expect(
      (await describePhoto(projectId, second, { description: 'La lunette, la nuit.' })).status,
    ).toBe(200)

    const data = AccountExport.parse(await (await sendJson('GET', '/v1/me/export', lea)).json())

    expect(data.projects[0]).toMatchObject({
      primaryCategory: 'science',
      secondaryCategory: 'learning',
      startedOn: '2024-03',
      difficulty: 'hard',
    })
    expect(data.projects[0]?.visuals.map((v) => [v.id, v.description])).toEqual([
      [first, null],
      [second, 'La lunette, la nuit.'],
    ])
  })

  it('erases the photo descriptions with the project and with the account', async () => {
    const first = await projectWithPhoto()
    const second = await projectWithPhoto()
    for (const { projectId, visualId } of [first, second]) {
      expect(
        (await describePhoto(projectId, visualId, { description: `Photo de ${projectId}` })).status,
      ).toBe(200)
    }
    expect(await storedDescriptions()).toHaveLength(2)

    // Avec le projet…
    expect((await sendJson('DELETE', `/v1/projects/${first.projectId}`, lea)).status).toBe(204)
    expect(await storedDescriptions()).toEqual([`Photo de ${second.projectId}`])

    // … et avec le compte.
    await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: lea, 'content-type': 'application/json' },
      body: JSON.stringify({ password: leaAccount.password }),
    })
    expect(await storedDescriptions()).toEqual([])
  })
})

// --- Tranche R7a : les photos des mises à jour ---
// Une photo envoyée avec `slot=update` est « en attente » jusqu'à la publication de la mise à jour
// qui la cite, puis lui est rattachée. Elle n'entre jamais dans la galerie. Scénario :
// docs/scenarios/refonte.md, section R7a (« Publier une mise à jour », la partie « Photos ») ;
// relecture de sécurité du plan : A4 (qui voit quelle photo), A11 (une cinquième photo en attente
// remplace la plus ancienne) ; décision de Louis du 10/11/2026 : 100 photos de mises à jour par
// projet au plus, en attente comprises (409 `update_photos_full`).
// La colonne neuve `project_media.update_id` se lit en SQL brut, comme `description` plus haut.

/** Les photos `update` d'un projet, de la base : identifiant, clé de stockage, mise à jour. */
const updatePhotosOf = async (projectId: string) =>
  (
    (await ctx.db.execute(
      sql`select id, storage_key, update_id from project_media
          where project_id = ${projectId} and slot = 'update'`,
    )) as unknown as { rows: { id: string; storage_key: string; update_id: string | null }[] }
  ).rows

/**
 * Envoie une photo pour une mise à jour pas encore publiée, et la rend (identifiant, clé). La
 * réponse de l'envoi n'est pas lue : la photo se retrouve en base, la seule ligne `update` du projet
 * qui n'y était pas avant.
 */
const pendingPhoto = async (projectId: string, cookie = lea) => {
  const known = new Set((await updatePhotosOf(projectId)).map((photo) => photo.id))
  const res = await upload(projectId, visualForm(await jpegImage(800, 600), 'update'), cookie)
  expect(res.status).toBe(201)
  const added = (await updatePhotosOf(projectId)).filter((photo) => !known.has(photo.id))
  expect(added).toHaveLength(1)
  const [photo] = added
  if (!photo) throw new Error('no pending photo')
  return { id: photo.id, key: photo.storage_key }
}

/** Publie une mise à jour d'une ligne qui cite ces photos en attente. */
const publishUpdateWith = async (projectId: string, photoIds: string[], cookie = lea) => {
  const res = await sendJson('POST', `/v1/projects/${projectId}/updates`, cookie, {
    title: null,
    version: null,
    lines: [{ family: 'new', text: 'Un mode nuit' }],
    photos: photoIds.map((id) => ({ id, description: null })),
    beforeAfter: false,
  })
  expect(res.status).toBe(201)
  return ProjectUpdate.parse(await res.json())
}

/** Ouvre le fichier d'une clé de stockage (« visuals/<uuid>.webp »), avec ou sans session. */
const openKey = (key: string, cookie: string | null) =>
  ctx.request(`/media/${key}`, { headers: cookie ? { cookie } : {} })

/** Le corps d'un 404 sur un fichier qui n'existe pas : la référence de « comme un inconnu ». */
const unknownFileBody = async (cookie: string) => {
  const res = await openKey(`visuals/${crypto.randomUUID()}.webp`, cookie)
  expect(res.status).toBe(404)
  return res.json()
}

describe('the photos of an update (R7a)', () => {
  it('serves a pending update photo to its author only', async () => {
    const project = await publish()
    const photo = await pendingPhoto(project.id)
    const expected = await unknownFileBody(max)

    expect((await openKey(photo.key, lea)).status).toBe(200)
    for (const [what, cookie] of [
      ['another member', max],
      ['a visitor', null],
    ] as const) {
      const res = await openKey(photo.key, cookie)
      expect(res.status, what).toBe(404)
      expect(await res.json(), what).toEqual(expected)
    }
  })

  it('serves the photos of a published update to whoever sees the project', async () => {
    const project = await publish()
    const photo = await pendingPhoto(project.id)
    await publishUpdateWith(project.id, [photo.id])
    const act = activity(ctx)
    const [leaId, maxId] = [await idOf(lea), await idOf(max)]

    expect((await openKey(photo.key, max)).status).toBe(200)

    await act.setVisibility(project.id, lea, 'private')
    expect((await openKey(photo.key, max)).status).toBe(404)
    await act.setVisibility(project.id, lea, 'public')
    expect((await openKey(photo.key, max)).status).toBe(200) // témoin : de nouveau visible

    await act.block(maxId, lea)
    expect((await openKey(photo.key, max)).status).toBe(404)
    await act.unblock(maxId, lea)
    await act.block(leaId, max)
    expect((await openKey(photo.key, max)).status).toBe(404)
  })

  it('serves the photos of a removed update to the author only', async () => {
    const project = await publish()
    const photo = await pendingPhoto(project.id)
    const update = await publishUpdateWith(project.id, [photo.id])
    const act = activity(ctx)
    const louis = await ctx.verifiedMember({
      name: 'Louis',
      email: 'louis@example.com',
      password: 'louis-long-password',
    })
    await act.makeAdmin(await idOf(louis))
    await act.report(max, { kind: 'update', id: update.id })
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'update', id: update.id },
      ground: 'rules',
      explanation: 'Cette mise à jour enfreint les règles de la communauté.',
    })

    expect((await openKey(photo.key, lea)).status).toBe(200)
    expect((await openKey(photo.key, max)).status).toBe(404)
    // L'administrateur qui l'a retirée la lit comme tout membre : pas d'exception.
    expect((await openKey(photo.key, louis)).status).toBe(404)
  })

  it('never lists an update photo, pending or published, in the gallery, the cover or the cards', async () => {
    const project = await publish()
    const published = await pendingPhoto(project.id)
    await publishUpdateWith(project.id, [published.id])
    const pending = await pendingPhoto(project.id)

    // Même sans aucune photo de galerie, aucune des deux ne devient la couverture.
    const seen = await read(project.id, max)
    expect(seen.visuals).toEqual([])
    expect(seen.portraitCover).toBeNull()
    const feed = await sendJson('GET', '/v1/feed/discover', max)
    expect(feed.status).toBe(200)
    const card = DiscoverFeedPage.parse(await feed.json()).items.find(
      (item) => item.project.id === project.id,
    )
    expect(card?.project.cover).toBeNull()
    expect(card?.project.portraitCover).toBeNull()
    // L'export de l'auteur ne les compte pas non plus parmi les photos de la galerie.
    const data = AccountExport.parse(await (await sendJson('GET', '/v1/me/export', lea)).json())
    expect(data.projects[0]?.visuals).toEqual([])
    expect(await updatePhotosOf(project.id)).toHaveLength(2) // témoin : elles existent bien
    expect(storedVisuals()).toEqual(expect.arrayContaining([published.key, pending.key]))
  })

  it('does not count update photos in the six photos of the gallery, nor the other way round', async () => {
    const project = await publish()
    for (let i = 0; i < 6; i++) await addPhoto(project.id)

    for (let i = 0; i < 4; i++) await pendingPhoto(project.id)

    expect((await read(project.id)).visuals).toHaveLength(6)
    expect(await updatePhotosOf(project.id)).toHaveLength(4)
  })

  it('refuses to remove or describe a photo attached to a published update', async () => {
    const project = await publish()
    const photo = await pendingPhoto(project.id)
    const update = await publishUpdateWith(project.id, [photo.id])

    const removal = await sendJson('DELETE', `/v1/projects/${project.id}/visuals/${photo.id}`, lea)
    const description = await describePhoto(project.id, photo.id, { description: 'Autre chose' })

    expect(removal.status).toBe(404)
    expect(description.status).toBe(404)
    // La ligne et le fichier restent, toujours rattachés, sans description.
    expect(await updatePhotosOf(project.id)).toEqual([
      { id: photo.id, storage_key: photo.key, update_id: update.id },
    ])
    expect(ctx.storage.files.has(photo.key)).toBe(true)
    expect(await storedDescriptions()).toEqual([])
  })

  it('lets the author remove a pending photo, file included', async () => {
    const project = await publish()
    const photo = await pendingPhoto(project.id)

    const res = await sendJson('DELETE', `/v1/projects/${project.id}/visuals/${photo.id}`, lea)

    expect(res.status).toBe(200)
    expect(ctx.storage.files.has(photo.key)).toBe(false)
    expect(await updatePhotosOf(project.id)).toEqual([])
  })

  it('replaces the oldest pending photo when a fifth one is uploaded', async () => {
    // Relecture A11 : une feuille abandonnée avec quatre photos ne bloque pas la suivante pendant
    // 24 heures ; la plus ancienne en attente part, ligne et fichier.
    const project = await publish()
    const sent = []
    for (let i = 0; i < 4; i++) sent.push(await pendingPhoto(project.id))
    const [oldest] = sent

    const res = await upload(project.id, visualForm(await jpegImage(800, 600), 'update'))

    expect(res.status).toBe(201)
    const left = await updatePhotosOf(project.id)
    expect(left).toHaveLength(4)
    expect(left.map((photo) => photo.id)).not.toContain(oldest?.id)
    expect(ctx.storage.files.has(oldest?.key ?? '')).toBe(false)
    // Les trois autres restent, et la nouvelle est là.
    for (const kept of sent.slice(1)) expect(ctx.storage.files.has(kept.key)).toBe(true)
    expect(storedVisuals()).toHaveLength(4)
  })

  it('never replaces a photo already attached to an update', async () => {
    const project = await publish()
    const attached = await pendingPhoto(project.id)
    await publishUpdateWith(project.id, [attached.id])
    for (let i = 0; i < 5; i++) await pendingPhoto(project.id)

    // Cinq envois : quatre en attente au plus, et la photo publiée reste.
    const photos = await updatePhotosOf(project.id)
    expect(photos.filter((photo) => photo.update_id === null)).toHaveLength(4)
    expect(photos.map((photo) => photo.id)).toContain(attached.id)
    expect(ctx.storage.files.has(attached.key)).toBe(true)
  })

  it('refuses a 101st update photo on a project, pending ones included, and stores no file', async () => {
    const project = await publish()
    const update = await publishUpdateWith(project.id, [])
    // 97 photos déjà rattachées, semées en base (sans fichier), puis 2 en attente envoyées : 99.
    await ctx.db.execute(sql`
      insert into project_media
        (id, project_id, kind, slot, position, storage_key, width, height, thumbhash, update_id)
      select gen_random_uuid(), ${project.id}::uuid, 'image', 'update', 0,
             'visuals/' || gen_random_uuid() || '.webp', 800, 600, 'AAAA', ${update.id}::uuid
      from generate_series(1, 97)`)
    await pendingPhoto(project.id)
    await pendingPhoto(project.id)
    // Témoin : la centième passe.
    await pendingPhoto(project.id)
    expect(await updatePhotosOf(project.id)).toHaveLength(100)

    const res = await upload(project.id, visualForm(await jpegImage(800, 600), 'update'))

    expect(res.status).toBe(409)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('update_photos_full')
    expect(await updatePhotosOf(project.id)).toHaveLength(100)
    expect(storedVisuals()).toHaveLength(3)
    // La galerie, elle, garde ses six places.
    expect((await upload(project.id, visualForm(await photoWithGps()))).status).toBe(201)
  })

  it('refuses another member who sends an update photo, and keeps a private project hidden', async () => {
    const visible = await publish('public')
    const hidden = await publish('private')
    const photo = await jpegImage(800, 600)

    expect((await upload(visible.id, visualForm(photo, 'update'), max)).status).toBe(403)
    expect((await upload(hidden.id, visualForm(photo, 'update'), max)).status).toBe(404)
    expect(storedVisuals()).toHaveLength(0)
    await pendingPhoto(visible.id) // témoin : l'autrice, elle, envoie
  })
})
