// Un projet réservé à une ruche (R10), lecture par lecture : il n'apparaît nulle part pour qui n'est
// pas membre de la ruche (sa page, ses commentaires, ses mises à jour, ses photos, le coin des
// testeurs, Explorer, la page d'un outil, la page de son auteur), et partout pour ses membres.
// Publier « réservé », ou y passer, exige d'être membre de la ruche ; changer de ruche aussi.
// Scénario : docs/scenarios/refonte.md, R10, « Un projet réservé à une ruche » et « Quitter une
// ruche » ; plan de R10, choix 2 et 3, « Ce qui change au plan » point 1, décision Q2 (défaire son
// geste sans être membre). Les nombres (réactions, suivis, catalogue) sont dans
// hive-visibility.counts.test.ts, le Fil dans feed.hives.test.ts, la recherche dans
// search.hives.test.ts.
//
// Les ruches sont écrites directement en base (testing/hive-rows.ts) : leurs routes sont testées
// ailleurs. Quatre membres : Inès (l'autrice, dans « Famille » et « Amis »), Max (dans « Famille »),
// Zoé (dans « Amis » seulement : être dans une autre ruche d'Inès ne suffit pas) et Sami (dans
// aucune ruche). Le témoin de chaque lecture est Max : ce qui est caché aux autres lui est montré.
import { Comment, FeedPage, Member, Project, TesterMedia, ToolPage } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let max: string
let zoe: string
let sami: string
let inesId: string
let maxId: string
let zoeId: string
let famille: string // identifiants des ruches
let amis: string

const SECOND = 1000
const START = new Date('2026-11-14T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  sami = await ctx.verifiedMember({
    name: 'Sami',
    email: 'sami@example.com',
    password: 'sami-long-password',
  })
  inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  famille = await hives.createHive('Famille', inesId, [maxId])
  amis = await hives.createHive('Amis', inesId, [zoeId])
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (d'une seconde par défaut : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Les non-membres de « Famille » : Zoé (dans une autre ruche d'Inès) et Sami (dans aucune). */
const strangers = () =>
  [
    ['Zoé', zoe],
    ['Sami', sami],
  ] as const

/** Publie un projet public d'Inès (testable, avec l'outil Mistral), puis le réserve à Famille. */
const reservedProject = async (title = 'Album de famille', body: object = {}) => {
  const project = await act.publish(ines, title, { tools: ['Mistral'], ...TESTABLE, ...body })
  later()
  await hives.reserve(project.id, famille)
  later()
  return project
}

const status = async (method: string, path: string, cookie: string, body?: unknown) =>
  (await act.send(method, path, cookie, body)).status

const readText = async (path: string, cookie: string) => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, path).toBe(200)
  return res.text()
}

/** Vérifie qu'une réponse est le même 404 qu'un projet inconnu. */
const expectUnknownProject = async (res: Response, unknown: Response) => {
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual(await unknown.json())
}

// ─── Sa page et ce qui s'y lit ───────────────────────────────────────────────────────────────────

