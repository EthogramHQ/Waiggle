// Tests d'intégration de R12 : la visibilité `web` (« Public ») vue des membres, et ce que l'auteur
// peut en faire. Pour un membre connecté, un projet public se lit exactement comme un projet
// « Membres » (`public`) : sa page, le Fil, Explorer, la recherche, les pages d'outils et la page de
// son auteur (plan R12, choix 1). Rendre un projet public : permis à tout auteur, sauf à un membre
// suspendu (Q6) et pour un projet retiré par la modération ; en sortir le retire de la vitrine, dans
// la même transaction (choix 10).
//
// Scénario : docs/scenarios/refonte.md, « R12 », « Rendre un projet public ». Trois membres : Inès
// (l'autrice), Max (un membre qui la suit), Louis (l'administrateur).
import { ErrorResponse, Project, PublicProject } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let max: string
let louis: string
let inesId: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const patch = (cookie: string, id: string, body: object) => {
  later()
  return act.send('PATCH', `/v1/projects/${id}`, cookie, body)
}

const showcaseRows = (projectId: string) =>
  ctx.db
    .select({ projectId: schema.showcase.projectId })
    .from(schema.showcase)
    .where(eq(schema.showcase.projectId, projectId))

describe('a public project, for members', () => {
  it('shows a member a public project on its page, like a project for members', async () => {
    later()
    const id = await ctx.webProject(ines, {
      status: 'testable',
      demoUrl: 'https://meteo.example.org/',
    })

    const res = await act.send('GET', `/v1/projects/${id}`, max)
    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).visibility).toBe('web')
    // Max réagit, commente, suit le projet et rejoint ses testeurs, comme sur un projet « Membres ».
    later()
    await act.react(id, 'bravo', max)
    later()
    await act.comment(id, max, 'Bravo pour la carte !')
    later()
    expect((await act.send('POST', `/v1/projects/${id}/follow`, max)).status).toBe(204)
    later()
    expect((await act.send('POST', `/v1/projects/${id}/testers`, max)).status).toBe(204)
  })

  it('lists a public project wherever a project for members is listed: feed, Explorer, search, tool pages and the page of its author', async () => {
    later()
    await act.followMember(inesId, max)
    later()
    const web = await ctx.webProject(ines, {
      title: 'Zygomatique public',
      primaryCategory: 'family',
      tools: ['Claude'],
      status: 'testable',
      demoUrl: 'https://zygo.example.org/',
    })
    // Témoin : un projet privé du même membre, aux mêmes mots, n'est dans aucune liste.
    later()
    const secret = await act.publish(ines, 'Zygomatique secret', {
      visibility: 'private',
      primaryCategory: 'family',
      tools: ['Claude'],
    })

    const lists = [
      '/v1/feed/following',
      '/v1/feed/discover',
      '/v1/feed/discover?category=family',
      '/v1/feed/discover?testers=true',
      '/v1/search?q=zygomatique',
      '/v1/tags/claude',
      `/v1/members/${encodeURIComponent(inesId)}`,
    ]
    const wrong: string[] = []
    for (const path of lists) {
      const res = await act.send('GET', path, max)
      const text = await res.text()
      if (res.status !== 200 || !text.includes(web)) wrong.push(`${path}: ${res.status}, missing`)
      if (text.includes(secret.id)) wrong.push(`${path}: shows the private project`)
    }
    expect(wrong.join('\n')).toBe('')

    // Les nombres d'Explorer : la catégorie et l'outil comptent le projet public.
    const categories = (await (await act.send('GET', '/v1/categories', max)).json()) as {
      categories: { code: string; projectCount: number }[]
    }
    expect(categories.categories.find((one) => one.code === 'family')?.projectCount).toBe(1)
    const tools = (await (await act.send('GET', '/v1/tools', max)).json()) as {
      tools: { slug: string; projectCount: number }[]
    }
    expect(tools.tools.find((one) => one.slug === 'claude')?.projectCount).toBe(1)
  })
})

