// Tests d'intégration de la tranche 3a : publier, lire, modifier et supprimer un projet.
// Scénarios : docs/scenarios/phase-1.md, tranche 3. Deux membres : Léa (l'autrice) et Max.
import { AccountExport, Comment, ErrorResponse, Me, Project, ProjectNote } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const recipes = { title: 'Mon agent de recettes', pitch: 'Un menu avec ce qu’il y a au frigo.' }

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
  it('only needs a title and a pitch, and starts as a public idea without demo', async () => {
    const project = await publish()

    expect(project).toMatchObject({
      ...recipes,
      description: '',
      status: 'idea',
      visibility: 'public',
      demoUrl: null,
      tools: [],
      timeSpent: null,
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
      timeSpent: 'weekend',
      prompts: ['Propose trois recettes avec : {ingrédients}'],
    })

    expect(project).toMatchObject({
      status: 'testable',
      demoUrl: 'https://recettes.example.com/', // enregistrée sous sa forme standard
      // « claude-code » est la même étiquette que « Claude Code » : gardée une seule fois.
      tools: [
        { label: 'Claude Code', slug: 'claude-code' },
        { label: 'Éclair 2.0', slug: 'eclair-2-0' },
      ],
      timeSpent: 'weekend',
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
      { projectId: mine.id, id: first.id, body: first.body, createdAt: first.createdAt },
      { projectId: draft.id, id: secret.id, body: secret.body, createdAt: secret.createdAt },
      { projectId: mine.id, id: last.id, body: last.body, createdAt: last.createdAt },
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
      },
      {
        projectId: maxProject.id,
        id: reply.id,
        replyTo: fromMax.id,
        body: 'Ma réponse à Max',
        createdAt: reply.createdAt,
        editedAt: null,
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
