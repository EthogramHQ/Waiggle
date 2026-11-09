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
import { randomUUID } from 'node:crypto'
import {
  AccountExport,
  type DiscoverQuery,
  ErrorResponse,
  FEED_PAGE_SIZE,
  FeedPage,
  FollowingFeedPage,
  Me,
  Member,
  Project,
  ProjectNote,
  SearchResults,
  ToolPage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { explainQueries } from './testing/explain'
import { addCatalogueTool, clearCatalogue } from './testing/tool-catalogue'

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
    primaryCategory: 'other',
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

    expect(await readFollowing(max)).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: false,
      lastReadAt: null,
    })
  })

  it('shows the public projects of the members followed and one’s own, newest first, and nobody else’s', async () => {
    const first = await publish(lea, { title: 'Premier' })
    const second = await publish(lea, { title: 'Second' })
    await publish(zoe, { title: 'De Zoé' }) // Max ne suit pas Zoé
    // R6a (décision de Louis du 8/11/2026) : ses propres projets entrent dans son fil.
    const own = await publish(max, { title: 'De Max' })
    await followMember(leaId, max)

    const page = await readFollowing(max)

    expect(page.followsAnyone).toBe(true)
    expect(ids(page)).toEqual([own.id, second.id, first.id])
    // Le premier élément est désormais le sien : on regarde le premier projet de Léa.
    expect(page.items[1]).toMatchObject({
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
    expect(await readFollowing(max)).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: true,
      lastReadAt: null,
    })
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

    expect(await readFollowing(max)).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: false,
      lastReadAt: null,
    })
  })

  it('reveals nothing about a followed project gone private: the same page as when it is deleted', async () => {
    // Max ne suit qu'un projet de Léa. Qu'il devienne privé ou qu'il soit supprimé, Max reçoit la
    // même page : rien ne lui dit que le projet existe encore.
    const project = await publish(lea)
    expect((await send('POST', `/v1/projects/${project.id}/follow`, max)).status).toBe(204)

    await setVisibility(lea, project.id, 'private')
    const whilePrivate = await readFollowing(max)
    expect((await send('DELETE', `/v1/projects/${project.id}`, lea)).status).toBe(204)
    const afterDeletion = await readFollowing(max)

    expect(whilePrivate).toEqual(afterDeletion)
    expect(whilePrivate).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: false,
      lastReadAt: null,
    })
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
    // « aGVsbG8 » est bien du base64url, mais il ne contient que le mot « hello ». L'autre est un
    // vrai curseur daté de l'an 0, une date que PostgreSQL refuse : il ne doit pas la recevoir.
    const yearZero = Buffer.from(
      JSON.stringify({ at: '0000-01-01T00:00:00Z', id: '00000000-0000-4000-8000-000000000000' }),
    ).toString('base64url')
    for (const path of [
      followingPath('aGVsbG8'),
      discoverPath({ cursor: 'aGVsbG8' }),
      followingPath(yearZero),
      discoverPath({ cursor: yearZero }),
    ]) {
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
    expect(await readFollowing(max)).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: false,
      lastReadAt: null,
    })
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

// --- Tranche 4b : les notes des projets suivis dans le fil « Abonnements » ---
// Seuls les projets suivis apportent leurs notes : suivre un membre fait venir ses nouveaux
// projets, pas ses notes. « Découvrir » ne montre que des projets, jamais de note.

/** Suit un projet. */
const followProject = async (id: string, cookie: string) =>
  expect((await send('POST', `/v1/projects/${id}/follow`, cookie)).status).toBe(204)

/** Publie une note sur un projet, deux heures après ce qui précède, et renvoie la note. */
const postNote = async (
  cookie: string,
  projectId: string,
  body = 'v2 : mode hors ligne',
  { wait = true } = {},
) => {
  if (wait) later()
  const res = await send('POST', `/v1/projects/${projectId}/notes`, cookie, { body })
  expect(res.status).toBe(201)
  return ProjectNote.parse(await res.json())
}

/**
 * Ce qu'est chaque élément d'une page : « project:<id> » ou « note:<id> ». Un projet et ses notes
 * ont des identifiants distincts : on voit ainsi sans ambiguïté ce que contient le fil.
 */
const keys = (page: FeedPage) =>
  page.items.map((item) =>
    item.kind === 'note' ? `note:${item.note.id}` : `project:${item.project.id}`,
  )
const noteKey = (note: ProjectNote) => `note:${note.id}`
const projectKey = (project: Project) => `project:${project.id}`

