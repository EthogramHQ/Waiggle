// Tests d'intégration de la tranche 3a : publier, lire, modifier et supprimer un projet.
// Scénarios : docs/scenarios/phase-1.md, tranche 3. Deux membres : Léa (l'autrice) et Max.
import { AccountExport, ErrorResponse, Project } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('deletes my projects together with my account', async () => {
    await publish()

    await send('POST', '/api/auth/delete-user', lea, { password: leaAccount.password })

    expect(await ctx.db.select().from(schema.project)).toHaveLength(0)
  })
})
