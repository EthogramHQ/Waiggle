// Tests d'intégration de la tranche 4a : les deux fils de l'accueil, « Abonnements » et
// « Découvrir », lus page par page grâce à un curseur.
// Scénarios : docs/scenarios/phase-1.md, « Précisions (tranche 4) ». Trois membres : Léa (qui
// publie), Max (qui la suit) et Zoé (une troisième).
//
// Le temps est maîtrisé par le test : vi.useFakeTimers remplace l'horloge de JavaScript (Date)
// par une fausse, qu'on avance à la main. Deux raisons :
// - la limite de 20 nouveaux projets par jour lit cette horloge : en avançant de 2 h entre deux
//   publications, on peut en publier 45 sans attendre deux jours ;
// - les dates de publication sont distinctes et dans un ordre connu (ou, au contraire, toutes
//   égales, pour vérifier qu'un « ex aequo » ne fait rien perdre d'une page à l'autre).
// Seule Date est remplacée (toFake) : les vraies minuteries continuent de tourner, la base aussi.
import {
  type DiscoverQuery,
  ErrorResponse,
  FEED_PAGE_SIZE,
  FeedPage,
  FollowingFeedPage,
  Me,
  Project,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let lea: string // cookies de session
let max: string
let zoe: string
let leaId: string

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

beforeEach(async () => {
  // La fausse horloge part de l'heure réelle, puis n'avance que quand le test le demande. Elle est
  // posée avant de créer l'API : la limite de débit garde la fonction Date.now qu'elle trouve alors.
  const start = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)

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
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut de 2 heures). */
const later = (hours = 2) => vi.setSystemTime(Date.now() + hours * 60 * 60 * 1000)

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

/** Publie un projet, deux heures après ce qui précède, et renvoie ce que l'API a répondu. */
const publish = async (cookie: string, body: object = {}, { wait = true } = {}) => {
  if (wait) later()
  const res = await send('POST', '/v1/projects', cookie, {
    title: 'Un projet',
    pitch: 'Un pitch.',
    ...body,
  })
  expect(res.status).toBe(201)
  return Project.parse(await res.json())
}

/** Rend un projet public ou privé, deux heures après ce qui précède. */
const setVisibility = async (cookie: string, id: string, visibility: 'public' | 'private') => {
  later()
  const res = await send('PATCH', `/v1/projects/${id}`, cookie, { visibility })
  expect(res.status).toBe(200)
}

const followMember = async (id: string, cookie: string) =>
  expect((await send('POST', `/v1/members/${id}/follow`, cookie)).status).toBe(204)
const unfollowMember = async (id: string, cookie: string) =>
  expect((await send('DELETE', `/v1/members/${id}/follow`, cookie)).status).toBe(204)

// Les adresses des fils, avec leurs paramètres. URLSearchParams écrit chaque valeur sans qu'elle
// puisse changer l'adresse (un « & » glissé dans un curseur reste un simple caractère).
const followingPath = (cursor?: string) =>
  `/v1/feed/following${cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`}`
const discoverPath = (query: DiscoverQuery = {}) => {
  const params = new URLSearchParams(query as Record<string, string>).toString()
  return `/v1/feed/discover${params ? `?${params}` : ''}`
}

const readFollowing = async (cookie: string, cursor?: string) => {
  const res = await send('GET', followingPath(cursor), cookie)
  expect(res.status).toBe(200)
  return FollowingFeedPage.parse(await res.json())
}
const readDiscover = async (cookie: string, query: DiscoverQuery = {}) => {
  const res = await send('GET', discoverPath(query), cookie)
  expect(res.status).toBe(200)
  return FeedPage.parse(await res.json())
}

/** Lit un fil jusqu'au bout, page après page ; renvoie toutes les pages. */
const readAllPages = async (readPage: (cursor?: string) => Promise<FeedPage>) => {
  const pages: FeedPage[] = []
  let cursor: string | undefined
  // Garde-fou : un curseur qui ne mènerait jamais au bout ne doit pas bloquer le test.
  for (let i = 0; i < 10; i++) {
    const page = await readPage(cursor)
    pages.push(page)
    if (page.nextCursor === null) return pages
    cursor = page.nextCursor
  }
  throw new Error('the feed never ends')
}

/** Les identifiants des projets d'une page, dans l'ordre. */
const ids = (page: FeedPage) => page.items.map((item) => item.project.id)
/** La date d'un projet dans une page (le moment où il est devenu public). */
const atOf = (page: FeedPage, id: string) => page.items.find((item) => item.project.id === id)?.at

describe('the « following » feed', () => {
  it('is only for signed-in members', async () => {
    const res = await send('GET', '/v1/feed/following', null)

    expect(res.status).toBe(401)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unauthorized')
  })

  it('says that a member follows nobody, and shows nothing', async () => {
    await publish(lea)

    expect(await readFollowing(max)).toEqual({ items: [], nextCursor: null, followsAnyone: false })
  })

  it('shows the public projects of the members followed, newest first, and nobody else’s', async () => {
    const first = await publish(lea, { title: 'Premier' })
    const second = await publish(lea, { title: 'Second' })
    await publish(zoe, { title: 'De Zoé' }) // Max ne suit pas Zoé
    await publish(max, { title: 'De Max' }) // ni lui-même
    await followMember(leaId, max)

    const page = await readFollowing(max)

    expect(page.followsAnyone).toBe(true)
    expect(ids(page)).toEqual([second.id, first.id])
    expect(page.items[0]).toMatchObject({
      kind: 'project',
      project: { title: 'Second', author: { id: leaId, name: 'Léa' } },
    })
    expect(page.nextCursor).toBeNull()
  })

  it('counts following a single project as following someone, without listing its author’s projects', async () => {
    const project = await publish(lea)
    await publish(lea, { title: 'Un autre projet de Léa' })
    expect((await send('POST', `/v1/projects/${project.id}/follow`, max)).status).toBe(204)

    // Suivre un projet fera venir ses notes (tranche 4b), pas les nouveaux projets de l'autrice.
    expect(await readFollowing(max)).toEqual({ items: [], nextCursor: null, followsAnyone: true })
  })

  it('never shows a private project, even from a member followed', async () => {
    const shown = await publish(lea, { title: 'Public' })
    await publish(lea, { title: 'Brouillon', visibility: 'private' })
    await followMember(leaId, max)

    expect(ids(await readFollowing(max))).toEqual([shown.id])
  })

  it('stops showing the projects of a member no longer followed', async () => {
    await publish(lea)
    await followMember(leaId, max)
    expect(ids(await readFollowing(max))).toHaveLength(1)

    await unfollowMember(leaId, max)

    expect(await readFollowing(max)).toEqual({ items: [], nextCursor: null, followsAnyone: false })
  })
})

describe('the « discover » feed', () => {
  it('is only for signed-in members', async () => {
    const res = await send('GET', '/v1/feed/discover', null)

    expect(res.status).toBe(401)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unauthorized')
  })

  it('shows the public projects of every member, one’s own included, newest first', async () => {
    const fromLea = await publish(lea, { title: 'De Léa' })
    const fromMax = await publish(max, { title: 'De Max' })
    const fromZoe = await publish(zoe, { title: 'De Zoé' })

    const page = await readDiscover(max)

    expect(ids(page)).toEqual([fromZoe.id, fromMax.id, fromLea.id])
    expect(page.nextCursor).toBeNull()
  })

  it('never shows a private project, not even to its author', async () => {
    const shown = await publish(lea, { title: 'Public' })
    await publish(lea, { title: 'Brouillon', visibility: 'private' })

    expect(ids(await readDiscover(lea))).toEqual([shown.id])
    expect(ids(await readDiscover(max))).toEqual([shown.id])
  })

  it('keeps only the testable projects with a demo for « looking for testers »', async () => {
    const demo = 'https://demo.example.com'
    const wanted = await publish(lea, {
      title: 'Testable avec démo',
      status: 'testable',
      demoUrl: demo,
    })
    const noDemo = await publish(lea, { title: 'Testable sans démo', status: 'testable' })
    const idea = await publish(lea, { title: 'Idée avec démo', status: 'idea', demoUrl: demo })
    const done = await publish(max, { title: 'Fini avec démo', status: 'done', demoUrl: demo })
    await publish(max, {
      title: 'Testable mais privé',
      status: 'testable',
      demoUrl: demo,
      visibility: 'private',
    })

    expect(ids(await readDiscover(zoe, { testers: 'true' }))).toEqual([wanted.id])

    // Sans le filtre, ou avec testers=false : tous les projets publics.
    const all = [done.id, idea.id, noDemo.id, wanted.id]
    expect(ids(await readDiscover(zoe, { testers: 'false' }))).toEqual(all)
    expect(ids(await readDiscover(zoe))).toEqual(all)
  })

  it('refuses a « testers » value other than true or false', async () => {
    const res = await send('GET', '/v1/feed/discover?testers=yes', max)

    expect(res.status).toBe(400)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
  })
})

describe('the date of a project in the feeds', () => {
  it('drops a project that went private, and brings it back at its first publication date', async () => {
    const older = await publish(lea, { title: 'Plus ancien' })
    const newer = await publish(lea, { title: 'Plus récent' })
    await followMember(leaId, max)
    const firstDate = atOf(await readDiscover(max), older.id)

    await setVisibility(lea, older.id, 'private')
    expect(ids(await readFollowing(max))).toEqual([newer.id])
    expect(ids(await readDiscover(max))).toEqual([newer.id])
    expect(ids(await readDiscover(lea))).toEqual([newer.id]) // même pour son autrice

    await setVisibility(lea, older.id, 'public')
    // Repasser public ne le fait pas remonter : il reprend sa place et sa date.
    expect(ids(await readFollowing(max))).toEqual([newer.id, older.id])
    const discover = await readDiscover(max)
    expect(ids(discover)).toEqual([newer.id, older.id])
    expect(atOf(discover, older.id)).toBe(firstDate)
  })

  it('puts a private draft made public later at the top, dated from its publication', async () => {
    const draft = await publish(lea, { title: 'Brouillon', visibility: 'private' })
    const published = await publish(lea, { title: 'Publié tout de suite' })
    await followMember(leaId, max)

    later(24 * 7) // une semaine plus tard
    // Une session dure 7 jours : celles ouvertes au début du test ont expiré. Léa et Max se
    // reconnectent, comme ils le feraient en revenant une semaine plus tard.
    lea = ctx.cookiesFrom(await ctx.signIn(leaAccount))
    max = ctx.cookiesFrom(
      await ctx.signIn({ email: 'max@example.com', password: 'another-long-password' }),
    )
    await setVisibility(lea, draft.id, 'public')

    const following = await readFollowing(max)
    expect(ids(following)).toEqual([draft.id, published.id])
    expect(ids(await readDiscover(max))).toEqual([draft.id, published.id])
    // Sa date est celle de sa publication, plus récente que celle de l'autre projet.
    expect(Date.parse(atOf(following, draft.id) ?? '')).toBeGreaterThan(
      Date.parse(atOf(following, published.id) ?? ''),
    )
  })
})

describe('reading a feed page by page', () => {
  it('gives 45 projects in three pages of 20, 20 and 5, in order, without gaps or repeats', async () => {
    // 45 projets publics de Léa, deux heures d'écart chacun (sous la limite de 20 par jour).
    const published: string[] = []
    for (let i = 0; i < 45; i++) published.push((await publish(lea, { title: `Projet ${i}` })).id)
    await followMember(leaId, max)
    const newestFirst = [...published].reverse()

    for (const read of [
      (cursor?: string) => readFollowing(max, cursor),
      (cursor?: string) => readDiscover(max, cursor === undefined ? {} : { cursor }),
    ]) {
      const pages = await readAllPages(read)

      expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, FEED_PAGE_SIZE, 5])
      expect(pages.map((page) => page.nextCursor === null)).toEqual([false, false, true])
      expect(pages.flatMap(ids)).toEqual(newestFirst)
    }
  })

  it('loses no project and repeats none when several were published at the same instant', async () => {
    // 21 projets au même instant (la fausse horloge n'avance pas) : la limite d'une page tombe au
    // milieu des ex aequo. Répartis entre Léa et Max, pour rester sous la limite de 20 par jour.
    const published: string[] = []
    for (let i = 0; i < 11; i++) {
      published.push((await publish(lea, { title: `Léa ${i}` }, { wait: false })).id)
    }
    for (let i = 0; i < 10; i++) {
      published.push((await publish(max, { title: `Max ${i}` }, { wait: false })).id)
    }

    const pages = await readAllPages((cursor) =>
      readDiscover(zoe, cursor === undefined ? {} : { cursor }),
    )

    // Condition du test : ils portent bien tous la même date (celle de la fausse horloge).
    expect(new Set(pages.flatMap((page) => page.items.map((item) => item.at))).size).toBe(1)
    expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, 1])
    const seen = pages.flatMap(ids)
    expect(new Set(seen).size).toBe(seen.length) // aucun doublon
    expect([...seen].sort()).toEqual([...published].sort()) // aucun oubli
  })

  it('refuses a booby-trapped cursor', async () => {
    // Une apostrophe (injection SQL), un « = » de remplissage, un curseur trop long (201 caractères).
    for (const cursor of ["'OR1=1", 'abc=', 'a'.repeat(201)]) {
      for (const path of [followingPath(cursor), discoverPath({ cursor })]) {
        const res = await send('GET', path, max)
        expect(res.status, path).toBe(400)
        expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
      }
    }
  })

  it('refuses a well-formed cursor whose content makes no sense', async () => {
    // « aGVsbG8 » est bien du base64url, mais il ne contient que le mot « hello ».
    for (const path of [followingPath('aGVsbG8'), discoverPath({ cursor: 'aGVsbG8' })]) {
      const res = await send('GET', path, max)
      expect(res.status, path).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
  })
})

describe('a deleted account in the feeds', () => {
  it('takes her projects out of both feeds, and her follows with her', async () => {
    await publish(lea, { title: 'De Léa' })
    const fromZoe = await publish(zoe, { title: 'De Zoé' })
    await followMember(leaId, max)

    const res = await send('POST', '/api/auth/delete-user', lea, {
      password: leaAccount.password,
    })
    expect(res.status).toBe(200)

    // Max ne suivait que Léa : il ne suit plus personne, et ne voit plus ses projets nulle part.
    expect(await readFollowing(max)).toEqual({ items: [], nextCursor: null, followsAnyone: false })
    expect(ids(await readDiscover(max))).toEqual([fromZoe.id])
  })
})

describe('the API contract', () => {
  it('documents the follow and feed routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, unknown>
    }

    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/v1/members/{id}/follow',
        '/v1/projects/{id}/follow',
        '/v1/feed/following',
        '/v1/feed/discover',
      ]),
    )
  })
})