describe('the notes of followed projects in the « following » feed', () => {
  it('brings the notes of a followed project among the new projects, newest first, dated from their publication', async () => {
    const recipes = await publish(lea, { title: 'Mon agent de recettes' })
    await followProject(recipes.id, max)
    await followMember((await me(zoe)).id, max)
    const older = await publish(zoe, { title: 'Le carnet de jardin' })
    const v2 = await postNote(lea, recipes.id, 'v2 : mode hors ligne')
    const newer = await publish(zoe, { title: 'Le tri des photos' })

    const page = await readFollowing(max)

    expect(keys(page)).toEqual([projectKey(newer), noteKey(v2), projectKey(older)])
    // La note dit à quel projet elle appartient ; sa date est celle de sa publication.
    expect(page.items[1]).toEqual({
      kind: 'note',
      at: v2.createdAt,
      note: v2,
      project: expect.objectContaining({
        id: recipes.id,
        title: 'Mon agent de recettes',
        author: expect.objectContaining({ id: leaId, name: 'Léa' }),
      }),
    })
    expect(page.nextCursor).toBeNull()
  })

  it('leaves out the notes of a project not followed, even when its author is followed', async () => {
    const recipes = await publish(lea)
    await followMember(leaId, max)
    await postNote(lea, recipes.id)

    // Max suit Léa : il voit son nouveau projet, pas les notes de ce projet qu'il ne suit pas.
    expect(keys(await readFollowing(max))).toEqual([projectKey(recipes)])
  })

  it('shows the notes of a followed project to its followers only', async () => {
    const recipes = await publish(lea)
    await followProject(recipes.id, max)
    const v2 = await postNote(lea, recipes.id)

    expect(keys(await readFollowing(max))).toEqual([noteKey(v2)])
    // Zoé ne suit rien : son fil reste vide. Léa ne peut pas suivre son propre projet : son fil
    // montre le projet lui-même (R6a, ses propres projets), jamais les notes qu'elle y écrit.
    expect((await readFollowing(zoe)).items).toEqual([])
    expect(keys(await readFollowing(lea))).toEqual([projectKey(recipes)])
  })

  it('stops showing the notes of a project no longer followed', async () => {
    const recipes = await publish(lea)
    await followProject(recipes.id, max)
    const v2 = await postNote(lea, recipes.id)
    expect(keys(await readFollowing(max))).toEqual([noteKey(v2)]) // témoin

    expect((await send('DELETE', `/v1/projects/${recipes.id}/follow`, max)).status).toBe(204)

    expect(await readFollowing(max)).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: false,
      lastReadAt: null,
    })
  })

  it('removes a deleted note from the feed', async () => {
    const recipes = await publish(lea)
    await followProject(recipes.id, max)
    const kept = await postNote(lea, recipes.id, 'Première version en ligne')
    const removed = await postNote(lea, recipes.id, 'Une note publiée par erreur')
    expect(keys(await readFollowing(max))).toEqual([noteKey(removed), noteKey(kept)])

    const res = await send('DELETE', `/v1/projects/${recipes.id}/notes/${removed.id}`, lea)
    expect(res.status).toBe(204)

    expect(keys(await readFollowing(max))).toEqual([noteKey(kept)])
  })

  it('drops the notes of a followed project gone private, and brings them back at their date', async () => {
    const recipes = await publish(lea)
    await followProject(recipes.id, max)
    const v2 = await postNote(lea, recipes.id)
    expect(keys(await readFollowing(max))).toEqual([noteKey(v2)]) // témoin

    await setVisibility(lea, recipes.id, 'private')
    // Comme s'il avait été supprimé : rien ne trahit qu'il existe encore (voir les tests 4a).
    expect(await readFollowing(max)).toEqual({
      items: [],
      nextCursor: null,
      followsAnyone: false,
      lastReadAt: null,
    })

    await setVisibility(lea, recipes.id, 'public')
    const after = await readFollowing(max)
    expect(keys(after)).toEqual([noteKey(v2)])
    // Elle reprend sa place, à sa date de publication : repasser public ne la fait pas remonter.
    expect(after.items[0]?.at).toBe(v2.createdAt)
  })

  it('shows, once the project is public again, the notes written while it was private, at their own date', async () => {
    const recipes = await publish(lea)
    await followProject(recipes.id, max)
    await setVisibility(lea, recipes.id, 'private')
    const meanwhile = await postNote(lea, recipes.id, 'Écrite pendant que le projet était privé')
    expect((await readFollowing(max)).items).toEqual([])

    await setVisibility(lea, recipes.id, 'public')

    const page = await readFollowing(max)
    expect(keys(page)).toEqual([noteKey(meanwhile)])
    expect(page.items[0]?.at).toBe(meanwhile.createdAt)
  })

  it('takes the notes of a deleted account out of the feeds of her followers', async () => {
    const recipes = await publish(lea)
    const garden = await publish(zoe, { title: 'Le carnet de jardin' })
    await followProject(recipes.id, max)
    await followProject(garden.id, max)
    const fromLea = await postNote(lea, recipes.id, 'Note de Léa')
    const fromZoe = await postNote(zoe, garden.id, 'Note de Zoé')
    expect(keys(await readFollowing(max))).toEqual([noteKey(fromZoe), noteKey(fromLea)]) // témoin

    const res = await send('POST', '/api/auth/delete-user', lea, {
      password: leaAccount.password,
    })
    expect(res.status).toBe(200)

    // Seule la note de Zoé reste : celles de Léa ont disparu avec son compte.
    expect(keys(await readFollowing(max))).toEqual([noteKey(fromZoe)])
  })
})

describe('the notes of a project beyond its journal', () => {
  it('brings only the 20 latest notes of a project, those its author still sees and can delete', async () => {
    // Une note lisible par les abonnés doit rester visible, et supprimable, par son auteur : le fil
    // s'en tient donc aux notes du journal (les 20 plus récentes).
    const recipes = await publish(lea, { title: 'Mon agent de recettes' })
    await followProject(recipes.id, max)
    const notes: ProjectNote[] = []
    for (let i = 0; i < 21; i++) notes.push(await postNote(lea, recipes.id, `Note ${i}`))

    const pages = await readAllPages((cursor) => readFollowing(max, cursor))
    const seen = pages.flatMap(keys)

    expect(seen).toHaveLength(20)
    expect(seen).not.toContain(noteKey(notes[0] as ProjectNote)) // la plus ancienne
    expect(seen[0]).toBe(noteKey(notes[20] as ProjectNote))
  })
})

describe('notes in the « discover » feed', () => {
  it('never shows a note, only projects', async () => {
    const recipes = await publish(lea, { status: 'testable', demoUrl: 'https://demo.example.com' })
    await followProject(recipes.id, max)
    await postNote(lea, recipes.id)
    const garden = await publish(zoe, { title: 'Le carnet de jardin' })
    await postNote(zoe, garden.id)

    for (const cookie of [max, lea, zoe]) {
      expect(keys(await readDiscover(cookie))).toEqual([projectKey(garden), projectKey(recipes)])
      expect(keys(await readDiscover(cookie, { testers: 'true' }))).toEqual([projectKey(recipes)])
    }
  })
})

