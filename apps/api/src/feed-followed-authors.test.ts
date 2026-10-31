// Tests d'intégration de `followedAuthorIds` dans le fil « Découvrir » (R3, « Récents »
// d'Explorer) : parmi les auteurs des projets de la page, ceux que le membre suit déjà. L'appli ne
// pose la pastille « Suivre Nora » que sur les autres. Scénario : docs/scenarios/refonte.md, « R3 »,
// « Suivre l'auteur depuis une carte ».
import { DiscoverFeedPage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { explainQueries } from './testing/explain'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let inesId: string
let malikId: string
let zoeId: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  zoeId = (await act.me(zoe)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Publie un projet une seconde après ce qui précède (l'ordre du fil suit les dates). */
const publish = (cookie: string, title: string) => {
  vi.setSystemTime(Date.now() + 1000)
  return act.publish(cookie, title)
}

/** La première page du fil « Découvrir », vérifiée par le contrat. */
const discover = async (cookie: string) => {
  const res = await act.send('GET', '/v1/feed/discover', cookie)
  expect(res.status).toBe(200)
  return DiscoverFeedPage.parse(await res.json())
}

describe('the followed authors of a discover page', () => {
  it('names the authors I follow, and only them', async () => {
    await publish(ines, 'Carnet de cafés')
    await publish(zoe, 'Le potager')
    await act.followMember(inesId, malik)

    const page = await discover(malik)

    // Témoin : les deux projets sont bien dans la page.
    expect(page.items.map((item) => item.project.author.id).sort()).toEqual([inesId, zoeId].sort())
    expect(page.followedAuthorIds).toEqual([inesId])
  })

  it('never names myself, even when my projects are in the page', async () => {
    await publish(malik, 'Mon carnet')

    const page = await discover(malik)

    expect(page.items.map((item) => item.project.author.id)).toEqual([malikId])
    expect(page.followedAuthorIds).toEqual([])
  })

  it('names an author once, whatever the number of his projects in the page', async () => {
    await publish(ines, 'Un')
    await publish(ines, 'Deux')
    await act.followMember(inesId, malik)

    expect((await discover(malik)).followedAuthorIds).toEqual([inesId])
  })

  it('never names a blocked member, whose projects are not in the page', async () => {
    await publish(ines, 'Carnet de cafés')
    await act.followMember(inesId, malik)
    // Témoin : avant le blocage, Inès est suivie et nommée.
    expect((await discover(malik)).followedAuthorIds).toEqual([inesId])

    vi.setSystemTime(Date.now() + 1000)
    await act.block(malikId, ines)

    const page = await discover(malik)
    expect(page.items).toEqual([])
    expect(page.followedAuthorIds).toEqual([])
  })

  it('reads the follows in a fixed number of queries, whatever the number of authors', async () => {
    const queriesFor = async () =>
      (
        await explainQueries(ctx.db, async () => {
          await discover(malik)
        })
      ).length

    await publish(ines, 'Un')
    await act.followMember(inesId, malik)
    const oneAuthor = await queriesFor()

    await publish(zoe, 'Deux')
    await act.followMember(zoeId, malik)
    await publish(zoe, 'Trois')
    const twoAuthors = await queriesFor()

    expect(twoAuthors).toBe(oneAuthor)
  })
})
