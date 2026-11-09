// Tests d'intégration de la page d'un outil (tranche R6b) : GET /v1/tags/{slug}?status&category&cursor
// rend l'outil du catalogue (nom, famille, description dans la langue du visiteur, site, nombre de
// projets), les catégories de ses projets avec leur nombre, et ses projets du plus récent au plus
// ancien, 50 par page. Une ancienne adresse rattachée mène à l'outil ; un « Autre » ou un nom
// inconnu répond le même 404.
// Scénario : docs/scenarios/refonte.md, « R6b », « La page d'un outil ». Règles du plan : décision 1
// de la session (la page compte exactement ce que le lecteur voit, jur-T18), décision 2 (sec-A2 :
// un slug d'outil passe avant une ancienne adresse ; même 404), décision 12 (description par
// langue, « xx » → français ; quota `toolsHour`).
//
// Le contrat n'a pas de code d'erreur `tool_not_found` (le plan le nomme) : le 404 attendu porte
// `not_found`, comme une adresse inconnue.
//
// Quatre membres : Inès et Zoé (autrices), Malik (qui lit), Louis (administrateur, pour retirer).
import { randomUUID } from 'node:crypto'
import { ErrorResponse, TOOL_PAGE_SIZE, ToolPage } from '@ruche/contracts'
import { schema } from '@ruche/db'
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
let lovable: string // id de l'outil Lovable

const SECOND = 1000
const DEMO = 'https://demo.lovable.app'

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

  // Le catalogue du test, à la place du catalogue semé : trois outils, dont un avec une ancienne
  // adresse (« chat-gpt », l'étiquette d'avant R6b).
  await clearCatalogue(ctx.db)
  lovable = (
    await addCatalogueTool(ctx.db, {
      name: 'Lovable',
      family: 'no-code',
      descriptionFr: 'Crée une application web à partir d’une description.',
      descriptionEn: 'Builds a web app from a description.',
      siteUrl: 'https://lovable.dev/',
    })
  ).id
  await addCatalogueTool(ctx.db, {
    name: 'ChatGPT',
    family: 'assistant',
    descriptionFr: 'Un assistant qui répond par écrit.',
    descriptionEn: 'An assistant that answers in writing.',
    redirects: ['chat-gpt'],
  })
  await addCatalogueTool(ctx.db, { name: 'Claude', family: 'assistant' })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

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

const pageRaw = (cookie: string | null, path: string, language?: string) =>
  ctx.request(`/v1/tags/${path}`, {
    headers: { ...(cookie && { cookie }), ...(language && { 'accept-language': language }) },
  })

/** La page, telle que ce membre la lit (la demande doit réussir), vérifiée par le contrat. */
const page = async (cookie: string, path: string, language?: string) => {
  const res = await pageRaw(cookie, path, language)
  expect(res.status).toBe(200)
  return ToolPage.parse(await res.json())
}

const titles = async (cookie: string, path: string) =>
  (await page(cookie, path)).projects.map((project) => project.title)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

