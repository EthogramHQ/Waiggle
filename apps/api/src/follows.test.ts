// Tests d'intégration de la tranche 4a : suivre un membre ou un projet, et le nombre d'abonnés.
// Scénarios : docs/scenarios/phase-1.md, « Précisions (tranche 4) ». Trois membres : Léa (celle
// qu'on suit), Max (qui la suit) et Zoé (une troisième, pour vérifier ce que voient les autres).
import { ErrorResponse, FollowingFeedPage, Me, Member, Project } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let lea: string // cookies de session
let max: string
let zoe: string
let leaId: string
let maxId: string
let zoeId: string

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

beforeEach(async () => {
  ctx = await createTestContext()
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  leaId = (await me(lea)).id
  maxId = (await me(max)).id
  zoeId = (await me(zoe)).id
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
const publish = async (cookie: string, body: object = {}) => {
  const res = await send('POST', '/v1/projects', cookie, {
    title: 'Mon agent de recettes',
    pitch: 'Un menu avec ce qu’il y a au frigo.',
    ...body,
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

// Les deux sortes de choses qu'on peut suivre, et l'adresse de leur abonnement.
type Kind = 'members' | 'projects'
const followPath = (kind: Kind, id: string) => `/v1/${kind}/${encodeURIComponent(id)}/follow`
const follow = (kind: Kind, id: string, cookie: string | null) =>
  send('POST', followPath(kind, id), cookie)
const unfollow = (kind: Kind, id: string, cookie: string | null) =>
  send('DELETE', followPath(kind, id), cookie)

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const readMember = async (id: string, cookie: string) => {
  const res = await send('GET', `/v1/members/${encodeURIComponent(id)}`, cookie)
  expect(res.status).toBe(200)
  return Member.parse(await res.json())
}

const readProject = async (id: string, cookie: string) => {
  const res = await send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

describe('following a member', () => {
  it('is only for signed-in members', async () => {
    await expectError(await follow('members', leaId, null), 401, 'unauthorized')
    await expectError(await unfollow('members', leaId, null), 401, 'unauthorized')
    // Témoin : la même demande, avec une session, réussit (la route existe bien).
    await expectDone(await follow('members', leaId, max))
  })

  it('follows her once, even when asked twice, and counts one more follower', async () => {
    expect((await readMember(leaId, max)).followerCount).toBe(0)

    await expectDone(await follow('members', leaId, max))
    await expectDone(await follow('members', leaId, max)) // suivre deux fois = suivre une fois

    expect(await readMember(leaId, max)).toMatchObject({ isFollowed: true, followerCount: 1 })
  })

  it('tells each visitor whether they follow her, and never on her own page', async () => {
    await follow('members', leaId, max)

    // Zoé ne la suit pas ; Léa voit son propre nombre d'abonnés, jamais « suivie » chez elle.
    expect(await readMember(leaId, zoe)).toMatchObject({ isFollowed: false, followerCount: 1 })
    expect(await readMember(leaId, lea)).toMatchObject({ isFollowed: false, followerCount: 1 })
  })

  it('stops following her, and accepts to stop following someone not followed', async () => {
    await follow('members', leaId, max)

    await expectDone(await unfollow('members', leaId, max))
    await expectDone(await unfollow('members', leaId, max)) // déjà fait : rien ne change
    await expectDone(await unfollow('members', leaId, zoe)) // Zoé ne l'a jamais suivie

    expect(await readMember(leaId, max)).toMatchObject({ isFollowed: false, followerCount: 0 })
  })

  it('refuses that a member follows herself', async () => {
    await expectError(await follow('members', leaId, lea), 400, 'cannot_follow_own')

    expect((await readMember(leaId, lea)).followerCount).toBe(0)
  })

  it('answers « not found » for an unknown member or a booby-trapped identifier', async () => {
    // Témoin : un membre qui existe se suit (le 404 qui suit tient au membre, pas à la route).
    await expectDone(await follow('members', leaId, max))
    for (const id of ['nobody-has-this-id', "x' or '1'='1", '../me', 'a'.repeat(65), 'é']) {
      await expectError(await follow('members', id, max), 404, 'not_found')
    }
  })

  it('answers « not found » for a member whose email was never verified', async () => {
    await ctx.signUp({ name: 'Tom', email: 'tom@example.com', password: 'tom-long-password' })
    const [tom] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'tom@example.com'))
    if (!tom) throw new Error('Tom should exist, unverified')
    await expectDone(await follow('members', leaId, max)) // témoin

    await expectError(await follow('members', tom.id, max), 404, 'not_found')
  })

  it('answers « not found » for a deleted account', async () => {
    await expectDone(await follow('members', leaId, max)) // témoin, avant la suppression
    await send('POST', '/api/auth/delete-user', lea, { password: leaAccount.password })

    await expectError(await follow('members', leaId, max), 404, 'not_found')
  })

  it('counts her followers without ever naming them', async () => {
    await follow('members', leaId, max)
    await follow('members', leaId, zoe)

    const res = await send('GET', `/v1/members/${leaId}`, lea)
    const text = await res.text()

    expect(Member.parse(JSON.parse(text)).followerCount).toBe(2)
    // Ni l'identifiant ni le nom des abonnés n'apparaissent dans la réponse.
    for (const secret of [maxId, zoeId, 'Max', 'Zoé']) expect(text).not.toContain(secret)
  })
})

describe('following a project', () => {
  it('is only for signed-in members', async () => {
    const project = await publish(lea)

    await expectError(await follow('projects', project.id, null), 401, 'unauthorized')
    await expectError(await unfollow('projects', project.id, null), 401, 'unauthorized')
    await expectDone(await follow('projects', project.id, max)) // témoin
  })

  it('follows a public project of another member once, even when asked twice', async () => {
    const project = await publish(lea)

    await expectDone(await follow('projects', project.id, max))
    await expectDone(await follow('projects', project.id, max))

    expect(await readProject(project.id, max)).toMatchObject({ isFollowed: true, followerCount: 1 })
    // L'autrice voit le nombre, jamais « suivi » sur son propre projet ; Zoé ne le suit pas.
    expect(await readProject(project.id, lea)).toMatchObject({
      isFollowed: false,
      followerCount: 1,
    })
    expect(await readProject(project.id, zoe)).toMatchObject({
      isFollowed: false,
      followerCount: 1,
    })
  })

  it('stops following it, and accepts to stop following a project not followed', async () => {
    const project = await publish(lea)
    await follow('projects', project.id, max)

    await expectDone(await unfollow('projects', project.id, max))
    await expectDone(await unfollow('projects', project.id, max))
    await expectDone(await unfollow('projects', project.id, zoe))

    expect(await readProject(project.id, max)).toMatchObject({
      isFollowed: false,
      followerCount: 0,
    })
  })

  it('refuses that a member follows her own project', async () => {
    const project = await publish(lea)

    await expectError(await follow('projects', project.id, lea), 400, 'cannot_follow_own')
    expect((await readProject(project.id, lea)).followerCount).toBe(0)
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    // Témoin : un projet public d'un autre membre se suit.
    await expectDone(await follow('projects', (await publish(lea)).id, max))
    for (const id of ['00000000-0000-4000-8000-000000000000', 'pas-un-identifiant']) {
      await expectError(await follow('projects', id, max), 404, 'not_found')
    }
  })

  it('answers « not found » for the private project of another member, as for an unknown one', async () => {
    const draft = await publish(lea, { visibility: 'private' })

    const res = await follow('projects', draft.id, max)
    const unknown = await follow('projects', '00000000-0000-4000-8000-000000000000', max)

    // Même réponse, mot pour mot : impossible de deviner qu'un projet privé existe à cette adresse.
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual(await unknown.json())
    expect((await readProject(draft.id, lea)).followerCount).toBe(0)
  })

  it('keeps following a project that went private and came back public', async () => {
    const project = await publish(lea)
    await follow('projects', project.id, max)

    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })
    // Pendant qu'il est privé, Max ne le voit plus du tout (ni la page, ni l'abonnement).
    expect((await send('GET', `/v1/projects/${project.id}`, max)).status).toBe(404)
    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'public' })

    expect(await readProject(project.id, max)).toMatchObject({ isFollowed: true, followerCount: 1 })
  })

  it('always lets a member stop following, even a project gone private, without revealing anything', async () => {
    // Max suivait le projet quand il était public ; Léa le passe en privé. Il doit pouvoir se
    // désabonner quand même, et la réponse est la même que pour un projet qui n'existe pas (204) :
    // « ne plus suivre » efface seulement ses propres abonnements, sans rien chercher d'autre.
    const project = await publish(lea)
    await follow('projects', project.id, max)
    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })

    await expectDone(await unfollow('projects', project.id, max))
    await expectDone(await unfollow('projects', '00000000-0000-4000-8000-000000000000', max))
    await expectDone(await unfollow('projects', project.id, lea)) // son propre projet : rien à faire
    await expectDone(await unfollow('members', 'unknown-member', max))
    await expectDone(await unfollow('members', leaId, lea)) // elle-même : rien à faire

    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'public' })
    expect(await readProject(project.id, max)).toMatchObject({ isFollowed: false, followerCount: 0 })
  })

  it('counts the followers of a project without ever naming them', async () => {
    const project = await publish(lea)
    await follow('projects', project.id, max)
    await follow('projects', project.id, zoe)

    const text = await (await send('GET', `/v1/projects/${project.id}`, lea)).text()

    expect(Project.parse(JSON.parse(text)).followerCount).toBe(2)
    for (const secret of [maxId, zoeId, 'Max', 'Zoé']) expect(text).not.toContain(secret)
  })

  it('keeps the follows of a member and of a project apart', async () => {
    const project = await publish(lea)

    await follow('members', leaId, max)

    // Suivre Léa ne fait pas suivre chacun de ses projets, et inversement.
    expect(await readProject(project.id, max)).toMatchObject({
      isFollowed: false,
      followerCount: 0,
    })
    await unfollow('members', leaId, max)
    await follow('projects', project.id, max)
    expect(await readMember(leaId, max)).toMatchObject({ isFollowed: false, followerCount: 0 })
  })
})