describe('making a project public, and back', () => {
  it('lets the author make a project public, with a first publication date a visitor can read', async () => {
    later()
    const draft = await act.publish(ines, 'Brouillon', { visibility: 'private' })

    const res = await patch(ines, draft.id, { visibility: 'web' })
    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).visibility).toBe('web')
    const seen = await ctx.visitor(`/v1/public/projects/${draft.id}`)
    expect(seen.status).toBe(200)
    expect(PublicProject.parse(await seen.json()).publishedAt).toBe(new Date().toISOString())

    // Et retour : « Membres », puis « Privé ».
    expect((await patch(ines, draft.id, { visibility: 'public' })).status).toBe(200)
    expect((await ctx.visitor(`/v1/public/projects/${draft.id}`)).status).toBe(404)
  })

  it('refuses a suspended author making a project public, and lets her make it private', async () => {
    later()
    const forMembers = await act.publish(ines, 'Pour les membres')
    later()
    const secret = await act.publish(ines, 'Secret', { visibility: 'private' })
    later()
    const web = await ctx.webProject(ines)
    // Témoin : avant la suspension, Inès rend un projet public.
    later()
    const other = await act.publish(ines, 'Avant la suspension')
    expect((await patch(ines, other.id, { visibility: 'web' })).status).toBe(200)
    // Témoin : le projet public se lit sans compte (la fin du test vérifie qu'il ne l'est plus).
    expect((await ctx.visitor(`/v1/public/projects/${web}`)).status).toBe(200)

    await world.suspend(louis, inesId)

    for (const id of [forMembers.id, secret.id]) {
      const res = await patch(ines, id, { visibility: 'web' })
      expect(res.status, id).toBe(403)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('suspended')
    }
    expect((await patch(ines, web, { visibility: 'private' })).status).toBe(200)
    expect((await ctx.visitor(`/v1/public/projects/${web}`)).status).toBe(404)
  })

  it('refuses to make public a project removed by the moderation', async () => {
    later()
    const removed = await act.publish(ines, 'Retiré')
    await world.remove(max, louis, { kind: 'project', id: removed.id })
    // Témoin : un projet non retiré devient public.
    later()
    const kept = await act.publish(ines, 'Gardé')
    expect((await patch(ines, kept.id, { visibility: 'web' })).status).toBe(200)
    expect((await ctx.visitor(`/v1/public/projects/${kept.id}`)).status).toBe(200)

    const res = await patch(ines, removed.id, { visibility: 'web' })
    expect(res.status).toBe(409)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('removed')
    expect((await ctx.visitor(`/v1/public/projects/${removed.id}`)).status).toBe(404)
  })

  it('takes a project out of the showcase when it stops being public, and does not bring it back', async () => {
    later()
    const first = await ctx.webProject(ines, { title: 'Carte des vents' })
    later()
    const second = await ctx.webProject(ines, { title: 'Herbier sonore' })
    await world.setShowcase(louis, [first, second])
    // Témoin : les deux sont en vitrine.
    expect((await showcaseRows(first)).length).toBe(1)
    expect((await showcaseRows(second)).length).toBe(1)

    expect((await patch(ines, first, { visibility: 'public' })).status).toBe(200)
    expect((await patch(ines, second, { visibility: 'private' })).status).toBe(200)
    expect(await showcaseRows(first)).toEqual([])
    expect(await showcaseRows(second)).toEqual([])
    const showcase = await ctx.visitor('/v1/public/showcase')
    expect(showcase.status).toBe(200)
    expect(await showcase.text()).not.toContain(first)

    // Redevenu public, il ne revient pas seul : la vitrine est choisie par la modération.
    expect((await patch(ines, first, { visibility: 'web' })).status).toBe(200)
    expect(await showcaseRows(first)).toEqual([])
  })
})