describe('the page of a tool', () => {
  it('is only for signed-in members', async () => {
    await expectError(await pageRaw(null, 'lovable'), 401, 'unauthorized')
    // Témoin : la même demande, avec une session, réussit.
    expect((await page(malik, 'lovable')).tool.slug).toBe('lovable')
  })

  it('shows the tool: name, family, description in the reader’s language, site and count', async () => {
    await publish(ines, 'Un', ['Lovable'])

    expect((await page(malik, 'lovable')).tool).toEqual({
      slug: 'lovable',
      name: 'Lovable',
      family: 'no-code',
      description: 'Crée une application web à partir d’une description.',
      siteUrl: 'https://lovable.dev/',
      projectCount: 1,
    })
    expect((await page(malik, 'lovable', 'en-US,en;q=0.9')).tool.description).toBe(
      'Builds a web app from a description.',
    )
    // Un outil sans description ni site : null, jamais un texte vide.
    const claude = (await page(malik, 'claude')).tool
    expect(claude.description).toBeNull()
    expect(claude.siteUrl).toBeNull()
  })

  it('serves the French description for an unknown Accept-Language', async () => {
    expect((await page(malik, 'lovable', 'de-DE,de;q=0.9')).tool.description).toBe(
      'Crée une application web à partir d’une description.',
    )
  })

  it('answers a tool without projects with an empty page', async () => {
    expect(await page(malik, 'claude')).toEqual({
      tool: expect.objectContaining({ slug: 'claude', projectCount: 0 }),
      categories: [],
      projects: [],
      nextCursor: null,
    })
  })

  it('lists the projects made with the tool, newest first, whatever spelling they used', async () => {
    await publish(ines, 'Un', ['Lovable'])
    await publish(zoe, 'Deux', ['lovable', 'Claude'])
    await publish(ines, 'Sans Lovable', ['Claude'])

    expect(await titles(malik, 'lovable')).toEqual(['Deux', 'Un'])
  })

  it('counts on a tool page exactly the projects the reader can see in its list', async () => {
    await publish(ines, 'Un', ['Lovable'])
    await publish(ines, 'Brouillon d’Inès', ['Lovable'], { visibility: 'private' })
    await publish(malik, 'Mon brouillon', ['Lovable'], { visibility: 'private' })
    const removed = await publish(zoe, 'Retiré', ['Lovable'])
    // Un projet public d'un compte jamais vérifié, posé en base (aucune route ne le permet).
    await ctx.db.insert(schema.user).values({
      id: 'unverified',
      name: 'Fantôme',
      email: 'fantome@example.com',
      emailVerified: false,
    })
    const ghost = randomUUID()
    const at = new Date()
    await ctx.db.insert(schema.project).values({
      id: ghost,
      authorId: 'unverified',
      title: 'Fantôme',
      pitch: 'Un projet sans auteur vérifié.',
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
    })
    await linkProjectTool(ctx.db, ghost, lovable)
    // Témoin : avant le retrait, le projet de Zoé est là.
    expect(await titles(malik, 'lovable')).toEqual(['Retiré', 'Un'])

    await remove(removed.id)

    const read = await page(malik, 'lovable')
    expect(read.projects.map((project) => project.title)).toEqual(['Un'])
    expect(read.tool.projectCount).toBe(read.projects.length)
  })

  it('answers 600 readings an hour per member on the tools quota, then asks to wait', async () => {
    await ctx.db
      .insert(schema.apiRateLimit)
      .values({ key: memberCounterKeys(malikId).toolsHour, count: 599, windowStart: Date.now() })

    expect((await page(malik, 'lovable')).tool.slug).toBe('lovable')
    await expectError(await pageRaw(malik, 'lovable'), 429, 'rate_limited')
    // Le compteur est celui de la liste des outils : elle aussi attend.
    await expectError(await act.send('GET', '/v1/tools', malik), 429, 'rate_limited')
    // Zoé a son propre compteur.
    expect((await page(zoe, 'lovable')).tool.slug).toBe('lovable')
  })
})

