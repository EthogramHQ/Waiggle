// Tests d'intégration de la tranche 3a : publier, lire, modifier et supprimer un projet.
// Scénarios : docs/scenarios/phase-1.md, tranche 3. Deux membres : Léa (l'autrice) et Max.
import {
  AccountExport,
  Comment,
  DiscoverFeedPage,
  ErrorResponse,
  foldTool,
  Me,
  Member,
  type NewProjectUpdate,
  OTHER_TOOLS_PER_DAY,
  PROJECT_TOOLS_MAX,
  Project,
  type ProjectSummary,
  ProjectUpdate,
  SearchResults,
  startedMonthMax,
  TesterMedia,
  ToolPage,
  toolSlug,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let lea: string // cookie de session de Léa
let max: string // cookie de session de Max

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

beforeEach(async () => {
  ctx = await createTestContext()
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
})

afterEach(async () => {
  await ctx.close()
})

const recipes = {
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  primaryCategory: 'cooking',
}

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

/** Léa publie un projet et renvoie ce que l'API a répondu. */
const publish = async (body: object = recipes, cookie = lea) => {
  const res = await send('POST', '/v1/projects', cookie, body)
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

const read = (id: string, cookie: string | null) => send('GET', `/v1/projects/${id}`, cookie)

describe('publishing a project', () => {
  it('only needs a title, a pitch and a category, and starts as a public idea without demo', async () => {
    const project = await publish()

    expect(project).toMatchObject({
      ...recipes,
      description: '',
      status: 'idea',
      visibility: 'public',
      demoUrl: null,
      tools: [],
      prompts: [],
      isMine: true,
      author: { name: 'Léa', avatarUrl: null },
    })
  })

  it('saves the whole recipe, with each tool turned into a tag', async () => {
    const project = await publish({
      ...recipes,
      description: '## Comment ça marche\n\nOn **photographie** le frigo.',
      status: 'testable',
      demoUrl: 'https://recettes.example.com',
      tools: ['Claude Code', 'claude-code', 'Éclair 2.0'],
      prompts: ['Propose trois recettes avec : {ingrédients}'],
    })

    expect(project).toMatchObject({
      status: 'testable',
      demoUrl: 'https://recettes.example.com/', // enregistrée sous sa forme standard
      // « claude-code » est le même outil que « Claude Code » : gardé une seule fois. R6b :
      // « Éclair 2.0 » n'est pas au catalogue, il devient un « Autre » (texte simple, sans page).
      tools: [
        { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
        { label: 'Éclair 2.0', slug: 'eclair-2-0', inCatalogue: false },
      ],
      prompts: ['Propose trois recettes avec : {ingrédients}'],
    })
  })

  it('accepts the longest description, even written with accented letters', async () => {
    // 10 000 « é » : 20 000 octets, plus que la limite de 16 Ko des petites requêtes.
    const project = await publish({ ...recipes, description: 'é'.repeat(10_000) })

    expect(project.description).toHaveLength(10_000)
  })

  it('stores a demo link in another alphabet under its real form, never as a look-alike', async () => {
    // « аpple.com » avec un « а » cyrillique ressemble à apple.com : on garde la forme « xn-- ».
    const project = await publish({ ...recipes, demoUrl: 'https://\u0430pple.com/login' })

    expect(project.demoUrl).toBe('https://xn--pple-43d.com/login')
  })

  it('refuses a request larger than 256 KB, while the profile keeps its 16 KB limit', async () => {
    const big = JSON.stringify({ ...recipes, description: 'a'.repeat(300 * 1024) })
    const medium = JSON.stringify({ bio: 'a'.repeat(20 * 1024) })
    const post = (path: string, method: string, body: string) =>
      ctx.request(path, {
        method,
        headers: { cookie: lea, 'content-type': 'application/json' },
        body,
      })

    expect((await post('/v1/projects', 'POST', big)).status).toBe(413)
    expect((await post('/v1/me', 'PATCH', medium)).status).toBe(413)
  })

  it('refuses a demo link that is not a public https address', async () => {
    for (const demoUrl of [
      'http://recettes.example.net',
      'https://192.168.1.10',
      'https://nas.local',
    ]) {
      const res = await send('POST', '/v1/projects', lea, { ...recipes, demoUrl })
      expect(res.status, demoUrl).toBe(400)
    }
  })

  it('cannot be published in the name of someone else', async () => {
    const res = await send('POST', '/v1/projects', lea, { ...recipes, authorId: 'max' })

    expect(res.status).toBe(400)
  })

  it('is only for signed-in members', async () => {
    const res = await send('POST', '/v1/projects', null, recipes)

    expect(res.status).toBe(401)
  })

  it('cannot be triggered from another website', async () => {
    const res = await ctx.request('/v1/projects', {
      method: 'POST',
      headers: { cookie: lea, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(recipes),
    })

    expect(res.status).toBe(403)
  })

  it('blocks a 21st project within a day', async () => {
    for (let i = 0; i < 20; i++) await publish({ ...recipes, title: `Projet ${i}` })

    const res = await send('POST', '/v1/projects', lea, recipes)

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('counts even malformed requests in the daily limit', async () => {
    // Le quota passe avant tout examen de la demande (audit du 25/10/2026, C7) : sinon, des
    // demandes mal écrites feraient travailler le serveur sans jamais compter.
    for (let i = 0; i < 20; i++)
      expect((await send('POST', '/v1/projects', lea, {})).status).toBe(400)

    // La 21e demande du jour, même valide, est refusée.
    expect((await send('POST', '/v1/projects', lea, recipes)).status).toBe(429)
  })
})

describe('reading a project', () => {
  it('shows a public project to another member', async () => {
    const { id } = await publish()

    const res = await read(id, max)

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json())).toMatchObject({ id, isMine: false })
  })

  it('hides a private project from other members, even with its direct link', async () => {
    const { id } = await publish({ ...recipes, visibility: 'private' })

    const res = await read(id, max)

    expect(res.status).toBe(404)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('not_found')
  })

  it('shows a private project to its author', async () => {
    const { id } = await publish({ ...recipes, visibility: 'private' })

    expect((await read(id, lea)).status).toBe(200)
  })

  it('shows nothing to a visitor without an account', async () => {
    const { id } = await publish()

    expect((await read(id, null)).status).toBe(401)
  })

  it('answers « not found » for an unknown or malformed address', async () => {
    expect((await read('00000000-0000-4000-8000-000000000000', max)).status).toBe(404)
    expect((await read('pas-un-identifiant', max)).status).toBe(404)
  })

  it('is never kept in a cache along the way', async () => {
    const { id } = await publish()

    expect((await read(id, max)).headers.get('cache-control')).toBe('no-store')
  })
})

describe('changing a project', () => {
  it('lets the author change any field', async () => {
    const { id } = await publish()

    const res = await send('PATCH', `/v1/projects/${id}`, lea, {
      status: 'testable',
      demoUrl: 'https://recettes.example.com',
      visibility: 'private',
    })

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json())).toMatchObject({
      title: recipes.title, // non envoyé : inchangé
      status: 'testable',
      demoUrl: 'https://recettes.example.com/',
      visibility: 'private',
    })
  })

  it('lets the author remove the demo link', async () => {
    const { id } = await publish({ ...recipes, demoUrl: 'https://recettes.example.com' })

    const res = await send('PATCH', `/v1/projects/${id}`, lea, { demoUrl: null })

    expect(Project.parse(await res.json()).demoUrl).toBeNull()
  })

  it('cannot hand the project over to someone else, nor change its identifier', async () => {
    const { id } = await publish()

    for (const body of [
      { authorId: 'max' },
      { id: crypto.randomUUID() },
      { createdAt: '2020-01-01' },
    ]) {
      expect((await send('PATCH', `/v1/projects/${id}`, lea, body)).status).toBe(400)
    }
  })

  it('hides a project from the others as soon as it becomes private', async () => {
    const { id } = await publish()
    expect((await read(id, max)).status).toBe(200)

    await send('PATCH', `/v1/projects/${id}`, lea, { visibility: 'private' })

    expect((await read(id, max)).status).toBe(404)
  })

  it('refuses changes from another member', async () => {
    const { id } = await publish()

    const res = await send('PATCH', `/v1/projects/${id}`, max, { title: 'Piraté' })

    expect(res.status).toBe(403)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('forbidden')
    expect(Project.parse(await (await read(id, lea)).json()).title).toBe(recipes.title)
  })

  it('does not even reveal a private project to another member who tries to change it', async () => {
    const { id } = await publish({ ...recipes, visibility: 'private' })

    expect((await send('PATCH', `/v1/projects/${id}`, max, { title: 'x' })).status).toBe(404)
    expect((await send('DELETE', `/v1/projects/${id}`, max)).status).toBe(404)
  })

  it('blocks a 61st change within an hour', async () => {
    const { id } = await publish()
    for (let i = 0; i < 60; i++) {
      expect(
        (await send('PATCH', `/v1/projects/${id}`, lea, { pitch: `Version ${i}` })).status,
      ).toBe(200)
    }

    expect((await send('PATCH', `/v1/projects/${id}`, lea, { pitch: 'De trop' })).status).toBe(429)
  })

  it('counts even malformed requests in the hourly limit', async () => {
    const { id } = await publish()
    for (let i = 0; i < 60; i++) {
      expect((await send('PATCH', `/v1/projects/${id}`, lea, { authorId: 'max' })).status).toBe(400)
    }

    // La 61e demande de l'heure, même valide, est refusée.
    expect((await send('PATCH', `/v1/projects/${id}`, lea, { pitch: 'Valide' })).status).toBe(429)
  })

  it('is only for signed-in members', async () => {
    const { id } = await publish()

    const res = await send('PATCH', `/v1/projects/${id}`, null, { title: 'Anonyme' })

    expect(res.status).toBe(401)
    expect(Project.parse(await (await read(id, lea)).json()).title).toBe(recipes.title)
    // Témoin : la même demande, avec la session de l'autrice, passe.
    expect((await send('PATCH', `/v1/projects/${id}`, lea, { title: 'Signé' })).status).toBe(200)
  })
})

describe('deleting a project', () => {
  it('deletes it for good', async () => {
    const { id } = await publish()

    const res = await send('DELETE', `/v1/projects/${id}`, lea)

    expect(res.status).toBe(204)
    expect((await read(id, lea)).status).toBe(404)
  })

  it('refuses a deletion by another member', async () => {
    const { id } = await publish()

    const res = await send('DELETE', `/v1/projects/${id}`, max)

    expect(res.status).toBe(403)
    expect((await read(id, lea)).status).toBe(200)
  })

  it('is only for signed-in members', async () => {
    const { id } = await publish()

    const res = await send('DELETE', `/v1/projects/${id}`, null)

    expect(res.status).toBe(401)
    expect((await read(id, lea)).status).toBe(200)
    // Témoin : la même demande, avec la session de l'autrice, efface le projet.
    expect((await send('DELETE', `/v1/projects/${id}`, lea)).status).toBe(204)
  })
})

// Audit de sécurité du 25/10/2026, C13 : un blocage, dans un sens ou dans l'autre, cache le projet
// (blocks/visibility.ts). Modifier ou supprimer le projet de l'autre répond donc « introuvable »,
// mot pour mot comme un projet qui n'existe pas, et ne change rien.
describe('changing or deleting a project across a block', () => {
  /** L'identifiant d'un membre, lu dans « Mon profil ». */
  const idOf = async (cookie: string) =>
    Me.parse(await (await send('GET', '/v1/me', cookie)).json()).id

  it.each([
    ['the author blocked the member', 'author'],
    ['the member blocked the author', 'member'],
  ] as const)('answers « not found » and changes nothing when %s', async (_, blocker) => {
    const { id } = await publish()
    // Témoin : sans blocage, Max voit le projet public de Léa ; il est seulement « refusé ».
    expect((await send('PATCH', `/v1/projects/${id}`, max, { title: 'Piraté' })).status).toBe(403)
    expect((await send('DELETE', `/v1/projects/${id}`, max)).status).toBe(403)

    if (blocker === 'author') await activity(ctx).block(await idOf(max), lea)
    else await activity(ctx).block(await idOf(lea), max)

    const unknown = crypto.randomUUID()
    for (const [method, body] of [
      ['PATCH', { title: 'Piraté' }],
      ['DELETE', undefined],
    ] as const) {
      const res = await send(method, `/v1/projects/${id}`, max, body)
      const reference = await send(method, `/v1/projects/${unknown}`, max, body)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(await reference.json())
    }
    // Le projet est toujours là, avec son titre.
    expect(Project.parse(await (await read(id, lea)).json()).title).toBe(recipes.title)
  })
})

describe('my data and my account', () => {
  it('exports all my projects, private ones included, and nobody else’s', async () => {
    await publish({ ...recipes, visibility: 'private' })
    await publish({ ...recipes, title: 'Projet de Max' }, max)

    const data = AccountExport.parse(await (await send('GET', '/v1/me/export', lea)).json())

    expect(data.projects.map((p) => p.title)).toEqual([recipes.title])
  })

  it('exports the members and projects I follow, with their date only, and not my followers', async () => {
    const maxId = Me.parse(await (await send('GET', '/v1/me', max)).json()).id
    const followed = await publish({ ...recipes, title: 'Projet de Max' }, max)
    const mine = await publish()
    // Léa suit Max et son projet ; Max suit le projet de Léa (cela ne regarde pas l'export de Léa).
    expect((await send('POST', `/v1/members/${maxId}/follow`, lea)).status).toBe(204)
    expect((await send('POST', `/v1/projects/${followed.id}/follow`, lea)).status).toBe(204)
    expect((await send('POST', `/v1/projects/${mine.id}/follow`, max)).status).toBe(204)

    const raw = await (await send('GET', '/v1/me/export', lea)).text()
    const data = AccountExport.parse(JSON.parse(raw))

    expect(data.follows.members).toEqual([{ id: maxId, followedAt: expect.any(String) }])
    expect(data.follows.projects).toEqual([{ id: followed.id, followedAt: expect.any(String) }])
    // Seulement l'identifiant et la date : ni le titre du projet suivi, ni le nom ou l'adresse de Max.
    for (const entry of [...data.follows.members, ...data.follows.projects]) {
      expect(Object.keys(entry).sort()).toEqual(['followedAt', 'id'])
    }
    expect(raw).not.toContain('Projet de Max')
    expect(raw).not.toContain('max@example.com')
  })

  it('leaves out a followed project gone private, as if it were deleted', async () => {
    const followed = await publish({ ...recipes, title: 'Projet de Max' }, max)
    expect((await send('POST', `/v1/projects/${followed.id}/follow`, lea)).status).toBe(204)
    expect(
      (await send('PATCH', `/v1/projects/${followed.id}`, max, { visibility: 'private' })).status,
    ).toBe(200)

    const raw = await (await send('GET', '/v1/me/export', lea)).text()

    // L'abonnement existe encore en base, mais l'export n'en dit rien : il ne trahit pas le projet.
    expect(AccountExport.parse(JSON.parse(raw)).follows.projects).toEqual([])
    expect(raw).not.toContain(followed.id)
  })

  it('exports no follow at all for a member who follows nobody', async () => {
    const mine = await publish()
    expect((await send('POST', `/v1/projects/${mine.id}/follow`, max)).status).toBe(204)
    const maxId = Me.parse(await (await send('GET', '/v1/me', max)).json()).id

    const raw = await (await send('GET', '/v1/me/export', lea)).text()

    // Ses abonnés ne font pas partie de ses données : Max n'apparaît nulle part.
    expect(AccountExport.parse(JSON.parse(raw)).follows).toEqual({ members: [], projects: [] })
    expect(raw).not.toContain(maxId)
  })

  it('deletes my projects together with my account', async () => {
    await publish()

    await send('POST', '/api/auth/delete-user', lea, { password: leaAccount.password })

    expect(await ctx.db.select().from(schema.project)).toHaveLength(0)
  })
})

// --- R7a : les mises à jour dans l'export et sur la page du projet ---
// Les mises à jour remplacent les notes du Journal, effacées avec lui (migration 0018). L'export
// donne toutes celles publiées sur ses projets (privés compris, et au-delà des 20 d'une page de la
// frise), des plus anciennes aux plus récentes, avec le titre du projet et les descriptions de leurs
// photos ; aucune mise à jour des autres membres. La page d'un projet porte la dernière mise à jour
// visible, leur nombre et la version (relecture de sécurité B4 : jamais celle d'une mise à jour
// retirée, une seule règle « non retirée, ou l'auteur »).

/** Une mise à jour publiée par Léa (une ligne « Nouveau » par défaut). */
const postUpdate = async (
  projectId: string,
  body: Partial<NewProjectUpdate> = {},
  cookie: string = lea,
) => {
  const res = await send('POST', `/v1/projects/${projectId}/updates`, cookie, {
    title: null,
    version: null,
    lines: [{ family: 'new', text: 'Un mode sombre' }],
    photos: [],
    beforeAfter: false,
    ...body,
  })
  expect(res.status).toBe(201)
  return ProjectUpdate.parse(await res.json())
}

/** Les photos de mise à jour d'un projet, en attente ou rattachées, lues en base. */
const updatePhotosOf = (projectId: string) =>
  rows<{ id: string; storage_key: string }>(
    sql`select id, storage_key from project_media where project_id = ${projectId} and slot = 'update'`,
  )

/**
 * Envoie une photo « en attente » pour une mise à jour (POST …/visuals avec slot=update). Son
 * identifiant est lu en base : le test ne dépend pas de la forme de la réponse.
 */
const uploadPending = async (projectId: string, cookie: string = lea) => {
  const before = new Set((await updatePhotosOf(projectId)).map((photo) => photo.id))
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(800, 600), 'update'),
  })
  expect(res.status).toBe(201)
  const [photo, ...more] = (await updatePhotosOf(projectId)).filter((p) => !before.has(p.id))
  expect(more).toEqual([])
  if (!photo) throw new Error('no pending photo stored')
  return photo
}