describe('reading a feed of notes and projects page by page', () => {
  it('gives 25 notes and 20 projects in pages of 20, in order, without gaps or repeats', async () => {
    // Max suit Léa (ses 20 nouveaux projets) et deux projets de Zoé (25 notes en tout, réparties :
    // le fil ne montre que les 20 dernières notes d'un même projet, celles de son journal). Les
    // deux sortes alternent, deux heures d'écart chacune : sous les limites de 20 projets et 30
    // notes par jour.
    const garden = await publish(zoe, { title: 'Le carnet de jardin' })
    const birds = await publish(zoe, { title: 'Les oiseaux du jardin' })
    await followProject(garden.id, max)
    await followProject(birds.id, max)
    await followMember(leaId, max)
    const published: string[] = []
    for (let i = 0; i < 25; i++) {
      const project = i % 2 === 0 ? garden : birds
      published.push(noteKey(await postNote(zoe, project.id, `Note ${i}`)))
      if (i < 20) published.push(projectKey(await publish(lea, { title: `Projet ${i}` })))
    }

    const pages = await readAllPages((cursor) => readFollowing(max, cursor))

    expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, FEED_PAGE_SIZE, 5])
    expect(pages.map((page) => page.nextCursor === null)).toEqual([false, false, true])
    expect(pages.flatMap(keys)).toEqual([...published].reverse())
  })

  it('loses nothing and repeats nothing when notes and projects share the same instant', async () => {
    // 21 éléments au même instant (la fausse horloge n'avance plus) : 11 projets de Léa et 10 notes
    // d'un projet de Zoé. La limite de la page tombe au milieu de ces ex aequo de deux sortes.
    const garden = await publish(zoe, { title: 'Le carnet de jardin' })
    await followProject(garden.id, max)
    await followMember(leaId, max)
    later()
    const published: string[] = []
    for (let i = 0; i < 11; i++) {
      published.push(projectKey(await publish(lea, { title: `Léa ${i}` }, { wait: false })))
    }
    for (let i = 0; i < 10; i++) {
      published.push(noteKey(await postNote(zoe, garden.id, `Note ${i}`, { wait: false })))
    }

    const pages = await readAllPages((cursor) => readFollowing(max, cursor))

    // Condition du test : tous portent bien la même date (celle de la fausse horloge).
    expect(new Set(pages.flatMap((page) => page.items.map((item) => item.at))).size).toBe(1)
    expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, 1])
    const seen = pages.flatMap(keys)
    expect(new Set(seen).size).toBe(seen.length) // aucun doublon
    expect([...seen].sort()).toEqual([...published].sort()) // aucun oubli
  })
})

// --- Tranche R4 : « Récents » et « testeurs » sans les auteurs jamais vérifiés (W4) ---
// Explorer (« Récents », « Ils cherchent des testeurs ») lit le fil « Découvrir » : il prend la
// même règle que la recherche, les étiquettes et les outils (R3, sec-A3) : le projet d'un compte
// qui n'a jamais vérifié son adresse n'existe pour personne.

describe('the « discover » feed and unverified authors (R4, W4)', () => {
  it('leaves out of « recent » and « testers » the projects of an author who never verified his address', async () => {
    const demo = 'https://demo.example.com'
    const shown = await publish(lea, { title: 'De Léa', status: 'testable', demoUrl: demo })
    // Tom s'inscrit sans ouvrir son lien : son compte existe, jamais vérifié. Son projet est rangé
    // directement en base (un compte non vérifié ne peut pas se connecter pour publier) : c'est
    // l'état qu'aurait laissé un compte vérifié plus tard « dé-vérifié », ou une donnée ancienne.
    await ctx.signUp({ name: 'Tom', email: 'tom@example.com', password: 'tom-long-password' })
    const [tom] = await ctx.db
      .select({ id: schema.user.id, emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.email, 'tom@example.com'))
    expect(tom?.emailVerified).toBe(false)
    later()
    const at = new Date()
    const hidden = randomUUID()
    await ctx.db.insert(schema.project).values({
      id: hidden,
      authorId: tom?.id ?? '',
      title: 'De Tom, jamais vérifié',
      pitch: 'Un pitch.',
      description: '',
      status: 'testable',
      visibility: 'public',
      demoUrl: demo,
      tools: [],
      toolSlugs: [],
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
    })

    for (const cookie of [max, lea]) {
      expect(ids(await readDiscover(cookie))).toEqual([shown.id])
      expect(ids(await readDiscover(cookie, { testers: 'true' }))).toEqual([shown.id])
    }
  })
})

// --- Tranche R4 : le total des réactions sur chaque carte ---
// Le résumé d'un projet (ProjectSummary) porte `reactionTotal`, la somme des cinq compteurs, mêmes
// règles que la page du projet : les réactions d'un membre bloqué comptent (les nombres sont les
// mêmes pour tous) ; 0 sur un projet privé ou retiré, même pour son auteur (sec-A4). Le total égale
// la somme de la page du projet pour le même lecteur (jur-J10). Il est lu partout où une carte
// s'affiche : le fil « Abonnements », « Découvrir » (et « testeurs »), la recherche, la page d'une
// étiquette, la page d'un membre.