describe('the page of a hive-reserved project', () => {
  it('shows it to the members of the hive, with the hive it is reserved to', async () => {
    const album = await reservedProject()

    for (const cookie of [max, ines]) {
      const res = await act.send('GET', `/v1/projects/${album.id}`, cookie)
      expect(res.status).toBe(200)
      const project = Project.parse(await res.json())
      expect(project.visibility).toBe('hive')
      expect(project.hive).toEqual({ id: famille, name: 'Famille' })
    }
  })

  it('answers any other member as for an unknown project, even one in another hive of the author', async () => {
    const album = await reservedProject()

    for (const [name, cookie] of strangers()) {
      const res = await act.send('GET', `/v1/projects/${album.id}`, cookie)
      expect(res.status, name).toBe(404)
      expect(await res.json(), name).toEqual(
        await (await act.send('GET', `/v1/projects/${UNKNOWN}`, cookie)).json(),
      )
    }
    // Témoin : Max, membre de Famille, l'ouvre.
    expect(await status('GET', `/v1/projects/${album.id}`, max)).toBe(200)
  })

  it('closes the page at once to a member who left the hive', async () => {
    const album = await reservedProject()
    expect(await status('GET', `/v1/projects/${album.id}`, max)).toBe(200)

    await hives.removeMember(famille, maxId)

    await expectUnknownProject(
      await act.send('GET', `/v1/projects/${album.id}`, max),
      await act.send('GET', `/v1/projects/${UNKNOWN}`, max),
    )
  })

  it('shows its comments and its updates to members only', async () => {
    const album = await act.publish(ines, 'Album de famille')
    later()
    const first = await act.comment(album.id, ines, 'Les photos de Noël arrivent.')
    later()
    await act.send('POST', `/v1/projects/${album.id}/updates`, ines, {
      title: null,
      version: null,
      lines: [{ family: 'new', text: 'Les photos de l’été' }],
      photos: [],
      beforeAfter: false,
    })
    later()
    await hives.reserve(album.id, famille)

    const reads = [
      `/v1/projects/${album.id}/comments`,
      `/v1/projects/${album.id}/updates`,
      `/v1/comments/${first.id}/context`,
    ]
    for (const path of reads) {
      expect(await status('GET', path, max), path).toBe(200)
      for (const [name, cookie] of strangers()) {
        expect(await status('GET', path, cookie), `${name} ${path}`).toBe(404)
      }
    }
    expect(await readText(`/v1/projects/${album.id}/comments`, max)).toContain('photos de Noël')
  })

  it('lets members comment and react, and answers the others as for an unknown project', async () => {
    const album = await reservedProject()

    const res = await act.send('POST', `/v1/projects/${album.id}/comments`, max, {
      body: 'Superbe idée !',
    })
    expect(res.status).toBe(201)
    expect(Comment.parse(await res.json()).body).toBe('Superbe idée !')
    expect(await status('PUT', `/v1/projects/${album.id}/reactions/bravo`, max)).toBe(204)

    for (const [name, cookie] of strangers()) {
      await expectUnknownProject(
        await act.send('POST', `/v1/projects/${album.id}/comments`, cookie, { body: 'Coucou' }),
        await act.send('POST', `/v1/projects/${UNKNOWN}/comments`, cookie, { body: 'Coucou' }),
      )
      expect(await status('PUT', `/v1/projects/${album.id}/reactions/bravo`, cookie), name).toBe(
        404,
      )
    }
  })

  it('serves its photos to members only', async () => {
    const album = await act.publish(ines, 'Album de famille')
    const upload = await ctx.request(`/v1/projects/${album.id}/visuals`, {
      method: 'POST',
      headers: { cookie: ines },
      body: visualForm(await jpegImage(800, 600)),
    })
    expect(upload.status).toBe(201)
    const url = Project.parse(await upload.json()).visuals[0]?.url
    if (url === undefined) throw new Error('no visual')
    const path = new URL(url).pathname
    later()
    await hives.reserve(album.id, famille)

    expect(await status('GET', path, max)).toBe(200)
    expect(await status('GET', path, ines)).toBe(200)
    for (const [name, cookie] of strangers()) {
      expect(await status('GET', path, cookie), name).toBe(404)
    }
  })
})

// ─── Les testeurs ────────────────────────────────────────────────────────────────────────────────

