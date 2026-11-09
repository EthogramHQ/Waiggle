// Tests d'intégration du catalogue des outils et des catégories (tranche R6b) :
// - GET /v1/tools rend tout le catalogue (même les outils sans projet), chacun avec sa famille, ses
//   alias et son nombre de projets que le membre peut voir, puis « Pas encore dans le catalogue » :
//   les « Autre » cités par au moins un projet visible des membres (50 au plus) ;
// - GET /v1/categories rend les catégories dans l'ordre de la feuille de publication, nommées dans
//   la langue du visiteur, chacune avec son nombre de projets visibles.
// Scénario : docs/scenarios/refonte.md, « R6b », « Le catalogue », « Tous les outils » et « Les
// catégories en filtre ». Règles du plan : décision 1 de la session (visibilité, sec-A1, jur-T2),
// décision 8 (un « Autre » écarté n'est plus listé), décision 12 (sec-B5 : 50 « Autre » au plus,
// limite après la visibilité ; quota `toolsHour` partagé).
//
// Le catalogue semé par la migration est effacé au début de chaque test (sauf le premier groupe) :
// chaque test ajoute ses propres outils (testing/tool-catalogue.ts) et sait ce que la liste rend.
//
// Quatre membres : Inès et Zoé (autrices), Malik (qui lit), Louis (administrateur, pour retirer).
import { randomUUID } from 'node:crypto'
import {
  CategoryList,
  ErrorResponse,
  foldTool,
  Member,
  OTHER_TOOLS_SHOWN,
  PROJECT_CATEGORIES,
  Project,
  ToolList,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { resources } from '@ruche/i18n'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { addCatalogueTool, clearCatalogue, linkProjectTool } from './testing/tool-catalogue'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let zoe: string
let louis: string
let inesId: string
let malikId: string

const SECOND = 1000
const HOUR = 60 * 60 * SECOND

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
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Le nombre d'outils de ce nom replié, en base. */
const toolsFoldedCount = async (folded: string) => {
  const result = (await ctx.db.execute(
    sql`select count(*)::int as n from tool where folded = ${folded}`,
  )) as unknown as { rows: { n: unknown }[] }
  return Number(result.rows[0]?.n)
}

/** Publie un projet avec ses outils, une seconde après ce qui précède. */
const publish = (cookie: string, title: string, tools: string[], body: object = {}) => {
  later()
  return act.publish(cookie, title, { tools, ...body })
}

/** Retire un projet : Malik le signale, Louis décide (un retrait répond à un signalement ouvert). */
const remove = async (projectId: string) => {
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

/**
 * Un projet public d'un compte jamais vérifié, posé en base (aucune route ne le permet), rattaché
 * à ces outils.
 */
const ghostProject = async (
  toolIds: string[],
  body: Partial<typeof schema.project.$inferInsert>,
) => {
  await ctx.db.insert(schema.user).values({
    id: 'unverified',
    name: 'Fantôme',
    email: 'fantome@example.com',
    emailVerified: false,
  })
  const at = new Date()
  const id = randomUUID()
  await ctx.db.insert(schema.project).values({
    id,
    authorId: 'unverified',
    title: 'Fantôme',
    pitch: 'Un projet sans auteur vérifié.',
    createdAt: at,
    updatedAt: at,
    publishedAt: at,
    ...body,
  })
  for (const [position, toolId] of toolIds.entries()) {
    await linkProjectTool(ctx.db, id, toolId, position)
  }
}

const toolsRaw = (cookie: string | null) => act.send('GET', '/v1/tools', cookie)

/** La liste, telle que ce membre la lit (la demande doit réussir), vérifiée par le contrat. */
const toolList = async (cookie: string) => {
  const res = await toolsRaw(cookie)
  expect(res.status).toBe(200)
  return ToolList.parse(await res.json())
}

/** Les outils du catalogue, réduits à ce que la plupart des tests comparent. */
const counts = async (cookie: string) =>
  (await toolList(cookie)).tools.map(({ slug, projectCount }) => ({ slug, projectCount }))

const others = async (cookie: string) => (await toolList(cookie)).others.map((tool) => tool.name)

const categoriesRaw = (cookie: string | null, language?: string) =>
  ctx.request('/v1/categories', {
    headers: { ...(cookie && { cookie }), ...(language && { 'accept-language': language }) },
  })

const categories = async (cookie: string, language?: string) => {
  const res = await categoriesRaw(cookie, language)
  expect(res.status).toBe(200)
  return CategoryList.parse(await res.json()).categories
}

/** Le nombre de projets de chaque catégorie qui en a, pour ce membre. */
const categoryCounts = async (cookie: string) =>
  Object.fromEntries(
    (await categories(cookie))
      .filter((category) => category.projectCount > 0)
      .map((category) => [category.code, category.projectCount]),
  )

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

describe('the seeded catalogue', () => {
  it('lists every tool seeded by the migration, each without any project yet', async () => {
    const result = (await ctx.db.execute(
      sql`select count(*)::int as n from tool where status = 'catalogue'`,
    )) as unknown as { rows: { n: number }[] }
    const seeded = result.rows[0]?.n ?? 0
    // Le scénario : « environ 120 outils connus » au lancement.
    expect(seeded).toBeGreaterThanOrEqual(100)

    const list = await toolList(malik)
    expect(list.tools).toHaveLength(seeded)
    expect(list.tools.every((tool) => tool.projectCount === 0)).toBe(true)
    expect(list.others).toEqual([])
  })
})

describe('the list of tools', () => {
  let claude: string // ids des outils du catalogue du test
  let lovable: string

  beforeEach(async () => {
    await clearCatalogue(ctx.db)
    claude = (
      await addCatalogueTool(ctx.db, {
        name: 'Claude',
        family: 'assistant',
        aliases: ['Claude AI'],
      })
    ).id
    lovable = (await addCatalogueTool(ctx.db, { name: 'Lovable', family: 'no-code' })).id
    await addCatalogueTool(ctx.db, { name: 'Home Assistant', family: 'smart-home' })
    await addCatalogueTool(ctx.db, { name: 'Raspberry Pi', family: 'hardware' })
  })

  it('is only for signed-in members', async () => {
    await expectError(await toolsRaw(null), 401, 'unauthorized')
    // Témoin : la même demande, avec une session, réussit (la route existe bien).
    expect(await counts(malik)).toHaveLength(4)
  })

  it('lists the whole catalogue, tools without projects included, most used first, then by name', async () => {
    await publish(ines, 'Un', ['Claude', 'Lovable'])
    await publish(zoe, 'Deux', ['claude'])

    const list = await toolList(malik)
    expect(list.tools.map(({ aliases: _, ...tool }) => tool)).toEqual([
      { slug: 'claude', name: 'Claude', family: 'assistant', projectCount: 2 },
      { slug: 'lovable', name: 'Lovable', family: 'no-code', projectCount: 1 },
      { slug: 'home-assistant', name: 'Home Assistant', family: 'smart-home', projectCount: 0 },
      { slug: 'raspberry-pi', name: 'Raspberry Pi', family: 'hardware', projectCount: 0 },
    ])
  })

  it('gives the aliases of a tool, so that the app finds it under another name', async () => {
    const list = await toolList(malik)
    // L'API rend l'alias tel qu'écrit ou replié : l'appli le replie de toute façon pour comparer.
    expect(list.tools.find((tool) => tool.slug === 'claude')?.aliases.map(foldTool)).toEqual([
      foldTool('Claude AI'),
    ])
    expect(list.tools.find((tool) => tool.slug === 'lovable')?.aliases).toEqual([])
  })

  it('counts a project published with an alias for the catalogue tool', async () => {
    await publish(ines, 'Un', ['claude ai'])

    expect((await counts(malik)).find((tool) => tool.slug === 'claude')?.projectCount).toBe(1)
    expect(await others(malik)).toEqual([])
  })

  it('counts only the projects the member can see: no private one, even his own, no removed one', async () => {
    await publish(ines, 'Un', ['Claude'])
    await publish(ines, 'Brouillon d’Inès', ['Claude', 'Lovable'], { visibility: 'private' })
    await publish(malik, 'Mon brouillon', ['Lovable'], { visibility: 'private' })
    const removed = await publish(zoe, 'Retiré', ['Claude', 'Lovable'])
    // Témoin : avant le retrait, le projet de Zoé compte.
    expect((await counts(malik)).slice(0, 2)).toEqual([
      { slug: 'claude', projectCount: 2 },
      { slug: 'lovable', projectCount: 1 },
    ])

    await remove(removed.id)

    expect((await counts(malik)).slice(0, 2)).toEqual([
      { slug: 'claude', projectCount: 1 },
      { slug: 'home-assistant', projectCount: 0 },
    ])
  })

  it('leaves out the projects of an author who never verified his account', async () => {
    await publish(ines, 'Un', ['Claude'])
    await ghostProject([claude, lovable], {})

    expect((await counts(malik)).slice(0, 2)).toEqual([
      { slug: 'claude', projectCount: 1 },
      { slug: 'home-assistant', projectCount: 0 },
    ])
  })

  it('answers 600 readings an hour per member, then asks to wait', async () => {
    await ctx.db
      .insert(schema.apiRateLimit)
      .values({ key: memberCounterKeys(malikId).toolsHour, count: 599, windowStart: Date.now() })

    expect(await counts(malik)).toHaveLength(4)
    const blocked = await toolsRaw(malik)
    await expectError(blocked, 429, 'rate_limited')
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    // Chaque membre a son compteur : Zoé lit encore ; une heure plus tard, Malik aussi.
    expect(await counts(zoe)).toHaveLength(4)
    later(HOUR)
    expect(await counts(malik)).toHaveLength(4)
  })

  it('lists at most 500 tools', async () => {
    // 501 outils au catalogue, écrits d'un coup (generate_series : une ligne par nombre).
    await ctx.db.execute(sql`
      insert into tool (id, slug, name, folded, status, family, created_at, admitted_at)
      select gen_random_uuid(), 'outil-' || i, 'Outil ' || i, 'outil' || i, 'catalogue', 'assistant',
             now(), now()
      from generate_series(1, 501) as i`)

    expect((await toolList(malik)).tools).toHaveLength(500)
  })
})

describe('the « other » tools', () => {
  beforeEach(async () => {
    await clearCatalogue(ctx.db)
    await addCatalogueTool(ctx.db, { name: 'Claude', family: 'assistant' })
  })

  it('lists by name the « other » tools of the projects members can see, once each', async () => {
    await publish(ines, 'Un', ['Teachable Machine', 'Claude'])
    await publish(zoe, 'Deux', ['teachable machine', 'Carnetix'])

    // Jamais un outil du catalogue ; deux écritures du même « Autre » n'en font qu'un.
    expect(await others(malik)).toEqual(['Carnetix', 'Teachable Machine'])
  })

  it('never lists an « other » cited only by private or removed projects', async () => {
    await publish(ines, 'Un', ['Teachable Machine'])
    await publish(ines, 'Brouillon', ['Carnetix'], { visibility: 'private' })
    await publish(malik, 'Mon brouillon', ['Mon outil secret'], { visibility: 'private' })
    const removed = await publish(zoe, 'Retiré', ['Bidouille'])
    // Témoin : avant le retrait, l'« Autre » du projet de Zoé est là.
    expect(await others(malik)).toEqual(['Bidouille', 'Teachable Machine'])

    await remove(removed.id)

    // Pas même son propre « Autre » privé : la liste est la même pour tous (jur-T2).
    expect(await others(malik)).toEqual(['Teachable Machine'])
  })

  it('never lists an « other » of an author who never verified his account', async () => {
    await publish(ines, 'Un', ['Teachable Machine'])
    await ctx.db.execute(sql`
      insert into tool (id, slug, name, folded, status, created_at)
      values (gen_random_uuid(), 'carnetix', 'Carnetix', 'carnetix', 'other', now())`)
    const carnetix = (await ctx.db.execute(
      sql`select id from tool where folded = 'carnetix'`,
    )) as unknown as { rows: { id: string }[] }
    await ghostProject([carnetix.rows[0]?.id ?? ''], {})

    expect(await others(malik)).toEqual(['Teachable Machine'])
  })

  it('keeps a dismissed other tool out of the public list', async () => {
    await publish(ines, 'Un', ['Teachable Machine', 'Carnetix'])
    // Un administrateur l'a laissé hors du catalogue (décision 8 : statut « dismissed »).
    await ctx.db.execute(
      sql`update tool set status = 'dismissed' where folded = ${foldTool('Carnetix')}`,
    )

    expect(await others(malik)).toEqual(['Teachable Machine'])
  })

  it('hides the « other » tools only cited by a blocked member, from that member only', async () => {
    // « others » suit le blocage, comme les fils (décision de la conversation 1 du 9/11 : la
    // décision 1, sans filtre de blocage, ne vaut que pour les pages d'administration). Un nom
    // cité seulement par un membre bloqué trahirait sa présence à qui l'a bloqué.
    await publish(ines, 'Un', ['Teachable Machine'])
    later()
    await act.block(inesId, malik)

    expect(await others(malik)).toEqual([])
    // Témoin : un autre membre le voit toujours.
    expect(await others(zoe)).toEqual(['Teachable Machine'])
  })

  it('gives an « other » the slug of the name this member typed, never the shared one', async () => {
    // Relecture de sécurité sec-B2 : Malik tape « Zorblax » dans un projet privé ; l'« Autre »
    // zorblax existe. Inès tape « Zorblax ✨ » : un autre nom replié, donc un autre « Autre », dont
    // l'adresse partagée est zorblax-2. Si l'API la rendait, le « -2 » dirait à Inès, et à qui lit
    // son projet ou son profil, qu'un autre membre a tapé « Zorblax » quelque part.
    const sparkle = `Zorblax ${String.fromCodePoint(0x2728)}`
    await publish(malik, 'Secret', ['Zorblax'], { visibility: 'private' })
    const project = await publish(ines, 'Mon robot', [sparkle])
    await act.updateProfile(ines, { favoriteTools: [sparkle] })
    // Témoin : en base, l'adresse partagée porte bien le suffixe.
    const shared = (await ctx.db.execute(
      sql`select slug from tool where folded = ${foldTool(sparkle)}`,
    )) as unknown as { rows: { slug: string }[] }
    expect(shared.rows[0]?.slug).toBe('zorblax-2')

    const expected = [{ label: sparkle, slug: 'zorblax', inCatalogue: false }]
    // Le projet, lu par un autre membre, et par son auteure à la publication.
    const read = Project.parse(
      await (await act.send('GET', `/v1/projects/${project.id}`, zoe)).json(),
    )
    expect(read.tools).toEqual(expected)
    expect(project.tools).toEqual(expected)
    // Le profil public d'Inès, lu par un autre membre.
    const page = Member.parse(await (await act.send('GET', `/v1/members/${inesId}`, zoe)).json())
    expect(page.favoriteTools).toEqual(expected)
    // Nulle part la réponse brute ne contient l'adresse partagée.
    const raw = await (await act.send('GET', `/v1/projects/${project.id}`, malik)).text()
    expect(raw).not.toContain('zorblax-2')
  })

  it('answers 400, translated and never 500, when every address of a new « other » is taken', async () => {
    // Relecture de sécurité sec-B4 : 51 « Autre » de noms repliés différents ont déjà les adresses
    // zorblax, zorblax-2… zorblax-51 (posés en base : par l'API, il faudrait deux jours de quota).
    // Un 52ᵉ nom de même adresse ne trouve plus de place : la demande est refusée, rien n'est gardé.
    await ctx.db.execute(sql`
      insert into tool (id, slug, name, folded, status, created_at)
      select gen_random_uuid(), case when n = 1 then 'zorblax' else 'zorblax-' || n end,
        'Zorblax ' || n, 'zorblaxtaken' || n, 'other', now()
      from generate_series(1, 51) as n`)
    const sun = `Zorblax ${String.fromCodePoint(0x2600)}`
    const send = (method: string, path: string, body: object) =>
      ctx.request(path, {
        method,
        headers: { cookie: ines, 'content-type': 'application/json', 'accept-language': 'en' },
        body: JSON.stringify(body),
      })

    const created = await send('POST', '/v1/projects', {
      title: 'Soleil',
      pitch: 'Un petit projet pour essayer.',
      primaryCategory: 'other',
      tools: [sun],
    })
    const project = await publish(ines, 'Mon robot', ['Claude'])
    const edited = await send('PATCH', `/v1/projects/${project.id}`, { tools: [sun] })
    const profile = await send('PATCH', '/v1/me', { favoriteTools: [sun] })

    for (const res of [created, edited, profile]) {
      expect(res.status).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error).toEqual({
        code: 'validation',
        message: resources.en.translation.errors.validation,
      })
    }
    // Rien n'est gardé : ni le projet refusé, ni le nouvel outil, ni l'« Autre ».
    const titles = (await ctx.db.execute(
      sql`select title from project where author_id = ${inesId}`,
    )) as unknown as { rows: { title: string }[] }
    expect(titles.rows.map((row) => row.title)).toEqual(['Mon robot'])
    expect(await toolsFoldedCount(foldTool(sun))).toBe(0)
  })

  it('shows 50 of 51 visible « other » tools, and a private one never takes a place', async () => {
    // 51 « Autre » visibles : Inès en crée 30 (son plafond du jour), Zoé 21. Malik en cite trois
    // dans un projet privé, avec des noms qui passent avant tous les autres dans l'ordre du nom :
    // si la limite venait avant la visibilité, ils prendraient trois des 50 places (sec-B5).
    const visible = Array.from({ length: 51 }, (_, i) => `Outil ${String(i + 1).padStart(2, '0')}`)
    await publish(ines, 'Un', visible.slice(0, 15))
    await publish(ines, 'Deux', visible.slice(15, 30))
    await publish(zoe, 'Trois', visible.slice(30, 45))
    await publish(zoe, 'Quatre', visible.slice(45))
    await publish(malik, 'Secret', ['0 Privé A', '0 Privé B', '0 Privé C'], {
      visibility: 'private',
    })

    const names = await others(malik)
    expect(names).toHaveLength(OTHER_TOOLS_SHOWN)
    expect(names.every((name) => visible.includes(name))).toBe(true)
  })
})

describe('a block', () => {
  /** Les deux sens du blocage, avec qui bloque qui. */
  const DIRECTIONS = [
    ['Inès blocked Malik', () => act.block(malikId, ines)],
    ['Malik blocked Inès', () => act.block(inesId, malik)],
  ] as const

  beforeEach(async () => {
    await clearCatalogue(ctx.db)
    await addCatalogueTool(ctx.db, { name: 'Claude', family: 'assistant' })
    await addCatalogueTool(ctx.db, { name: 'Mistral', family: 'assistant' })
    await addCatalogueTool(ctx.db, { name: 'Ollama', family: 'development' })
  })

  describe.each(DIRECTIONS)('when %s', (_, blockNow) => {
    it('leaves the projects of a blocked member out of the counts, in both directions', async () => {
      await publish(ines, 'Un', ['Mistral', 'Claude'], { primaryCategory: 'cooking' })
      await publish(zoe, 'Deux', ['Claude'], { primaryCategory: 'cooking' })
      await publish(malik, 'Trois', ['Ollama'], { primaryCategory: 'animals' })
      // Témoin : avant le blocage, chacun compte les projets de l'autre.
      expect(await counts(malik)).toEqual([
        { slug: 'claude', projectCount: 2 },
        { slug: 'mistral', projectCount: 1 },
        { slug: 'ollama', projectCount: 1 },
      ])
      expect(await categoryCounts(ines)).toEqual({ cooking: 2, animals: 1 })

      later()
      await blockNow()

      // Pour Malik : Mistral ne compte plus rien, Claude ne compte que le projet de Zoé. Le
      // catalogue, lui, reste entier.
      expect(await counts(malik)).toEqual([
        { slug: 'claude', projectCount: 1 },
        { slug: 'ollama', projectCount: 1 },
        { slug: 'mistral', projectCount: 0 },
      ])
      expect(await categoryCounts(malik)).toEqual({ cooking: 1, animals: 1 })
      // Pour Inès : Ollama ne compte plus.
      expect((await counts(ines)).find((tool) => tool.slug === 'ollama')?.projectCount).toBe(0)
      expect(await categoryCounts(ines)).toEqual({ cooking: 2 })
      // Zoé ne voit aucune différence.
      expect(await categoryCounts(zoe)).toEqual({ cooking: 2, animals: 1 })
    })
  })
})

describe('the categories', () => {
  it('is only for signed-in members', async () => {
    await expectError(await categoriesRaw(null), 401, 'unauthorized')
    // Témoin : avec une session, la liste est là.
    expect(await categories(malik)).toHaveLength(16)
  })

  it('lists the sixteen categories in the order of the publishing sheet, « other » last', async () => {
    const list = await categories(malik)

    expect(list.map((category) => category.code)).toEqual([...PROJECT_CATEGORIES])
    expect(list.find((category) => category.code === 'cooking')?.icon).toBe('cooking-pot')
    expect(list.find((category) => category.code === 'animals')?.icon).toBe('paw-print')
    expect(list.at(-1)).toEqual({ code: 'other', name: 'Autre', icon: 'shapes', projectCount: 0 })
  })

  it('names the categories in the language of the visitor, French by default', async () => {
    const nameOf = async (language?: string) =>
      (await categories(malik, language)).find((category) => category.code === 'home-garden')?.name

    expect(await nameOf()).toBe('Maison et jardin')
    expect(await nameOf('fr-FR,fr;q=0.9')).toBe('Maison et jardin')
    expect(await nameOf('en-US,en;q=0.9')).toBe('Home and garden')
    // Une langue que l'appli ne parle pas : le français, la langue de référence.
    expect(await nameOf('de-DE')).toBe('Maison et jardin')
  })

  it('counts the projects the member can see, in first or second category', async () => {
    await publish(ines, 'Un', [], { primaryCategory: 'cooking' })
    await publish(zoe, 'Deux', [], { primaryCategory: 'animals', secondaryCategory: 'cooking' })
    await publish(ines, 'Brouillon', [], { primaryCategory: 'cooking', visibility: 'private' })
    await publish(malik, 'Mon brouillon', [], { primaryCategory: 'music', visibility: 'private' })
    const removed = await publish(zoe, 'Retiré', [], { primaryCategory: 'cooking' })
    await ghostProject([], { primaryCategory: 'cooking' })
    // Ni les brouillons (même celui de Malik), ni le projet d'un compte jamais vérifié. Témoin :
    // avant le retrait, le projet de Zoé compte.
    expect(await categoryCounts(malik)).toEqual({ cooking: 3, animals: 1 })

    await remove(removed.id)

    expect(await categoryCounts(malik)).toEqual({ cooking: 2, animals: 1 })
  })

  it('shares the hourly quota of the list of tools', async () => {
    await ctx.db
      .insert(schema.apiRateLimit)
      .values({ key: memberCounterKeys(malikId).toolsHour, count: 599, windowStart: Date.now() })

    expect(await categories(malik)).toHaveLength(16)
    await expectError(await toolsRaw(malik), 429, 'rate_limited')
    await expectError(await categoriesRaw(malik), 429, 'rate_limited')
  })
})