describe('the addresses of a tool', () => {
  it('serves the tool for an old address, with its canonical slug', async () => {
    await publish(ines, 'Un', ['ChatGPT'])

    const read = await page(malik, 'chat-gpt')
    // L'appli remplace l'adresse par celle-ci (/tags/chatgpt).
    expect(read.tool.slug).toBe('chatgpt')
    expect(read.projects.map((project) => project.title)).toEqual(['Un'])
  })

  it('serves the catalogue tool, never the redirect, when a redirect slug equals a tool slug', async () => {
    // Un état que seule une course ou une erreur d'administration produirait : posé en base. Une
    // ancienne adresse « claude » qui mènerait à ChatGPT ne doit jamais cacher l'outil Claude.
    await addCatalogueTool(ctx.db, { name: 'Gemini', family: 'assistant', redirects: ['claude'] })

    expect((await page(malik, 'claude')).tool.name).toBe('Claude')
    // Témoin : la page de Gemini existe bien.
    expect((await page(malik, 'gemini')).tool.name).toBe('Gemini')
  })

  it('answers the same 404 body to an « other » and to an unknown slug', async () => {
    // « Teachable Machine » n'est pas au catalogue : la publication en fait un « Autre », sans page.
    await publish(ines, 'Un', ['Teachable Machine', 'Lovable'])
    // Témoin : un outil du catalogue du même projet a sa page.
    expect(await titles(malik, 'lovable')).toEqual(['Un'])

    const other = await pageRaw(malik, 'teachable-machine')
    const unknown = await pageRaw(malik, 'inconnu')
    const malformed = await pageRaw(malik, 'chat.gpt')
    const bodies = [await other.text(), await unknown.text(), await malformed.text()]

    for (const res of [other, unknown, malformed]) expect(res.status).toBe(404)
    expect(ErrorResponse.parse(JSON.parse(bodies[0] ?? '')).error.code).toBe('not_found')
    expect(bodies[1]).toBe(bodies[0])
    expect(bodies[2]).toBe(bodies[0])
  })
})

describe('the filters of a tool page', () => {
  /**
   * Quatre projets publics faits avec Lovable, du plus ancien au plus récent :
   * - « Carnet » : testable, Cuisine ;
   * - « Chatière » : terminé, Animaux, puis Cuisine en seconde ;
   * - « Croquettes » : testable, Animaux, puis Cuisine en seconde ;
   * - « Esquisse » : idée, Art et dessin.
   * Et un brouillon d'Inès, testable, en Musique, que personne d'autre ne voit.
   */
  beforeEach(async () => {
    await publish(ines, 'Carnet', ['Lovable'], {
      status: 'testable',
      demoUrl: DEMO,
      primaryCategory: 'cooking',
    })
    await publish(zoe, 'Chatière', ['Lovable'], {
      status: 'done',
      primaryCategory: 'animals',
      secondaryCategory: 'cooking',
    })
    await publish(ines, 'Croquettes', ['Lovable'], {
      status: 'testable',
      demoUrl: DEMO,
      primaryCategory: 'animals',
      secondaryCategory: 'cooking',
    })
    await publish(zoe, 'Esquisse', ['Lovable'], { status: 'idea', primaryCategory: 'art' })
    await publish(ines, 'Brouillon', ['Lovable'], {
      status: 'testable',
      demoUrl: DEMO,
      primaryCategory: 'music',
      visibility: 'private',
    })
  })

  /** Les catégories de la page, rangées par code (l'ordre d'affichage est celui de l'appli). */
  const categoriesOf = async (path: string) =>
    (await page(malik, path)).categories.toSorted((a, b) => a.code.localeCompare(b.code))

  it('keeps only the testable or the done projects', async () => {
    expect(await titles(malik, 'lovable')).toEqual(['Esquisse', 'Croquettes', 'Chatière', 'Carnet'])
    expect(await titles(malik, 'lovable?status=testable')).toEqual(['Croquettes', 'Carnet'])
    expect(await titles(malik, 'lovable?status=done')).toEqual(['Chatière'])
  })

  it('keeps the projects of a category, in first or in second place', async () => {
    expect(await titles(malik, 'lovable?category=cooking')).toEqual([
      'Croquettes',
      'Chatière',
      'Carnet',
    ])
    expect(await titles(malik, 'lovable?category=animals')).toEqual(['Croquettes', 'Chatière'])
    expect(await titles(malik, 'lovable?status=testable&category=cooking')).toEqual([
      'Croquettes',
      'Carnet',
    ])
    // Une catégorie bien formée sans projet : une page vide, pas une erreur.
    expect(await titles(malik, 'lovable?category=travel')).toEqual([])
  })

  it('counts the categories of the visible projects, with the status filter but not the category one', async () => {
    // Sans filtre : chaque projet compte dans sa principale et sa seconde ; jamais le brouillon.
    expect(await categoriesOf('lovable')).toEqual([
      { code: 'animals', projectCount: 2 },
      { code: 'art', projectCount: 1 },
      { code: 'cooking', projectCount: 3 },
    ])
    // Le filtre de statut s'applique aux nombres ; celui de catégorie, non (pour en changer).
    expect(await categoriesOf('lovable?status=testable&category=animals')).toEqual([
      { code: 'animals', projectCount: 1 },
      { code: 'cooking', projectCount: 2 },
    ])
  })

  it('refuses a malformed filter', async () => {
    await expectError(await pageRaw(malik, 'lovable?status=idea'), 400, 'validation')
    await expectError(await pageRaw(malik, 'lovable?category=Cuisine'), 400, 'validation')
    await expectError(await pageRaw(malik, 'lovable?cursor=a%20b'), 400, 'validation')
  })
})