describe('the reaction total of each project (R4)', () => {
  // R6b : la page d'un outil n'existe que pour un outil du catalogue (un « Autre » répond 404).
  // On remplace le catalogue semé par le seul outil que ces tests citent, Mistral : les projets
  // publiés avec « Mistral » y sont rattachés, et sa page (/v1/tags/mistral) les liste.
  beforeEach(async () => {
    await clearCatalogue(ctx.db)
    await addCatalogueTool(ctx.db, { name: 'Mistral', family: 'assistant' })
  })

  const react = async (projectId: string, kind: string, cookie: string) =>
    expect((await send('PUT', `/v1/projects/${projectId}/reactions/${kind}`, cookie)).status).toBe(
      204,
    )

  /** La somme des compteurs de la page du projet, telle que ce lecteur la lit. */
  const pageTotal = async (projectId: string, cookie: string) => {
    const res = await send('GET', `/v1/projects/${projectId}`, cookie)
    expect(res.status).toBe(200)
    const { counts } = Project.parse(await res.json()).reactions
    return Object.values(counts).reduce((sum, n) => sum + n, 0)
  }

  /** Les résumés de projets de chaque liste où ce lecteur peut voir une carte, par liste. */
  const listsOf = async (cookie: string, memberId: string, tag: string, words: string) => {
    const get = async (path: string) => {
      const res = await send('GET', path, cookie)
      expect(res.status, path).toBe(200)
      return res.json()
    }
    return {
      following: (await readFollowing(cookie)).items.map((item) => item.project),
      discover: (await readDiscover(cookie)).items.map((item) => item.project),
      testers: (await readDiscover(cookie, { testers: 'true' })).items.map((item) => item.project),
      search: SearchResults.parse(await get(`/v1/search?${new URLSearchParams({ q: words })}`))
        .projects.items,
      tag: ToolPage.parse(await get(`/v1/tags/${tag}`)).projects,
      member: Member.parse(await get(`/v1/members/${memberId}`)).projects,
    }
  }

  /** Pour chaque liste, le total de chaque projet, par identifiant. */
  const totalsIn = (lists: Record<string, { id: string; reactionTotal: number }[]>) =>
    Object.fromEntries(
      Object.entries(lists).map(([name, projects]) => [
        name,
        Object.fromEntries(projects.map((p) => [p.id, p.reactionTotal])),
      ]),
    )

  it('gives the total of the reactions in every list, the same as the project page', async () => {
    const demo = 'https://cafes.example.com'
    const quiet = await publish(lea, {
      title: 'Carnet de thés',
      tools: ['Mistral'],
      status: 'testable',
      demoUrl: demo,
    })
    const liked = await publish(lea, {
      title: 'Carnet de cafés',
      tools: ['Mistral'],
      status: 'testable',
      demoUrl: demo,
    })
    await followMember(leaId, max)
    // Trois réactions de deux membres : Max en pose deux, Zoé une ; « quiet » n'en a aucune.
    await react(liked.id, 'bravo', max)
    await react(liked.id, 'useful', max)
    await react(liked.id, 'bravo', zoe)

    const expected = { [liked.id]: 3, [quiet.id]: 0 }
    const lists = await listsOf(max, leaId, 'mistral', 'carnet')
    for (const [name, totals] of Object.entries(totalsIn(lists))) {
      expect(totals, name).toEqual(expected)
    }
    // Le même nombre que la page du projet, pour le même lecteur (jur-J10).
    expect(await pageTotal(liked.id, max)).toBe(3)
    expect(await pageTotal(quiet.id, max)).toBe(0)
    // Et le même pour tous : Léa, l'autrice, lit les mêmes totaux sur sa propre page.
    const own = Member.parse(await (await send('GET', `/v1/members/${leaId}`, lea)).json())
    expect(totalsIn({ own: own.projects }).own).toEqual(expected)
  })

  it('counts the reactions of a blocked member in the total, as the project page does', async () => {
    const liked = await publish(lea, { title: 'Carnet de cafés', tools: ['Mistral'] })
    await followMember(leaId, max)
    const zoeId = (await me(zoe)).id
    await react(liked.id, 'bravo', zoe)
    await react(liked.id, 'amazing', zoe)
    await react(liked.id, 'useful', max)

    // Max bloque Zoé : il ne voit plus rien de ce qu'elle écrit, mais les nombres ne changent pas.
    expect((await send('PUT', `/v1/members/${zoeId}/block`, max)).status).toBe(204)

    const lists = await listsOf(max, leaId, 'mistral', 'carnet')
    for (const [name, totals] of Object.entries(totalsIn(lists))) {
      // « testers » est vide : le projet n'est pas testable.
      if (name === 'testers') continue
      expect(totals, name).toEqual({ [liked.id]: 3 })
    }
    expect(await pageTotal(liked.id, max)).toBe(3)
  })

  it('shows no total on a private or removed project summary, even to its author and in the export', async () => {
    const kept = await publish(lea, { title: 'Carnet gardé public' })
    const hidden = await publish(lea, { title: 'Carnet devenu privé' })
    const removed = await publish(lea, { title: 'Carnet retiré' })
    for (const project of [kept, hidden, removed]) {
      await react(project.id, 'bravo', max)
      await react(project.id, 'funny', zoe)
    }
    await setVisibility(lea, hidden.id, 'private')
    // Zoé est administratrice (rôle posé en base, comme infra/grant-admin.sh) ; un retrait répond
    // à un signalement ouvert : Max signale, puis Zoé retire.
    const act = activity(ctx)
    await act.makeAdmin((await me(zoe)).id)
    later()
    await act.report(max, { kind: 'project', id: removed.id })
    later()
    await act.decide(zoe, {
      action: 'remove',
      target: { kind: 'project', id: removed.id },
      ground: 'rules',
      explanation: 'Ce projet ne respecte pas les règles.',
    })

    // Léa lit sa propre page, où figurent aussi ses projets privés et retirés.
    const own = Member.parse(await (await send('GET', `/v1/members/${leaId}`, lea)).json())
    expect(totalsIn({ own: own.projects }).own).toEqual({
      [kept.id]: 2, // témoin : un projet public garde son total
      [hidden.id]: 0,
      [removed.id]: 0,
    })
    // Sa page de projet dit la même chose.
    expect(await pageTotal(kept.id, lea)).toBe(2)
    expect(await pageTotal(hidden.id, lea)).toBe(0)
    expect(await pageTotal(removed.id, lea)).toBe(0)

    // L'export de Léa : ses projets avec leurs compteurs, aucun sur le privé ni sur le retiré.
    const res = await send('GET', '/v1/me/export', lea)
    expect(res.status).toBe(200)
    const exported = AccountExport.parse(await res.json())
    const counted = Object.fromEntries(
      exported.projects.map((p) => [
        p.id,
        Object.values(p.reactions.counts).reduce((sum, n) => sum + n, 0),
      ]),
    )
    expect(counted).toEqual({ [kept.id]: 2, [hidden.id]: 0, [removed.id]: 0 })
  })

  it('reads the totals of a whole page in a constant number of queries', async () => {
    await followMember(leaId, max)
    /** Toutes les requêtes de chaque liste, et celles qui lisent les réactions. */
    const measure = async () => {
      const queries = await explainQueries(ctx.db, async () => {
        await listsOf(max, leaId, 'mistral', 'carnet')
      })
      return {
        all: queries.length,
        reactions: queries.filter((q) => q.sql.includes('project_reaction')).length,
      }
    }

    const first = await publish(lea, { title: 'Carnet 1', tools: ['Mistral'] })
    await react(first.id, 'bravo', max)
    const one = await measure()

    for (const n of [2, 3, 4]) {
      const project = await publish(lea, { title: `Carnet ${n}`, tools: ['Mistral'] })
      await react(project.id, 'bravo', max)
      await react(project.id, 'useful', zoe)
    }
    const four = await measure()

    expect(four).toEqual(one)
    // Une requête groupée des totaux par liste lue (six listes), quel que soit le nombre de cartes.
    expect(one.reactions).toBe(6)
  })
})