describe('the testers of a hive-reserved project', () => {
  it('lets a member of the hive join its testers and open the corner, and nobody else', async () => {
    const album = await reservedProject()

    expect(await status('POST', `/v1/projects/${album.id}/testers`, max)).toBe(204)
    expect(await status('GET', `/v1/projects/${album.id}/testers`, max)).toBe(200)
    for (const [name, cookie] of strangers()) {
      await expectUnknownProject(
        await act.send('POST', `/v1/projects/${album.id}/testers`, cookie),
        await act.send('POST', `/v1/projects/${UNKNOWN}/testers`, cookie),
      )
      expect(await status('GET', `/v1/projects/${album.id}/testers`, cookie), name).toBe(404)
    }
  })

  // Relecture de sécurité du plan (B4) : `cornerAccess` et la route des testeurs relisent
  // l'appartenance à chaque accès. Max testait le projet quand il était « Membres » ; il reste
  // testeur en base après son départ de la ruche, mais ne voit plus rien.
  it('hides a hive-reserved project from a member who left the hive, in the testers corner and its photos', async () => {
    const album = await act.publish(ines, 'Album de famille', { ...TESTABLE })
    const visual = await ctx.request(`/v1/projects/${album.id}/visuals`, {
      method: 'POST',
      headers: { cookie: ines },
      body: visualForm(await jpegImage(800, 600)),
    })
    const visualUrl = Project.parse(await visual.json()).visuals[0]?.url
    later()
    expect(await status('POST', `/v1/projects/${album.id}/testers`, max)).toBe(204)
    // Inès lance un appel avec une photo : les testeurs actuels la voient.
    later()
    const form = new FormData()
    form.append(
      'file',
      new File([new Uint8Array(await jpegImage(800, 600))], 'image', { type: 'image/jpeg' }),
    )
    form.append('kind', 'call')
    const photoRes = await ctx.request(`/v1/projects/${album.id}/testers/media`, {
      method: 'POST',
      headers: { cookie: ines },
      body: form,
    })
    expect(photoRes.status).toBe(201)
    const photo = TesterMedia.parse(await photoRes.json())
    later()
    const call = await act.send('POST', `/v1/projects/${album.id}/calls`, ines, {
      text: 'Essayez l’album ce week-end.',
      photoId: photo.id,
      photoDescription: 'La page de garde de l’album.',
    })
    expect(call.status).toBe(201)
    later()
    await hives.reserve(album.id, famille)
    if (visualUrl === undefined) throw new Error('no visual')
    const reads = [
      `/v1/projects/${album.id}/testers`,
      `/v1/projects/${album.id}/calls`,
      new URL(visualUrl).pathname,
      new URL(photo.url).pathname,
    ]
    // Témoin : membre de la ruche, Max lit tout.
    for (const path of reads) {
      expect(await status('GET', path, max), `member ${path}`).toBe(200)
    }

    await hives.removeMember(famille, maxId)

    for (const path of reads) {
      expect(await status('GET', path, max), `former member ${path}`).toBe(404)
    }
    // Il ne peut pas non plus rejoindre à nouveau les testeurs.
    expect(await status('POST', `/v1/projects/${album.id}/testers`, max)).toBe(404)
  })
})

// ─── Défaire son geste après le départ (décision Q2 de la relecture du plan) ────────────────────

describe('a member who left the hive', () => {
  it('lets a member who left the hive delete their comment on a project reserved to it', async () => {
    // Max a commenté quand le projet était encore « Membres » ; Inès le réserve ensuite à Famille.
    const album = await act.publish(ines, 'Album de famille')
    const mine = await act.comment(album.id, max, 'Mon commentaire chez Inès')
    later()
    await hives.reserve(album.id, famille)
    await hives.removeMember(famille, maxId)

    // Il ne lit plus les commentaires…
    expect(await status('GET', `/v1/projects/${album.id}/comments`, max)).toBe(404)
    // … mais efface encore le sien.
    expect(await status('DELETE', `/v1/projects/${album.id}/comments/${mine.id}`, max)).toBe(204)
    const [row] = await ctx.db
      .select({ deletedAt: schema.projectComment.deletedAt })
      .from(schema.projectComment)
      .where(eq(schema.projectComment.id, mine.id))
    expect(row?.deletedAt).not.toBeNull()
  })

  it('lets a former hive member delete their own comment on a project reserved to that hive', async () => {
    const album = await act.publish(ines, 'Album de famille')
    const mine = await act.comment(album.id, max, 'Un mot de Max')
    later()
    await act.react(album.id, 'bravo', max)
    later()
    expect(await status('POST', `/v1/projects/${album.id}/follow`, max)).toBe(204)
    later()
    await hives.reserve(album.id, famille)
    await hives.removeMember(famille, maxId)

    for (const [method, path] of [
      ['DELETE', `/v1/projects/${album.id}/comments/${mine.id}`],
      ['DELETE', `/v1/projects/${album.id}/reactions/bravo`],
      ['DELETE', `/v1/projects/${album.id}/follow`],
    ] as const) {
      expect(await status(method, path, max), path).toBe(204)
    }
    expect(
      await ctx.db
        .select()
        .from(schema.projectReaction)
        .where(eq(schema.projectReaction.memberId, maxId)),
    ).toEqual([])
  })
})

