// Tests d'intégration de la tranche 3b-1 : les visuels des projets (galerie et couverture
// verticale), et les médias réservés aux membres. Scénarios : docs/scenarios/phase-1.md, tranche 3b-1.
// Deux membres : Léa (l'autrice) et Max.
import { AccountExport, ErrorResponse, Me, Project } from '@ruche/contracts'
import { schema } from '@ruche/db'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