/** Un administrateur (Louis) retire une mise à jour signalée par Max. */
const removeUpdate = async (updateId: string) => {
  const act = activity(ctx)
  const admin = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  await act.makeAdmin((await act.me(admin)).id)
  const target = { kind: 'update', id: updateId } as const
  await act.report(max, target)
  await act.decide(admin, {
    action: 'remove',
    target,
    ground: 'rules',
    explanation: 'Une publicité déguisée.',
  })
}

describe('my updates in my data (R7a)', () => {
  // Une fausse horloge, qu'on avance entre deux mises à jour : leurs dates sont distinctes, donc
  // leur ordre est connu. Seule Date est remplacée (voir feed.test.ts).
  beforeEach(() => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Avance l'horloge (une minute par défaut) avant de publier. */
  const later = (ms = 60 * 1000) => vi.setSystemTime(Date.now() + ms)

  it('exports the updates of all my projects, private ones included, oldest first, and nobody else’s', async () => {
    const mine = await publish()
    const draft = await publish({ ...recipes, title: 'Mon brouillon', visibility: 'private' })
    const maxProject = await publish({ ...recipes, title: 'Projet de Max' }, max)
    later()
    const first = await postUpdate(mine.id, {
      title: 'Première version',
      version: 'v1.0',
      lines: [
        { family: 'new', text: 'Les menus de la semaine' },
        { family: 'fixed', text: 'Les quantités pour deux' },
      ],
    })
    later()
    const secret = await postUpdate(draft.id, {
      lines: [{ family: 'polish', text: 'Une idée encore secrète' }],
    })
    later()
    await postUpdate(maxProject.id, { lines: [{ family: 'new', text: 'Mise à jour de Max' }] }, max)

    const raw = await (await send('GET', '/v1/me/export', lea)).text()
    const data = AccountExport.parse(JSON.parse(raw))

    expect(data.updates).toEqual([
      {
        projectId: mine.id,
        projectTitle: recipes.title,
        id: first.id,
        title: 'Première version',
        version: 'v1.0',
        lines: [
          { family: 'new', text: 'Les menus de la semaine' },
          { family: 'fixed', text: 'Les quantités pour deux' },
        ],
        beforeAfter: false,
        photoDescriptions: [],
        createdAt: first.createdAt,
        removal: null,
      },
      {
        projectId: draft.id,
        projectTitle: 'Mon brouillon',
        id: secret.id,
        title: null,
        version: null,
        lines: [{ family: 'polish', text: 'Une idée encore secrète' }],
        beforeAfter: false,
        photoDescriptions: [],
        createdAt: secret.createdAt,
        removal: null,
      },
    ])
    expect(raw).not.toContain('Mise à jour de Max')
    expect(raw).not.toContain('Projet de Max')
  })

  it('exports the descriptions of the photos of my updates, in their order', async () => {
    const { id } = await publish()
    const before = await uploadPending(id)
    const after = await uploadPending(id)
    later()
    await postUpdate(id, {
      photos: [
        { id: before.id, description: 'Le menu, avant' },
        { id: after.id, description: null },
      ],
      beforeAfter: true,
    })

    const data = AccountExport.parse(await (await send('GET', '/v1/me/export', lea)).json())

    expect(data.updates).toMatchObject([
      { beforeAfter: true, photoDescriptions: ['Le menu, avant', null] },
    ])
  })

  it('exports every update, beyond the 20 shown on a page of the timeline', async () => {
    const { id } = await publish()
    const texts: string[] = []
    // Trois heures entre deux mises à jour : jamais plus de 10 en 24 heures (le quota).
    for (let i = 1; i <= 22; i++) {
      later(3 * 60 * 60 * 1000)
      const text = `Changement ${i}`
      await postUpdate(id, { lines: [{ family: 'new', text }] })
      texts.push(text)
    }
    // Une session dure 7 jours : 66 heures plus tard, Léa est toujours connectée.
    const data = AccountExport.parse(await (await send('GET', '/v1/me/export', lea)).json())

    expect(data.updates.map((update) => update.lines[0]?.text)).toEqual(texts)
  })

  it('does not export the updates of the projects I follow or test', async () => {
    const followed = await publish(
      {
        ...recipes,
        title: 'Projet de Max',
        status: 'testable',
        demoUrl: 'https://example.com/demo',
      },
      max,
    )
    expect((await send('POST', `/v1/projects/${followed.id}/follow`, lea)).status).toBe(204)
    expect((await send('POST', `/v1/projects/${followed.id}/testers`, lea)).status).toBe(204)
    later()
    await postUpdate(followed.id, { lines: [{ family: 'new', text: 'Mise à jour de Max' }] }, max)

    const raw = await (await send('GET', '/v1/me/export', lea)).text()

    expect(AccountExport.parse(JSON.parse(raw)).updates).toEqual([])
    expect(raw).not.toContain('Mise à jour de Max')
  })

  it('exports no update for a member who never wrote one', async () => {
    await publish()

    const data = AccountExport.parse(await (await send('GET', '/v1/me/export', lea)).json())

    expect(data.updates).toEqual([])
  })
})

describe('the latest update, the count and the version of a project (R7a)', () => {
  beforeEach(() => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const later = () => vi.setSystemTime(Date.now() + 60 * 1000)
  const readAs = async (id: string, cookie: string) => {
    const res = await read(id, cookie)
    expect(res.status).toBe(200)
    const raw = await res.text()
    return { raw, project: Project.parse(JSON.parse(raw)) }
  }

  it('gives no update, a count of zero and no version to a project without updates', async () => {
    const { id } = await publish()

    const { project } = await readAs(id, max)

    expect(project).toMatchObject({ latestUpdate: null, updateCount: 0, version: null })
  })

  it('gives the latest update, the number of updates and the version of the latest one that has one', async () => {
    const { id } = await publish()
    later()
    await postUpdate(id, { version: 'v1.0' })
    later()
    await postUpdate(id, { version: 'v1.1' })
    later()
    // La plus récente n'a pas de version : celle d'avant reste sous le titre.
    const latest = await postUpdate(id, {
      title: 'Le mode sombre',
      lines: [{ family: 'polish', text: 'Des couleurs plus douces' }],
    })

    for (const cookie of [max, lea]) {
      const { project } = await readAs(id, cookie)
      expect(project.latestUpdate).toEqual(latest)
      expect(project.updateCount).toBe(3)
      expect(project.version).toBe('v1.1')
    }
  })

  it('never shows the version of a removed update under the project title', async () => {
    const { id } = await publish()
    later()
    const kept = await postUpdate(id, { version: 'v1.1' })
    later()
    const removed = await postUpdate(id, { version: 'v1.2' })
    await removeUpdate(removed.id)

    const { raw, project } = await readAs(id, max)

    expect(project.version).toBe('v1.1')
    expect(project.latestUpdate?.id).toBe(kept.id)
    expect(project.updateCount).toBe(1)
    expect(raw).not.toContain('v1.2')
  })

  it('shows the author his removed update with its removal and counts it for him, but never its version', async () => {
    const { id } = await publish()
    later()
    await postUpdate(id, { version: 'v1.1' })
    later()
    const removed = await postUpdate(id, { version: 'v1.2' })
    await removeUpdate(removed.id)

    const { project } = await readAs(id, lea)

    expect(project.latestUpdate?.id).toBe(removed.id)
    expect(project.latestUpdate?.removal).toMatchObject({
      ground: 'rules',
      explanation: 'Une publicité déguisée.',
    })
    expect(project.updateCount).toBe(2)
    // La version sous le titre suit les cartes : jamais celle d'une mise à jour retirée.
    expect(project.version).toBe('v1.1')
  })

  it('never shows a removed update on a card, even to its author', async () => {
    const { id } = await publish()
    later()
    const kept = await postUpdate(id, { version: 'v1.1' })
    later()
    const removed = await postUpdate(id, { version: 'v1.2' })
    await removeUpdate(removed.id)

    for (const cookie of [lea, max]) {
      const res = await send('GET', '/v1/feed/discover', cookie)
      expect(res.status).toBe(200)
      const card = DiscoverFeedPage.parse(await res.json()).items.find(
        (item) => item.project.id === id,
      )?.project
      expect(card?.latestUpdate).toMatchObject({ id: kept.id, version: 'v1.1' })
      expect(card?.version).toBe('v1.1')
    }
  })
})

describe('erasing a project with its updates (R7a)', () => {
  it('erases the files of update photos and pending photos with the project', async () => {
    const { id } = await publish()
    const attached = await uploadPending(id)
    const pending = await uploadPending(id)
    await postUpdate(id, { photos: [{ id: attached.id, description: null }] })
    // Témoin : les deux fichiers sont bien dans le stockage avant la suppression.
    expect(ctx.storage.files.has(attached.storage_key)).toBe(true)
    expect(ctx.storage.files.has(pending.storage_key)).toBe(true)

    expect((await send('DELETE', `/v1/projects/${id}`, lea)).status).toBe(204)

    expect(ctx.storage.files.has(attached.storage_key)).toBe(false)
    expect(ctx.storage.files.has(pending.storage_key)).toBe(false)
    expect(await rows(sql`select id from project_update where project_id = ${id}`)).toEqual([])
  })
})

// R7b, scénario « Mes données » : les fils de ses testeurs disparaissent avec son projet. Les lignes
// du coin partent en cascade avec le projet ; leurs fichiers (photos d'appel, captures des
// testeurs, en attente comprises) doivent partir aussi, sinon ils resteraient sur le disque pour
// toujours, sans ligne pour les retrouver.
describe('erasing a project with its testers corner (R7b)', () => {
  /** Envoie une image du coin (photo d'appel de l'autrice, capture d'un testeur), en attente. */
  const uploadTesterImage = async (projectId: string, cookie: string, kind: 'call' | 'capture') => {
    const form = new FormData()
    form.append(
      'file',
      new File([new Uint8Array(await jpegImage(800, 600))], 'photo.jpg', { type: 'image/jpeg' }),
    )
    form.append('kind', kind)
    const res = await ctx.request(`/v1/projects/${projectId}/testers/media`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(res.status).toBe(201)
    return TesterMedia.parse(await res.json())
  }
  const testerFiles = () =>
    [...ctx.storage.files.keys()].filter((key) => key.startsWith('testers/'))

  it('erases the call photos and the tester captures with the project, pending ones included', async () => {
    const { id } = await publish({
      ...recipes,
      status: 'testable',
      demoUrl: 'https://example.com/demo',
    })
    expect((await send('POST', `/v1/projects/${id}/testers`, max)).status).toBe(204)
    const maxId = Me.parse(await (await send('GET', '/v1/me', max)).json()).id
    const photo = await uploadTesterImage(id, lea, 'call')
    expect(
      (
        await send('POST', `/v1/projects/${id}/calls`, lea, {
          text: 'Essayez le menu du dimanche.',
          photoId: photo.id,
          photoDescription: null,
        })
      ).status,
    ).toBe(201)
    await uploadTesterImage(id, lea, 'call') // en attente
    const capture = await uploadTesterImage(id, max, 'capture')
    expect(
      (
        await send('POST', `/v1/projects/${id}/threads/${maxId}/messages`, max, {
          kind: 'feedback',
          outcome: 'no',
          device: 'computer',
          text: 'Le menu reste vide.',
          captureId: capture.id,
        })
      ).status,
    ).toBe(201)
    await uploadTesterImage(id, max, 'capture') // en attente
    // Témoin : les quatre fichiers du coin sont dans le stockage avant la suppression.
    expect(testerFiles()).toHaveLength(4)

    expect((await send('DELETE', `/v1/projects/${id}`, lea)).status).toBe(204)

    expect(testerFiles()).toEqual([])
    expect(await rows(sql`select id from tester_media where project_id = ${id}`)).toEqual([])
    expect(await rows(sql`select id from tester_message where project_id = ${id}`)).toEqual([])
    expect(await rows(sql`select tester_id from tester_thread where project_id = ${id}`)).toEqual(
      [],
    )
  })
})

// --- Tranche 5 : les réactions et les commentaires dans l'export ---
// L'export donne les réactions du membre (projet, type, date) et ses commentaires (projet, texte,
// dates, commentaire auquel il répond), des plus anciens aux plus récents. Le projet n'est donné
// que par son identifiant : il appartient à un autre, et a pu devenir privé.
describe('my reactions and comments in my data', () => {
  // Une fausse horloge, qu'on avance d'une minute entre deux gestes : leurs dates sont distinctes,
  // donc leur ordre est connu. Seule Date est remplacée (voir feed.test.ts).
  beforeEach(() => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const later = () => vi.setSystemTime(Date.now() + 60 * 1000)

  /** Pose une réaction, une minute après ce qui précède, et renvoie sa date. */
  const react = async (projectId: string, kind: string, cookie = lea) => {
    later()
    const res = await send('PUT', `/v1/projects/${projectId}/reactions/${kind}`, cookie)
    expect(res.status).toBe(204)
    return new Date(Date.now()).toISOString()
  }

  /** Publie un commentaire (une réponse si `replyTo` est donné), une minute après ce qui précède. */
  const postComment = async (projectId: string, body: string, cookie = lea, replyTo?: string) => {
    later()
    const res = await send('POST', `/v1/projects/${projectId}/comments`, cookie, {
      body,
      ...(replyTo && { replyTo }),
    })
    expect(res.status).toBe(201)
    return Comment.parse(await res.json())
  }

  const exported = async () => {
    const raw = await (await send('GET', '/v1/me/export', lea)).text()
    return { raw, data: AccountExport.parse(JSON.parse(raw)) }
  }

  it('exports my reactions with the project, the kind and the date only, oldest first', async () => {
    const maxProject = await publish({ ...recipes, title: 'Projet de Max' }, max)
    const mine = await publish()
    const bravoAt = await react(maxProject.id, 'bravo')
    const usefulAt = await react(maxProject.id, 'useful')
    // Max réagit au projet de Léa : cela ne regarde pas l'export de Léa.
    await react(mine.id, 'funny', max)

    const { raw, data } = await exported()

    expect(data.reactions).toEqual([
      { projectId: maxProject.id, kind: 'bravo', createdAt: bravoAt },
      { projectId: maxProject.id, kind: 'useful', createdAt: usefulAt },
    ])
    expect(raw).not.toContain('Projet de Max')
  })

  it('exports my comments and replies, with their dates and the comment they answer, and nobody else’s', async () => {
    const maxProject = await publish({ ...recipes, title: 'Projet de Max' }, max)
    const fromMax = await postComment(maxProject.id, 'Commentaire de Max', max)
    const root = await postComment(maxProject.id, 'Mon avis sur le projet de Max')
    const reply = await postComment(maxProject.id, 'Ma réponse à Max', lea, fromMax.id)
    later()
    const edit = await send('PATCH', `/v1/projects/${maxProject.id}/comments/${root.id}`, lea, {
      body: 'Mon avis corrigé',
    })
    expect(edit.status).toBe(200)

    const { raw, data } = await exported()

    expect(data.comments).toEqual([
      {
        projectId: maxProject.id,
        id: root.id,
        replyTo: null,
        body: 'Mon avis corrigé',
        createdAt: root.createdAt,
        editedAt: new Date(Date.now()).toISOString(),
        hiddenAt: null,
        removal: null,
        mentions: [],
      },
      {
        projectId: maxProject.id,
        id: reply.id,
        replyTo: fromMax.id,
        body: 'Ma réponse à Max',
        createdAt: reply.createdAt,
        editedAt: null,
        hiddenAt: null,
        removal: null,
        mentions: [],
      },
    ])
    expect(raw).not.toContain('Commentaire de Max')
    expect(raw).not.toContain('Projet de Max')
  })

  it('never gives the title of a project I reacted to or commented, even gone private', async () => {
    const maxProject = await publish({ ...recipes, title: 'Projet secret de Max' }, max)
    await react(maxProject.id, 'bravo')
    await postComment(maxProject.id, 'Mon avis')
    const hidden = await send('PATCH', `/v1/projects/${maxProject.id}`, max, {
      visibility: 'private',
    })
    expect(hidden.status).toBe(200)

    const { raw } = await exported()

    expect(raw).not.toContain('Projet secret de Max')
    expect(raw).not.toContain('Un menu avec ce qu’il y a au frigo.')
  })

  it('leaves out a comment I deleted, even when its replies keep it as « deleted comment »', async () => {
    const maxProject = await publish({ ...recipes, title: 'Projet de Max' }, max)
    const answered = await postComment(maxProject.id, 'Un avis que je regrette')
    await postComment(maxProject.id, 'Réponse de Max', max, answered.id)
    const lone = await postComment(maxProject.id, 'Un autre avis supprimé')
    for (const id of [answered.id, lone.id]) {
      const res = await send('DELETE', `/v1/projects/${maxProject.id}/comments/${id}`, lea)
      expect(res.status).toBe(204)
    }

    const { raw, data } = await exported()

    expect(data.comments).toEqual([])
    expect(raw).not.toContain('Un avis que je regrette')
    expect(raw).not.toContain(answered.id)
  })

  it('exports no reaction and no comment for a member who never reacted nor commented', async () => {
    const mine = await publish()
    await postComment(mine.id, 'Avis de Max', max)
    await react(mine.id, 'bravo', max)

    const { data } = await exported()

    expect(data.reactions).toEqual([])
    expect(data.comments).toEqual([])
  })
})

// --- Tranche R6a : catégories, « Commencé en » et « Facile à refaire ? » ---
// Scénario : docs/scenarios/refonte.md, section R6a (« Catégorie et outils », « Commencé en » et
// « Facile à refaire ? », « Modifier ») ; relecture du plan : sec-M2, jur-J8, jur-J13.
// Les descriptions des photos ont leurs tests dans visuals.test.ts (export et effacement compris).

/** Le corps d'erreur d'une réponse, vérifié par le contrat. */
const errorOf = async (res: Response) => ErrorResponse.parse(await res.json())

/**
 * Un projet publié avant R6a, sans catégorie. L'API exige maintenant la catégorie à la création :
 * on publie normalement, puis on efface les catégories dans la base, comme les lignes d'avant la
 * migration (colonnes ajoutées vides). Le SQL est brut : les colonnes n'existent pas encore dans
 * le schéma typé quand ce test est écrit.
 */
const publishBeforeR6a = async (body: object = recipes, cookie = lea) => {
  const project = await publish(body, cookie)
  await ctx.db.execute(
    sql`update project set primary_category = null, secondary_category = null where id = ${project.id}`,
  )
  return project
}

const readProject = async (id: string, cookie = lea) =>
  Project.parse(await (await read(id, cookie)).json())

describe('the categories, the month and the difficulty of a project (R6a)', () => {
  const telescope = {
    title: 'Le télescope qui raconte',
    pitch: 'Il nomme les étoiles que vise la lunette.',
    primaryCategory: 'science',
    secondaryCategory: 'learning',
    startedOn: '2024-03',
    difficulty: 'medium',
  }

  it('saves the categories, the month and the difficulty, and shows them to another member', async () => {
    const project = await publish(telescope)

    const expected = {
      primaryCategory: 'science',
      secondaryCategory: 'learning',
      startedOn: '2024-03',
      difficulty: 'medium',
    }
    expect(project).toMatchObject(expected)
    expect(await readProject(project.id, max)).toMatchObject(expected)
  })

  it('leaves the second category, the month and the difficulty empty when they are not given', async () => {
    const project = await publish()

    expect(project).toMatchObject({
      primaryCategory: 'cooking',
      secondaryCategory: null,
      startedOn: null,
      difficulty: null,
    })
  })

  it('changes and clears them in an update', async () => {
    const { id } = await publish(telescope)

    const res = await send('PATCH', `/v1/projects/${id}`, lea, {
      primaryCategory: 'games',
      secondaryCategory: null,
      startedOn: null,
      difficulty: 'hard',
    })

    expect(res.status).toBe(200)
    const expected = {
      primaryCategory: 'games',
      secondaryCategory: null,
      startedOn: null,
      difficulty: 'hard',
    }
    expect(Project.parse(await res.json())).toMatchObject(expected)
    expect(await readProject(id)).toMatchObject(expected)
  })

  it('keeps the categories when an update does not mention them', async () => {
    const { id } = await publish(telescope)

    expect((await send('PATCH', `/v1/projects/${id}`, lea, { status: 'done' })).status).toBe(200)

    expect(await readProject(id)).toMatchObject({
      primaryCategory: 'science',
      secondaryCategory: 'learning',
      startedOn: '2024-03',
      difficulty: 'medium',
    })
  })

  it('refuses a creation without a category, or with an unknown one', async () => {
    const { primaryCategory: _, ...withoutCategory } = recipes

    for (const body of [withoutCategory, { ...recipes, primaryCategory: 'jardinage' }]) {
      expect((await send('POST', '/v1/projects', lea, body)).status).toBe(400)
    }
    expect(await ctx.db.select().from(schema.project)).toHaveLength(0)
  })

  it('refuses a second category equal to the primary, at creation as in an update', async () => {
    const creation = await send('POST', '/v1/projects', lea, {
      ...recipes,
      secondaryCategory: 'cooking',
    })
    expect(creation.status).toBe(400)
    expect(await ctx.db.select().from(schema.project)).toHaveLength(0)

    const { id } = await publish(telescope)
    const update = await send('PATCH', `/v1/projects/${id}`, lea, {
      primaryCategory: 'art',
      secondaryCategory: 'art',
    })
    expect(update.status).toBe(400)
    expect(await readProject(id)).toMatchObject({
      primaryCategory: 'science',
      secondaryCategory: 'learning',
    })
  })

  it('refuses a second category equal to the current primary when the update leaves it unchanged', async () => {
    // Le corps ne porte que la seconde : le contrat ne peut pas comparer, c'est l'API qui lit la
    // principale enregistrée.
    const { id } = await publish(telescope)

    const res = await send('PATCH', `/v1/projects/${id}`, lea, { secondaryCategory: 'science' })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('same_category')
    expect(await readProject(id)).toMatchObject({ secondaryCategory: 'learning' })
    // Témoin : une autre seconde est acceptée.
    const other = await send('PATCH', `/v1/projects/${id}`, lea, { secondaryCategory: 'art' })
    expect(other.status).toBe(200)
    expect(Project.parse(await other.json()).secondaryCategory).toBe('art')
  })

  it('refuses a new primary equal to the current second category when the update does not send the second', async () => {
    // sec-M2 : sans la seconde dans le corps, la nouvelle principale se compare à la seconde
    // enregistrée ; l'appli, elle, envoie toujours les deux ensemble.
    const { id } = await publish(telescope)

    const res = await send('PATCH', `/v1/projects/${id}`, lea, { primaryCategory: 'learning' })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('same_category')
    expect(await readProject(id)).toMatchObject({
      primaryCategory: 'science',
      secondaryCategory: 'learning',
    })
    // Témoin : échanger les deux, envoyées ensemble, est permis.
    const swap = await send('PATCH', `/v1/projects/${id}`, lea, {
      primaryCategory: 'learning',
      secondaryCategory: 'science',
    })
    expect(swap.status).toBe(200)
    expect(Project.parse(await swap.json())).toMatchObject({
      primaryCategory: 'learning',
      secondaryCategory: 'science',
    })
  })

  it('refuses timeSpent sent by an app of before R6a', async () => {
    // sec-M4 : un onglet ouvert avant le déploiement reçoit un refus net jusqu'au rechargement.
    const creation = await send('POST', '/v1/projects', lea, { ...recipes, timeSpent: 'week' })
    expect(creation.status).toBe(400)

    const { id } = await publish()
    const update = await send('PATCH', `/v1/projects/${id}`, lea, { timeSpent: 'week' })
    expect(update.status).toBe(400)
  })

  it('refuses a month after the current one in Kiritimati, or before January 2000', async () => {
    // Le dernier mois permis se lit dans le contrat (le mois en cours à UTC+14), le suivant est
    // refusé. Sans fausse horloge : la session de Léa a été ouverte à l'heure réelle.
    const { id } = await publish()
    const latest = startedMonthMax(new Date())
    const [year, month] = latest.split('-').map(Number) as [number, number]
    const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`

    for (const startedOn of [next, '1999-12', '2026-3', '2026-03-01']) {
      const res = await send('PATCH', `/v1/projects/${id}`, lea, { startedOn })
      expect(res.status, startedOn).toBe(400)
    }
    const res = await send('PATCH', `/v1/projects/${id}`, lea, { startedOn: latest })
    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).startedOn).toBe(latest)
    expect((await readProject(id)).startedOn).toBe(latest)
  })
})

describe('a project published before R6a, without category', () => {
  it('shows an old project without category, while a new one has its own', async () => {
    const old = await publishBeforeR6a()
    const recent = await publish({
      ...recipes,
      title: 'Mon carnet de jardin',
      primaryCategory: 'home-garden',
    })

    expect(await readProject(old.id, max)).toMatchObject({
      primaryCategory: null,
      secondaryCategory: null,
    })
    // Témoin : le projet publié après R6a garde sa catégorie.
    expect((await readProject(recent.id, max)).primaryCategory).toBe('home-garden')
  })

  it('refuses a second category without a primary on an old project', async () => {
    const { id } = await publishBeforeR6a()

    const res = await send('PATCH', `/v1/projects/${id}`, lea, { secondaryCategory: 'learning' })

    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('category_required')
    expect(await readProject(id)).toMatchObject({ primaryCategory: null, secondaryCategory: null })
  })

  it('translates the refusal of a second category without a primary', async () => {
    const { id } = await publishBeforeR6a()
    const ask = (language: string) =>
      ctx.request(`/v1/projects/${id}`, {
        method: 'PATCH',
        headers: { cookie: lea, 'content-type': 'application/json', 'accept-language': language },
        body: JSON.stringify({ secondaryCategory: 'learning' }),
      })

    const fr = await errorOf(await ask('fr'))
    const en = await errorOf(await ask('en'))

    expect([fr.error.code, en.error.code]).toEqual(['category_required', 'category_required'])
    expect(fr.error.message).not.toBe(en.error.message)
  })

  it('lets the author of an old project choose its categories', async () => {
    const { id } = await publishBeforeR6a()

    const res = await send('PATCH', `/v1/projects/${id}`, lea, {
      primaryCategory: 'learning',
      secondaryCategory: 'science',
    })

    expect(res.status).toBe(200)
    expect(await readProject(id)).toMatchObject({
      primaryCategory: 'learning',
      secondaryCategory: 'science',
    })
  })

  it('lets an old project without category become private', async () => {
    // jur-J8 (décision de Louis du 8/11/2026) : restreindre l'audience ne demande jamais une donnée
    // nouvelle.
    const { id } = await publishBeforeR6a()

    const res = await send('PATCH', `/v1/projects/${id}`, lea, { visibility: 'private' })

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json())).toMatchObject({
      visibility: 'private',
      primaryCategory: null,
    })
    // Témoin : la seconde seule, elle, attend toujours une principale.
    const second = await send('PATCH', `/v1/projects/${id}`, lea, {
      visibility: 'public',
      secondaryCategory: 'learning',
    })
    expect(second.status).toBe(400)
    expect(await readProject(id)).toMatchObject({ visibility: 'private', secondaryCategory: null })
  })
  // R6b : le test « never returns timeSpent » (qui écrivait time_spent en SQL brut) est retiré, la
  // colonne n'existe plus (jur-P1) ; son absence est vérifiée par catalogue-migration.test.ts, et
  // le refus de timeSpent reste plus haut.
})

describe('the lists carry the categories (R6a)', () => {
  it('gives the categories to the cards of the feed, the profile, the tag and the search', async () => {
    const project = await publish({
      title: 'Le télescope qui raconte',
      pitch: 'Il nomme les étoiles que vise la lunette.',
      primaryCategory: 'science',
      secondaryCategory: 'learning',
      tools: ['Claude'],
    })
    const leaId = Me.parse(await (await send('GET', '/v1/me', lea)).json()).id
    const get = async (path: string) => {
      const res = await send('GET', path, max)
      expect(res.status, path).toBe(200)
      return res.json()
    }
    const cardIn = (cards: ProjectSummary[]) => cards.find((card) => card.id === project.id)

    const feed = DiscoverFeedPage.parse(await get('/v1/feed/discover')).items.flatMap((item) =>
      item.kind === 'project' ? [item.project] : [],
    )
    const profile = Member.parse(await get(`/v1/members/${leaId}`)).projects
    const tag = ToolPage.parse(await get('/v1/tags/claude')).projects
    const search = SearchResults.parse(
      await get(`/v1/search?${new URLSearchParams({ q: 'télescope' })}`),
    ).projects.items

    for (const [list, cards] of [
      ['feed', feed],
      ['profile', profile],
      ['tag', tag],
      ['search', search],
    ] as const) {
      expect(cardIn(cards), list).toMatchObject({
        primaryCategory: 'science',
        secondaryCategory: 'learning',
      })
    }
  })

  it('gives no category to the card of an old project', async () => {
    const old = await publishBeforeR6a({ ...recipes, tools: ['Claude'] })

    const tag = ToolPage.parse(await (await send('GET', '/v1/tags/claude', max)).json()).projects

    expect(tag.find((card) => card.id === old.id)).toMatchObject({
      primaryCategory: null,
      secondaryCategory: null,
    })
  })
})

// --- Tranche R6b : les outils d'un projet passent par le catalogue ---
// Scénario : docs/scenarios/refonte.md, section R6b (« Choisir ses outils », « Où les outils
// s'affichent ») ; relecture du plan : sec-A3, sec-A5, sec-B8 et les décisions 5 et 6 de la
// session. Un nom tapé est rattaché à l'outil du catalogue qui porte ce nom ou cet alias (sans
// accents, majuscules, espaces ni ponctuation : `foldTool`) ; sinon il devient un « Autre »,
// partagé par tous ceux qui le tapent, et chaque projet garde le nom tel que son auteur l'a tapé.
//
// Les tables du catalogue (tool, tool_alias, project_tool, category) sont lues en SQL brut : elles
// n'existent pas encore dans le schéma typé quand ces tests sont écrits. On compte sur les outils
// que le scénario cite (« Claude », « ChatGPT », « Cursor ») : ils sont semés par la migration.

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

type ToolRow = {
  slug: string
  name: string
  folded: string
  status: string
  family: string | null
  created_by: string | null
}

/** Les outils qui ne sont pas au catalogue (« Autre »), par nom replié. */
const otherTools = () =>
  rows<ToolRow>(
    sql`select slug, name, folded, status, family, created_by from tool where status <> 'catalogue' order by folded`,
  )

/** Les outils d'un projet tels que la base les range : dans l'ordre choisi, avec le nom tapé. */
const toolsOf = (projectId: string) =>
  rows<{ name: string; label: string | null; status: string }>(
    sql`select t.name, pt.label, t.status from project_tool pt join tool t on t.id = pt.tool_id where pt.project_id = ${projectId} order by pt.position`,
  )

const patchTools = (id: string, tools: string[], cookie = lea) =>
  send('PATCH', `/v1/projects/${id}`, cookie, { tools })

describe('choosing the tools of a project in the catalogue (R6b)', () => {
  it('links a catalogue name, whatever its case, spaces and accents, to the catalogue tool', async () => {
    const project = await publish({ ...recipes, tools: ['claude', 'CHAT GPT'] })

    const expected = [
      { label: 'Claude', slug: 'claude', inCatalogue: true },
      { label: 'ChatGPT', slug: 'chatgpt', inCatalogue: true },
    ]
    expect(project.tools).toEqual(expected)
    expect((await readProject(project.id, max)).tools).toEqual(expected)
    // Un outil du catalogue ne garde pas de nom tapé : son nom est celui du catalogue.
    expect(await toolsOf(project.id)).toEqual([
      { name: 'Claude', label: null, status: 'catalogue' },
      { name: 'ChatGPT', label: null, status: 'catalogue' },
    ])
    // Aucun « Autre » n'a été créé.
    expect(await otherTools()).toEqual([])
  })

  it('links an alias to its catalogue tool, never creating an « other »', async () => {
    // Un autre nom de Claude, posé ici pour ne pas dépendre de la liste des alias du catalogue.
    await ctx.db.execute(
      sql`insert into tool_alias (folded, tool_id) select 'claudeai', id from tool where folded = 'claude' and status = 'catalogue' on conflict do nothing`,
    )
    expect(
      await rows<{ name: string }>(
        sql`select t.name from tool_alias a join tool t on t.id = a.tool_id where a.folded = 'claudeai'`,
      ),
    ).toEqual([{ name: 'Claude' }])

    const project = await publish({ ...recipes, tools: ['Claude A.I.'] })

    expect(project.tools).toEqual([{ label: 'Claude', slug: 'claude', inCatalogue: true }])
    expect(await otherTools()).toEqual([])
  })

  it('creates an « other » for an unknown name, shown as plain text under the name typed', async () => {
    const project = await publish({ ...recipes, tools: ['Teachable Machine', 'Claude'] })

    expect(project.tools).toEqual([
      { label: 'Teachable Machine', slug: 'teachable-machine', inCatalogue: false },
      { label: 'Claude', slug: 'claude', inCatalogue: true },
    ])
    expect((await readProject(project.id, max)).tools).toEqual(project.tools)
    // Un « Autre » n'a ni famille ni auteur (décision 5 : created_by toujours nul).
    expect(await otherTools()).toEqual([
      {
        slug: 'teachable-machine',
        name: 'Teachable Machine',
        folded: 'teachablemachine',
        status: 'other',
        family: null,
        created_by: null,
      },
    ])
    expect(await toolsOf(project.id)).toEqual([
      { name: 'Teachable Machine', label: 'Teachable Machine', status: 'other' },
      { name: 'Claude', label: null, status: 'catalogue' },
    ])
  })

  it('adds the same « other » for two members who type it differently, each keeping the name he typed', async () => {
    const mine = await publish({ ...recipes, tools: ['Teachable Machine'] })
    const his = await publish(
      { ...recipes, title: 'Projet de Max', tools: ['TEACHABLE machine'] },
      max,
    )

    // Un seul « Autre », au nom du premier qui l'a tapé.
    expect((await otherTools()).map(({ name, folded }) => ({ name, folded }))).toEqual([
      { name: 'Teachable Machine', folded: 'teachablemachine' },
    ])
    // sec-B8 : sur le projet de Max, le nom tel que Max l'a tapé, jamais l'écriture de Léa.
    expect((await readProject(his.id, lea)).tools).toEqual([
      { label: 'TEACHABLE machine', slug: 'teachable-machine', inCatalogue: false },
    ])
    expect((await readProject(mine.id, max)).tools).toEqual([
      { label: 'Teachable Machine', slug: 'teachable-machine', inCatalogue: false },
    ])
  })

  it('keeps the tools in the order chosen, each tool once', async () => {
    const project = await publish({
      ...recipes,
      tools: ['Teachable Machine', 'cursor', 'Claude', 'teachable-machine', 'CLAUDE'],
    })

    expect(project.tools.map((tool) => tool.label)).toEqual([
      'Teachable Machine',
      'Cursor',
      'Claude',
    ])
    expect((await toolsOf(project.id)).map((tool) => tool.name)).toEqual([
      'Teachable Machine',
      'Cursor',
      'Claude',
    ])
  })

  it('accepts 15 tools and refuses a 16th, at creation as in an update', async () => {
    const fifteen = Array.from({ length: PROJECT_TOOLS_MAX }, (_, i) => `Outil maison ${i + 1}`)
    const project = await publish({ ...recipes, tools: fifteen })
    expect(await toolsOf(project.id)).toHaveLength(15)

    const creation = await send('POST', '/v1/projects', lea, {
      ...recipes,
      tools: [...fifteen, 'Claude'],
    })
    const update = await patchTools(project.id, [...fifteen, 'Claude'])

    expect([creation.status, update.status]).toEqual([400, 400])
    expect(await toolsOf(project.id)).toHaveLength(15)
    expect(await ctx.db.select().from(schema.project)).toHaveLength(1)
  })

  it('replaces the tools in an update, and keeps them when the update does not mention them', async () => {
    const { id } = await publish({ ...recipes, tools: ['Claude', 'Teachable Machine'] })

    expect((await send('PATCH', `/v1/projects/${id}`, lea, { status: 'done' })).status).toBe(200)
    expect((await toolsOf(id)).map((tool) => tool.name)).toEqual(['Claude', 'Teachable Machine'])

    const res = await patchTools(id, ['Cursor', 'claude'])

    expect(res.status).toBe(200)
    expect(Project.parse(await res.json()).tools).toEqual([
      { label: 'Cursor', slug: 'cursor', inCatalogue: true },
      { label: 'Claude', slug: 'claude', inCatalogue: true },
    ])
    expect((await toolsOf(id)).map((tool) => tool.name)).toEqual(['Cursor', 'Claude'])
  })

  it('keeps the tools only in the catalogue links, the former columns being gone (R7a)', async () => {
    // R6b gardait project.tools et project.tool_slugs écrites « jusqu'en R7 », pour un retour
    // possible à R6a ; la migration 0018 (R7a) les efface, avec leur index. Les outils ne vivent plus
    // que dans project_tool.
    const { id } = await publish({ ...recipes, tools: ['chat gpt', 'Teachable Machine'] })
    expect((await toolsOf(id)).map((tool) => tool.name)).toEqual(['ChatGPT', 'Teachable Machine'])

    expect((await patchTools(id, ['CURSOR'])).status).toBe(200)
    expect((await toolsOf(id)).map((tool) => tool.name)).toEqual(['Cursor'])
    // information_schema : le catalogue de PostgreSQL, qui décrit les tables et leurs colonnes.
    expect(
      await rows(
        sql`select column_name from information_schema.columns where table_name = 'project' and column_name in ('tools', 'tool_slugs')`,
      ),
    ).toEqual([])
  })

  it('gives the suffix -2 to an « other » whose slug is already taken by a different folded name', async () => {
    // « Zorblax ✨ » et « Zorblax » ne sont pas le même outil (l'emoji compte dans le nom replié),
    // mais leur identifiant d'adresse serait le même : le second prend « zorblax-2 » (sec-A3).
    const sparkle = String.fromCodePoint(0x2728)
    // Témoin du contrat : deux noms repliés différents, un même identifiant d'adresse.
    expect(foldTool(`Zorblax ${sparkle}`)).not.toBe(foldTool('Zorblax'))
    expect(toolSlug(`Zorblax ${sparkle}`)).toBe(toolSlug('Zorblax'))
    const plain = await publish({ ...recipes, tools: ['Zorblax'] })
    const fancy = await publish({ ...recipes, title: 'Le second', tools: [`Zorblax ${sparkle}`] })

    expect(plain.tools).toEqual([{ label: 'Zorblax', slug: 'zorblax', inCatalogue: false }])
    expect(fancy.tools).toEqual([
      // sec-B2 : la réponse donne le slug du nom tapé, jamais le suffixe partagé, qui dirait
      // qu'un autre membre a déjà tapé « Zorblax » ; la base garde bien les deux adresses.
      { label: `Zorblax ${sparkle}`, slug: 'zorblax', inCatalogue: false },
    ])
    expect((await otherTools()).map((tool) => tool.slug).sort()).toEqual(['zorblax', 'zorblax-2'])
  })
})

describe('the categories of a project are read in the base (R6b)', () => {
  /** Une demande dans une langue donnée, pour lire le message traduit. */
  const ask = (method: string, path: string, body: object, language: string) =>
    ctx.request(path, {
      method,
      headers: { cookie: lea, 'content-type': 'application/json', 'accept-language': language },
      body: JSON.stringify(body),
    })

  it('refuses an unknown category code with a translated 400 unknown_category', async () => {
    // Depuis R6b, le contrat accepte tout code bien formé : c'est l'API qui le cherche en base.
    const creation = await ask(
      'POST',
      '/v1/projects',
      { ...recipes, primaryCategory: 'jardinage' },
      'fr',
    )

    expect(creation.status).toBe(400)
    expect((await errorOf(creation)).error).toEqual({
      code: 'unknown_category',
      message: fill(resources.fr.translation.errors.unknownCategory),
    })
    expect(await ctx.db.select().from(schema.project)).toHaveLength(0)

    const { id } = await publish()
    const update = await ask(
      'PATCH',
      `/v1/projects/${id}`,
      { secondaryCategory: 'jardinage' },
      'en',
    )

    expect(update.status).toBe(400)
    expect((await errorOf(update)).error).toEqual({
      code: 'unknown_category',
      message: fill(resources.en.translation.errors.unknownCategory),
    })
    expect((await readProject(id)).secondaryCategory).toBeNull()
  })

  it('accepts a category created in the base after the sixteen of R6a', async () => {
    // Comme si un administrateur l'avait créée : la catégorie existe, le projet peut la prendre.
    const createdAt = new Date().toISOString()
    await ctx.db.execute(
      sql`insert into category (code, name_fr, name_en, icon, position, created_at) values ('jardinage', 'Jardinage', 'Gardening', 'flower', (select max(position) + 1 from category), ${createdAt}::timestamptz at time zone 'UTC')`,
    )

    const project = await publish({ ...recipes, primaryCategory: 'jardinage' })
    const res = await send('PATCH', `/v1/projects/${project.id}`, lea, {
      primaryCategory: 'cooking',
      secondaryCategory: 'jardinage',
    })

    expect(project.primaryCategory).toBe('jardinage')
    expect(res.status).toBe(200)
    expect(await readProject(project.id, max)).toMatchObject({
      primaryCategory: 'cooking',
      secondaryCategory: 'jardinage',
    })
  })
})

// Décision 5 du plan (sec-A5, jur-T6) : un « Autre » s'efface dans la transaction qui retire
// sa dernière référence (projet, profil, compte) ; la purge de nuit n'est qu'un filet.
describe('an « other » tool lives as long as something cites it (R6b)', () => {
  it('deletes an « other » tool when the last project or profile citing it drops it', async () => {
    const first = await publish({ ...recipes, tools: ['Teachable Machine'] })
    const second = await publish({
      ...recipes,
      title: 'Le second',
      tools: ['Teachable Machine', 'Claude'],
    })

    expect((await patchTools(first.id, [])).status).toBe(200)
    // Le second projet le cite encore : il reste.
    expect((await otherTools()).map((tool) => tool.name)).toEqual(['Teachable Machine'])

    expect((await send('DELETE', `/v1/projects/${second.id}`, lea)).status).toBe(204)
    expect(await otherTools()).toEqual([])
    // Un outil du catalogue, lui, ne s'efface jamais, même quand plus rien ne le cite.
    expect(
      await rows(sql`select 1 from tool where folded = 'claude' and status = 'catalogue'`),
    ).toHaveLength(1)
  })

  it("keeps an « other » tool cited by another member's project when one project drops it", async () => {
    const mine = await publish({ ...recipes, tools: ['Teachable Machine'] })
    const his = await publish(
      { ...recipes, title: 'Projet de Max', tools: ['teachable machine'] },
      max,
    )

    expect((await send('DELETE', `/v1/projects/${mine.id}`, lea)).status).toBe(204)

    expect((await otherTools()).map((tool) => tool.folded)).toEqual(['teachablemachine'])
    expect((await readProject(his.id, max)).tools).toEqual([
      { label: 'teachable machine', slug: 'teachable-machine', inCatalogue: false },
    ])
  })
})

describe('the daily limit of new « other » tools (R6b, sec-A5)', () => {
  // Une fausse horloge, pour passer au lendemain. Seule Date est remplacée (voir feed.test.ts).
  beforeEach(() => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const names = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => `Outil maison ${from + i}`)

  it('refuses the 31st new « other » tool of a member in a day with 429, counting the creations undone with their project', async () => {
    expect(OTHER_TOOLS_PER_DAY).toBe(30)
    // Les créations se comptent avant l'écriture, et une création défaite compte quand même : 15
    // « Autre » créés, puis effacés avec leur projet (ils ne sont plus cités), comptent pour 15.
    // Sans cela, publier et effacer en boucle gonflerait la base sans fin.
    const first = await publish({ ...recipes, tools: names(1, 15) })
    expect((await send('DELETE', `/v1/projects/${first.id}`, lea)).status).toBe(204)
    expect(await otherTools()).toEqual([])
    // Les mêmes noms, recréés : 30 créations aujourd'hui.
    await publish({ ...recipes, title: 'Le second', tools: names(1, 15) })
    // Témoin : un outil du catalogue et un « Autre » qui existe déjà ne sont pas des créations.
    const third = await publish({
      ...recipes,
      title: 'Le troisième',
      tools: ['Claude', 'Outil maison 1'],
    })

    const res = await patchTools(third.id, ['Claude', 'Outil maison 1', 'Outil maison 31'])

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect((await errorOf(res)).error).toEqual({
      code: 'too_many_other_tools',
      message: fill(resources.fr.translation.errors.tooManyOtherTools),
    })
    // Rien de la demande n'est gardé : ni l'outil, ni le changement du projet.
    expect((await readProject(third.id)).tools.map((tool) => tool.label)).toEqual([
      'Claude',
      'Outil maison 1',
    ])
    expect((await otherTools()).map((tool) => tool.name)).not.toContain('Outil maison 31')

    // Chaque membre a sa limite : Max crée le sien.
    const his = await publish(
      { ...recipes, title: 'Projet de Max', tools: ['Outil maison 31'] },
      max,
    )
    expect(his.tools).toEqual([
      { label: 'Outil maison 31', slug: 'outil-maison-31', inCatalogue: false },
    ])
    // Le lendemain, Léa en crée de nouveau.
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 60 * 1000)
    expect((await patchTools(third.id, ['Claude', 'Outil maison 32'])).status).toBe(200)
  })

  // Relecture de sécurité sec-B1 (décision de Louis du 9/11/2026 au soir) : le quota épuisé, un nom
  // hors du catalogue est refusé qu'un autre membre l'ait déjà tapé ou non. Sinon le 429 dirait
  // « personne n'a jamais tapé ce nom », et le 200 « quelqu'un l'a tapé » (projet privé compris).
  it('answers 429 the same way for a new and an already typed « other » name once the quota is spent', async () => {
    // Max tape « Zorblax Secret » sur un projet privé : un « Autre » que Léa ne voit nulle part.
    await publish(
      { ...recipes, title: 'Carnet de Max', visibility: 'private', tools: ['Zorblax Secret'] },
      max,
    )
    await publish({ ...recipes, tools: names(1, 15) })
    const project = await publish({ ...recipes, title: 'Le second', tools: names(16, 15) })

    const typed = await patchTools(project.id, ['Zorblax Secret'])
    const fresh = await patchTools(project.id, ['Zorblax Inédit'])

    for (const res of [typed, fresh]) {
      expect(res.status).toBe(429)
      expect(res.headers.get('retry-after')).toBeTruthy()
    }
    expect(await typed.text()).toBe(await fresh.text())
    // Témoin : un nom du catalogue passe, et ses propres « Autre » déjà cités aussi.
    expect((await patchTools(project.id, ['Claude', 'Outil maison 1'])).status).toBe(200)
  })
})
