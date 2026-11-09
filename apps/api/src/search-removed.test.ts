// Tests d'intégration (tranche R3) : un projet retiré par la modération ne sort ni de la recherche
// (GET /v1/search), même pour son auteur, ni de la liste des outils (GET /v1/tools). Le retrait suit
// ici un signalement, comme en vrai : une décision sans signalement ouvert est refusée (409), ce que
// les tests « removed » de search.test.ts et tools.test.ts ne font pas (voir le rapport de R3, BE).
//
// R6b : les outils sont ceux du catalogue. Un outil du catalogue reste trouvé et listé après le
// retrait, mais le projet retiré ne compte plus dans son nombre ; le filtre de catégorie de la
// recherche ne le rend pas non plus. Le test pose son propre catalogue (Lovable seul).
import { SearchResults, ToolList } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { addCatalogueTool, clearCatalogue } from './testing/tool-catalogue'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let louis: string

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
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  await act.makeAdmin((await act.me(louis)).id)
  await clearCatalogue(ctx.db)
  await addCatalogueTool(ctx.db, { name: 'Lovable', family: 'no-code' })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = () => vi.setSystemTime(Date.now() + 1000)

/** Malik signale le projet, puis Louis le retire. */
const reportAndRemove = async (projectId: string) => {
  later()
  await act.report(malik, { kind: 'project', id: projectId })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'project', id: projectId },
    ground: 'rules',
    explanation: 'Ce projet ne respecte pas les règles.',
  })
}

/** `category` (R6b) : le filtre de catégorie du groupe Projets. */
const search = async (cookie: string, q: string, category?: string) => {
  const params = new URLSearchParams({ q, ...(category !== undefined && { category }) })
  const res = await act.send('GET', `/v1/search?${params}`, cookie)
  expect(res.status).toBe(200)
  return SearchResults.parse(await res.json())
}

const tools = async (cookie: string) => {
  const res = await act.send('GET', '/v1/tools', cookie)
  expect(res.status).toBe(200)
  return ToolList.parse(await res.json()).tools
}

/** Les outils, par slug et nombre de projets (les alias et la famille ne sont pas la règle ici). */
const counts = (list: { slug: string; projectCount: number }[]) =>
  list.map(({ slug, projectCount }) => ({ slug, projectCount }))

describe('a project removed after a report', () => {
  it('leaves the search, even for its author and in its category, and the tool counts', async () => {
    later()
    const carnet = await act.publish(ines, 'Carnet de cafés', {
      tools: ['Lovable'],
      primaryCategory: 'cooking',
    })
    // Témoin : avant le retrait, le projet est trouvé, avec et sans filtre, et son outil le compte.
    expect((await search(malik, 'carnet')).projects.items.map((p) => p.id)).toEqual([carnet.id])
    expect((await search(malik, 'carnet', 'cooking')).projects.items.map((p) => p.id)).toEqual([
      carnet.id,
    ])
    expect(counts((await search(malik, 'lovable')).tools.items)).toEqual([
      { slug: 'lovable', projectCount: 1 },
    ])
    expect(counts(await tools(malik))).toEqual([{ slug: 'lovable', projectCount: 1 }])

    await reportAndRemove(carnet.id)

    for (const cookie of [malik, ines]) {
      expect((await search(cookie, 'carnet')).projects.items).toEqual([])
      expect((await search(cookie, 'carnet', 'cooking')).projects.items).toEqual([])
    }
    // L'outil reste au catalogue, sans le projet retiré.
    expect(counts((await search(malik, 'lovable')).tools.items)).toEqual([
      { slug: 'lovable', projectCount: 0 },
    ])
    expect(counts(await tools(malik))).toEqual([{ slug: 'lovable', projectCount: 0 }])
  })
})