// --- Tranche R6a : ses propres projets dans son fil « Abonnements » ---
// Scénario : docs/scenarios/refonte.md, « R6a », « Publier et la danse » : « ses propres projets
// visibles des membres entrent dans son propre fil, à leur date, sans jamais compter dans les
// nouveautés » (décision de Louis du 8/11/2026). Après « Publier », la danse de l'abeille file vers
// la nouvelle carte, en tête du fil : il faut donc que le fil la contienne.
//
// Plan (section « API ») : le morceau « nouveaux projets » du fil prend les projets des membres
// suivis **ou** ceux du lecteur ; rien d'autre ne change. Donc :
// - ses projets privés et ses projets retirés par la modération n'y sont jamais, comme pour ceux des
//   autres ;
// - ses notes n'y viennent pas : seules les notes des projets suivis entrent dans le fil, et l'on ne
//   suit pas son propre projet ;
// - `followsAnyone` parle toujours de ses abonnements : publier ne fait suivre personne.
// Les nouveautés se comptent dans l'appli (feed/api.ts) ; l'API, elle, garantit que la carte porte
// son auteur, le lecteur lui-même : c'est ce qui permet à l'appli de la laisser hors du compte
// (HomeScreen.news.test.tsx).
//
// Ici Max est le lecteur qui publie ; il suit Léa, et ne suit pas Zoé.

