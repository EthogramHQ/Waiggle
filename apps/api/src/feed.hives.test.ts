// Le Fil d'une ruche (R10) : GET /v1/feed/following?hive=<id>, la pastille du sélecteur. Il montre
// les nouveaux projets et les mises à jour de tous les membres de la ruche, suivis ou non, que le
// lecteur peut voir : leurs projets réservés à cette ruche et leurs projets « Membres », jamais un
// projet réservé à une autre ruche. Un non-membre reçoit le même 404 qu'une ruche inconnue. Sans
// `hive`, « Tout » reste le Fil d'aujourd'hui, avec les projets réservés aux ruches du lecteur.
// Scénario : docs/scenarios/refonte.md, R10, « Le Fil » et « Les blocages » ; contrat :
// packages/contracts/src/feed.ts (`FollowingFeedQuery`, `FollowingFeedPage`) ; plan, choix 4 et 5.
//
// Les ruches sont écrites directement en base (testing/hive-rows.ts). Famille : Inès (la lectrice),
// Léa et Max, qu'Inès ne suit pas. Amis : Inès et Léa. Nina n'est dans aucune ruche.
import { ErrorResponse, FollowingFeedPage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let lea: string
let max: string
let nina: string
let inesId: string
let leaId: string
let maxId: string
let famille: string // identifiants des ruches
let amis: string

const SECOND = 1000
const START = new Date('2026-11-14T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

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
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  nina = await ctx.verifiedMember({
    name: 'Nina',
    email: 'nina@example.com',
    password: 'nina-long-password',
  })
  inesId = (await act.me(ines)).id
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  famille = await hives.createHive('Famille', leaId, [inesId, maxId])
  amis = await hives.createHive('Amis', leaId, [inesId])
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (d'une seconde par défaut : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const hivePath = (hiveId: string) => `/v1/feed/following?${new URLSearchParams({ hive: hiveId })}`

/** Lit le Fil d'une ruche (ou « Tout » sans ruche), qui doit répondre 200. */
const feedOf = async (cookie: string, hiveId?: string) => {
  const path = hiveId === undefined ? '/v1/feed/following' : hivePath(hiveId)
  const res = await act.send('GET', path, cookie)
  expect(res.status, path).toBe(200)
  return FollowingFeedPage.parse(await res.json())
}

/** Le fil en une ligne par élément : « project:Titre » ou « update:Titre ». */
const linesOf = (page: FollowingFeedPage) =>
  page.items.map((item) => `${item.kind}:${item.project.title}`)

/** Publie un projet, et le réserve à une ruche si elle est donnée. */
const publish = async (cookie: string, title: string, hiveId?: string, body: object = {}) => {
  later()
  const project = await act.publish(cookie, title, body)
  if (hiveId !== undefined) await hives.reserve(project.id, hiveId)
  return project
}

/** Publie une mise à jour de ce projet (avant de le réserver : la route est celle d'aujourd'hui). */
const postUpdate = async (cookie: string, projectId: string, text: string) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, {
    title: null,
    version: null,
    lines: [{ family: 'new', text }],
    photos: [],
    beforeAfter: false,
  })
  expect(res.status).toBe(201)
}

// ─── Qui peut lire le Fil d'une ruche ────────────────────────────────────────────────────────────

describe('who may read the feed of a hive', () => {
  it('answers the same 404 to a non-member, to a former member and for an unknown hive', async () => {
    await publish(lea, 'Album de famille', famille)
    later()
    await hives.removeMember(famille, maxId)

    for (const [name, cookie] of [
      ['Nina', nina],
      ['Max, gone', max],
    ] as const) {
      const res = await act.send('GET', hivePath(famille), cookie)
      const unknown = await act.send('GET', hivePath(UNKNOWN), cookie)
      expect(res.status, name).toBe(404)
      expect(unknown.status, name).toBe(404)
      expect(await res.json(), name).toEqual(await unknown.json())
    }
    // Témoin : Inès, membre, lit le Fil de Famille.
    expect(linesOf(await feedOf(ines, famille))).toEqual(['project:Album de famille'])
  })

  it('asks to sign in', async () => {
    const res = await act.send('GET', hivePath(famille), null)
    expect(res.status).toBe(401)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unauthorized')
    // Témoin : la même adresse répond à Inès, membre (la pastille existe).
    expect((await feedOf(ines, famille)).followsAnyone).toBe(true)
  })
})

// ─── Ce que montre la pastille ───────────────────────────────────────────────────────────────────

describe('the feed of a hive', () => {
  it('shows the new projects of every member, followed or not, reserved to the hive or for members', async () => {
    await publish(lea, 'Potager de Léa') // « Membres »
    await publish(max, 'Album de famille', famille)
    await publish(lea, 'Brouillon de Léa', undefined, { visibility: 'private' })
    await publish(nina, 'Météo de Nina') // Nina n'est pas dans Famille

    const page = await feedOf(ines, famille)

    expect(linesOf(page)).toEqual(['project:Album de famille', 'project:Potager de Léa'])
    // Inès ne suit personne : la pastille vaut quand même « suit quelqu'un ».
    expect(page.followsAnyone).toBe(true)
    expect(page.items.find((i) => i.project.title === 'Album de famille')?.project.hive).toEqual({
      id: famille,
      name: 'Famille',
    })
  })

  it('shows the updates of the projects of its members that the reader may see', async () => {
    const potager = await publish(lea, 'Potager de Léa')
    const album = await publish(max, 'Album de famille')
    const meteo = await publish(nina, 'Météo de Nina')
    await postUpdate(lea, potager.id, 'Les tomates sont là')
    await postUpdate(max, album.id, 'Les photos de Noël')
    await postUpdate(nina, meteo.id, 'Le radar de pluie')
    await hives.reserve(album.id, famille)

    expect(linesOf(await feedOf(ines, famille))).toEqual([
      'update:Album de famille',
      'update:Potager de Léa',
    ])
  })

  it('shows under a hive pill no project reserved to another hive', async () => {
    await publish(lea, 'Album de famille', famille)
    // Léa et Inès sont toutes deux dans Amis : le projet est visible d'Inès, mais pas sous Famille.
    const carnet = await publish(lea, 'Carnet des amis', amis)
    const jeux = await publish(lea, 'Jeux des amis')
    await postUpdate(lea, jeux.id, 'Un nouveau jeu')
    await hives.reserve(jeux.id, amis)

    const underFamille = await feedOf(ines, famille)
    expect(linesOf(underFamille)).toEqual(['project:Album de famille'])
    expect(JSON.stringify(underFamille)).not.toContain(carnet.id)
    // Témoin : sous Amis, les deux projets réservés à Amis.
    expect(linesOf(await feedOf(ines, amis))).toEqual([
      'update:Jeux des amis',
      'project:Carnet des amis',
    ])
  })

  it('leaves out the projects of a member who left the hive', async () => {
    await publish(max, 'Vélo de Max')
    await publish(lea, 'Potager de Léa')
    later()
    await hives.removeMember(famille, maxId)

    expect(linesOf(await feedOf(ines, famille))).toEqual(['project:Potager de Léa'])
  })

  it('leaves out the projects of a member blocked either way', async () => {
    await publish(max, 'Vélo de Max')
    await publish(max, 'Album de Max', famille)
    await publish(lea, 'Potager de Léa')

    await act.block(maxId, ines) // Inès bloque Max
    expect(linesOf(await feedOf(ines, famille))).toEqual(['project:Potager de Léa'])
    await act.unblock(maxId, ines)
    await act.block(inesId, max) // Max bloque Inès
    expect(linesOf(await feedOf(ines, famille))).toEqual(['project:Potager de Léa'])
    // Témoin : Léa, sans blocage, voit les trois.
    expect(linesOf(await feedOf(lea, famille))).toHaveLength(3)
  })
})

// ─── « Tu es à jour » : la dernière visite de la ruche ────────────────────────────────────────────

describe('the last visit of a hive', () => {
  it('answers the last visit before this reading, and the first page moves it to now', async () => {
    await publish(lea, 'Potager de Léa')
    const visit = new Date(Date.now() - 3600 * SECOND)
    await hives.setSeenAt(famille, inesId, visit)
    later()
    const firstRead = new Date()

    expect((await feedOf(ines, famille)).lastReadAt).toBe(visit.toISOString())
    expect(await hives.seenAt(famille, inesId)).toEqual(firstRead)
    later()
    expect((await feedOf(ines, famille)).lastReadAt).toBe(firstRead.toISOString())
  })

  it('answers null before a first visit, and leaves the other hives and « Tout » alone', async () => {
    await publish(lea, 'Potager de Léa')

    expect((await feedOf(ines, famille)).lastReadAt).toBeNull()
    expect(await hives.seenAt(famille, inesId)).not.toBeNull()
    expect(await hives.seenAt(amis, inesId)).toBeNull()
    // « Tout » garde sa propre date (PUT /v1/feed/read), jamais celle d'une ruche.
    expect((await feedOf(ines)).lastReadAt).toBeNull()
  })
})

// ─── « Tout » ────────────────────────────────────────────────────────────────────────────────────

describe('the whole feed', () => {
  it('shows the reserved projects of followed members to a reader in their hive, and to nobody else', async () => {
    await act.followMember(leaId, ines)
    await act.followMember(leaId, nina)
    const album = await publish(lea, 'Album de famille', famille)

    expect(linesOf(await feedOf(ines))).toContain('project:Album de famille')
    // Nina suit Léa mais n'est pas dans Famille ; Max, qui a quitté la ruche, non plus.
    expect(JSON.stringify(await feedOf(nina))).not.toContain(album.id)
    await act.followMember(leaId, max)
    expect(linesOf(await feedOf(max))).toContain('project:Album de famille')
    await hives.removeMember(famille, maxId)
    expect(JSON.stringify(await feedOf(max))).not.toContain(album.id)
  })

  it('drops a followed reserved project for a follower who left the hive', async () => {
    const album = await publish(lea, 'Album de famille')
    expect((await act.send('POST', `/v1/projects/${album.id}/follow`, max)).status).toBe(204)
    await postUpdate(lea, album.id, 'Les photos de Noël')
    await hives.reserve(album.id, famille)
    expect(linesOf(await feedOf(max))).toContain('update:Album de famille')

    await hives.removeMember(famille, maxId)

    expect(JSON.stringify(await feedOf(max))).not.toContain(album.id)
  })
})