// ─── Les listes ──────────────────────────────────────────────────────────────────────────────────

describe('the lists', () => {
  it('lists it in Explorer, its testers carousel, its category and its tool page for members only', async () => {
    const album = await reservedProject('Album de famille', { primaryCategory: 'family' })

    const lists = [
      '/v1/feed/discover',
      '/v1/feed/discover?testers=true',
      '/v1/feed/discover?category=family',
      '/v1/tags/mistral',
    ]
    for (const path of lists) {
      expect(await readText(path, max), `member ${path}`).toContain(album.id)
      for (const [name, cookie] of strangers()) {
        expect(await readText(path, cookie), `${name} ${path}`).not.toContain(album.id)
      }
    }
    const tool = ToolPage.parse(JSON.parse(await readText('/v1/tags/mistral', max)))
    expect(tool.projects.find((p) => p.id === album.id)?.hive).toEqual({
      id: famille,
      name: 'Famille',
    })
  })

  it('lists it on the page of its author for members only', async () => {
    const album = await reservedProject()
    const projectsOn = async (cookie: string) =>
      Member.parse(JSON.parse(await readText(`/v1/members/${inesId}`, cookie))).projects.map(
        (p) => p.id,
      )

    expect(await projectsOn(max)).toContain(album.id)
    expect(await projectsOn(ines)).toContain(album.id)
    for (const [, cookie] of strangers()) {
      expect(await projectsOn(cookie)).not.toContain(album.id)
    }
  })

  it('drops it from every list of a member who left the hive', async () => {
    const album = await reservedProject()
    const lists = ['/v1/feed/discover', '/v1/tags/mistral', `/v1/members/${inesId}`]
    for (const path of lists) {
      expect(await readText(path, max), path).toContain(album.id)
    }

    await hives.removeMember(famille, maxId)

    for (const path of lists) {
      expect(await readText(path, max), path).not.toContain(album.id)
    }
  })

  it('never lists a project reserved to another hive to a member of a hive', async () => {
    const album = await reservedProject()
    // Zoé est dans « Amis » avec Inès ; son propre projet réservé à Amis lui est montré.
    const carnet = await act.publish(ines, 'Carnet des amis', { tools: ['Mistral'] })
    later()
    await hives.reserve(carnet.id, amis)

    const discover = FeedPage.parse(JSON.parse(await readText('/v1/feed/discover', zoe)))
    const ids = discover.items.map((item) => item.project.id)
    expect(ids).toContain(carnet.id)
    expect(ids).not.toContain(album.id)
  })
})

// ─── Publier « réservé », y passer, changer de ruche ─────────────────────────────────────────────