describe('one’s own projects in the « following » feed (R6a)', () => {
  let maxId: string

  beforeEach(async () => {
    maxId = (await me(max)).id
  })

  it('shows my projects visible to the members among those of the members I follow, at their date', async () => {
    await followMember(leaId, max)
    const fromLea = await publish(lea, { title: 'Le carnet de Léa' })
    const mine = await publish(max, { title: 'Mon agent de recettes' })
    const newer = await publish(lea, { title: 'Le tri des photos' })

    const page = await readFollowing(max)

    // À sa date : entre les deux projets de Léa, pas en tête parce qu'il est à lui.
    expect(ids(page)).toEqual([newer.id, mine.id, fromLea.id])
    expect(page.items[1]).toMatchObject({
      kind: 'project',
      project: { id: mine.id, title: 'Mon agent de recettes', author: { id: maxId, name: 'Max' } },
    })
    // Sa date est celle de sa publication, la même que dans « Découvrir ».
    expect(atOf(page, mine.id)).toBe(atOf(await readDiscover(zoe), mine.id))
    expect(page.nextCursor).toBeNull()
  })

  it('shows my projects even when I follow nobody, and still says that I follow nobody', async () => {
    const mine = await publish(max, { title: 'Mon agent de recettes' })
    await publish(lea, { title: 'De Léa, que Max ne suit pas' })

    const page = await readFollowing(max)

    expect(ids(page)).toEqual([mine.id])
    // Publier ne fait suivre personne : l'appli garde son invitation à suivre des proches.
    expect(page.followsAnyone).toBe(false)
    expect(page.lastReadAt).toBeNull()
    expect(page.nextCursor).toBeNull()
  })

  it('reads the new projects of the feed through the author index, my own included (sec-S1)', async () => {
    // « in (suivis union all moi) » doit rester une jointure sur l'index (author_id, published_at),
    // pas une lecture de toute la table project : on le lit dans le plan, après `analyze` (les
    // statistiques de PostgreSQL). 500 autres membres, que Max ne suit pas, ont 20 projets chacun,
    // tous plus récents que ceux de Léa et de Max : lire le fil par date seulement (index
    // project_public_published_idx) les parcourrait tous ; l'index d'auteur n'en lit que ceux des
    // deux auteurs voulus. Avec trois auteurs seulement, PostgreSQL préfère le parcours par date.
    await followMember(leaId, max)
    await publish(lea, { title: 'Le carnet de Léa' })
    await publish(max, { title: 'Mon agent de recettes' })
    await ctx.db.execute(sql`
      insert into "user" (id, name, email)
      select 'filler-' || a, 'Membre ' || a, 'filler-' || a || '@example.test'
      from generate_series(1, 500) as a`)
    await ctx.db.execute(sql`
      insert into project (id, author_id, title, pitch, visibility, published_at)
      select gen_random_uuid(), 'filler-' || (n % 500 + 1), 'Lot ' || n, 'Résumé', 'public',
             timestamp '2100-01-01' - make_interval(mins => n)
      from generate_series(1, 10000) as n`)
    await ctx.db.execute(sql`analyze project`)

    const queries = await explainQueries(ctx.db, () => readFollowing(max))

    // La requête des lignes du fil : la seule qui mêle projets et notes (le mot 'note' en dur).
    const feedQuery = queries.find(
      (q) => q.sql.includes('member_follow') && q.sql.includes("'note'"),
    )
    expect(feedQuery).toBeDefined()
    // Les deux index qui commencent par l'auteur conviennent (PostgreSQL choisit entre eux selon
    // ses statistiques) ; le parcours par date seul, non. Les deux projets des deux auteurs
    // (Léa, suivie, et Max, le lecteur : la branche « union all ») sortent.
    expect(feedQuery?.plan).toMatch(/project_author_(published|created)_idx/)
    expect(feedQuery?.plan).not.toContain('project_public_published_idx')
    expect(feedQuery?.plan).toContain('rows=2.00')
  })

  it('never shows my private projects, not even to me', async () => {
    const shown = await publish(max, { title: 'Visible des membres' })
    await publish(max, { title: 'Mon brouillon', visibility: 'private' })

    expect(ids(await readFollowing(max))).toEqual([shown.id])
  })

  it('drops my project gone private, and brings it back at its first date when it is visible again', async () => {
    const older = await publish(max, { title: 'Plus ancien' })
    const newer = await publish(max, { title: 'Plus récent' })
    const before = await readFollowing(max)
    expect(ids(before)).toEqual([newer.id, older.id]) // témoin
    const firstDate = atOf(before, older.id)

    await setVisibility(max, older.id, 'private')
    expect(ids(await readFollowing(max))).toEqual([newer.id])

    await setVisibility(max, older.id, 'public')
    const after = await readFollowing(max)
    // Repasser « Membres de Waiggle » ne le fait pas remonter : il reprend sa place et sa date.
    expect(ids(after)).toEqual([newer.id, older.id])
    expect(atOf(after, older.id)).toBe(firstDate)
  })

  it('puts my private draft made visible later at the top, dated from that moment', async () => {
    const draft = await publish(max, { title: 'Mon brouillon', visibility: 'private' })
    const published = await publish(max, { title: 'Publié tout de suite' })

    await setVisibility(max, draft.id, 'public')

    const page = await readFollowing(max)
    expect(ids(page)).toEqual([draft.id, published.id])
    expect(Date.parse(atOf(page, draft.id) ?? '')).toBeGreaterThan(
      Date.parse(atOf(page, published.id) ?? ''),
    )
  })

  it('never shows my project removed by the moderation, not even to me', async () => {
    const kept = await publish(max, { title: 'Projet gardé' })
    const removed = await publish(max, { title: 'Projet retiré' })
    expect(ids(await readFollowing(max))).toEqual([removed.id, kept.id]) // témoin

    // Zoé est administratrice (rôle posé en base) ; un retrait répond à un signalement ouvert :
    // Léa signale, puis Zoé retire.
    const act = activity(ctx)
    await act.makeAdmin((await me(zoe)).id)
    later()
    await act.report(lea, { kind: 'project', id: removed.id })
    later()
    await act.decide(zoe, {
      action: 'remove',
      target: { kind: 'project', id: removed.id },
      ground: 'rules',
      explanation: 'Ce projet ne respecte pas les règles.',
    })

    const page = await readFollowing(max)
    expect(ids(page)).toEqual([kept.id])
    // Rien du projet retiré, pas même son titre.
    expect(JSON.stringify(page)).not.toContain('Projet retiré')
  })

  it('brings my projects, never the notes I write on them', async () => {
    const mine = await publish(max, { title: 'Mon agent de recettes' })
    await postNote(max, mine.id, 'v2 : mode hors ligne')

    // On ne suit pas son propre projet : ses notes restent sur sa page, le fil montre le projet.
    expect(keys(await readFollowing(max))).toEqual([projectKey(mine)])
  })

  it('shows my projects in my feed only, never in the feed of a member who does not follow me', async () => {
    await followMember(leaId, max) // Max suit Léa ; Léa ne suit pas Max
    const mine = await publish(max, { title: 'Mon agent de recettes' })
    const fromLea = await publish(lea, { title: 'Le carnet de Léa' })
    expect(ids(await readFollowing(max))).toEqual([fromLea.id, mine.id]) // témoin

    expect(ids(await readFollowing(lea))).toEqual([fromLea.id]) // le sien, pas celui de Max
    expect((await readFollowing(zoe)).items).toEqual([])
  })

  it('gives my card in the feed my own identifier as author, so the app leaves it out of the news', async () => {
    await followMember(leaId, max)
    await publish(lea, { title: 'Le carnet de Léa' })
    // Max lit son fil jusqu'au premier élément, comme l'appli après l'avoir affiché.
    const read = await readFollowing(max)
    const upTo = read.items[0]?.at
    expect((await send('PUT', '/v1/feed/read', max, { upTo })).status).toBe(204)

    // Puis il publie : sa carte arrive en tête, plus récente que la dernière lecture.
    const mine = await publish(max, { title: 'Mon agent de recettes' })
    const page = await readFollowing(max)

    expect(ids(page)[0]).toBe(mine.id)
    expect(Date.parse(page.items[0]?.at ?? '')).toBeGreaterThan(Date.parse(upTo ?? ''))
    // Ce qui permet à l'appli de ne pas la compter : son auteur est le lecteur lui-même.
    expect(page.items[0]?.project.author.id).toBe(maxId)
    // Publier ne marque pas le fil lu : la date de lecture reste celle que l'appli a envoyée.
    expect(page.lastReadAt).toBe(upTo)
  })

  it('gives my projects and those of the members I follow page by page, without gaps or repeats', async () => {
    // 24 projets qui alternent, deux heures d'écart chacun : 12 de Léa, 12 de Max (sous la limite
    // de 20 par jour et par membre). La limite de la première page tombe au milieu des deux.
    await followMember(leaId, max)
    const published: string[] = []
    for (let i = 0; i < 12; i++) {
      published.push((await publish(lea, { title: `Léa ${i}` })).id)
      published.push((await publish(max, { title: `Max ${i}` })).id)
    }

    const pages = await readAllPages((cursor) => readFollowing(max, cursor))

    expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, 4])
    expect(pages.map((page) => page.nextCursor === null)).toEqual([false, true])
    expect(pages.flatMap(ids)).toEqual([...published].reverse())
  })

  it('loses none of my projects and repeats none when they share an instant with those followed', async () => {
    // 21 projets au même instant (la fausse horloge n'avance plus) : 11 de Léa, 10 de Max.
    await followMember(leaId, max)
    later()
    const published: string[] = []
    for (let i = 0; i < 11; i++) {
      published.push((await publish(lea, { title: `Léa ${i}` }, { wait: false })).id)
    }
    for (let i = 0; i < 10; i++) {
      published.push((await publish(max, { title: `Max ${i}` }, { wait: false })).id)
    }

    const pages = await readAllPages((cursor) => readFollowing(max, cursor))

    // Condition du test : tous portent bien la même date.
    expect(new Set(pages.flatMap((page) => page.items.map((item) => item.at))).size).toBe(1)
    expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, 1])
    const seen = pages.flatMap(ids)
    expect(new Set(seen).size).toBe(seen.length) // aucun doublon
    expect([...seen].sort()).toEqual([...published].sort()) // aucun oubli
  })

  it('reads my projects and those followed in a constant number of queries', async () => {
    await followMember(leaId, max)
    const count = async () => (await explainQueries(ctx.db, () => readFollowing(max))).length

    await publish(lea, { title: 'Léa 1' })
    await publish(max, { title: 'Max 1' })
    const two = await count()
    for (let i = 2; i <= 5; i++) {
      await publish(lea, { title: `Léa ${i}` })
      await publish(max, { title: `Max ${i}` })
    }
    const ten = await count()

    // Témoin : les cinq projets de Max sont bien lus avec ceux de Léa.
    expect(ids(await readFollowing(max))).toHaveLength(10)
    expect(ten).toBe(two)
  })
})

