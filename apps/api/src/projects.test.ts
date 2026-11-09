// Tests d'intégration de la tranche 3a : publier, lire, modifier et supprimer un projet.
// Scénarios : docs/scenarios/phase-1.md, tranche 3. Deux membres : Léa (l'autrice) et Max.
import {
  AccountExport,
  Comment,
  DiscoverFeedPage,
  ErrorResponse,
  Me,
  Member,
  Project,
  ProjectNote,
  type ProjectSummary,
  SearchResults,
  startedMonthMax,
  TagPage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

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
      // « claude-code » est la même étiquette que « Claude Code » : gardée une seule fois.
      tools: [
        { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
        { label: 'Éclair 2.0', slug: 'eclair-2-0', inCatalogue: true },
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

// --- Tranche 4b : les notes dans l'export ---
// L'export donne toutes les notes publiées sur ses projets (privés compris, et au-delà des 20 du
// journal), des plus anciennes aux plus récentes, et aucune note des autres membres.
describe('my notes in my data', () => {
  // Une fausse horloge, qu'on avance d'une minute entre deux notes : leurs dates sont distinctes,
  // donc leur ordre est connu. Seule Date est remplacée (voir feed.test.ts).
  beforeEach(() => {
    const now = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Publie une note, une minute après ce qui précède, et renvoie la note. */
  const postNote = async (projectId: string, body: string, cookie = lea) => {
    vi.setSystemTime(Date.now() + 60 * 1000)
    const res = await send('POST', `/v1/projects/${projectId}/notes`, cookie, { body })
    expect(res.status).toBe(201)
    return ProjectNote.parse(await res.json())
  }

  it('exports the notes of all my projects, private ones included, oldest first, and nobody else’s', async () => {
    const mine = await publish()
    const draft = await publish({ ...recipes, title: 'Mon brouillon', visibility: 'private' })
    const maxProject = await publish({ ...recipes, title: 'Projet de Max' }, max)
    const first = await postNote(mine.id, 'Première version en ligne')
    const secret = await postNote(draft.id, 'Une idée encore secrète')
    await postNote(maxProject.id, 'Note de Max', max)
    const last = await postNote(mine.id, 'v2 : mode hors ligne')

    const raw = await (await send('GET', '/v1/me/export', lea)).text()
    const data = AccountExport.parse(JSON.parse(raw))

    expect(data.notes).toEqual([
      {
        projectId: mine.id,
        id: first.id,
        body: first.body,
        createdAt: first.createdAt,
        removal: null,
      },
      {
        projectId: draft.id,
        id: secret.id,
        body: secret.body,
        createdAt: secret.createdAt,
        removal: null,
      },
      {
        projectId: mine.id,
        id: last.id,
        body: last.body,
        createdAt: last.createdAt,
        removal: null,
      },
    ])
    expect(raw).not.toContain('Note de Max')
  })

  it('exports every note, beyond the 20 shown on the page of the project', async () => {
    const { id } = await publish()
    const bodies: string[] = []
    for (let i = 1; i <= 22; i++) bodies.push((await postNote(id, `Note ${i}`)).body)

    const data = AccountExport.parse(await (await send('GET', '/v1/me/export', lea)).json())

    expect(data.notes.map((note) => note.body)).toEqual(bodies)
  })

  it('does not export the notes of the projects I follow', async () => {
    const followed = await publish({ ...recipes, title: 'Projet de Max' }, max)
    expect((await send('POST', `/v1/projects/${followed.id}/follow`, lea)).status).toBe(204)
    await postNote(followed.id, 'Note de Max', max)

    const raw = await (await send('GET', '/v1/me/export', lea)).text()

    expect(AccountExport.parse(JSON.parse(raw)).notes).toEqual([])
    expect(raw).not.toContain('Note de Max')
  })

  it('exports no note for a member who never wrote one', async () => {
    await publish()

    const data = AccountExport.parse(await (await send('GET', '/v1/me/export', lea)).json())

    expect(data.notes).toEqual([])
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

  it('never returns timeSpent, even for a project created before', async () => {
    // La colonne reste en R6a (sec-A6 : effacée en R6b) ; ce qu'elle contient ne sort plus.
    const old = await publishBeforeR6a({ ...recipes, tools: ['Claude'] })
    await ctx.db.execute(sql`update project set time_spent = 'week' where id = ${old.id}`)
    const leaId = Me.parse(await (await send('GET', '/v1/me', lea)).json()).id

    for (const path of [
      `/v1/projects/${old.id}`,
      '/v1/feed/discover',
      `/v1/members/${leaId}`,
      '/v1/tags/claude',
      '/v1/me/export',
    ]) {
      const res = await send('GET', path, path === '/v1/me/export' ? lea : max)
      expect(res.status, path).toBe(200)
      const raw = await res.text()
      expect(raw, path).toContain(old.id)
      expect(raw, path).not.toContain('timeSpent')
      expect(raw, path).not.toContain('"week"')
    }
  })
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
    const tag = TagPage.parse(await get('/v1/tags/claude')).projects
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

    const tag = TagPage.parse(await (await send('GET', '/v1/tags/claude', max)).json()).projects

    expect(tag.find((card) => card.id === old.id)).toMatchObject({
      primaryCategory: null,
      secondaryCategory: null,
    })
  })
})
