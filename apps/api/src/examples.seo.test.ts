// Tests d'intégration de R12b, « Les exemples » : ce que les moteurs de recherche lisent d'un compte
// d'exemples. Scénario : docs/scenarios/refonte.md, « R12b — Les exemples », « Ce qui ne les montre
// pas » : la tête d'un projet ou de la page d'un compte d'exemples dit `noindex` (GET
// /v1/public/head), et le plan du site ne les contient pas (GET /v1/public/sitemap). Un projet et une
// page ordinaires gardent `index, follow` et leur place dans le plan du site.
//
// Le marquage d'un compte se pose en base, comme `infra/mark-example.sh` (voir examples.test.ts) ;
// en SQL brut, la table `example_account` n'étant pas encore dans le schéma Drizzle.
//
// Trois membres : Léa (une autrice ordinaire, le témoin), le compte d'exemples, tous deux avec une
// page publique et un projet « Public ».
import { appName } from '@ruche/brand'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, TEST_APP_URL, type TestContext } from './testing/context'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let world: ReturnType<typeof visitorGestures>
let lea: string // cookies de session
let bot: string
let leaId: string
let botId: string

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API (la limite de lecture lit Date.now).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  const act = activity(ctx)
  world = visitorGestures(ctx, act)
  lea = await ctx.verifiedMember({
    name: 'Léa Fournier',
    email: 'lea@example.com',
    password: 'lea-long-password',
  })
  bot = await ctx.verifiedMember({
    name: `${appName}Bot`,
    email: 'bot@example.com',
    password: 'bot-long-password',
  })
  leaId = (await act.me(lea)).id
  botId = (await act.me(bot)).id
  await markExample(botId)
  await ctx.openPublicPage(lea)
  await ctx.openPublicPage(bot)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/**
 * Fait de ce compte un compte d'exemples, comme `infra/mark-example.sh` : une ligne dans
 * `example_account`. La date entre en texte ISO, lue en UTC, pour ne pas dépendre du fuseau.
 */
const markExample = (userId: string) =>
  ctx.db.execute(
    sql`insert into example_account (user_id, marked_at)
        values (${userId}, ${new Date().toISOString()}::timestamptz at time zone 'UTC')`,
  )

/** Un projet « Public » de chacun, une seconde après ce qui précède. */
const bothPublishOnTheWeb = async () => {
  later()
  const fake = await ctx.webProject(bot, { title: 'Le carnet de randonnée' })
  later()
  const real = await ctx.webProject(lea)
  return { fake, real }
}

/** La consigne aux moteurs (`<meta name="robots">`) de la tête d'un chemin, lue par un visiteur. */
const robotsOf = async (path: string, lang: 'fr' | 'en') => {
  const answer = await world.asVisitor(`/v1/public/head?${new URLSearchParams({ path, lang })}`)
  expect(answer.status, `head of ${path}: ${answer.body.slice(0, 160)}`).toBe(200)
  const robots = [...answer.body.matchAll(/<meta\b([^>]*)>/gi)]
    .map((match) => match[1] ?? '')
    .filter((attrs) => /\bname="robots"/i.test(attrs))
    .map((attrs) => attrs.match(/\bcontent="([^"]*)"/i)?.[1])
  // Une seule consigne : deux balises contradictoires laisseraient le moteur choisir.
  expect(robots, `robots of ${path}`).toHaveLength(1)
  return robots[0]
}

/** Les adresses (`<loc>`) du plan du site, lu par un visiteur. */
const sitemapLocs = async () => {
  const answer = await world.asVisitor('/v1/public/sitemap')
  expect(answer.status, `sitemap: ${answer.body.slice(0, 160)}`).toBe(200)
  return [...answer.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => (match[1] ?? '').trim())
}

/** Les deux adresses d'une page publique, en français et en anglais. */
const both = (path: string) => [`${TEST_APP_URL}/fr${path}`, `${TEST_APP_URL}/en${path}`]

describe('the head of an example account (R12b)', () => {
  it('tells search engines not to index an example project, and lets them index an ordinary one', async () => {
    const { fake, real } = await bothPublishOnTheWeb()

    for (const lang of ['fr', 'en'] as const) {
      // Témoin d'abord : le projet de Léa garde sa consigne d'avant la tranche.
      expect(await robotsOf(`/${lang}/projects/${real}`, lang), `${lang}, ordinary`).toBe(
        'index, follow',
      )
      expect(await robotsOf(`/${lang}/projects/${fake}`, lang), `${lang}, example`).toMatch(
        /\bnoindex\b/,
      )
    }
  })

  it('tells search engines not to index the public page of an example account, and lets them index another', async () => {
    await bothPublishOnTheWeb()

    for (const lang of ['fr', 'en'] as const) {
      expect(await robotsOf(`/${lang}/members/${leaId}`, lang), `${lang}, ordinary`).toBe(
        'index, follow',
      )
      expect(await robotsOf(`/${lang}/members/${botId}`, lang), `${lang}, example`).toMatch(
        /\bnoindex\b/,
      )
    }
  })
})

describe('the sitemap and an example account (R12b)', () => {
  it('lists neither the projects nor the page of an example account, and still lists the others', async () => {
    const { fake, real } = await bothPublishOnTheWeb()

    const locs = await sitemapLocs()

    // Témoin : le projet et la page de Léa y sont, dans les deux langues.
    for (const loc of [...both(`/projects/${real}`), ...both(`/members/${leaId}`)]) {
      expect(locs, loc).toContain(loc)
    }
    for (const loc of [...both(`/projects/${fake}`), ...both(`/members/${botId}`)]) {
      expect(locs, loc).not.toContain(loc)
    }
  })
})