describe('reserving a project to a hive', () => {
  const projectInput = (hiveId: string) => ({
    title: 'Recettes de Mamie',
    pitch: 'Les recettes de la famille.',
    primaryCategory: 'cooking',
    visibility: 'hive',
    hiveId,
  })
  const projectCount = async () => (await ctx.db.select().from(schema.project)).length

  it('publishes a project reserved to a hive of its author, seen by its members only', async () => {
    const res = await act.send('POST', '/v1/projects', max, projectInput(famille))

    expect(res.status).toBe(201)
    const created = Project.parse(await res.json())
    expect(created.visibility).toBe('hive')
    expect(created.hive).toEqual({ id: famille, name: 'Famille' })
    expect(await status('GET', `/v1/projects/${created.id}`, ines)).toBe(200)
    expect(await status('GET', `/v1/projects/${created.id}`, zoe)).toBe(404)
    // Il entre dans les listes de ses membres à sa date de publication (Explorer).
    expect(await readText('/v1/feed/discover', ines)).toContain(created.id)
  })

  it('refuses to publish to a hive the author is not in, with the same 404 as an unknown hive', async () => {
    // Sami n'est dans aucune ruche, Zoé n'est pas dans Famille.
    for (const [name, cookie] of strangers()) {
      const before = await projectCount()
      const res = await act.send('POST', '/v1/projects', cookie, projectInput(famille))
      const unknown = await act.send('POST', '/v1/projects', cookie, projectInput(UNKNOWN))
      expect(res.status, name).toBe(404)
      expect(await res.json(), name).toEqual(await unknown.json())
      expect(await projectCount(), name).toBe(before)
    }
    // Témoin : Max, membre, publie dans Famille.
    expect((await act.send('POST', '/v1/projects', max, projectInput(famille))).status).toBe(201)
  })

  it('moves a project to « hive » for a member of the hive only', async () => {
    const recettes = await act.publish(zoe, 'Recettes de Zoé')
    later()

    const refused = await act.send('PATCH', `/v1/projects/${recettes.id}`, zoe, {
      visibility: 'hive',
      hiveId: famille,
    })
    const unknown = await act.send('PATCH', `/v1/projects/${recettes.id}`, zoe, {
      visibility: 'hive',
      hiveId: UNKNOWN,
    })
    expect(refused.status).toBe(404)
    expect(await refused.json()).toEqual(await unknown.json())
    const kept = Project.parse(
      await (await act.send('GET', `/v1/projects/${recettes.id}`, zoe)).json(),
    )
    expect(kept.visibility).toBe('public')
    expect(kept.hive).toBeNull()

    const moved = await act.send('PATCH', `/v1/projects/${recettes.id}`, zoe, {
      visibility: 'hive',
      hiveId: amis,
    })
    expect(moved.status).toBe(200)
    expect(Project.parse(await moved.json()).hive).toEqual({ id: amis, name: 'Amis' })
    expect(await status('GET', `/v1/projects/${recettes.id}`, ines)).toBe(200)
    expect(await status('GET', `/v1/projects/${recettes.id}`, max)).toBe(404)
  })

  it('moves a reserved project from one hive to another, and the old hive loses it', async () => {
    const album = await reservedProject()

    const res = await act.send('PATCH', `/v1/projects/${album.id}`, ines, {
      visibility: 'hive',
      hiveId: amis,
    })

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).hive).toEqual({ id: amis, name: 'Amis' })
    expect(await status('GET', `/v1/projects/${album.id}`, zoe)).toBe(200)
    expect(await status('GET', `/v1/projects/${album.id}`, max)).toBe(404)
  })

  it('refuses to move a reserved project to a hive its author is not in, and changes nothing', async () => {
    const outsiders = await hives.createHive('Voisins', zoeId, [maxId])
    const album = await reservedProject()

    const res = await act.send('PATCH', `/v1/projects/${album.id}`, ines, {
      visibility: 'hive',
      hiveId: outsiders,
    })

    expect(res.status).toBe(404)
    const [row] = await ctx.db
      .select({ hiveId: schema.project.hiveId })
      .from(schema.project)
      .where(eq(schema.project.id, album.id))
    expect(row?.hiveId).toBe(famille)
  })

  it('forgets the hive when the project becomes « Membres » or private again', async () => {
    for (const visibility of ['public', 'private'] as const) {
      const album = await reservedProject(`Album ${visibility}`)

      const res = await act.send('PATCH', `/v1/projects/${album.id}`, ines, { visibility })

      expect(res.status, visibility).toBe(200)
      const project = Project.parse(await res.json())
      expect(project.visibility).toBe(visibility)
      expect(project.hive).toBeNull()
      const [row] = await ctx.db
        .select({ hiveId: schema.project.hiveId })
        .from(schema.project)
        .where(eq(schema.project.id, album.id))
      expect(row?.hiveId).toBeNull()
    }
  })
})
