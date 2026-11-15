// Les nombres d'un projet réservé à une ruche après le départ d'un membre (R10, BE-C3) : un ancien
// membre ne voit plus le projet, donc sa réaction et son suivi ne comptent plus, ni pour la ruche
// ni pour lui-même ; ses lignes restent en base (elles reviendraient avec lui). Ses commentaires,
// eux, restent lus et comptés (plan, « Après BE-C1 »). Même scène que hive-visibility.counts.test.ts :
// Famille réunit Inès (l'autrice), Max et Léa ; les gestes datent du temps où le projet était
// « Membres », puis il est réservé et Léa quitte la ruche.
import { FeedPage, FollowingFeedPage, Project } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string
let max: string
let lea: string
let leaId: string
let famille: string
let albumId: string

const START = new Date('2026-11-14T08:00:00.000Z')
const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

const read = async (path: string, cookie: string) => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, path).toBe(200)
  return res.json()
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  const member = (name: string) =>
    ctx.verifiedMember({
      name,
      email: `${name.toLowerCase()}@example.com`,
      password: `${name.toLowerCase()}-long-password`,
    })
  ines = await member('Ines')
  max = await member('Max')
  lea = await member('Lea')
  const inesId = (await act.me(ines)).id
  const maxId = (await act.me(max)).id
  leaId = (await act.me(lea)).id
  famille = await hives.createHive('Famille', inesId, [maxId, leaId])
  later()
  const album = await act.publish(ines, 'Album de famille')
  albumId = album.id
  later()
  await act.react(albumId, 'bravo', max)
  await act.react(albumId, 'bravo', lea)
  await act.send('POST', `/v1/projects/${albumId}/follow`, max)
  await act.send('POST', `/v1/projects/${albumId}/follow`, lea)
  later()
  await hives.reserve(albumId, famille)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

describe('the counts of a hive-reserved project once a member left', () => {
  it('counts the reactions and followers of its members only', async () => {
    await hives.removeMember(famille, leaId)
    for (const cookie of [ines, max]) {
      const project = Project.parse(await read(`/v1/projects/${albumId}`, cookie))
      expect(project.reactions.counts.bravo).toBe(1)
      expect(project.followerCount).toBe(1)
    }
    const discover = FeedPage.parse(await read('/v1/feed/discover', max))
    expect(discover.items.find((item) => item.project.id === albumId)?.project.reactionTotal).toBe(
      1,
    )
  })

  it('keeps the rows of the former member, so that they count again if they come back', async () => {
    await hives.removeMember(famille, leaId)
    expect(await ctx.db.select().from(schema.projectReaction)).toHaveLength(2)
    expect(await ctx.db.select().from(schema.projectFollow)).toHaveLength(2)
    await ctx.db
      .insert(schema.hiveMember)
      .values({ hiveId: famille, userId: leaId, joinedAt: new Date() })
    const project = Project.parse(await read(`/v1/projects/${albumId}`, ines))
    expect(project.reactions.counts.bravo).toBe(2)
    expect(project.followerCount).toBe(2)
  })

  it('does not count the follow of a project the former member can no longer see', async () => {
    // Léa ne suit que cet album : sans lui, elle ne suit plus personne.
    expect(FollowingFeedPage.parse(await read('/v1/feed/following', lea)).followsAnyone).toBe(true)
    await hives.removeMember(famille, leaId)
    expect(FollowingFeedPage.parse(await read('/v1/feed/following', lea)).followsAnyone).toBe(false)
  })
})