describe('the pages of a tool', () => {
  it('lists 50 projects, then the next ones through the cursor, keeping the filters', async () => {
    // 51 projets terminés, une seconde d'écart chacun, posés d'un coup en base (la publication par
    // l'API prendrait trop de temps), puis un projet « idée », le plus récent, que le filtre écarte.
    const start = Date.now()
    const rows = Array.from({ length: 52 }, (_, i) => {
      const at = new Date(start + (i + 1) * SECOND)
      return {
        id: randomUUID(),
        authorId: inesId,
        title: i === 51 ? 'Idée' : `Projet ${i + 1}`,
        pitch: 'Un petit projet pour essayer.',
        status: i === 51 ? ('idea' as const) : ('done' as const),
        primaryCategory: 'cooking',
        tools: ['Lovable'],
        toolSlugs: ['lovable'],
        createdAt: at,
        updatedAt: at,
        publishedAt: at,
      }
    })
    await ctx.db.insert(schema.project).values(rows)
    for (const row of rows) await linkProjectTool(ctx.db, row.id, lovable)

    const first = await page(malik, 'lovable?status=done')
    expect(first.projects).toHaveLength(TOOL_PAGE_SIZE)
    expect(first.projects[0]?.title).toBe('Projet 51')
    expect(first.projects.at(-1)?.title).toBe('Projet 2')
    expect(first.tool.projectCount).toBe(52) // tous ses projets visibles, quels que soient les filtres
    expect(first.nextCursor).not.toBeNull()

    const second = await page(malik, `lovable?status=done&cursor=${first.nextCursor}`)
    expect(second.projects.map((project) => project.title)).toEqual(['Projet 1'])
    expect(second.nextCursor).toBeNull()

    // Sans filtre, la première page commence par le projet « idée ».
    expect((await page(malik, 'lovable')).projects[0]?.title).toBe('Idée')
  })
})

describe('a block', () => {
  /** Les deux sens du blocage, avec qui bloque qui. */
  const DIRECTIONS = [
    ['Inès blocked Malik', () => act.block(malikId, ines)],
    ['Malik blocked Inès', () => act.block(inesId, malik)],
  ] as const

  describe.each(DIRECTIONS)('when %s', (_, blockNow) => {
    it('leaves the projects of the blocked member out of the list, the count and the categories', async () => {
      await publish(ines, 'Chez Inès', ['Lovable'], { primaryCategory: 'cooking' })
      await publish(zoe, 'Chez Zoé', ['Lovable'], { primaryCategory: 'animals' })
      // Témoin : avant le blocage, Malik voit les deux.
      expect(await titles(malik, 'lovable')).toEqual(['Chez Zoé', 'Chez Inès'])

      later()
      await blockNow()

      const read = await page(malik, 'lovable')
      expect(read.projects.map((project) => project.title)).toEqual(['Chez Zoé'])
      expect(read.tool.projectCount).toBe(1)
      expect(read.categories).toEqual([{ code: 'animals', projectCount: 1 }])
      // Zoé voit toujours les deux.
      expect(await titles(zoe, 'lovable')).toEqual(['Chez Zoé', 'Chez Inès'])
    })
  })
})