// --- Tranche R6b : « Découvrir » filtré par catégorie ---
// Scénario : docs/scenarios/refonte.md, « R6b », « Les catégories en filtre », Explorer : une
// pastille de catégorie ne garde, dans « Récents », que les projets classés dans cette catégorie,
// en principale ou en seconde, page après page. Plan, section « API » (B2b) : GET
// /v1/feed/discover?category= (DiscoverQuery du contrat), même curseur `(date, id)` que sans filtre.
//
// Le curseur ne porte pas le filtre : l'appli renvoie `category` avec chaque page, comme `testers`.
// Ce qui ne change pas : jamais un projet privé (même pour son auteur), retiré, d'un membre bloqué
// ou d'un auteur jamais vérifié. Les projets d'avant R6a, sans catégorie, ne sortent que sans filtre
// (scénario, « La recherche » ; même règle ici : un filtre ne garde que ce qui y est rangé).

describe('the « discover » feed filtered by a category (R6b)', () => {
  let act: ReturnType<typeof activity>
  let louis: string

  beforeEach(async () => {
    act = activity(ctx)
    // Louis, administrateur (rôle posé en base), retire les projets signalés.
    louis = await ctx.verifiedMember({
      name: 'Louis',
      email: 'louis@example.com',
      password: 'louis-long-password',
    })
    await act.makeAdmin((await me(louis)).id)
  })

  /** Retire un projet : Max le signale, Louis décide (un retrait répond à un signalement ouvert). */
  const remove = async (projectId: string) => {
    later()
    await act.report(max, { kind: 'project', id: projectId })
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: projectId },
      ground: 'rules',
      explanation: 'Ce projet ne respecte pas les règles.',
    })
  }

  /**
   * Range un projet public de Léa directement en base, deux heures après ce qui précède : pour en
   * poser 45 sans la limite de 20 publications par jour, ou un projet d'avant R6a (catégorie
   * nulle), que la publication ne permet plus.
   */
  const insertProject = async (
    title: string,
    categories: { primaryCategory: string | null; secondaryCategory?: string | null },
  ) => {
    later()
    const at = new Date()
    const id = randomUUID()
    await ctx.db.insert(schema.project).values({
      id,
      authorId: leaId,
      title,
      pitch: 'Un pitch.',
      description: '',
      status: 'idea',
      visibility: 'public',
      tools: [],
      toolSlugs: [],
      primaryCategory: categories.primaryCategory,
      secondaryCategory: categories.secondaryCategory ?? null,
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
    })
    return id
  }

  it('keeps only the projects of the category, in first or in second place, newest first', async () => {
    const chatiere = await publish(lea, { title: 'Chatière', primaryCategory: 'animals' })
    const croquettes = await publish(max, {
      title: 'Croquettes',
      primaryCategory: 'cooking',
      secondaryCategory: 'animals',
    })
    const recettes = await publish(zoe, { title: 'Carnet de recettes', primaryCategory: 'cooking' })
    const esquisse = await publish(lea, { title: 'Esquisse', primaryCategory: 'art' })

    expect(ids(await readDiscover(zoe, { category: 'animals' }))).toEqual([
      croquettes.id,
      chatiere.id,
    ])
    expect(ids(await readDiscover(zoe, { category: 'cooking' }))).toEqual([
      recettes.id,
      croquettes.id,
    ])
    expect(ids(await readDiscover(zoe, { category: 'art' }))).toEqual([esquisse.id])
    // Témoin : sans filtre, les quatre.
    expect(ids(await readDiscover(zoe))).toEqual([
      esquisse.id,
      recettes.id,
      croquettes.id,
      chatiere.id,
    ])
  })

  it('gives an empty last page for a category without any visible project', async () => {
    await publish(lea, { title: 'Chatière', primaryCategory: 'animals' })
    await publish(max, {
      title: 'Voyage en brouillon',
      primaryCategory: 'travel',
      visibility: 'private',
    })

    // « travel » est une catégorie connue, sans projet visible : une page vide, pas une erreur.
    const page = await readDiscover(zoe, { category: 'travel' })

    expect(page.items).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  it('never shows a private or a removed project in a category, not even to its author', async () => {
    const shown = await publish(lea, { title: 'Chatière', primaryCategory: 'animals' })
    await publish(lea, {
      title: 'Brouillon',
      primaryCategory: 'cooking',
      secondaryCategory: 'animals',
      visibility: 'private',
    })
    const removed = await publish(lea, { title: 'Retiré', primaryCategory: 'animals' })
    await publish(zoe, { title: 'Carnet de recettes', primaryCategory: 'cooking' })
    // Témoin : avant le retrait, le projet est bien dans la catégorie.
    expect(ids(await readDiscover(max, { category: 'animals' }))).toEqual([removed.id, shown.id])

    await remove(removed.id)

    for (const cookie of [lea, max]) {
      expect(ids(await readDiscover(cookie, { category: 'animals' }))).toEqual([shown.id])
    }
  })

  it('leaves out the projects without a category, from before R6a, once a category is chosen', async () => {
    const old = await insertProject('Ancien carnet', { primaryCategory: null })
    const recent = await publish(lea, { title: 'Carnet récent', primaryCategory: 'other' })

    // Témoin : sans filtre, le projet d'avant R6a est là.
    expect(ids(await readDiscover(max))).toEqual([recent.id, old])
    // Avec un filtre, même « Autre », il n'y est jamais.
    expect(ids(await readDiscover(max, { category: 'other' }))).toEqual([recent.id])
    expect(ids(await readDiscover(max, { category: 'animals' }))).toEqual([])
  })

  it('leaves out the projects of a blocked member, in both directions', async () => {
    const fromLea = await publish(lea, { title: 'De Léa', primaryCategory: 'animals' })
    const fromZoe = await publish(zoe, { title: 'De Zoé', primaryCategory: 'animals' })
    const fromMax = await publish(max, { title: 'De Max', primaryCategory: 'animals' })
    await publish(lea, { title: 'Carnet de recettes', primaryCategory: 'cooking' })
    later()
    await act.block((await me(zoe)).id, max)

    // Max a bloqué Zoé : ni lui ne voit ses projets, ni elle les siens.
    expect(ids(await readDiscover(max, { category: 'animals' }))).toEqual([fromMax.id, fromLea.id])
    expect(ids(await readDiscover(zoe, { category: 'animals' }))).toEqual([fromZoe.id, fromLea.id])
    // Léa, elle, ne voit aucune différence.
    expect(ids(await readDiscover(lea, { category: 'animals' }))).toEqual([
      fromMax.id,
      fromZoe.id,
      fromLea.id,
    ])
  })

  it('keeps the category from page to page, without gaps or repeats', async () => {
    // 45 projets : un sur trois en « Animaux », un sur trois en « Cuisine » avec « Animaux » en
    // seconde, un sur trois en « Cuisine » seulement. Le filtre « Animaux » en garde 30.
    const animals: string[] = []
    for (let i = 0; i < 45; i++) {
      const id = await insertProject(`Projet ${i}`, {
        primaryCategory: i % 3 === 0 ? 'animals' : 'cooking',
        secondaryCategory: i % 3 === 1 ? 'animals' : null,
      })
      if (i % 3 !== 2) animals.push(id)
    }

    const pages = await readAllPages((cursor) =>
      readDiscover(
        max,
        cursor === undefined ? { category: 'animals' } : { category: 'animals', cursor },
      ),
    )

    expect(pages.map((page) => page.items.length)).toEqual([FEED_PAGE_SIZE, 10])
    expect(pages.map((page) => page.nextCursor === null)).toEqual([false, true])
    expect(pages.flatMap(ids)).toEqual([...animals].reverse())
  })

  it('combines the category with « looking for testers »', async () => {
    const demo = 'https://demo.example.com'
    const wanted = await publish(lea, {
      title: 'Chatière testable',
      status: 'testable',
      demoUrl: demo,
      primaryCategory: 'animals',
    })
    await publish(lea, {
      title: 'Recettes testables',
      status: 'testable',
      demoUrl: demo,
      primaryCategory: 'cooking',
    })
    await publish(max, {
      title: 'Croquettes en idée',
      status: 'idea',
      demoUrl: demo,
      primaryCategory: 'animals',
    })

    expect(ids(await readDiscover(zoe, { testers: 'true', category: 'animals' }))).toEqual([
      wanted.id,
    ])
  })

  it('refuses a malformed category code', async () => {
    // Le contrat (CategoryCode) n'admet que des minuscules, des chiffres et des tirets, 40 au plus :
    // un nom affiché, un espace, un chemin ou un code trop long ne vont jamais jusqu'à la base.
    for (const category of ['Cuisine', 'cuisine du monde', '../admin', 'a'.repeat(41), '']) {
      const res = await send('GET', discoverPath({ category }), max)
      expect(res.status, category).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
    // Témoin : un code bien formé est accepté (ce refus passe dès le contrat, avant le code).
    expect((await send('GET', discoverPath({ category: 'animals' }), max)).status).toBe(200)
    // Et sans session, le filtre ne change rien : 401.
    expect((await send('GET', discoverPath({ category: 'animals' }), null)).status).toBe(401)
  })
})
