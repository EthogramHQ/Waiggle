// Tests d'intégration de la tranche 3b-2 : la page d'un membre et la page d'une étiquette.
// Scénarios : docs/scenarios/phase-1.md, « Précisions (tranche 3b-2) ». Deux membres : Léa et Max.
import { ErrorResponse, Me, Member, PROJECT_LIST_MAX, Project, TagPage } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let lea: string // cookie de session de Léa
let max: string // cookie de session de Max
let leaId: string

beforeEach(async () => {
  ctx = await createTestContext()
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
  leaId = (await me(lea)).id
})

afterEach(async () => {
  await ctx.close()
})

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

const me = async (cookie: string) => Me.parse(await (await send('GET', '/v1/me', cookie)).json())

/** Publie un projet et renvoie ce que l'API a répondu. */
const publish = async (cookie: string, body: object) => {
  const res = await send('POST', '/v1/projects', cookie, { pitch: 'Un pitch.', ...body })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

const memberPage = (id: string, cookie: string | null) =>
  send('GET', `/v1/members/${encodeURIComponent(id)}`, cookie)
const readMember = async (id: string, cookie: string) => {
  const res = await memberPage(id, cookie)
  expect(res.status).toBe(200)
  return Member.parse(await res.json())
}

const tagPage = (slug: string, cookie: string | null) =>
  send('GET', `/v1/tags/${encodeURIComponent(slug)}`, cookie)
const readTag = async (slug: string, cookie: string) => {
  const res = await tagPage(slug, cookie)
  expect(res.status).toBe(200)
  return TagPage.parse(await res.json())
}

const expectNotFound = async (res: Response) => {
  expect(res.status).toBe(404)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe('not_found')
}

/**
 * Range directement dans la base `count` projets publics de Léa portant cette étiquette, du plus
 * ancien au plus récent : plus rapide que par l'API, et sans buter sur la limite de 20 par jour.
 */
const insertProjects = async (count: number, tool: string, slug: string) => {
  for (let i = 0; i < count; i++) {
    await ctx.db.insert(schema.project).values({
      id: crypto.randomUUID(),
      authorId: leaId,
      title: `Projet ${i}`,
      pitch: 'Un pitch.',
      tools: [tool],
      toolSlugs: [slug],
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
    })
  }
}

/** Puis un brouillon privé de Léa, plus récent que tous ces projets, avec la même étiquette. */
const insertNewerDraft = (tool: string, slug: string) =>
  ctx.db.insert(schema.project).values({
    id: crypto.randomUUID(),
    authorId: leaId,
    title: 'Brouillon récent',
    pitch: 'Un pitch.',
    visibility: 'private',
    tools: [`${tool} (privé)`],
    toolSlugs: [slug],
    createdAt: new Date(Date.UTC(2026, 5, 1)),
  })

describe('the page of a member', () => {
  it('is only shown to signed-in members', async () => {
    expect((await memberPage(leaId, null)).status).toBe(401)
  })

  it('shows her profile and her public projects, newest first, to another member', async () => {
    await send('PATCH', '/v1/me', lea, {
      bio: 'Je bricole des agents.',
      favoriteTools: ['Claude Code', 'Cursor'],
    })
    const first = await publish(lea, { title: 'Premier' })
    const second = await publish(lea, { title: 'Second', tools: ['Claude Code'] })
    await publish(lea, { title: 'Brouillon', visibility: 'private' })

    const page = await readMember(leaId, max)

    expect(page).toMatchObject({
      id: leaId,
      name: 'Léa',
      avatarUrl: null,
      bio: 'Je bricole des agents.',
      favoriteTools: [
        { label: 'Claude Code', slug: 'claude-code' },
        { label: 'Cursor', slug: 'cursor' },
      ],
      isMe: false,
    })
    expect(page.projects.map((project) => project.id)).toEqual([second.id, first.id])
    expect(page.projects[0]?.tools).toEqual([{ label: 'Claude Code', slug: 'claude-code' }])
  })

  it('also shows her private projects to the member herself', async () => {
    await publish(lea, { title: 'Public' })
    await publish(lea, { title: 'Brouillon', visibility: 'private' })

    const page = await readMember(leaId, lea)

    expect(page.isMe).toBe(true)
    expect(page.projects.map((project) => [project.title, project.visibility])).toEqual([
      ['Brouillon', 'private'],
      ['Public', 'public'],
    ])
  })

  it('never shows her email address, language or sign-in dates', async () => {
    const res = await memberPage(leaId, max)
    const text = await res.text()

    expect(text).not.toContain('lea@example.com')
    // Tranche 4 : l'abonnement (suivie ou non, combien d'abonnés), jamais la liste des abonnés.
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(
      [
        'avatarUrl',
        'bio',
        'favoriteTools',
        'followerCount',
        'handle',
        'id',
        'isBlocked', // tranche 7b : si le visiteur l'a bloquée
        'isFollowed',
        'isMe',
        'moderation', // tranche 7c : null, sauf pour un administrateur
        'name',
        'projects',
      ].sort(),
    )
  })

  it('shows each project with its cover photo', async () => {
    const project = await publish(lea, { title: 'Avec photo' })
    const form = visualForm(await jpegImage(800, 600))
    const res = await ctx.request(`/v1/projects/${project.id}/visuals`, {
      method: 'POST',
      headers: { cookie: lea },
      body: form,
    })
    expect(res.status).toBe(201)

    const [summary] = (await readMember(leaId, max)).projects
    expect(summary?.cover?.url).toMatch(/\/media\/visuals\/[0-9a-f-]{36}\.webp$/)
    expect(summary).not.toHaveProperty('visuals')
  })

  it('lists at most 50 projects', async () => {
    await insertProjects(PROJECT_LIST_MAX + 1, 'Claude', 'claude')

    const page = await readMember(leaId, max)

    expect(page.projects).toHaveLength(PROJECT_LIST_MAX)
    expect(page.projects[0]?.title).toBe(`Projet ${PROJECT_LIST_MAX}`) // le plus récent
  })

  it('never lets a private project take one of the 50 places, nor hide a public one', async () => {
    await insertProjects(PROJECT_LIST_MAX, 'Claude', 'claude')
    await insertNewerDraft('Claude', 'claude')

    const seenByMax = await readMember(leaId, max)
    expect(seenByMax.projects).toHaveLength(PROJECT_LIST_MAX)
    expect(seenByMax.projects.every((project) => project.visibility === 'public')).toBe(true)
    expect(seenByMax.projects[0]?.title).toBe(`Projet ${PROJECT_LIST_MAX - 1}`)

    const seenByLea = await readMember(leaId, lea)
    expect(seenByLea.projects[0]?.title).toBe('Brouillon récent')
  })

  it('answers « not found » for an unknown, deleted or never verified member', async () => {
    await expectNotFound(await memberPage('nobody-has-this-id', max))

    await ctx.db.delete(schema.user).where(eq(schema.user.id, leaId))
    await expectNotFound(await memberPage(leaId, max))

    await ctx.signUp({ name: 'Zoé', email: 'zoe@example.com', password: 'zoe-long-password' })
    const [zoe] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'zoe@example.com'))
    if (!zoe) throw new Error('Zoé should exist, unverified')
    await expectNotFound(await memberPage(zoe.id, max))
  })

  it('answers « not found » for a booby-trapped identifier', async () => {
    for (const id of ["x' or '1'='1", '../me', 'a'.repeat(65), 'é']) {
      await expectNotFound(await memberPage(id, max))
    }
  })
})

