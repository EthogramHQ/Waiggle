// La recherche et les ruches (R10) : un projet réservé à une ruche se trouve pour les membres de la
// ruche seulement, par son titre comme par sa description, et compte dans le nombre de projets d'un
// outil trouvé pour eux seuls ; un membre qui a quitté la ruche ne le trouve plus. Un membre qui a
// choisi « Ne pas me proposer aux autres » reste dans la recherche. Scénario :
// docs/scenarios/refonte.md, R10, « Un projet réservé à une ruche » (Qui le voit : la recherche) et
// « Ne pas me proposer aux autres » ; plan, BE-D (search/load.ts : la règle commune, vérifiée).
//
// Les ruches et le réglage sont écrits directement en base (testing/hive-rows.ts). Famille : Inès
// (l'autrice) et Max. Amis : Inès et Zoé. Sami n'est dans aucune ruche.
import { SearchResults } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let max: string
let zoe: string
let sami: string
let inesId: string
let maxId: string
let famille: string

const SECOND = 1000
const START = new Date('2026-11-14T08:00:00.000Z')

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
  const zoeId = (await act.me(zoe)).id
  famille = await hives.createHive('Famille', inesId, [maxId])
  await hives.createHive('Amis', inesId, [zoeId])
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const search = async (cookie: string, q: string) => {
  later()
  const res = await act.send('GET', `/v1/search?${new URLSearchParams({ q })}`, cookie)
  expect(res.status).toBe(200)
  return SearchResults.parse(await res.json())
}
const projectIds = async (cookie: string, q: string) =>
  (await search(cookie, q)).projects.items.map((p) => p.id)

/** « Album de famille », d'Inès, avec l'outil Mistral, réservé à Famille. */
const reservedAlbum = async () => {
  const album = await act.publish(ines, 'Album de famille', {
    description: 'Les photos de Mamie Odette, rangées par année.',
    tools: ['Mistral'],
  })
  await hives.reserve(album.id, famille)
  return album
}

const outsiders = () =>
  [
    ['Zoé', zoe],
    ['Sami', sami],
  ] as const

describe('the search and the hives', () => {
  it('finds a reserved project for the members of its hive only, by its title and its description', async () => {
    const album = await reservedAlbum()

    for (const q of ['Album', 'Odette']) {
      expect(await projectIds(max, q), `member ${q}`).toContain(album.id)
      expect(await projectIds(ines, q), `author ${q}`).toContain(album.id)
      for (const [name, cookie] of outsiders()) {
        const raw = JSON.stringify(await search(cookie, q))
        expect(raw, `${name} ${q}`).not.toContain(album.id)
        expect(raw, `${name} ${q}`).not.toContain('Odette')
      }
    }
    const found = (await search(max, 'Album')).projects.items.find((p) => p.id === album.id)
    expect(found?.hive).toEqual({ id: famille, name: 'Famille' })
  })

  it('stops finding it for a member who left the hive', async () => {
    const album = await reservedAlbum()
    expect(await projectIds(max, 'Album')).toContain(album.id)

    await hives.removeMember(famille, maxId)

    expect(await projectIds(max, 'Album')).not.toContain(album.id)
  })

  it('counts a reserved project in a tool found for the members of its hive only', async () => {
    await act.publish(zoe, 'Météo de Zoé', { tools: ['Mistral'] })
    later()
    await reservedAlbum()

    const countFor = async (cookie: string) =>
      (await search(cookie, 'Mistral')).tools.items.find((t) => t.name === 'Mistral')?.projectCount
    expect(await countFor(max)).toBe(2)
    expect(await countFor(sami)).toBe(1)
    expect(await countFor(zoe)).toBe(1)
  })

  // « Tu restes dans la recherche et dans les membres de tes ruches » : le réglage ne vaut que pour
  // « Proches à suivre ».
  it('keeps a member who chose not to be suggested in the members found', async () => {
    await hives.hideFromSuggestions(maxId)

    const members = (await search(sami, 'Max')).members.items.map((m) => m.id)
    expect(members).toContain(maxId)
  })
})
