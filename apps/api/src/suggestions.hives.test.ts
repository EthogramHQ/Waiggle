// « Proches à suivre » et les ruches (R10) : les membres de ses ruches qu'on ne suit pas viennent en
// premier, puis ceux qui ont publié récemment ; jamais un membre qui a choisi « Ne pas me proposer
// aux autres » (`profile.hide_from_suggestions`), pas même aux membres de ses ruches. Un projet
// réservé à une ruche n'est jamais montré à qui n'en est pas membre. Scénario :
// docs/scenarios/refonte.md, R10, « Le Fil » (Proches à suivre) et « Ne pas me proposer aux
// autres » ; relecture juridique du plan. Les règles d'avant R10 sont dans suggestions.test.ts.
//
// Les ruches et le réglage sont écrits directement en base (testing/hive-rows.ts). Max lit ses
// suggestions ; Léa est dans sa ruche Famille, Nina et Zoé n'y sont pas.
import { MemberSuggestions } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let max: string // cookies de session
let lea: string
let nina: string
let zoe: string
let maxId: string
let leaId: string
let zoeId: string
let famille: string

const SECOND = 1000
const DAY = 24 * 3600 * SECOND
const START = new Date('2026-11-14T08:00:00.000Z')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
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
  nina = await ctx.verifiedMember({
    name: 'Nina',
    email: 'nina@example.com',
    password: 'nina-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  maxId = (await act.me(max)).id
  leaId = (await act.me(lea)).id
  zoeId = (await act.me(zoe)).id
  famille = await hives.createHive('Famille', leaId, [maxId])
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const suggestions = async (cookie: string) => {
  const res = await act.send('GET', '/v1/suggestions/members', cookie)
  expect(res.status).toBe(200)
  return MemberSuggestions.parse(await res.json()).members
}
const names = async (cookie: string) => (await suggestions(cookie)).map((m) => m.name)

describe('the suggestions and the hives', () => {
  it('puts the members of my hives first, then the members who published recently', async () => {
    // Léa a publié il y a cinq jours ; Zoé hier, Nina aujourd'hui (une session dure 7 jours).
    await act.publish(lea, 'Potager de Léa')
    later(4 * DAY)
    await act.publish(zoe, 'Météo de Zoé')
    later(DAY)
    await act.publish(nina, 'Recettes de Nina')
    later()

    expect(await names(max)).toEqual(['Léa', 'Nina', 'Zoé'])
    // Témoin : Nina, dans aucune ruche, reçoit l'ordre des dates seul.
    expect(await names(nina)).toEqual(['Zoé', 'Léa'])
  })

  it('never suggests a member who chose not to be suggested, members of their hives included', async () => {
    await act.publish(lea, 'Potager de Léa')
    later()
    await act.publish(zoe, 'Météo de Zoé')
    later()
    expect(await names(max)).toContain('Léa')

    await hives.hideFromSuggestions(leaId)
    await hives.hideFromSuggestions(zoeId)

    // Max est dans Famille avec Léa : elle n'y est pas pour autant.
    expect(await names(max)).toEqual([])
    expect(await names(nina)).toEqual([])
    // Témoin : Nina, qui n'a rien choisi, reste proposée.
    await act.publish(nina, 'Recettes de Nina')
    expect(await names(max)).toEqual(['Nina'])
  })

  it('shows a member of my hive with a project reserved to it, never to who is not in the hive', async () => {
    const album = await act.publish(lea, 'Album de famille')
    await hives.reserve(album.id, famille)
    later()

    const forMax = await suggestions(max)
    expect(forMax.map((m) => m.name)).toEqual(['Léa'])
    expect(forMax[0]?.latestProject.id).toBe(album.id)
    // Nina n'est pas dans Famille : Léa n'a rien qu'elle puisse voir, elle n'est pas proposée.
    expect(JSON.stringify(await suggestions(nina))).not.toContain(album.id)
  })

  it('leaves out a member of my hive whom I already follow', async () => {
    await act.publish(lea, 'Potager de Léa')
    later()
    await act.publish(nina, 'Recettes de Nina')
    later()
    await act.followMember(leaId, max)

    expect(await names(max)).toEqual(['Nina'])
  })
})