describe('limits against abuse', () => {
  it('blocks the 121st follow change within an hour, members and projects together', async () => {
    const project = await publish(lea)
    // 120 changements : on suit puis ne suit plus, tour à tour Léa et son projet.
    for (let i = 0; i < 30; i++) {
      await expectDone(await follow('members', leaId, max))
      await expectDone(await unfollow('members', leaId, max))
      await expectDone(await follow('projects', project.id, max))
      await expectDone(await unfollow('projects', project.id, max))
    }

    const res = await follow('members', leaId, max)

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    // Le refus ne change rien : Max ne suit toujours pas Léa.
    expect((await readMember(leaId, lea)).followerCount).toBe(0)
    // La limite est propre à chaque membre : Zoé, elle, peut encore suivre.
    await expectDone(await follow('members', leaId, zoe))
  })
})

describe('deleting an account', () => {
  it('removes her follows and her followers, and lowers the counts accordingly', async () => {
    const maxProject = await publish(max, { title: 'Projet de Max' })
    const leaProject = await publish(lea, { title: 'Projet de Léa' })
    // Léa suit Max et son projet ; Zoé suit Léa et son projet.
    await follow('members', maxId, lea)
    await follow('projects', maxProject.id, lea)
    await follow('members', leaId, zoe)
    await follow('projects', leaProject.id, zoe)
    expect((await readMember(maxId, zoe)).followerCount).toBe(1)

    const res = await send('POST', '/api/auth/delete-user', lea, {
      password: leaAccount.password,
    })
    expect(res.status).toBe(200)

    // Les abonnements de Léa ont disparu : Max et son projet n'ont plus d'abonnés.
    expect((await readMember(maxId, zoe)).followerCount).toBe(0)
    expect((await readProject(maxProject.id, zoe)).followerCount).toBe(0)
    // Ses abonnés aussi : Zoé ne suit plus personne.
    const feed = await send('GET', '/v1/feed/following', zoe)
    expect(feed.status).toBe(200)
    expect(FollowingFeedPage.parse(await feed.json()).followsAnyone).toBe(false)
  })
})
