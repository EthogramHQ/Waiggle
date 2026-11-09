// Tests d'intégration de l'administration du catalogue (tranche R6b) : les pages « Outils » et
// « Catégories » de la Modération. Scénario : docs/scenarios/refonte.md, « R6b », « Ranger les
// « Autre » » ; plan R6b, « API » (B3) et « Relecture du plan » (décisions 1 à 14, tests ajoutés).
//
// Les routes (routes/moderation-catalogue.ts) :
// - GET  /v1/moderation/tools/pending          les « Autre » à vérifier (PendingToolsPage) ;
// - GET  /v1/moderation/tools?q&cursor          le catalogue, pour le modifier (AdminCatalogueToolsPage) ;
// - POST /v1/moderation/tools                   créer un outil (ToolAdmit) → 201, AdminCatalogueTool ;
// - POST /v1/moderation/tools/{slug}/admit      un « Autre » entre au catalogue → 200, AdminCatalogueTool ;
// - PATCH /v1/moderation/tools/{slug}           modifier un outil du catalogue (ToolEdit) → 200 ;
// - GET  /v1/moderation/tools/{slug}/impact     ce que changera un rattachement (ToolImpact) ;
// - POST /v1/moderation/tools/{slug}/merge      rattacher un « Autre » (ToolMerge) → 204 ;
// - POST /v1/moderation/tools/{slug}/dismiss    laisser un « Autre » hors du catalogue → 204 ;
// - GET  /v1/moderation/categories/pending      les projets classés « Autre » (UncategorizedPage) ;
// - POST /v1/moderation/projects/{id}/category  ranger un projet (Recategorize) → 204 ;
// - POST /v1/moderation/categories              créer une catégorie (CategoryCreate) → 201, Category ;
// - GET  /v1/moderation/catalogue-changes       « Changements récents » (CatalogueChangesPage).
// Les statuts des écritures (201, 200, 204) ne sont pas dans le contrat : ce fichier les fixe.
//
// Ce qui est vérifié :
// - pour tout autre qu'un administrateur en fonction (anonyme, membre, administrateur révoqué ou
//   suspendu), chaque route répond exactement comme une adresse qui n'existe pas, avant même de
//   lire le corps ; le contrôle d'origine (CSRF) et le quota de 50 décisions par jour, partagé
//   avec les décisions de modération ;
// - les pages ne montrent que les projets que les membres peuvent voir (publics, pas retirés,
//   d'un auteur vérifié), sans filtre de blocage (décision 1) ;
// - admettre, créer, modifier, rattacher, écarter, ranger, créer une catégorie : leurs effets
//   partout, leurs refus (409, 404, 403), et une ligne de journal par écriture réussie ;
// - l'export d'un membre liste les rangements de ses projets, sans l'administrateur (jur-T4).
//
// Six membres au plus (quota d'inscription par adresse IP) : Louis, l'administrateur ; Léa, Max et
// Zoé, des membres ; Karim, seulement pour l'administrateur suspendu. Le catalogue semé par la
// migration est effacé avant chaque test (testing/tool-catalogue.ts) : Claude (alias « Claude
// AI »), Make et Mistral le remplacent. Tout autre nom tapé dans un projet devient un « Autre ».
import {
  AccountExport,
  AdminCatalogueTool,
  AdminCatalogueToolsPage,
  CatalogueChangesPage,
  Category,
  CategoryCode,
  CategoryList,
  ErrorResponse,
  MODERATION_DECISIONS_PER_DAY,
  OTHER_CATEGORY,
  PendingToolsPage,
  Project,
  ToolImpact,
  ToolList,
  ToolPage,
  UncategorizedPage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { addCatalogueTool, clearCatalogue } from './testing/tool-catalogue'

let ctx: TestContext
let act: ReturnType<typeof activity>
let louis: string // cookies de session
let lea: string
let max: string
let zoe: string
let louisId: string
let maxId: string
let zoeId: string

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Un corps valide pour ajouter un outil au catalogue (créer ou admettre). */
const teachable = {
  name: 'Teachable Machine',
  family: 'creation',
  descriptionFr: 'Entraîne un petit modèle de reconnaissance d’images dans le navigateur.',
  descriptionEn: 'Trains a small image recognition model in the browser.',
  siteUrl: 'https://teachablemachine.withgoogle.com',
} as const

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  louisId = (await act.me(louis)).id
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  await act.makeAdmin(louisId)
  await clearCatalogue(ctx.db)
  await addCatalogueTool(ctx.db, { name: 'Claude', family: 'assistant', aliases: ['Claude AI'] })
  await addCatalogueTool(ctx.db, { name: 'Make', family: 'automation' })
  await addCatalogueTool(ctx.db, { name: 'Mistral', family: 'assistant' })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Publie un projet avec ces outils (public, classé « Autre » par défaut), une seconde plus tard. */
const publish = async (cookie: string, title: string, tools: string[] = [], body: object = {}) => {
  later()
  return act.publish(cookie, title, { tools, ...body })
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Deux réponses identiques, statut et corps : rien ne distingue l'une de l'autre. */
const expectSame = async (res: Response, reference: Response, label: string) => {
  expect(res.status, label).toBe(reference.status)
  expect(await res.text(), label).toEqual(await reference.text())
}

/** La même demande vers une adresse qui n'existe pas : la réponse de référence. */
const nowhere = (method: string, cookie: string | null, body?: unknown) =>
  act.send(method, '/v1/inexistant', cookie, body)

/** Une écriture de l'administration, une seconde après ce qui précède. */
const write = (method: string, path: string, cookie: string | null, body?: unknown) => {
  later()
  return act.send(method, path, cookie, body)
}

const read = async (path: string, cookie = louis) => {
  const res = await act.send('GET', path, cookie)
  expect(res.status, path).toBe(200)
  return res.json()
}
const pending = async (cursor?: string) =>
  PendingToolsPage.parse(
    await read(
      `/v1/moderation/tools/pending${cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`}`,
    ),
  )
const uncategorized = async () =>
  UncategorizedPage.parse(await read('/v1/moderation/categories/pending'))
const changes = async () =>
  CatalogueChangesPage.parse(await read('/v1/moderation/catalogue-changes'))
const readProject = async (id: string, cookie = zoe) =>
  Project.parse(await read(`/v1/projects/${id}`, cookie))
const toolList = async (cookie = zoe) => ToolList.parse(await read('/v1/tools', cookie))
const categories = async (cookie = zoe) =>
  CategoryList.parse(await read('/v1/categories', cookie)).categories

/** Le slug d'un « Autre » d'après son nom, lu dans « À vérifier ». */
const pendingSlug = async (name: string) => {
  const tool = (await pending()).items.find((item) => item.name === name)
  if (tool === undefined) throw new Error(`no pending tool named ${name}`)
  return tool.slug
}

/** Retire un projet : Zoé le signale, Louis décide (un retrait exige un signalement ouvert). */
const removeProject = async (id: string, reporter = zoe) => {
  later()
  await act.report(reporter, { kind: 'project', id })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'project', id },
    ground: 'rules',
    explanation: 'Publicité déguisée.',
  })
}

/** Les lignes du journal, en base, dans l'ordre d'écriture. */
const journalInBase = async () => {
  const result = (await ctx.db.execute(
    sql`select action from catalogue_change order by created_at`,
  )) as unknown as { rows: { action: unknown }[] }
  return result.rows.map((row) => String(row.action))
}

/** Le nombre d'outils de ce nom replié, en base (un « Autre » effacé n'y est plus). */
const toolsFolded = async (folded: string) => {
  const result = (await ctx.db.execute(
    sql`select count(*)::int as n from tool where folded = ${folded}`,
  )) as unknown as { rows: { n: unknown }[] }
  return Number(result.rows[0]?.n)
}

// ─── Les gardes ──────────────────────────────────────────────────────────────────────────────────

/**
 * Chaque route, avec un corps valide pour les écritures. `projectId` : un projet de Léa à ranger.
 * Les slugs n'ont pas besoin d'exister : la garde répond avant de les chercher.
 */
const catalogueRoutes = (projectId: string) =>
  [
    ['GET', '/v1/moderation/tools/pending', undefined],
    ['GET', '/v1/moderation/tools', undefined],
    ['GET', '/v1/moderation/tools/teachable-machine/impact', undefined],
    ['POST', '/v1/moderation/tools', teachable],
    ['POST', '/v1/moderation/tools/teachable-machine/admit', teachable],
    ['PATCH', '/v1/moderation/tools/claude', { descriptionFr: 'Un assistant qui écrit.' }],
    ['POST', '/v1/moderation/tools/make-com/merge', { into: 'make' }],
    ['POST', '/v1/moderation/tools/teachable-machine/dismiss', undefined],
    ['GET', '/v1/moderation/categories/pending', undefined],
    ['POST', `/v1/moderation/projects/${projectId}/category`, { category: 'animals' }],
    [
      'POST',
      '/v1/moderation/categories',
      { nameFr: 'Jardinage', nameEn: 'Gardening', icon: 'flower' },
    ],
    ['GET', '/v1/moderation/catalogue-changes', undefined],
  ] as const

/**
 * Témoin des tests de garde (charte : « une route absente répond not_found ») : l'administrateur
 * atteint chaque route. Une lecture répond 200 ; une écriture, avec un corps invalide (une chaîne
 * JSON là où un objet est attendu), 400 `validation`, sans rien changer. « Écarter » n'a pas de
 * corps : il est essayé sur un « Autre » réel, en dernier.
 */
const expectEveryRouteReached = async (projectId: string) => {
  const missed: string[] = []
  for (const [method, path] of catalogueRoutes(projectId)) {
    if (path.endsWith('/dismiss')) continue
    const res = await write(method, path, louis, method === 'GET' ? undefined : 'x')
    const expected = method === 'GET' ? 200 : 400
    if (res.status !== expected) missed.push(`${method} ${path}: ${res.status}`)
  }
  await publish(lea, 'Bidules', ['Bidule'])
  const dismissed = await write(
    'POST',
    `/v1/moderation/tools/${await pendingSlug('Bidule')}/dismiss`,
    louis,
  )
  if (dismissed.status !== 204) missed.push(`dismiss: ${dismissed.status}`)
  expect(missed.join('\n')).toBe('')
}

describe('the catalogue routes, for anyone but an administrator', () => {
  it('answer like a route that does not exist: anonymous, member, revoked administrator', async () => {
    const project = await publish(lea, 'Mon chat', ['Teachable Machine'])
    await act.makeAdmin(zoeId)
    await act.revokeAdmin(zoeId)

    for (const [who, cookie] of [
      ['anonymous', null],
      ['member', max],
      ['revoked', zoe],
    ] as const) {
      for (const [method, path, body] of catalogueRoutes(project.id)) {
        const label = `${who} ${method} ${path}`
        const res = await act.send(method, path, cookie, body)
        expect(res.status, label).toBe(404)
        await expectSame(res, await nowhere(method, cookie, body), label)
      }
    }
    // Rien n'a été écrit.
    expect(await journalInBase()).toEqual([])
    expect((await readProject(project.id)).primaryCategory).toBe(OTHER_CATEGORY)
    await expectEveryRouteReached(project.id)
  })

  // Relecture sec-B2 et décision 13. Une lecture répond 404, comme une adresse inconnue lue par
  // n'importe qui. Une écriture répond, comme une adresse inconnue, ce que la garde des comptes
  // suspendus répond à toute écriture qu'elle ne permet pas (403 `suspended`, route-inventory) :
  // dans les deux cas, rien ne distingue une route du catalogue d'une adresse qui n'existe pas.
  it('answers the same 404 as an unknown route to a suspended administrator on every catalogue route', async () => {
    const project = await publish(lea, 'Mon chat', ['Teachable Machine'])
    const karim = await ctx.verifiedMember({
      name: 'Karim',
      email: 'karim@example.com',
      password: 'karim-long-password',
    })
    const karimId = (await act.me(karim)).id
    later()
    const suspended = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'suspend',
      memberId: karimId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })
    expect(suspended.status).toBe(201)
    // Administrateur après la suspension (on ne suspend pas un administrateur en fonction, 7c).
    await act.makeAdmin(karimId)

    for (const [method, path, body] of catalogueRoutes(project.id)) {
      const label = `suspended ${method} ${path}`
      const res = await act.send(method, path, karim, body)
      await expectSame(res, await nowhere(method, karim, body), label)
      if (method === 'GET') expect(res.status, label).toBe(404)
    }
    expect(await journalInBase()).toEqual([])
    await expectEveryRouteReached(project.id)
  })

  it('answers 404 to a member sending an invalid body, before any validation', async () => {
    const project = await publish(lea, 'Mon chat', ['Teachable Machine'])
    const invalid = ['x', { name: '' }, { into: 'Pas un slug !' }, { category: 'Cuisine' }, {}]

    for (const [method, path] of catalogueRoutes(project.id)) {
      if (method === 'GET') continue
      for (const body of invalid) {
        const label = `${method} ${path} ${JSON.stringify(body)}`
        const res = await act.send(method, path, max, body)
        expect(res.status, label).toBe(404)
        await expectSame(res, await nowhere(method, max, body), label)
      }
    }
    // Témoin : le même corps invalide, envoyé par l'administrateur, est refusé par la validation.
    await expectError(
      await write('POST', '/v1/moderation/tools', louis, { name: '' }),
      400,
      'validation',
    )
  })

  it('reads the role at each request: a revoked administrator loses access at once', async () => {
    expect((await act.send('GET', '/v1/moderation/tools/pending', louis)).status).toBe(200)

    await act.revokeAdmin(louisId)

    expect((await act.send('GET', '/v1/moderation/tools/pending', louis)).status).toBe(404)
  })

  it('refuses a write coming from another site (CSRF)', async () => {
    later()
    const res = await ctx.request('/v1/moderation/tools', {
      method: 'POST',
      headers: {
        cookie: louis,
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify(teachable),
    })

    expect(res.status).toBe(403)
    expect(await journalInBase()).toEqual([])
    // Témoin : la même demande, venue de l'appli, crée l'outil.
    expect((await write('POST', '/v1/moderation/tools', louis, teachable)).status).toBe(201)
  })
})

// ─── Le quota, partagé avec les décisions de modération ──────────────────────────────────────────

describe('the limit of catalogue writes', () => {
  /** Le compteur des décisions de Louis, posé en base à `count`. */
  const setDecisionCounter = (count: number) =>
    ctx.db.insert(schema.apiRateLimit).values({
      key: memberCounterKeys(louisId).moderationDecision,
      count,
      windowStart: Date.now(),
    })

  it('counts each write, even malformed, in the 50 decisions of the day, then answers 429', async () => {
    await setDecisionCounter(MODERATION_DECISIONS_PER_DAY - 1)

    // La 50e demande du jour, mal formée : elle compte quand même.
    await expectError(
      await write('POST', '/v1/moderation/tools', louis, { name: '' }),
      400,
      'validation',
    )
    const res = await write('POST', '/v1/moderation/tools', louis, teachable)

    await expectError(res, 429, 'rate_limited')
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await journalInBase()).toEqual([])
    // Le quota est celui des décisions : une décision de modération est refusée aussi.
    const project = await publish(lea, 'Mon chat')
    later()
    await act.report(zoe, { kind: 'project', id: project.id })
    await expectError(
      await write('POST', '/v1/moderation/decisions', louis, {
        action: 'dismiss',
        target: { kind: 'project', id: project.id },
      }),
      429,
      'rate_limited',
    )
    // Lire les pages ne compte pas : sinon 50 visites priveraient l'administrateur de ses décisions.
    expect((await act.send('GET', '/v1/moderation/tools/pending', louis)).status).toBe(200)
    // Un jour plus tard, Louis écrit de nouveau.
    later(DAY)
    expect((await write('POST', '/v1/moderation/tools', louis, teachable)).status).toBe(201)
  })

  it('counts a catalogue write and a moderation decision in the same counter', async () => {
    await setDecisionCounter(MODERATION_DECISIONS_PER_DAY - 1)
    const project = await publish(lea, 'Mon chat')

    // La 50e : un rangement.
    expect(
      (
        await write('POST', `/v1/moderation/projects/${project.id}/category`, louis, {
          category: 'animals',
        })
      ).status,
    ).toBe(204)
    // La 51e : une catégorie créée.
    await expectError(
      await write('POST', '/v1/moderation/categories', louis, {
        nameFr: 'Jardinage',
        nameEn: 'Gardening',
        icon: 'flower',
      }),
      429,
      'rate_limited',
    )
  })

  it('counts nothing for who is not an administrator: 60 times the same 404', async () => {
    for (let i = 1; i <= MODERATION_DECISIONS_PER_DAY + 10; i++) {
      const res = await write('POST', '/v1/moderation/tools', max, teachable)
      await expectSame(res, await nowhere('POST', max, teachable), `request ${i}`)
    }

    // Devenu administrateur, Max écrit aussitôt : rien n'a été compté pendant qu'il ne l'était pas.
    await act.makeAdmin(maxId)
    expect((await write('POST', '/v1/moderation/tools', max, teachable)).status).toBe(201)
  })
})

// ─── « À vérifier » : les « Autre » ──────────────────────────────────────────────────────────────

describe('the pending tools', () => {
  it('lists each « other » cited by a visible project, newest first, with its projects and their number', async () => {
    const chat = await publish(lea, 'Mon chat qui parle', ['Teachable Machine', 'Claude'])
    await publish(max, 'Pluie', ['Make.com'])
    const tri = await publish(zoe, 'Tri des déchets', ['teachable machine'])

    const page = await pending()

    expect(page.items.map((item) => item.name)).toEqual(['Make.com', 'Teachable Machine'])
    expect(page.nextCursor).toBeNull()
    const [make, machine] = page.items
    expect(make).toMatchObject({
      projectCount: 1,
      projects: [{ title: 'Pluie', author: { name: 'Max' } }],
    })
    expect(machine?.projectCount).toBe(2)
    expect(machine?.projects.map((p) => p.id).sort()).toEqual([chat.id, tri.id].sort())
    expect(machine?.projects.find((p) => p.id === chat.id)?.author.name).toBe('Léa')
    // Un outil du catalogue n'est jamais « à vérifier ».
    expect(page.items.map((item) => item.name)).not.toContain('Claude')
  })

  it('counts and lists in a pending tool only the listed projects of a verified author', async () => {
    const shown: string[] = []
    for (const [i, cookie] of [lea, max, zoe, lea, max, zoe, lea].entries()) {
      shown.push((await publish(cookie, `Projet ${i + 1}`, ['Teachable Machine'])).id)
    }
    const hidden = await publish(max, 'Projet privé', ['Teachable Machine'], {
      visibility: 'private',
    })
    const removed = await publish(lea, 'Projet retiré', ['Teachable Machine'])
    await removeProject(removed.id)
    // Zoé n'est plus vérifiée (adresse changée et pas encore confirmée, par exemple).
    await ctx.db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, zoeId))
    const zoeProjects = shown.filter((_, i) => i % 3 === 2)

    const [tool] = (await pending()).items

    expect(tool?.projectCount).toBe(shown.length - zoeProjects.length)
    expect(tool?.projects).toHaveLength(5)
    for (const project of tool?.projects ?? []) {
      expect(shown).toContain(project.id)
      expect(zoeProjects).not.toContain(project.id)
      expect([hidden.id, removed.id]).not.toContain(project.id)
    }
  })

  it('hides from the pending tools an « other » cited only by private or removed projects', async () => {
    await publish(lea, 'Carnet', ['Outil Secret'], { visibility: 'private' })
    const removed = await publish(max, 'Pub', ['Outil Retiré'])
    await removeProject(removed.id)
    await publish(zoe, 'Tri', ['Outil Visible'])

    expect((await pending()).items.map((item) => item.name)).toEqual(['Outil Visible'])
  })

  it('never shows an administrator the title or author of a private or removed project in the pending tools', async () => {
    await publish(lea, 'Mon chat qui parle', ['Teachable Machine'])
    await act.updateProfile(max, { name: 'Max Discret' })
    await publish(max, 'Projet secret de Max', ['Teachable Machine'], { visibility: 'private' })
    const removed = await publish(zoe, 'Projet retiré de Zoé', ['Teachable Machine'])
    await removeProject(removed.id, lea)

    const res = await act.send('GET', '/v1/moderation/tools/pending', louis)
    const raw = await res.text()

    expect(res.status).toBe(200)
    expect(raw).toContain('Mon chat qui parle')
    for (const leak of [
      'Projet secret de Max',
      'Max Discret',
      'Projet retiré de Zoé',
      '"name":"Zoé"',
    ]) {
      expect(raw, leak).not.toContain(leak)
    }
    expect(PendingToolsPage.parse(JSON.parse(raw)).items[0]?.projectCount).toBe(1)
  })

  // Décision 1 (sec-A1, charte 7b-B1) : les administrateurs voient tout, sans filtre de blocage ;
  // sinon bloquer l'administrateur ferait échapper au rangement.
  it('keeps in the pending lists a project whose author blocked the administrator', async () => {
    const project = await publish(max, 'Pluie', ['Make.com'])
    later()
    await act.block(louisId, max)

    expect((await pending()).items.map((item) => item.projects.map((p) => p.id))).toEqual([
      [project.id],
    ])
    expect((await uncategorized()).items.map((item) => item.id)).toEqual([project.id])
  })

  it('gives 20 tools a page, then the next ones by the cursor, without a gap or a double', async () => {
    const first = Array.from({ length: 15 }, (_, i) => `Outil ${String(i + 1).padStart(2, '0')}`)
    const second = Array.from({ length: 6 }, (_, i) => `Outil ${String(i + 16).padStart(2, '0')}`)
    await publish(lea, 'Beaucoup d’outils', first)
    await publish(lea, 'Encore des outils', second)

    const one = await pending()
    expect(one.items).toHaveLength(20)
    expect(one.nextCursor).not.toBeNull()
    const two = await pending(one.nextCursor ?? '')
    expect(two.items).toHaveLength(1)
    expect(two.nextCursor).toBeNull()

    const names = [...one.items, ...two.items].map((item) => item.name)
    expect(new Set(names).size).toBe(21)
    expect(names.sort()).toEqual([...first, ...second].sort())
    // Du plus récent au plus ancien : les outils du second projet d'abord.
    expect(
      one.items
        .slice(0, 6)
        .map((item) => item.name)
        .sort(),
    ).toEqual(second)
  })
})

// ─── Admettre, créer, modifier ───────────────────────────────────────────────────────────────────

describe('admitting an « other » into the catalogue', () => {
  it('opens its page, makes it a tag everywhere, and takes it out of the pending tools', async () => {
    const chat = await publish(lea, 'Mon chat qui parle', ['teachable machine', 'Claude'])
    const slug = await pendingSlug('teachable machine')

    const res = await write('POST', `/v1/moderation/tools/${slug}/admit`, louis, teachable)

    expect(res.status).toBe(200)
    const admitted = AdminCatalogueTool.parse(await res.json())
    expect(admitted).toMatchObject({
      name: 'Teachable Machine',
      family: 'creation',
      descriptionFr: teachable.descriptionFr,
      descriptionEn: teachable.descriptionEn,
      siteUrl: teachable.siteUrl,
      projectCount: 1,
    })
    // La page de l'outil s'ouvre, avec le projet de Léa.
    const page = ToolPage.parse(await read(`/v1/tags/${admitted.slug}`, zoe))
    expect(page.tool).toMatchObject({
      name: 'Teachable Machine',
      family: 'creation',
      projectCount: 1,
    })
    expect(page.projects.map((p) => p.id)).toEqual([chat.id])
    // Une étiquette sur le projet, au nom du catalogue, à sa place.
    expect((await readProject(chat.id)).tools).toEqual([
      { label: 'Teachable Machine', slug: admitted.slug, inCatalogue: true },
      { label: 'Claude', slug: 'claude', inCatalogue: true },
    ])
    // Dans la liste des outils, plus parmi « Pas encore dans le catalogue ».
    const list = await toolList()
    expect(list.tools.map((tool) => tool.slug)).toContain(admitted.slug)
    expect(list.others).toEqual([])
    expect((await pending()).items).toEqual([])
  })

  it('makes the name typed by the member an alias when the administrator corrects it', async () => {
    await publish(lea, 'Mon chat qui parle', ['Teachable'])

    const res = await write(
      'POST',
      `/v1/moderation/tools/${await pendingSlug('Teachable')}/admit`,
      louis,
      teachable,
    )
    expect(res.status).toBe(200)

    // Max tape l'ancien nom : c'est l'outil du catalogue, pas un nouvel « Autre ».
    const project = await publish(max, 'Pluie', ['TEACHABLE'])
    expect(project.tools).toEqual([
      expect.objectContaining({ label: 'Teachable Machine', inCatalogue: true }),
    ])
    expect((await pending()).items).toEqual([])
  })

  it('answers 409 tool_name_taken, never 500, when the corrected name of an admitted tool is already a tool or an alias', async () => {
    await publish(lea, 'Mon chat qui parle', ['Teachable Machine'])
    const slug = await pendingSlug('Teachable Machine')

    for (const name of ['Claude', 'claude ai', 'MISTRAL']) {
      await expectError(
        await write('POST', `/v1/moderation/tools/${slug}/admit`, louis, { ...teachable, name }),
        409,
        'tool_name_taken',
      )
    }
    // Rien n'a bougé : toujours à vérifier, aucune ligne de journal.
    expect((await pending()).items.map((item) => item.name)).toEqual(['Teachable Machine'])
    expect(await journalInBase()).toEqual([])
  })

  it('answers 409 when admitting a tool already in the catalogue', async () => {
    const res = await write('POST', '/v1/moderation/tools/claude/admit', louis, {
      ...teachable,
      name: 'Claude',
      family: 'assistant',
    })

    expect(res.status).toBe(409)
    ErrorResponse.parse(await res.json())
    expect(await journalInBase()).toEqual([])
    // Témoin : un « Autre », lui, s'admet.
    await publish(lea, 'Mon chat', ['Teachable Machine'])
    expect(
      (
        await write(
          'POST',
          `/v1/moderation/tools/${await pendingSlug('Teachable Machine')}/admit`,
          louis,
          teachable,
        )
      ).status,
    ).toBe(200)
  })

  it('answers 404 to admit an unknown tool', async () => {
    const res = await write('POST', '/v1/moderation/tools/zz-unknown/admit', louis, teachable)

    await expectError(res, 404, 'not_found')
    // Témoin (une route absente répond aussi not_found) : la route existe, elle refuse un corps
    // invalide.
    await expectError(
      await write('POST', '/v1/moderation/tools/zz-unknown/admit', louis, 'x'),
      400,
      'validation',
    )
  })
})

describe('creating a catalogue tool', () => {
  it('adds the tool with its page, and a member who types its name gets the catalogue tool', async () => {
    const res = await write('POST', '/v1/moderation/tools', louis, teachable)

    expect(res.status).toBe(201)
    const created = AdminCatalogueTool.parse(await res.json())
    expect(created).toMatchObject({
      name: 'Teachable Machine',
      family: 'creation',
      projectCount: 0,
    })
    const page = ToolPage.parse(await read(`/v1/tags/${created.slug}`, zoe))
    expect(page.tool.description).toBe(teachable.descriptionFr)
    const project = await publish(lea, 'Mon chat', ['teachable machine'])
    expect(project.tools).toEqual([
      { label: 'Teachable Machine', slug: created.slug, inCatalogue: true },
    ])
  })

  it('answers 409 tool_name_taken when a created tool collides with an alias', async () => {
    for (const name of ['Claude A.I.', 'CLAUDE', 'mistral']) {
      await expectError(
        await write('POST', '/v1/moderation/tools', louis, { ...teachable, name }),
        409,
        'tool_name_taken',
      )
    }
    expect(await journalInBase()).toEqual([])
  })

  it('refuses a site with a query string, a description of 161 characters, and an unknown family', async () => {
    for (const body of [
      { ...teachable, siteUrl: 'https://teachablemachine.withgoogle.com/?ref=waiggle' },
      { ...teachable, descriptionFr: 'a'.repeat(161) },
      { ...teachable, family: 'magic' },
      { ...teachable, extra: true },
    ]) {
      await expectError(await write('POST', '/v1/moderation/tools', louis, body), 400, 'validation')
    }
    expect(await journalInBase()).toEqual([])
  })
})

describe('searching and editing the catalogue', () => {
  it('finds a tool by its name or an alias, accents and capitals aside, with all its fields', async () => {
    const res = await act.send(
      'GET',
      `/v1/moderation/tools?${new URLSearchParams({ q: 'claude a' })}`,
      louis,
    )

    expect(res.status).toBe(200)
    const page = AdminCatalogueToolsPage.parse(await res.json())
    expect(page.items.map((tool) => tool.slug)).toEqual(['claude'])
    expect(page.items[0]).toMatchObject({ name: 'Claude', family: 'assistant', projectCount: 0 })
    // Sans recherche : tout le catalogue.
    const all = AdminCatalogueToolsPage.parse(await read('/v1/moderation/tools'))
    expect(all.items.map((tool) => tool.slug).sort()).toEqual(['claude', 'make', 'mistral'])
  })

  it('refuses a catalogue search of one character and of 81 characters', async () => {
    for (const q of ['c', 'c'.repeat(81)]) {
      await expectError(
        await act.send('GET', `/v1/moderation/tools?${new URLSearchParams({ q })}`, louis),
        400,
        'validation',
      )
    }
  })

  it('changes the description and the site of a tool, seen on its page', async () => {
    const res = await write('PATCH', '/v1/moderation/tools/claude', louis, {
      descriptionFr: 'Un assistant qui écrit et qui code.',
      siteUrl: 'https://claude.ai',
    })

    expect(res.status).toBe(200)
    expect(AdminCatalogueTool.parse(await res.json())).toMatchObject({
      slug: 'claude',
      descriptionFr: 'Un assistant qui écrit et qui code.',
      siteUrl: 'https://claude.ai',
    })
    const page = ToolPage.parse(await read('/v1/tags/claude', zoe))
    expect(page.tool).toMatchObject({
      description: 'Un assistant qui écrit et qui code.',
      siteUrl: 'https://claude.ai',
    })
  })

  it('answers 409 tool_name_taken when a tool is renamed as another tool or its alias', async () => {
    for (const name of ['Make', 'claude ai']) {
      await expectError(
        await write('PATCH', '/v1/moderation/tools/mistral', louis, { name }),
        409,
        'tool_name_taken',
      )
    }
    expect(await journalInBase()).toEqual([])
  })

  it('refuses to edit an « other » tool, to merge into an « other », and to merge a catalogue tool', async () => {
    await publish(lea, 'Mon chat', ['Teachable Machine', 'Make.com'])
    const machine = await pendingSlug('Teachable Machine')
    const makeCom = await pendingSlug('Make.com')

    await expectError(
      await write('PATCH', `/v1/moderation/tools/${machine}`, louis, { family: 'creation' }),
      404,
      'not_found',
    )
    await expectError(
      await write('POST', `/v1/moderation/tools/${makeCom}/merge`, louis, { into: machine }),
      404,
      'not_found',
    )
    await expectError(
      await write('POST', '/v1/moderation/tools/claude/merge', louis, { into: 'mistral' }),
      404,
      'not_found',
    )
    await expectError(
      await write('POST', `/v1/moderation/tools/${makeCom}/merge`, louis, { into: 'zz-unknown' }),
      404,
      'not_found',
    )
    expect(await journalInBase()).toEqual([])
    expect((await pending()).items).toHaveLength(2)
  })
})

// ─── Rattacher et écarter ────────────────────────────────────────────────────────────────────────

describe('linking an « other » to a catalogue tool', () => {
  it('counts the projects, private ones included, and the profiles that will change', async () => {
    await publish(lea, 'Pluie', ['Make.com'])
    await publish(lea, 'Brouillon', ['Make.com'], { visibility: 'private' })
    await act.updateProfile(zoe, { favoriteTools: ['make.com'] })

    const impact = ToolImpact.parse(
      await read(`/v1/moderation/tools/${await pendingSlug('Make.com')}/impact`),
    )

    expect(impact).toEqual({ projects: 2, profiles: 1 })
  })

  it('moves every project and profile to the catalogue tool without a double, and the typed name becomes an alias', async () => {
    const pluie = await publish(lea, 'Pluie', ['Make.com', 'Claude', 'Make'])
    const brouillon = await publish(lea, 'Brouillon', ['Make.com'], { visibility: 'private' })
    await act.updateProfile(zoe, { favoriteTools: ['make.com', 'Mistral'] })
    await act.updateProfile(max, { favoriteTools: ['Make', 'Make.com'] })
    const slug = await pendingSlug('Make.com')

    const res = await write('POST', `/v1/moderation/tools/${slug}/merge`, louis, { into: 'make' })

    expect(res.status).toBe(204)
    // À la place la plus haute, sans doublon ; le projet privé aussi.
    const make = { label: 'Make', slug: 'make', inCatalogue: true }
    expect((await readProject(pluie.id)).tools).toEqual([
      make,
      { label: 'Claude', slug: 'claude', inCatalogue: true },
    ])
    expect((await readProject(brouillon.id, lea)).tools).toEqual([make])
    expect((await act.me(zoe)).favoriteTools).toEqual(['Make', 'Mistral'])
    expect((await act.me(max)).favoriteTools).toEqual(['Make'])
    // L'« Autre » a disparu : ni à vérifier, ni en base.
    expect((await pending()).items).toEqual([])
    expect(await toolsFolded('makecom')).toBe(0)
    // Le nom tapé est devenu un autre nom de Make.
    const again = await publish(max, 'Arrosage', ['MAKE.COM'])
    expect(again.tools).toEqual([make])
    expect(ToolPage.parse(await read('/v1/tags/make', zoe)).tool.projectCount).toBe(2)
  })
})

describe('leaving an « other » out of the catalogue', () => {
  it('takes it out of the pending tools and the public list, and still shows it on its projects', async () => {
    const project = await publish(lea, 'Mon chat', ['Bidule'])
    await publish(max, 'Pluie', ['Make.com'])

    const res = await write(
      'POST',
      `/v1/moderation/tools/${await pendingSlug('Bidule')}/dismiss`,
      louis,
    )

    expect(res.status).toBe(204)
    expect((await pending()).items.map((item) => item.name)).toEqual(['Make.com'])
    expect((await toolList()).others).toEqual([{ name: 'Make.com' }])
    expect((await readProject(project.id)).tools).toEqual([
      expect.objectContaining({ label: 'Bidule', inCatalogue: false }),
    ])
  })

  it('keeps a dismissed name dismissed when another member types it again', async () => {
    await publish(lea, 'Mon chat', ['Bidule'])
    expect(
      (await write('POST', `/v1/moderation/tools/${await pendingSlug('Bidule')}/dismiss`, louis))
        .status,
    ).toBe(204)

    const project = await publish(max, 'Pluie', ['BIDULE'])

    expect(project.tools).toEqual([
      expect.objectContaining({ label: 'BIDULE', inCatalogue: false }),
    ])
    expect((await pending()).items).toEqual([])
    expect(await toolsFolded('bidule')).toBe(1)
  })

  it('lists in the pending tools an « other » named with 40 emoji, and lets the administrator dismiss it', async () => {
    // Relecture de sécurité sec-A1 : chaque emoji devient « u1f916- » dans l'adresse. Sans borne, 40
    // emoji donnaient 279 caractères, refusés par ToolSlug en sortie : « À vérifier » répondait 500
    // à tous les administrateurs, et l'« Autre » ne pouvait plus être ni écarté ni rattaché.
    const robots = String.fromCodePoint(0x1f916).repeat(40)
    await publish(lea, 'Le robot', [robots])

    const slug = await pendingSlug(robots)
    const res = await write('POST', `/v1/moderation/tools/${slug}/dismiss`, louis)

    expect(res.status).toBe(204)
    expect((await pending()).items).toEqual([])
  })

  it('answers 404 to dismiss a catalogue tool or an unknown one', async () => {
    await expectError(
      await write('POST', '/v1/moderation/tools/claude/dismiss', louis),
      404,
      'not_found',
    )
    await expectError(
      await write('POST', '/v1/moderation/tools/zz-unknown/dismiss', louis),
      404,
      'not_found',
    )
    expect(await journalInBase()).toEqual([])
  })
})

// ─── « À ranger » : les projets classés « Autre » ────────────────────────────────────────────────

describe('the projects to sort', () => {
  it('lists the visible projects filed under « other », in first or second place, oldest first', async () => {
    const first = await publish(lea, 'Mon chat qui parle', [], {
      pitch: 'Il miaule en trois langues.',
    })
    await publish(max, 'Pluie', [], { primaryCategory: 'cooking' })
    const second = await publish(zoe, 'Tri des déchets', [], {
      primaryCategory: 'cooking',
      secondaryCategory: 'other',
    })
    await publish(max, 'Brouillon', [], { visibility: 'private' })
    const removed = await publish(max, 'Pub', [])
    await removeProject(removed.id)

    const page = await uncategorized()

    expect(page.items.map((item) => item.id)).toEqual([first.id, second.id])
    expect(page.items[0]).toMatchObject({
      title: 'Mon chat qui parle',
      pitch: 'Il miaule en trois langues.',
      author: { name: 'Léa' },
      primaryCategory: 'other',
      secondaryCategory: null,
    })
    expect(page.items[1]).toMatchObject({ primaryCategory: 'cooking', secondaryCategory: 'other' })
    expect(page.nextCursor).toBeNull()
  })

  it('does not bring back to « À ranger » a project its author set back to other after it was sorted', async () => {
    const project = await publish(lea, 'Mon chat qui parle')
    expect(
      (
        await write('POST', `/v1/moderation/projects/${project.id}/category`, louis, {
          category: 'animals',
        })
      ).status,
    ).toBe(204)
    expect((await uncategorized()).items).toEqual([])

    later()
    expect(
      (await act.send('PATCH', `/v1/projects/${project.id}`, lea, { primaryCategory: 'other' }))
        .status,
    ).toBe(200)

    expect((await readProject(project.id)).primaryCategory).toBe('other')
    expect((await uncategorized()).items).toEqual([])
    // Témoin : un autre projet classé « Autre », jamais rangé, y est.
    const other = await publish(max, 'Pluie')
    expect((await uncategorized()).items.map((item) => item.id)).toEqual([other.id])
  })
})

describe('sorting a project into a category', () => {
  const sort = (projectId: string, category: string, cookie = louis) =>
    write('POST', `/v1/moderation/projects/${projectId}/category`, cookie, { category })

  it('puts the category in place of « other », in first or in second place', async () => {
    const first = await publish(lea, 'Mon chat', [], { secondaryCategory: 'cooking' })
    const second = await publish(max, 'Pluie', [], {
      primaryCategory: 'cooking',
      secondaryCategory: 'other',
    })

    expect((await sort(first.id, 'animals')).status).toBe(204)
    expect((await sort(second.id, 'science')).status).toBe(204)

    expect(await readProject(first.id)).toMatchObject({
      primaryCategory: 'animals',
      secondaryCategory: 'cooking',
    })
    expect(await readProject(second.id)).toMatchObject({
      primaryCategory: 'cooking',
      secondaryCategory: 'science',
    })
    expect((await uncategorized()).items).toEqual([])
    // Le projet se trouve dans sa nouvelle catégorie.
    const counts = Object.fromEntries((await categories()).map((c) => [c.code, c.projectCount]))
    expect(counts).toMatchObject({ animals: 1, science: 1, cooking: 2, other: 0 })
  })

  it('only takes « other » away when the other place already has the category', async () => {
    const first = await publish(lea, 'Mon chat', [], {
      primaryCategory: 'animals',
      secondaryCategory: 'other',
    })
    const second = await publish(max, 'Pluie', [], { secondaryCategory: 'animals' })

    expect((await sort(first.id, 'animals')).status).toBe(204)
    expect((await sort(second.id, 'animals')).status).toBe(204)

    expect(await readProject(first.id)).toMatchObject({
      primaryCategory: 'animals',
      secondaryCategory: null,
    })
    expect(await readProject(second.id)).toMatchObject({
      primaryCategory: 'animals',
      secondaryCategory: null,
    })
  })

  it('refuses a project that is not filed under « other », and changes nothing', async () => {
    const project = await publish(lea, 'Mon chat', [], {
      primaryCategory: 'cooking',
      secondaryCategory: 'animals',
    })

    await expectError(await sort(project.id, 'science'), 409, 'already_decided')

    expect(await readProject(project.id)).toMatchObject({
      primaryCategory: 'cooking',
      secondaryCategory: 'animals',
    })
    expect(await journalInBase()).toEqual([])
  })

  it('refuses « other » itself and an unknown category', async () => {
    const project = await publish(lea, 'Mon chat')

    expect((await sort(project.id, OTHER_CATEGORY)).status).toBe(400)
    await expectError(await sort(project.id, 'gardening'), 400, 'unknown_category')
    await expectError(await sort(project.id, 'Pas un code'), 400, 'validation')

    expect((await readProject(project.id)).primaryCategory).toBe(OTHER_CATEGORY)
    expect(await journalInBase()).toEqual([])
  })

  it('refuses to let an administrator sort her own project', async () => {
    const own = await publish(louis, 'Le projet de Louis')

    await expectError(await sort(own.id, 'animals'), 403, 'own_project')

    expect((await readProject(own.id)).primaryCategory).toBe(OTHER_CATEGORY)
    expect(await journalInBase()).toEqual([])
    // Le message est traduit (anglais pour un visiteur anglophone).
    later()
    const english = await ctx.request(`/v1/moderation/projects/${own.id}/category`, {
      method: 'POST',
      headers: { cookie: louis, 'content-type': 'application/json', 'accept-language': 'en' },
      body: JSON.stringify({ category: 'animals' }),
    })
    const french = await sort(own.id, 'animals')
    expect(ErrorResponse.parse(await english.json()).error.message).not.toBe(
      ErrorResponse.parse(await french.json()).error.message,
    )
  })

  it('answers the same 404 to recategorize a private, a removed and an unknown project', async () => {
    const hidden = await publish(lea, 'Brouillon', [], { visibility: 'private' })
    const removed = await publish(max, 'Pub')
    await removeProject(removed.id)
    const reference = await sort(UNKNOWN, 'animals')
    const body = await reference.text()

    expect(reference.status).toBe(404)
    for (const id of [hidden.id, removed.id, 'pas-un-uuid']) {
      const res = await sort(id, 'animals')
      expect(res.status, id).toBe(404)
      expect(await res.text(), id).toBe(body)
    }
    expect((await readProject(hidden.id, lea)).primaryCategory).toBe(OTHER_CATEGORY)
    expect(await journalInBase()).toEqual([])
    // Témoin : un projet public classé « Autre » se range.
    expect((await sort((await publish(zoe, 'Tri')).id, 'animals')).status).toBe(204)
  })

  it('sorts the project of a member who blocked the administrator', async () => {
    const project = await publish(max, 'Pluie')
    later()
    await act.block(louisId, max)

    expect((await sort(project.id, 'animals')).status).toBe(204)
    expect((await readProject(project.id, zoe)).primaryCategory).toBe('animals')
  })
})

// ─── Créer une catégorie ─────────────────────────────────────────────────────────────────────────

describe('creating a category', () => {
  const create = (body: object) => write('POST', '/v1/moderation/categories', louis, body)
  const jardinage = { nameFr: 'Jardinage', nameEn: 'Gardening', icon: 'flower' }

  it('creates it from the French name, just before « other », in both languages', async () => {
    const res = await create(jardinage)

    expect(res.status).toBe(201)
    expect(Category.parse(await res.json())).toEqual({
      code: 'jardinage',
      name: 'Jardinage',
      icon: 'flower',
      projectCount: 0,
    })
    const list = await categories()
    expect(list).toHaveLength(17)
    expect(list.map((c) => c.code).slice(-2)).toEqual(['jardinage', OTHER_CATEGORY])
    const english = CategoryList.parse(
      await (
        await ctx.request('/v1/categories', { headers: { cookie: zoe, 'accept-language': 'en' } })
      ).json(),
    )
    expect(english.categories.find((c) => c.code === 'jardinage')?.name).toBe('Gardening')
    // Elle sert tout de suite à publier et à ranger.
    const project = await publish(lea, 'Potager', [], { primaryCategory: 'jardinage' })
    expect(project.primaryCategory).toBe('jardinage')
  })

  it('places a second new category before « other » too', async () => {
    expect((await create(jardinage)).status).toBe(201)
    expect((await create({ nameFr: 'Bricolage', nameEn: 'DIY', icon: 'house' })).status).toBe(201)

    expect((await categories()).map((c) => c.code).slice(-3)).toEqual([
      'jardinage',
      'bricolage',
      OTHER_CATEGORY,
    ])
  })

  it('refuses a name already taken, in French or in English, accents and capitals aside', async () => {
    for (const body of [
      { ...jardinage, nameFr: 'CUISINE' },
      { ...jardinage, nameFr: 'Animaux', nameEn: 'Pets' },
      { ...jardinage, nameFr: 'Cuisines du monde', nameEn: 'cooking' },
    ]) {
      await expectError(await create(body), 409, 'category_name_taken')
    }
    expect(await categories()).toHaveLength(16)
    expect(await journalInBase()).toEqual([])
    // Le même nom deux fois : la seconde est refusée.
    expect((await create(jardinage)).status).toBe(201)
    await expectError(await create({ ...jardinage, nameEn: 'Garden' }), 409, 'category_name_taken')
  })

  it('creates a valid code from a non-Latin French name, and refuses the code other', async () => {
    const res = await create({ nameFr: 'Ракеты', nameEn: 'Rockets', icon: 'sparkle' })

    expect(res.status).toBe(201)
    const created = Category.parse(await res.json())
    expect(CategoryCode.safeParse(created.code).success).toBe(true)
    expect(created.code).not.toBe('')
    expect(created.code).not.toBe(OTHER_CATEGORY)
    // Un nom dont le code serait « other » : refusé, la catégorie « Autre » reste la seule.
    await expectError(
      await create({ nameFr: 'Other', nameEn: 'Odds and ends', icon: 'shapes' }),
      409,
      'category_name_taken',
    )
    expect((await categories()).filter((c) => c.code === OTHER_CATEGORY)).toHaveLength(1)
  })

  it('refuses an icon out of the list and a name of 31 characters', async () => {
    for (const body of [
      { ...jardinage, icon: 'skull' },
      { ...jardinage, nameFr: 'a'.repeat(31) },
      { ...jardinage, code: 'jardinage' },
    ]) {
      await expectError(await create(body), 400, 'validation')
    }
    expect(await categories()).toHaveLength(16)
  })
})

// ─── « Changements récents » ─────────────────────────────────────────────────────────────────────

describe('the catalogue journal', () => {
  it('keeps one line per write, newest first: who, when, what', async () => {
    const chat = await publish(lea, 'Mon chat qui parle', ['Scratch', 'Make.com', 'Bidule'])
    const scratch = await pendingSlug('Scratch')
    const makeCom = await pendingSlug('Make.com')
    const bidule = await pendingSlug('Bidule')

    expect((await write('POST', '/v1/moderation/tools', louis, teachable)).status).toBe(201)
    expect(
      (
        await write('POST', `/v1/moderation/tools/${scratch}/admit`, louis, {
          ...teachable,
          name: 'Scratch',
        })
      ).status,
    ).toBe(200)
    expect(
      (await write('PATCH', '/v1/moderation/tools/claude', louis, { family: 'development' }))
        .status,
    ).toBe(200)
    expect(
      (await write('POST', `/v1/moderation/tools/${makeCom}/merge`, louis, { into: 'make' }))
        .status,
    ).toBe(204)
    expect((await write('POST', `/v1/moderation/tools/${bidule}/dismiss`, louis)).status).toBe(204)
    expect(
      (
        await write('POST', '/v1/moderation/categories', louis, {
          nameFr: 'Jardinage',
          nameEn: 'Gardening',
          icon: 'flower',
        })
      ).status,
    ).toBe(201)
    expect(
      (
        await write('POST', `/v1/moderation/projects/${chat.id}/category`, louis, {
          category: 'animals',
        })
      ).status,
    ).toBe(204)
    // Un refus n'écrit rien.
    expect(
      (await write('POST', '/v1/moderation/tools', louis, { ...teachable, name: 'Claude' })).status,
    ).toBe(409)

    const page = await changes()

    expect(page.items.map((line) => line.action)).toEqual([
      'project_recategorize',
      'category_create',
      'tool_dismiss',
      'tool_merge',
      'tool_edit',
      'tool_admit',
      'tool_create',
    ])
    expect(page.nextCursor).toBeNull()
    for (const line of page.items) expect(line.admin).toMatchObject({ name: 'Louis' })
    const [recategorize, category, , merge, edit, admit, create] = page.items
    expect(recategorize).toMatchObject({
      project: { id: chat.id, title: 'Mon chat qui parle' },
      category: { code: 'animals' },
      fromCategory: 'other',
      tool: null,
    })
    expect(category).toMatchObject({
      category: { code: 'jardinage', name: 'Jardinage' },
      project: null,
    })
    expect(merge).toMatchObject({ tool: { slug: 'make', name: 'Make' }, mergedName: 'Make.com' })
    expect(edit).toMatchObject({ tool: { slug: 'claude', name: 'Claude' }, mergedName: null })
    expect(admit?.tool?.name).toBe('Scratch')
    expect(create?.tool?.name).toBe('Teachable Machine')
    // Les dates suivent l'ordre des gestes.
    const times = page.items.map((line) => Date.parse(line.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('renders the project of a catalogue change as null once the project is private or removed', async () => {
    const hidden = await publish(lea, 'Mon chat qui parle')
    const removed = await publish(max, 'Pluie de Max')
    for (const project of [hidden, removed]) {
      expect(
        (
          await write('POST', `/v1/moderation/projects/${project.id}/category`, louis, {
            category: 'animals',
          })
        ).status,
      ).toBe(204)
    }
    expect((await changes()).items.map((line) => line.project?.id)).toEqual([removed.id, hidden.id])

    later()
    await act.setVisibility(hidden.id, lea, 'private')
    await removeProject(removed.id)

    const page = await changes()
    expect(page.items.map((line) => line.project)).toEqual([null, null])
    // Le reste de la ligne demeure : qui, quand, quelle catégorie.
    expect(page.items.map((line) => line.category?.code)).toEqual(['animals', 'animals'])
    expect(page.items.map((line) => line.action)).toEqual([
      'project_recategorize',
      'project_recategorize',
    ])
  })

  it('hides from the catalogue journal the title of a project that has since become private or been removed', async () => {
    const hidden = await publish(lea, 'Le carnet secret de Léa')
    const removed = await publish(max, 'La pub de Max')
    const shown = await publish(zoe, 'Le tri de Zoé')
    for (const project of [hidden, removed, shown]) {
      await write('POST', `/v1/moderation/projects/${project.id}/category`, louis, {
        category: 'animals',
      })
    }
    later()
    await act.setVisibility(hidden.id, lea, 'private')
    await removeProject(removed.id)

    const res = await act.send('GET', '/v1/moderation/catalogue-changes', louis)
    const raw = await res.text()

    expect(res.status).toBe(200)
    expect(raw).toContain('Le tri de Zoé')
    for (const leak of ['Le carnet secret de Léa', 'La pub de Max', hidden.id, removed.id]) {
      expect(raw, leak).not.toContain(leak)
    }
  })

  it('names no administrator whose account is gone', async () => {
    await act.makeAdmin(zoeId)
    expect((await write('POST', '/v1/moderation/tools', zoe, teachable)).status).toBe(201)

    later()
    await act.deleteAccount(zoe, 'zoe-long-pw-1')

    const [line] = (await changes()).items
    expect(line).toMatchObject({
      action: 'tool_create',
      admin: null,
      tool: { name: 'Teachable Machine' },
    })
  })
})

// ─── L'export du membre (jur-T4) ─────────────────────────────────────────────────────────────────

describe('the export of a member whose project was sorted', () => {
  const exportOf = async (cookie: string) => {
    const res = await act.send('GET', '/v1/me/export', cookie)
    expect(res.status).toBe(200)
    const raw = await res.text()
    return { raw, data: AccountExport.parse(JSON.parse(raw)) }
  }

  it("lists in the export the category changes made to the member's projects, without the administrator", async () => {
    const first = await publish(lea, 'Mon chat qui parle')
    const second = await publish(lea, 'Tri', [], {
      primaryCategory: 'cooking',
      secondaryCategory: 'other',
    })
    await publish(max, 'Pluie de Max')
    later()
    const sortedAt = new Date(Date.now() + SECOND).toISOString()
    await write('POST', `/v1/moderation/projects/${first.id}/category`, louis, {
      category: 'animals',
    })
    later(HOUR)
    await write('POST', `/v1/moderation/projects/${second.id}/category`, louis, {
      category: 'science',
    })

    const { raw, data } = await exportOf(lea)

    expect(data.categoryChanges).toEqual([
      { projectId: first.id, from: 'other', to: 'animals', at: sortedAt },
      { projectId: second.id, from: 'other', to: 'science', at: expect.any(String) },
    ])
    for (const leak of ['"name":"Louis"', louisId, 'louis@example.com']) {
      expect(raw, leak).not.toContain(leak)
    }
    // Rien chez Max, dont le projet n'a pas été rangé.
    expect((await exportOf(max)).data.categoryChanges).toEqual([])
  })

  it('keeps the change in the export after the project became private', async () => {
    const project = await publish(lea, 'Mon chat qui parle')
    await write('POST', `/v1/moderation/projects/${project.id}/category`, louis, {
      category: 'animals',
    })
    later()
    await act.setVisibility(project.id, lea, 'private')

    expect((await exportOf(lea)).data.categoryChanges.map((change) => change.projectId)).toEqual([
      project.id,
    ])
  })
})
