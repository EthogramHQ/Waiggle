// Les nombres et un projet réservé à une ruche (R10) : ses membres lisent ses réactions, ses
// commentaires et ses abonnés comme sur tout projet qu'ils voient, et le retrouvent dans leur
// export ; les nombres du catalogue (outils, catégories, page d'un outil) le comptent pour eux
// seuls ; les pages d'administration du catalogue ne le montrent jamais, pas même à un
// administrateur membre de la ruche. Aucun nombre ne trahit un projet réservé à qui n'est pas de la
// ruche. Scénario : docs/scenarios/refonte.md, R10, « Un projet réservé à une ruche » ; plan, « Ce
// qui change au plan » point 1 (`listedProject()` sans lecteur : réactions, commentaires, suivis,
// export ; `listedVerifiedProject()` du catalogue de l'administration), BE-C3.
//
// Les ruches sont écrites directement en base (testing/hive-rows.ts). Famille : Inès (l'autrice),
// Max et Léa. Sami n'est dans aucune ruche. Louis, administrateur, est dans Famille.
import {
  AccountExport,
  CategoryList,
  FeedPage,
  PendingToolsPage,
  Project,
  ToolList,
  ToolPage,
  UncategorizedPage,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let max: string
let lea: string
let sami: string
let louis: string
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
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  sami = await ctx.verifiedMember({
    name: 'Sami',
    email: 'sami@example.com',
    password: 'sami-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  const leaId = (await act.me(lea)).id
  const louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
  famille = await hives.createHive('Famille', inesId, [maxId, leaId, louisId])
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const read = async (path: string, cookie: string) => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, path).toBe(200)
  return res.json()
}
const projectOf = async (id: string, cookie: string) =>
  Project.parse(await read(`/v1/projects/${id}`, cookie))

describe('the counts of a hive-reserved project', () => {
  it('keeps reaction and comment counts on a hive-reserved project for its members', async () => {
    // Les gestes datent du temps où le projet était « Membres » : les compteurs les gardent.
    const album = await act.publish(ines, 'Album de famille')
    later()
    await act.react(album.id, 'bravo', max)
    await act.react(album.id, 'bravo', lea)
    await act.comment(album.id, max, 'Superbe !')
    later()
    await act.comment(album.id, lea, 'Merci Inès')
    later()
    await hives.reserve(album.id, famille)

    for (const cookie of [ines, max]) {
      const project = await projectOf(album.id, cookie)
      expect(project.reactions.counts.bravo).toBe(2)
      expect(project.commentCount).toBe(2)
    }
    // La carte d'Explorer d'un membre porte le même total.
    const discover = FeedPage.parse(await read('/v1/feed/discover', max))
    expect(discover.items.find((item) => item.project.id === album.id)?.project.reactionTotal).toBe(
      2,
    )
  })

  it('counts the followers of a hive-reserved project for its members', async () => {
    const album = await act.publish(ines, 'Album de famille')
    later()
    await act.send('POST', `/v1/projects/${album.id}/follow`, max)
    await act.send('POST', `/v1/projects/${album.id}/follow`, lea)
    later()
    await hives.reserve(album.id, famille)

    expect((await projectOf(album.id, ines)).followerCount).toBe(2)
    const forMax = await projectOf(album.id, max)
    expect(forMax.followerCount).toBe(2)
    expect(forMax.isFollowed).toBe(true)
  })

  it('exports the follow of a hive-reserved project the member can see', async () => {
    const album = await act.publish(ines, 'Album de famille')
    later()
    expect((await act.send('POST', `/v1/projects/${album.id}/follow`, max)).status).toBe(204)
    later()
    await hives.reserve(album.id, famille)

    const followed = async () =>
      AccountExport.parse(await read('/v1/me/export', max)).follows.projects.map((p) => p.id)
    expect(await followed()).toEqual([album.id])

    // Une fois sorti de la ruche, Max ne le voit plus : comme un projet devenu privé, il quitte son
    // export.
    await hives.removeMember(famille, maxId)
    expect(await followed()).toEqual([])
  })
})

describe('the catalogue and a hive-reserved project', () => {
  it('counts it in the tools, the categories and the tool page of its members only', async () => {
    const album = await act.publish(ines, 'Album de famille', {
      tools: ['Mistral', 'Outil Secret'],
      primaryCategory: 'family',
    })
    later()
    await hives.reserve(album.id, famille)

    const mistral = async (cookie: string) =>
      ToolList.parse(await read('/v1/tools', cookie)).tools.find((t) => t.name === 'Mistral')
        ?.projectCount
    const others = async (cookie: string) =>
      ToolList.parse(await read('/v1/tools', cookie)).others.map((o) => o.name)
    const family = async (cookie: string) =>
      CategoryList.parse(await read('/v1/categories', cookie)).categories.find(
        (c) => c.code === 'family',
      )?.projectCount
    const toolPage = async (cookie: string) =>
      ToolPage.parse(await read('/v1/tags/le-chat', cookie)).tool.projectCount

    expect(await mistral(max)).toBe(1)
    expect(await others(max)).toContain('Outil Secret')
    expect(await family(max)).toBe(1)
    expect(await toolPage(max)).toBe(1)
    // Sami n'est pas dans Famille : rien ne compte le projet pour lui.
    expect(await mistral(sami)).toBe(0)
    expect(await others(sami)).not.toContain('Outil Secret')
    expect(await family(sami)).toBe(0)
    expect(await toolPage(sami)).toBe(0)
  })

  // Relecture de sécurité du plan (B5) : les pages « À vérifier » et « À ranger » lisent
  // `listedVerifiedProject()`, sans lecteur ; un projet réservé n'y entre jamais. Ce test passe
  // avant le code de R10 (la règle d'aujourd'hui ne garde que « Membres ») : il garde que l'élargir
  // aux ruches pour les membres n'ouvre pas ces pages.
  it('never lists a hive-reserved project in the admin catalogue pages, even to an admin who is a member', async () => {
    const album = await act.publish(ines, 'Album de famille', { tools: ['Outil Secret'] })
    later()
    await hives.reserve(album.id, famille)
    const potager = await act.publish(max, 'Potager de Max', { tools: ['Outil Visible'] })
    later()

    const pendingRes = await act.send('GET', '/v1/moderation/tools/pending', louis)
    const pendingRaw = await pendingRes.text()
    expect(pendingRes.status).toBe(200)
    expect(PendingToolsPage.parse(JSON.parse(pendingRaw)).items.map((i) => i.name)).toEqual([
      'Outil Visible',
    ])
    expect(pendingRaw).not.toContain('Album de famille')

    const uncategorizedRes = await act.send('GET', '/v1/moderation/categories/pending', louis)
    const uncategorizedRaw = await uncategorizedRes.text()
    expect(uncategorizedRes.status).toBe(200)
    expect(UncategorizedPage.parse(JSON.parse(uncategorizedRaw)).items.map((i) => i.id)).toEqual([
      potager.id,
    ])
    expect(uncategorizedRaw).not.toContain(album.id)
    // Témoin : Louis, membre de Famille, ouvre bien le projet comme membre.
    expect((await projectOf(album.id, louis)).hive).toEqual({ id: famille, name: 'Famille' })
  })
})