describe('the page of a tag', () => {
  it('is only shown to signed-in members', async () => {
    expect((await tagPage('claude-code', null)).status).toBe(401)
  })

  it('gathers the public projects of every member made with this tool, newest first', async () => {
    const first = await publish(lea, { title: 'De Léa', tools: ['Claude Code'] })
    const second = await publish(max, { title: 'De Max', tools: ['claude code', 'Cursor'] })
    await publish(max, { title: 'Sans', tools: ['Cursor'] })

    const page = await readTag('claude-code', lea)

    expect(page.slug).toBe('claude-code')
    expect(page.label).toBe('claude code') // le nom tapé sur le plus récent
    expect(page.projects.map((project) => project.id)).toEqual([second.id, first.id])
  })

  it('leads « Claude Code », « claude code » and « CLAUDE-CODE » to the same page', async () => {
    const project = await publish(lea, { title: 'De Léa', tools: ['Claude Code'] })

    for (const asked of ['Claude Code', 'claude code', 'CLAUDE-CODE']) {
      const page = await readTag(asked, max)
      expect(page.slug).toBe('claude-code')
      expect(page.projects.map((p) => p.id)).toEqual([project.id])
    }
  })

  it('never shows a private project, not even to its author', async () => {
    await publish(lea, { title: 'Brouillon', tools: ['Claude Code'], visibility: 'private' })

    expect((await readTag('claude-code', lea)).projects).toEqual([])
    expect((await readTag('claude-code', max)).projects).toEqual([])
  })

  it('looks the same for an unknown tag and a tag carried only by private projects', async () => {
    await publish(lea, { title: 'Brouillon', tools: ['Secret'], visibility: 'private' })

    expect(await readTag('secret', max)).toEqual({ slug: 'secret', label: null, projects: [] })
    expect(await readTag('inconnu', max)).toEqual({ slug: 'inconnu', label: null, projects: [] })
  })

  it('lists at most 50 projects, newest first', async () => {
    await insertProjects(PROJECT_LIST_MAX + 1, 'Claude', 'claude')

    const page = await readTag('claude', max)

    expect(page.projects).toHaveLength(PROJECT_LIST_MAX)
    expect(page.projects[0]?.title).toBe(`Projet ${PROJECT_LIST_MAX}`)
  })

  it('never lets a private project take one of the 50 places, nor give the tag its name', async () => {
    await insertProjects(PROJECT_LIST_MAX, 'Claude', 'claude')
    await insertNewerDraft('Claude', 'claude')

    const page = await readTag('claude', lea)

    expect(page.projects).toHaveLength(PROJECT_LIST_MAX)
    expect(page.projects.every((project) => project.visibility === 'public')).toBe(true)
    expect(page.label).toBe('Claude') // pas « Claude (privé) », le nom du brouillon
  })

  it('refuses an absurdly long tag, or one that gives no tag at all', async () => {
    expect((await tagPage('a'.repeat(201), max)).status).toBe(400)
    expect((await tagPage('   ', max)).status).toBe(400)
  })
})
