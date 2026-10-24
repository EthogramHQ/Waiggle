// Tests d'intégration de la tranche 5 : commenter un projet, répondre, modifier, supprimer et
// masquer un commentaire, et la liste des commentaires sur la page du projet. Scénario :
// docs/scenarios/phase-1.md, « Précisions (tranche 5) ». Trois membres : Léa (l'autrice du
// projet), Max (qui commente) et Zoé (une troisième, qui répond, et qui montre ce que voient les
// autres). L'export des commentaires est testé dans projects.test.ts, avec le reste de l'export ;
// seule la date de masquage l'est ici, plus bas.
//
// Le temps est maîtrisé par le test, comme dans notes.test.ts : vi.useFakeTimers remplace l'horloge
// de JavaScript (Date) par une fausse, qu'on avance à la main. Les commentaires ont ainsi des dates
// distinctes et dans un ordre connu, et la limite de 60 commentaires par heure se vérifie sans
// attendre. Seule Date est remplacée (toFake) : la base et les minuteries tournent normalement.
import {
  AccountExport,
  COMMENT_PAGE_SIZE,
  COMMENT_REPLIES_SHOWN,
  Comment,
  CommentPage,
  CommentReply,
  ErrorResponse,
  Me,
  Project,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let lea: string // cookies de session
let max: string
let zoe: string
let leaId: string
let maxId: string

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

beforeEach(async () => {
  // La fausse horloge est posée avant de créer l'API : la limite de débit garde la fonction
  // Date.now qu'elle trouve à ce moment-là (voir feed.test.ts).
  const start = Date.now()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(start)

  ctx = await createTestContext()
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember(maxAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  leaId = Me.parse(await (await send('GET', '/v1/me', lea)).json()).id
  maxId = Me.parse(await (await send('GET', '/v1/me', max)).json()).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : assez pour que les dates diffèrent). */
const later = (seconds = 1) => vi.setSystemTime(Date.now() + seconds * 1000)

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  ctx.request(path, {
    method,
    headers: {
      ...(cookie && { cookie }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })

/** Un identifiant bien formé, qui ne désigne aucun projet ni aucun commentaire. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

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

// Les adresses des commentaires d'un projet. encodeURIComponent : un identifiant piégé (« ../ »)
// reste un simple morceau d'adresse.
const commentsPath = (projectId: string, cursor?: string) =>
  `/v1/projects/${encodeURIComponent(projectId)}/comments${
    cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`
  }`
const commentPath = (projectId: string, commentId: string) =>
  `${commentsPath(projectId)}/${encodeURIComponent(commentId)}`
const hidePath = (projectId: string, commentId: string) =>
  `${commentPath(projectId, commentId)}/hide`

/**
 * Demande la publication d'un commentaire (une réponse si `replyTo` est donné), une seconde après
 * ce qui précède ; renvoie la réponse brute.
 */
const postComment = (
  projectId: string,
  cookie: string | null,
  body: unknown = 'Super idée, je teste ce soir.',
  replyTo?: unknown,
) => {
  later()
  return send(
    'POST',
    commentsPath(projectId),
    cookie,
    replyTo === undefined ? { body } : { body, replyTo },
  )
}

/** Publie un commentaire qui doit être accepté, et le renvoie tel que l'API l'a décrit. */
const comment = async (projectId: string, cookie: string, body: string, replyTo?: string) => {
  const res = await postComment(projectId, cookie, body, replyTo)
  expect(res.status).toBe(201)
  return Comment.parse(await res.json())
}

const editComment = (
  projectId: string,
  commentId: string,
  cookie: string | null,
  body: unknown,
) => {
  later()
  return send('PATCH', commentPath(projectId, commentId), cookie, { body })
}
const deleteComment = (projectId: string, commentId: string, cookie: string | null) =>
  send('DELETE', commentPath(projectId, commentId), cookie)
const hide = (projectId: string, commentId: string, cookie: string | null) =>
  send('PUT', hidePath(projectId, commentId), cookie)
const unhide = (projectId: string, commentId: string, cookie: string | null) =>
  send('DELETE', hidePath(projectId, commentId), cookie)

/** Une page de commentaires, telle que la voit ce membre (elle doit être lisible). */
const readComments = async (projectId: string, cookie: string, cursor?: string) => {
  const res = await send('GET', commentsPath(projectId, cursor), cookie)
  expect(res.status).toBe(200)
  return CommentPage.parse(await res.json())
}

/** Toutes les pages, en suivant les curseurs jusqu'au bout (dix au plus, par sécurité). */
const readAllPages = async (projectId: string, cookie: string) => {
  const pages: CommentPage[] = []
  let cursor: string | undefined
  do {
    const page = await readComments(projectId, cookie, cursor)
    pages.push(page)
    cursor = page.nextCursor ?? undefined
  } while (cursor !== undefined && pages.length < 10)
  return pages
}

/**
 * Un commentaire tel que le membre le lit : son texte s'il est visible ; sinon son état entre
 * parenthèses, suivi du texte s'il le voit encore (« (hidden) … » pour les deux auteurs).
 */
const show = (c: CommentReply) =>
  c.state === 'visible' ? c.body : `(${c.state})${c.body ? ` ${c.body}` : ''}`

/** Les fils de la première page : chaque racine suivie de ses réponses, dans l'ordre de l'API. */
const threads = async (projectId: string, cookie: string) =>
  (await readComments(projectId, cookie)).items.map((c) => [show(c), ...c.replies.map(show)])

/** La page d'un projet, telle que la voit ce membre (elle doit être visible). */
const readProject = async (id: string, cookie: string) => {
  const res = await send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps (rien à lire, rien qui puisse fuiter). */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

/** Deux réponses 404 identiques, mot pour mot : rien ne distingue l'une de l'autre. */
const expectSameNotFound = async (res: Response, reference: Response) => {
  expect(res.status).toBe(404)
  expect(reference.status).toBe(404)
  expect(await res.json()).toEqual(await reference.json())
}

/**
 * Une requête SQL brute, pour vérifier ce qui reste dans la base. Le résultat n'est pas typé : on
 * précise sa forme nous-mêmes (voir packages/db/src/db.test.ts).
 */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

const deleteAccount = async (cookie: string, password: string) => {
  const res = await send('POST', '/api/auth/delete-user', cookie, { password })
  expect(res.status).toBe(200)
}

describe('publishing a comment', () => {
  it('lets a member comment the public project of another, and answers with the comment', async () => {
    const project = await publish(lea)

    const res = await postComment(project.id, max, 'Super idée, je teste ce soir.')

    expect(res.status).toBe(201)
    const published = Comment.parse(await res.json())
    expect(published).toMatchObject({
      author: { id: maxId, name: 'Max', avatarUrl: null },
      body: 'Super idée, je teste ce soir.',
      editedAt: null,
      state: 'visible',
      isMine: true,
      replies: [],
    })
    // Sa date est celle de la publication (l'horloge du test).
    expect(Date.parse(published.createdAt)).toBe(Date.now())
    // Les autres le lisent aussi, sans qu'il soit le leur.
    expect((await readComments(project.id, lea)).items).toEqual([{ ...published, isMine: false }])
    expect((await readComments(project.id, zoe)).items).toEqual([{ ...published, isMine: false }])
  })

  it('lets the author comment her own project', async () => {
    const project = await publish(lea)

    const published = await comment(project.id, lea, 'Merci de vos retours !')

    expect(published).toMatchObject({ author: { id: leaId }, isMine: true })
    expect(await threads(project.id, max)).toEqual([['Merci de vos retours !']])
  })

  it('lets the author comment her private project, and shows it to her alone', async () => {
    const draft = await publish(lea, { visibility: 'private' })

    await comment(draft.id, lea, 'Encore en chantier')

    expect(await threads(draft.id, lea)).toEqual([['Encore en chantier']])
    // Pour un autre membre, le projet reste introuvable, commentaires compris.
    const res = await send('GET', commentsPath(draft.id), max)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('Encore en chantier')
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)

    await expectError(await postComment(project.id, null), 401, 'unauthorized')
    // Témoin : la même demande, avec la session de Max, réussit (la route existe bien).
    expect((await postComment(project.id, max)).status).toBe(201)
    expect(await threads(project.id, lea)).toHaveLength(1)
  })

  it('cannot be triggered from another website', async () => {
    const project = await publish(lea)

    const res = await ctx.request(commentsPath(project.id), {
      method: 'POST',
      headers: { cookie: max, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ body: 'Commentaire glissé par un autre site' }),
    })

    expect(res.status).toBe(403)
    expect((await postComment(project.id, max, 'Le vrai')).status).toBe(201) // témoin
    expect(await threads(project.id, lea)).toEqual([['Le vrai']])
  })

  it('answers « not found » for the private project of another member, as for an unknown one', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    // Témoin : l'autrice, elle, commente son brouillon (le 404 ne vient pas d'une route absente).
    expect((await postComment(draft.id, lea, 'Note pour moi')).status).toBe(201)

    await expectSameNotFound(
      await postComment(draft.id, max, 'Commentaire de Max'),
      await postComment(UNKNOWN, max, 'Commentaire de Max'),
    )
    expect(await threads(draft.id, lea)).toEqual([['Note pour moi']])
  })

  it('answers « not found » for an unknown or malformed project', async () => {
    expect((await postComment((await publish(lea)).id, max)).status).toBe(201) // témoin
    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await postComment(id, max), 404, 'not_found')
    }
  })

  it('refuses an empty comment, a comment over 1 000 characters, or invisible characters', async () => {
    const project = await publish(lea)
    for (const body of [
      '',
      '   \n  ', // que des espaces : vide une fois les bords retirés
      'a'.repeat(1_001),
      'Bravo​', // espace de largeur nulle
      'Bravo\u0007', // caractère de contrôle (sonnerie)
      '‮Bravo', // retourne le sens du texte
      '‌', // un seul caractère qui ne dessine rien
      42, // pas un texte
    ]) {
      const res = await postComment(project.id, max, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
    expect(await threads(project.id, lea)).toEqual([])
  })

  it('accepts 1 000 characters over several lines, trimmed, and keeps the text exactly as typed', async () => {
    const project = await publish(lea)
    const long = `${'é'.repeat(499)}\n${'à'.repeat(500)}` // 1 000 caractères, saut de ligne compris
    // Du texte brut : ni Markdown ni HTML ne sont interprétés, ni retirés. L'appli l'affiche tel quel.
    const raw = '**Bravo** : <b>ça marche</b> & [lien](https://example.com)'

    expect((await comment(project.id, max, long)).body).toBe(long)
    expect((await comment(project.id, max, `  ${raw}  \n`)).body).toBe(raw)
  })

  it('refuses a request larger than 16 KB', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier essai')
    const big = JSON.stringify({ body: 'a'.repeat(20 * 1024) })
    const sendRaw = (method: string, path: string) =>
      ctx.request(path, {
        method,
        headers: { cookie: max, 'content-type': 'application/json' },
        body: big,
      })

    // Un commentaire pèse au plus 1 000 caractères : la petite limite des requêtes suffit.
    expect((await sendRaw('POST', commentsPath(project.id))).status).toBe(413)
    expect((await sendRaw('PATCH', commentPath(project.id, published.id))).status).toBe(413)
  })
})

describe('replying to a comment', () => {
  it('adds the reply under its comment, the replies oldest first', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Super idée, je teste ce soir.')

    const res = await postComment(project.id, zoe, 'Moi aussi, dis-nous !', root.id)
    expect(res.status).toBe(201)
    const reply = Comment.parse(await res.json())
    expect(reply).toMatchObject({ body: 'Moi aussi, dis-nous !', isMine: true, replies: [] })
    await comment(project.id, lea, 'Merci à vous deux.', root.id)

    expect(await threads(project.id, max)).toEqual([
      ['Super idée, je teste ce soir.', 'Moi aussi, dis-nous !', 'Merci à vous deux.'],
    ])
    const [thread] = (await readComments(project.id, max)).items
    expect(thread?.replies[0]).toMatchObject({ id: reply.id, author: { name: 'Zoé' } })
  })

  it('lists the threads newest first, by the date of their first comment, whatever the replies', async () => {
    const project = await publish(lea)
    const older = await comment(project.id, max, 'Le plus ancien')
    await comment(project.id, zoe, 'Le plus récent')

    // Une réponse au plus ancien ne le fait pas remonter.
    await comment(project.id, lea, 'Une réponse tardive', older.id)

    expect(await threads(project.id, zoe)).toEqual([
      ['Le plus récent'],
      ['Le plus ancien', 'Une réponse tardive'],
    ])
  })

  it('answers « not found » for a reply to a reply: the app answers in the same thread', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine')
    const reply = await comment(project.id, zoe, 'Réponse', root.id)

    await expectError(
      await postComment(project.id, lea, 'Réponse à la réponse', reply.id),
      404,
      'not_found',
    )

    expect(await threads(project.id, lea)).toEqual([['Racine', 'Réponse']])
  })

  it('answers « not found » for a reply to a comment of another project', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    const gardenComment = await comment(garden.id, max, 'Commentaire du jardin')

    await expectError(
      await postComment(recipes.id, zoe, 'Réponse égarée', gardenComment.id),
      404,
      'not_found',
    )

    expect(await threads(recipes.id, lea)).toEqual([])
    expect(await threads(garden.id, lea)).toEqual([['Commentaire du jardin']])
  })

  it('answers « not found » for a reply to a deleted or unknown comment', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine bientôt supprimée')
    await comment(project.id, zoe, 'Réponse', root.id)
    await expectDone(await deleteComment(project.id, root.id, max))

    await expectError(await postComment(project.id, zoe, 'Encore une', root.id), 404, 'not_found')
    await expectError(await postComment(project.id, zoe, 'Dans le vide', UNKNOWN), 404, 'not_found')

    expect(await threads(project.id, zoe)).toEqual([['(deleted)', 'Réponse']])
  })

  it('answers « not found » for a reply to a hidden comment the member cannot see', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Commentaire masqué')
    await expectDone(await hide(project.id, root.id, lea))

    await expectError(await postComment(project.id, zoe, 'Réponse', root.id), 404, 'not_found')

    expect(await threads(project.id, lea)).toEqual([['(hidden) Commentaire masqué']])
  })

  it('refuses a malformed reference to the comment answered', async () => {
    const project = await publish(lea)

    for (const replyTo of ['pas-un-identifiant', "x' or '1'='1", 42]) {
      await expectError(await postComment(project.id, max, 'Réponse', replyTo), 400, 'validation')
    }
    expect(await threads(project.id, lea)).toEqual([])
  })
})

describe('the list of comments', () => {
  it('starts empty', async () => {
    const project = await publish(lea)

    expect(await readComments(project.id, max)).toEqual({ items: [], nextCursor: null })
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)

    await expectError(await send('GET', commentsPath(project.id), null), 401, 'unauthorized')
    expect((await send('GET', commentsPath(project.id), max)).status).toBe(200) // témoin
  })

  it('answers « not found » for the private project of another member, as for an unknown one', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    await comment(draft.id, lea, 'Note pour moi')

    await expectSameNotFound(
      await send('GET', commentsPath(draft.id), max),
      await send('GET', commentsPath(UNKNOWN), max),
    )
    for (const id of ['pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await send('GET', commentsPath(id), max), 404, 'not_found')
    }
  })

  it('shows the newest comments first, 20 per page, then the next ones with the cursor', async () => {
    const project = await publish(lea)
    for (let i = 1; i <= 45; i++) await comment(project.id, max, `Commentaire ${i}`)

    const pages = await readAllPages(project.id, zoe)

    expect(pages.map((page) => page.items.length)).toEqual([
      COMMENT_PAGE_SIZE,
      COMMENT_PAGE_SIZE,
      5,
    ])
    expect(pages.at(-1)?.nextCursor).toBeNull()
    const seen = pages.flatMap((page) => page.items.map((c) => c.body))
    expect(seen).toEqual(Array.from({ length: 45 }, (_, i) => `Commentaire ${45 - i}`))
  })

  it('neither repeats nor forgets a comment when several share the same instant', async () => {
    const project = await publish(lea)
    // Sans avancer l'horloge : 25 commentaires portent exactement la même date. Le curseur départage
    // par l'identifiant, comme dans le fil.
    const published: string[] = []
    for (let i = 1; i <= 25; i++) {
      const res = await send('POST', commentsPath(project.id), max, { body: `Même instant ${i}` })
      expect(res.status).toBe(201)
      published.push(Comment.parse(await res.json()).id)
    }

    const pages = await readAllPages(project.id, zoe)

    expect(pages.map((page) => page.items.length)).toEqual([COMMENT_PAGE_SIZE, 5])
    const seen = pages.flatMap((page) => page.items.map((c) => c.id))
    expect(new Set(seen).size).toBe(seen.length) // aucun doublon
    expect([...seen].sort()).toEqual([...published].sort()) // aucun oubli
  })

  it('refuses a booby-trapped cursor', async () => {
    const project = await publish(lea)
    // Une apostrophe (injection SQL), un « = » de remplissage, un curseur trop long, du base64url
    // qui ne contient que « hello », et un vrai curseur daté de l'an 0, que PostgreSQL refuserait.
    const yearZero = Buffer.from(
      JSON.stringify({ at: '0000-01-01T00:00:00Z', id: UNKNOWN }),
    ).toString('base64url')
    for (const cursor of ["'OR1=1", 'abc=', 'a'.repeat(201), 'aGVsbG8', yearZero]) {
      const res = await send('GET', commentsPath(project.id, cursor), max)
      expect(res.status, cursor).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
  })

  it('shows at most 50 replies under a comment, oldest first', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Une question très suivie')
    for (let i = 1; i <= COMMENT_REPLIES_SHOWN + 2; i++) {
      await comment(project.id, zoe, `Réponse ${i}`, root.id)
    }

    const [thread] = (await readComments(project.id, lea)).items

    expect(thread?.replies.map((r) => r.body)).toEqual(
      Array.from({ length: COMMENT_REPLIES_SHOWN }, (_, i) => `Réponse ${i + 1}`),
    )
  })

  it('keeps the comments of a project gone private, and brings them back', async () => {
    const project = await publish(lea)
    await comment(project.id, max, 'Écrit quand il était public')

    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })
    // Pendant qu'il est privé, personne ne lit ce que Max y a laissé, l'autrice comprise (décision
    // du 19/10/2026) ; Max ne peut plus rien y écrire.
    expect(await threads(project.id, lea)).toEqual([])
    expect((await send('GET', commentsPath(project.id), max)).status).toBe(404)
    expect((await postComment(project.id, max, 'Encore un')).status).toBe(404)
    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'public' })

    expect(await threads(project.id, max)).toEqual([['Écrit quand il était public']])
  })

  it('shows the author of a private project her own comments only, and brings back the others once public', async () => {
    const project = await publish(lea)
    const fromMax = await comment(project.id, max, 'Avis de Max')
    await comment(project.id, lea, 'Réponse de Léa', fromMax.id)
    await comment(project.id, zoe, 'Réponse de Zoé', fromMax.id)
    await comment(project.id, lea, 'Note de Léa')

    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })

    // Léa ne lit que ce qu'elle a écrit (décision du 19/10/2026). Sa réponse garde sa place : le
    // commentaire de Max n'en est qu'un emplacement, sans auteur ni texte.
    const res = await send('GET', commentsPath(project.id), lea)
    const text = await res.text()
    const page = CommentPage.parse(JSON.parse(text))
    expect(page.items.map((c) => [show(c), ...c.replies.map(show)])).toEqual([
      ['Note de Léa'],
      ['(hidden)', 'Réponse de Léa'],
    ])
    expect(page.items[1]).toMatchObject({ id: fromMax.id, author: null, body: '', state: 'hidden' })
    for (const secret of ['Avis de Max', 'Réponse de Zoé', maxId])
      expect(text).not.toContain(secret)
    // Le nombre affiché ne compte que ce qu'elle voit.
    expect((await readProject(project.id, lea)).commentCount).toBe(2)

    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'public' })

    for (const viewer of [lea, zoe]) {
      expect(await threads(project.id, viewer)).toEqual([
        ['Note de Léa'],
        ['Avis de Max', 'Réponse de Léa', 'Réponse de Zoé'],
      ])
      expect((await readProject(project.id, viewer)).commentCount).toBe(4)
    }
  })

  it('answers « not found » to the author of a private project for the comments of the others, as for unknown ones', async () => {
    const project = await publish(lea)
    const fromMax = await comment(project.id, max, 'Avis de Max')
    const mine = await comment(project.id, lea, 'Note de Léa')
    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'private' })

    // Elle ne le voit pas : pour elle, il n'existe pas, quoi qu'elle demande.
    await expectSameNotFound(
      await postComment(project.id, lea, 'Réponse', fromMax.id),
      await postComment(project.id, lea, 'Réponse', UNKNOWN),
    )
    await expectSameNotFound(
      await editComment(project.id, fromMax.id, lea, 'Corrigé'),
      await editComment(project.id, UNKNOWN, lea, 'Corrigé'),
    )
    await expectSameNotFound(
      await deleteComment(project.id, fromMax.id, lea),
      await deleteComment(project.id, UNKNOWN, lea),
    )
    await expectSameNotFound(
      await hide(project.id, fromMax.id, lea),
      await hide(project.id, UNKNOWN, lea),
    )
    await expectSameNotFound(
      await unhide(project.id, fromMax.id, lea),
      await unhide(project.id, UNKNOWN, lea),
    )
    // Témoin : son propre commentaire, elle le modifie comme avant.
    expect((await editComment(project.id, mine.id, lea, 'Note corrigée')).status).toBe(200)

    // Rien n'a bougé : de retour en public, le commentaire de Max est intact et visible.
    await send('PATCH', `/v1/projects/${project.id}`, lea, { visibility: 'public' })
    expect(await threads(project.id, zoe)).toEqual([['Note corrigée'], ['Avis de Max']])
  })

  it('keeps the comments of each project apart', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    await comment(recipes.id, max, 'Sur les recettes')
    await comment(garden.id, max, 'Sur le jardin')

    expect(await threads(recipes.id, zoe)).toEqual([['Sur les recettes']])
    expect(await threads(garden.id, zoe)).toEqual([['Sur le jardin']])
  })
})

describe('editing a comment', () => {
  it('lets its author change the text, and marks it as edited', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    const res = await editComment(project.id, published.id, max, '  Avis corrigé  ')

    expect(res.status).toBe(200)
    const edited = CommentReply.parse(await res.json())
    expect(edited).toMatchObject({
      id: published.id,
      body: 'Avis corrigé',
      createdAt: published.createdAt, // la date de publication ne bouge pas
      state: 'visible',
      isMine: true,
    })
    expect(Date.parse(edited.editedAt ?? '')).toBe(Date.now())
    const [shown] = (await readComments(project.id, zoe)).items
    expect(shown).toMatchObject({ body: 'Avis corrigé', editedAt: edited.editedAt })
  })

  it('lets its author edit a reply too', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine')
    const reply = await comment(project.id, zoe, 'Réponse', root.id)

    expect((await editComment(project.id, reply.id, zoe, 'Réponse corrigée')).status).toBe(200)

    expect(await threads(project.id, lea)).toEqual([['Racine', 'Réponse corrigée']])
  })

  it('refuses an invalid text, and keeps the comment as it was', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    for (const body of ['', '   ', 'a'.repeat(1_001), 'Avis​', 42]) {
      const res = await editComment(project.id, published.id, max, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
    const [shown] = (await readComments(project.id, max)).items
    expect(shown).toMatchObject({ body: 'Premier avis', editedAt: null })
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    await expectError(
      await editComment(project.id, published.id, null, 'Autre'),
      401,
      'unauthorized',
    )
    expect((await editComment(project.id, published.id, max, 'Autre')).status).toBe(200) // témoin
  })

  it('refuses the edit of the comment of another member, even by the author of the project', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    await expectError(
      await editComment(project.id, published.id, zoe, 'Avis de Zoé'),
      403,
      'forbidden',
    )
    await expectError(
      await editComment(project.id, published.id, lea, 'Avis de Léa'),
      403,
      'forbidden',
    )

    expect(await threads(project.id, max)).toEqual([['Premier avis']])
  })

  it('answers « not found » on the private project of another member, as for an unknown project', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    const mine = await comment(draft.id, lea, 'Note pour moi')

    await expectSameNotFound(
      await editComment(draft.id, mine.id, max, 'Changé par Max'),
      await editComment(UNKNOWN, mine.id, max, 'Changé par Max'),
    )
    expect(await threads(draft.id, lea)).toEqual([['Note pour moi']])
  })

  it('answers « not found » for an unknown or malformed comment, and for a comment of another project', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    const gardenComment = await comment(garden.id, max, 'Commentaire du jardin')

    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await editComment(recipes.id, id, max, 'Autre'), 404, 'not_found')
    }
    // L'adresse mêle un projet et le commentaire d'un autre projet.
    await expectError(
      await editComment(recipes.id, gardenComment.id, max, 'Autre'),
      404,
      'not_found',
    )
    expect(await threads(garden.id, max)).toEqual([['Commentaire du jardin']])
  })

  it('answers « not found » for a comment its author deleted', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine')
    await comment(project.id, zoe, 'Réponse', root.id)
    await expectDone(await deleteComment(project.id, root.id, max))

    // Il n'en reste qu'un emplacement « Commentaire supprimé », sans auteur ni texte.
    await expectError(await editComment(project.id, root.id, max, 'Je reviens'), 404, 'not_found')
    expect(await threads(project.id, max)).toEqual([['(deleted)', 'Réponse']])
  })
})

describe('deleting a comment', () => {
  it('lets its author delete a comment without replies, which disappears for everyone', async () => {
    const project = await publish(lea)
    await comment(project.id, zoe, 'Reste là')
    const published = await comment(project.id, max, 'Publié par erreur')

    await expectDone(await deleteComment(project.id, published.id, max))

    for (const viewer of [lea, max, zoe]) {
      expect(await threads(project.id, viewer)).toEqual([['Reste là']])
    }
    // Déjà supprimé : il n'y a plus rien à cette adresse.
    await expectError(await deleteComment(project.id, published.id, max), 404, 'not_found')
  })

  it('turns a comment with replies into « deleted comment », and keeps the replies', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Un avis que je regrette')
    await comment(project.id, zoe, 'Réponse de Zoé', root.id)

    await expectDone(await deleteComment(project.id, root.id, max))

    // Pour tout le monde, son auteur compris : un emplacement, sans auteur ni texte.
    for (const viewer of [lea, max, zoe]) {
      const [thread] = (await readComments(project.id, viewer)).items
      expect(thread).toMatchObject({
        id: root.id,
        author: null,
        body: '',
        state: 'deleted',
        isMine: false,
      })
      expect(thread?.replies.map((r) => r.body)).toEqual(['Réponse de Zoé'])
    }
    // Le texte est effacé de la base, pas seulement caché.
    const bodies = await rows<{ body: string }>(sql`select body from project_comment`)
    expect(bodies.map((r) => r.body)).not.toContain('Un avis que je regrette')
  })

  it('lets its author delete a reply, which leaves the thread', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine')
    const reply = await comment(project.id, zoe, 'Réponse de trop', root.id)
    await comment(project.id, lea, 'Réponse gardée', root.id)

    await expectDone(await deleteComment(project.id, reply.id, zoe))

    expect(await threads(project.id, max)).toEqual([['Racine', 'Réponse gardée']])
  })

  it('removes a deleted comment once its last reply is deleted too', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine')
    const reply = await comment(project.id, zoe, 'Seule réponse', root.id)
    await expectDone(await deleteComment(project.id, root.id, max))

    await expectDone(await deleteComment(project.id, reply.id, zoe))

    // Un « Commentaire supprimé » sans réponse ne montre plus rien : il n'apparaît plus.
    expect(await readComments(project.id, lea)).toEqual({ items: [], nextCursor: null })
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    await expectError(await deleteComment(project.id, published.id, null), 401, 'unauthorized')
    expect(await threads(project.id, max)).toHaveLength(1)
    await expectDone(await deleteComment(project.id, published.id, max)) // témoin
  })

  it('refuses the deletion of the comment of another member, even by the author of the project', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    await expectError(await deleteComment(project.id, published.id, zoe), 403, 'forbidden')
    // L'autrice du projet ne supprime pas : elle peut masquer.
    await expectError(await deleteComment(project.id, published.id, lea), 403, 'forbidden')

    expect(await threads(project.id, zoe)).toEqual([['Premier avis']])
  })

  it('answers « not found » on the private project of another member, as for an unknown project', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    const mine = await comment(draft.id, lea, 'Note pour moi')

    await expectSameNotFound(
      await deleteComment(draft.id, mine.id, max),
      await deleteComment(UNKNOWN, mine.id, max),
    )
    expect(await threads(draft.id, lea)).toEqual([['Note pour moi']])
  })

  it('answers « not found » for an unknown or malformed comment, and for a comment of another project', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    const gardenComment = await comment(garden.id, max, 'Commentaire du jardin')

    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await deleteComment(recipes.id, id, max), 404, 'not_found')
    }
    await expectError(await deleteComment(recipes.id, gardenComment.id, max), 404, 'not_found')
    expect(await threads(garden.id, max)).toEqual([['Commentaire du jardin']])
  })
})

describe('hiding a comment', () => {
  it('lets the author of the project hide the comment of another, still shown to both authors', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Un commentaire déplacé')

    await expectDone(await hide(project.id, published.id, lea))

    // Son auteur et l'autrice du projet le voient encore, marqué « masqué », avec son texte.
    const [forLea] = (await readComments(project.id, lea)).items
    expect(forLea).toMatchObject({
      author: { id: maxId },
      body: 'Un commentaire déplacé',
      state: 'hidden',
      isMine: false,
    })
    const [forMax] = (await readComments(project.id, max)).items
    expect(forMax).toMatchObject({ body: 'Un commentaire déplacé', state: 'hidden', isMine: true })
    // Les autres ne le voient plus du tout : sans réponse, il n'en reste rien.
    const res = await send('GET', commentsPath(project.id), zoe)
    const text = await res.text()
    expect(CommentPage.parse(JSON.parse(text)).items).toEqual([])
    expect(text).not.toContain('Un commentaire déplacé')
  })

  it('leaves « hidden comment » to the others when the hidden comment has replies', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Un commentaire déplacé')
    await comment(project.id, zoe, 'Réponse de Zoé', root.id)

    await expectDone(await hide(project.id, root.id, lea))

    const res = await send('GET', commentsPath(project.id), zoe)
    const text = await res.text()
    const [thread] = CommentPage.parse(JSON.parse(text)).items
    expect(thread).toMatchObject({ id: root.id, author: null, body: '', state: 'hidden' })
    expect(thread?.replies.map((r) => r.body)).toEqual(['Réponse de Zoé'])
    // Ni le texte ni l'auteur du commentaire masqué ne passent. Le nom se cherche avec sa clé :
    // « Max » seul se trouve parfois dans un identifiant tiré au hasard (tranche 7b).
    for (const secret of ['Un commentaire déplacé', maxId, '"name":"Max"'])
      expect(text).not.toContain(secret)
    // Les deux auteurs, eux, le lisent encore.
    expect(await threads(project.id, lea)).toEqual([
      ['(hidden) Un commentaire déplacé', 'Réponse de Zoé'],
    ])
    expect(await threads(project.id, max)).toEqual([
      ['(hidden) Un commentaire déplacé', 'Réponse de Zoé'],
    ])
  })

  it('hides a reply from the others, but not from its author nor from the author of the project', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Racine de Max')
    const reply = await comment(project.id, zoe, 'Réponse déplacée', root.id)

    await expectDone(await hide(project.id, reply.id, lea))

    // Max a écrit la racine, pas la réponse : pour lui, elle a disparu.
    expect(await threads(project.id, max)).toEqual([['Racine de Max']])
    expect(await threads(project.id, zoe)).toEqual([['Racine de Max', '(hidden) Réponse déplacée']])
    expect(await threads(project.id, lea)).toEqual([['Racine de Max', '(hidden) Réponse déplacée']])
  })

  it('shows the comment to everyone again once the author of the project shows it back', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Un malentendu')
    await expectDone(await hide(project.id, published.id, lea))

    await expectDone(await unhide(project.id, published.id, lea))

    for (const viewer of [lea, max, zoe]) {
      expect(await threads(project.id, viewer)).toEqual([['Un malentendu']])
    }
  })

  it('is only for signed-in members', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')

    await expectError(await hide(project.id, published.id, null), 401, 'unauthorized')
    await expectError(await unhide(project.id, published.id, null), 401, 'unauthorized')
    await expectDone(await hide(project.id, published.id, lea)) // témoin
  })

  it('is refused to other members than the author of the project', async () => {
    const project = await publish(lea)
    const fromZoe = await comment(project.id, zoe, 'Avis de Zoé')
    const fromMax = await comment(project.id, max, 'Avis de Max')
    await expectDone(await hide(project.id, fromMax.id, lea))

    await expectError(await hide(project.id, fromZoe.id, max), 403, 'forbidden')
    // Son auteur ne démasque pas son propre commentaire : seule l'autrice du projet le peut.
    await expectError(await unhide(project.id, fromMax.id, max), 403, 'forbidden')
    // Zoé ne voit pas le commentaire masqué de Max : pour elle, il n'existe pas (décision du
    // 19/10/2026), la même réponse que pour un identifiant inconnu.
    await expectSameNotFound(
      await unhide(project.id, fromMax.id, zoe),
      await unhide(project.id, UNKNOWN, zoe),
    )

    expect(await threads(project.id, zoe)).toEqual([['Avis de Zoé']])
  })

  it('answers « not found » to a member who cannot see a hidden comment, whatever she asks, as for an unknown one', async () => {
    const project = await publish(lea)
    const hidden = await comment(project.id, max, 'Un commentaire déplacé')
    const visible = await comment(project.id, max, 'Un commentaire visible')
    await expectDone(await hide(project.id, hidden.id, lea))

    // Un « refusé » dirait à Zoé qu'il existe un commentaire à cet identifiant (décision du
    // 19/10/2026) : elle reçoit mot pour mot la réponse d'un identifiant inconnu.
    await expectSameNotFound(
      await editComment(project.id, hidden.id, zoe, 'Réécrit'),
      await editComment(project.id, UNKNOWN, zoe, 'Réécrit'),
    )
    await expectSameNotFound(
      await deleteComment(project.id, hidden.id, zoe),
      await deleteComment(project.id, UNKNOWN, zoe),
    )
    await expectSameNotFound(
      await hide(project.id, hidden.id, zoe),
      await hide(project.id, UNKNOWN, zoe),
    )
    await expectSameNotFound(
      await unhide(project.id, hidden.id, zoe),
      await unhide(project.id, UNKNOWN, zoe),
    )
    await expectSameNotFound(
      await postComment(project.id, zoe, 'Une réponse', hidden.id),
      await postComment(project.id, zoe, 'Une réponse', UNKNOWN),
    )
    // Témoin : le commentaire visible d'un autre reste « refusé », pas « introuvable ».
    await expectError(await editComment(project.id, visible.id, zoe, 'Réécrit'), 403, 'forbidden')
    await expectError(await deleteComment(project.id, visible.id, zoe), 403, 'forbidden')
    await expectError(await hide(project.id, visible.id, zoe), 403, 'forbidden')

    expect(await threads(project.id, max)).toEqual([
      ['Un commentaire visible'],
      ['(hidden) Un commentaire déplacé'],
    ])
  })

  it('is refused to the author of the project on her own comment: she deletes it instead', async () => {
    const project = await publish(lea)
    const mine = await comment(project.id, lea, 'Mon propre commentaire')

    await expectError(await hide(project.id, mine.id, lea), 403, 'forbidden')

    expect(await threads(project.id, zoe)).toEqual([['Mon propre commentaire']])
  })

  it('answers « not found » on the private project of another member, as for an unknown project', async () => {
    const draft = await publish(lea, { visibility: 'private' })
    const mine = await comment(draft.id, lea, 'Note pour moi')

    await expectSameNotFound(await hide(draft.id, mine.id, max), await hide(UNKNOWN, mine.id, max))
    await expectSameNotFound(
      await unhide(draft.id, mine.id, max),
      await unhide(UNKNOWN, mine.id, max),
    )
  })

  it('answers « not found » for an unknown or malformed comment, and for a comment of another project', async () => {
    const recipes = await publish(lea)
    const garden = await publish(lea, { title: 'Le carnet de jardin' })
    const gardenComment = await comment(garden.id, max, 'Commentaire du jardin')

    for (const id of [UNKNOWN, 'pas-un-identifiant', "x' or '1'='1"]) {
      await expectError(await hide(recipes.id, id, lea), 404, 'not_found')
    }
    await expectError(await hide(recipes.id, gardenComment.id, lea), 404, 'not_found')
    expect(await threads(garden.id, zoe)).toEqual([['Commentaire du jardin']])
  })
})

describe('the number of comments on the page of the project', () => {
  it('starts at zero', async () => {
    const project = await publish(lea)

    expect(project.commentCount).toBe(0)
    expect((await readProject(project.id, max)).commentCount).toBe(0)
  })

  it('counts the comments and replies everyone sees, without the hidden and deleted ones', async () => {
    const project = await publish(lea)
    const first = await comment(project.id, max, 'Premier')
    await comment(project.id, zoe, 'Réponse au premier', first.id)
    await comment(project.id, zoe, 'Deuxième')
    const third = await comment(project.id, max, 'Troisième')
    const countFor = async (cookie: string) => (await readProject(project.id, cookie)).commentCount
    expect(await countFor(zoe)).toBe(4)

    await expectDone(await hide(project.id, third.id, lea))
    // Le même nombre pour tous, les deux auteurs compris : celui que tout le monde voit.
    for (const viewer of [lea, max, zoe]) expect(await countFor(viewer)).toBe(3)

    await expectDone(await deleteComment(project.id, first.id, max)) // devient « supprimé »
    expect(await countFor(zoe)).toBe(2)

    await expectDone(await unhide(project.id, third.id, lea))
    expect(await countFor(zoe)).toBe(3)
  })
})

describe('the order of the checks', () => {
  // Les droits et le quota sont vérifiés avant de lire le texte. Cette règle tient à l'ordre dans
  // lequel les vérifications sont branchées : ces tests envoient donc un texte invalide exprès.
  it('asks to sign in before anything else', async () => {
    await expectError(await postComment(UNKNOWN, null, ''), 401, 'unauthorized')
    await expectError(await editComment(UNKNOWN, UNKNOWN, null, 42), 401, 'unauthorized')
    // Témoin : avec une session, la même adresse répond autre chose (la route existe bien).
    await expectError(await postComment(UNKNOWN, max, ''), 404, 'not_found')
    expect((await postComment((await publish(lea)).id, max, 'Bonjour')).status).toBe(201)
  })

  it('refuses another member before reading the text, without telling a private project apart', async () => {
    const project = await publish(lea)
    const draft = await publish(lea, { visibility: 'private' })
    const published = await comment(project.id, max, 'Premier avis')

    for (const body of ['', 42]) {
      expect((await editComment(project.id, published.id, zoe, body)).status).toBe(403)
      expect((await editComment(project.id, published.id, lea, body)).status).toBe(403)
      await expectSameNotFound(
        await postComment(draft.id, max, body),
        await postComment(UNKNOWN, max, body),
      )
    }
  })

  it('counts even malformed requests in the hourly limit', async () => {
    const project = await publish(lea)
    for (let i = 0; i < 60; i++) expect((await postComment(project.id, max, '')).status).toBe(400)

    // La 61e demande de l'heure, même valide, est refusée.
    await expectError(
      await postComment(project.id, max, 'Un vrai commentaire'),
      429,
      'rate_limited',
    )
  })
})

describe('limits against abuse', () => {
  it('blocks the 61st comment within an hour, publishing and editing together', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Version 0')
    for (let i = 1; i < 60; i++) {
      expect((await editComment(project.id, published.id, max, `Version ${i}`)).status).toBe(200)
    }

    const res = await postComment(project.id, max, 'Un commentaire de trop')

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    await expectError(
      await editComment(project.id, published.id, max, 'Encore'),
      429,
      'rate_limited',
    )
    // Le refus ne publie rien.
    expect(await threads(project.id, lea)).toEqual([['Version 59']])
    // La limite est propre à chaque membre : Zoé, elle, commente encore.
    expect((await postComment(project.id, zoe, 'Avis de Zoé')).status).toBe(201)
  })

  it('lets the member comment again an hour later', async () => {
    const project = await publish(lea)
    for (let i = 0; i < 60; i++) await comment(project.id, max, `Commentaire ${i}`)
    expect((await postComment(project.id, max)).status).toBe(429)

    later(60 * 60)

    expect((await postComment(project.id, max, 'Une heure plus tard')).status).toBe(201)
  })

  it('counts hiding and showing a comment as changes of the project, 60 per hour', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')
    for (let i = 0; i < 30; i++) {
      await expectDone(await hide(project.id, published.id, lea))
      await expectDone(await unhide(project.id, published.id, lea))
    }

    await expectError(await hide(project.id, published.id, lea), 429, 'rate_limited')
    // C'est le même compteur que pour modifier le projet lui-même.
    const change = await send('PATCH', `/v1/projects/${project.id}`, lea, { pitch: 'De trop' })
    expect(change.status).toBe(429)
    expect(await threads(project.id, zoe)).toEqual([['Premier avis']])
  })

  it('counts deleting a comment as a change of the project, 60 per hour', async () => {
    const project = await publish(lea)
    const published = await comment(project.id, max, 'Premier avis')
    // Max épuise ses 60 modifications de l'heure sur son propre projet.
    const maxProject = await publish(max, { title: 'Projet de Max' })
    for (let i = 0; i < 60; i++) {
      const res = await send('PATCH', `/v1/projects/${maxProject.id}`, max, {
        pitch: `Version ${i}`,
      })
      expect(res.status).toBe(200)
    }

    await expectError(await deleteComment(project.id, published.id, max), 429, 'rate_limited')

    expect(await threads(project.id, zoe)).toEqual([['Premier avis']])
  })
})

describe('comments and reactions stay on the page of the project', () => {
  it('never show up, nor their numbers, in the feeds or on the cards', async () => {
    const project = await publish(lea)
    expect((await send('POST', `/v1/members/${leaId}/follow`, zoe)).status).toBe(204)
    await comment(project.id, max, 'Un commentaire qui reste sur la page')
    expect((await send('PUT', `/v1/projects/${project.id}/reactions/bravo`, max)).status).toBe(204)

    for (const path of ['/v1/feed/following', '/v1/feed/discover', `/v1/members/${leaId}`]) {
      const res = await send('GET', path, zoe)
      expect(res.status, path).toBe(200)
      const text = await res.text()
      expect(text, path).toContain(project.id) // témoin : la carte du projet est bien là
      expect(text, path).not.toContain('Un commentaire qui reste sur la page')
      expect(text, path).not.toContain('commentCount')
      expect(text, path).not.toContain('reactions')
    }
  })
})

describe('deleting an account', () => {
  it('removes her replies and her lone comments, and leaves « deleted comment » where others replied', async () => {
    const project = await publish(lea)
    await comment(project.id, max, 'Commentaire seul de Max')
    const answered = await comment(project.id, max, 'Commentaire de Max avec réponse')
    await comment(project.id, zoe, 'Réponse de Zoé', answered.id)
    const fromZoe = await comment(project.id, zoe, 'Commentaire de Zoé')
    await comment(project.id, max, 'Réponse de Max', fromZoe.id)
    expect((await readProject(project.id, zoe)).commentCount).toBe(5)

    await deleteAccount(max, maxAccount.password)

    expect(await threads(project.id, zoe)).toEqual([
      ['Commentaire de Zoé'],
      ['(deleted)', 'Réponse de Zoé'],
    ])
    const [, placeholder] = (await readComments(project.id, zoe)).items
    expect(placeholder).toMatchObject({ id: answered.id, author: null, body: '', state: 'deleted' })
    expect((await readProject(project.id, zoe)).commentCount).toBe(2)
  })

  it('erases the text of all her comments from the database', async () => {
    const project = await publish(lea)
    const answered = await comment(project.id, max, 'Texte de Max avec réponse')
    await comment(project.id, zoe, 'Réponse de Zoé', answered.id)
    await comment(project.id, max, 'Texte de Max sans réponse')

    await deleteAccount(max, maxAccount.password)

    const left = await rows<{ body: string; author_id: string | null }>(
      sql`select body, author_id from project_comment`,
    )
    expect(left.map((r) => r.body).filter((body) => body.includes('Texte de Max'))).toEqual([])
    expect(left.filter((r) => r.author_id === maxId)).toEqual([])
  })

  it('takes the comments on her projects with her', async () => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Commentaire de Max')
    await comment(project.id, zoe, 'Réponse de Zoé', root.id)

    await deleteAccount(lea, leaAccount.password)

    expect(await rows(sql`select id from project_comment`)).toHaveLength(0)
  })

  it('forgets her counter of comments', async () => {
    const project = await publish(lea)
    await comment(project.id, max, 'Commentaire de Max')

    await deleteAccount(max, maxAccount.password)

    // Les compteurs anti-abus portent l'identifiant du membre : ils partent avec son compte.
    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    expect(keys.filter((key) => key.includes(maxId))).toEqual([])
  })
})

describe('comments left without an author', () => {
  // Un commentaire peut perdre son auteur sans passer par la suppression du compte : publié pendant
  // qu'un compte disparaît (entre beforeDelete et la suppression, la base met author_id à null), ou
  // compte effacé à la main dans la base. On le simule ici directement en SQL.
  const orphan = (id: string) =>
    ctx.db.execute(sql`update project_comment set author_id = null where id = ${id}`)

  /** Des commentaires de Max dont trois perdent leur auteur, et ceux de Zoé, intacts. */
  const withOrphans = async () => {
    const project = await publish(lea)
    const lone = await comment(project.id, max, 'Orphelin seul')
    const answered = await comment(project.id, max, 'Orphelin avec réponse')
    await comment(project.id, zoe, 'Réponse de Zoé', answered.id)
    const fromZoe = await comment(project.id, zoe, 'Commentaire de Zoé')
    const orphanReply = await comment(project.id, max, 'Réponse orpheline', fromZoe.id)
    for (const { id } of [lone, answered, orphanReply]) await orphan(id)
    return { project, answered }
  }

  it('are neither counted nor shown, except as « deleted comment » above replies', async () => {
    const { project } = await withOrphans()

    for (const viewer of [lea, zoe]) {
      expect(await threads(project.id, viewer)).toEqual([
        ['Commentaire de Zoé'],
        ['(deleted)', 'Réponse de Zoé'],
      ])
      expect((await readProject(project.id, viewer)).commentCount).toBe(2)
    }
    const text = await (await send('GET', commentsPath(project.id), zoe)).text()
    for (const secret of ['Orphelin', 'orpheline']) expect(text).not.toContain(secret)
  })

  it('are swept from the database once any account is deleted', async () => {
    const { project, answered } = await withOrphans()
    // Un « Commentaire supprimé » dont la seule réponse a perdu son auteur.
    const thread = await comment(project.id, zoe, 'Racine de Zoé')
    const lastReply = await comment(project.id, max, 'Dernière réponse orpheline', thread.id)
    await expectDone(await deleteComment(project.id, thread.id, zoe))
    await orphan(lastReply.id)

    // N'importe quelle suppression de compte balaie les orphelins : ici, celle d'un autre membre.
    const sam = await ctx.verifiedMember({
      name: 'Sam',
      email: 'sam@example.com',
      password: 'sam-long-password',
    })
    await deleteAccount(sam, 'sam-long-password')

    // La racine qui a une réponse d'un autre devient « Commentaire supprimé » ; le reste est
    // effacé, et l'emplacement qui n'a plus de réponse aussi : aucun de leurs textes ne reste.
    const left = await rows<{ id: string; body: string; deleted: boolean }>(
      sql`select id, body, deleted_at is not null as deleted from project_comment order by body`,
    )
    expect(left.map((r) => r.body)).toEqual(['', 'Commentaire de Zoé', 'Réponse de Zoé'])
    expect(left[0]).toEqual({ id: answered.id, body: '', deleted: true })
    expect(await threads(project.id, zoe)).toEqual([
      ['Commentaire de Zoé'],
      ['(deleted)', 'Réponse de Zoé'],
    ])
  })
})

describe('my comments in my data', () => {
  it('exports the date the author of the project hid my comment', async () => {
    const project = await publish(lea)
    const hidden = await comment(project.id, max, 'Commentaire masqué')
    await comment(project.id, max, 'Commentaire visible')
    later()
    await expectDone(await hide(project.id, hidden.id, lea))
    const hiddenAt = new Date(Date.now()).toISOString()

    const res = await send('GET', '/v1/me/export', max)
    expect(res.status).toBe(200)
    const { comments } = AccountExport.parse(await res.json())

    expect(comments.map((c) => [c.body, c.hiddenAt])).toEqual([
      ['Commentaire masqué', hiddenAt],
      ['Commentaire visible', null],
    ])
  })
})

describe('the API contract', () => {
  it('documents the comment routes', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }

    const list = '/v1/projects/{id}/comments'
    const one = '/v1/projects/{id}/comments/{commentId}'
    const hidden = '/v1/projects/{id}/comments/{commentId}/hide'
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining([list, one, hidden]))
    expect(Object.keys(doc.paths[list] ?? {})).toEqual(expect.arrayContaining(['get', 'post']))
    expect(Object.keys(doc.paths[one] ?? {})).toEqual(expect.arrayContaining(['patch', 'delete']))
    expect(Object.keys(doc.paths[hidden] ?? {})).toEqual(expect.arrayContaining(['put', 'delete']))
  })
})

// ─── Bloquer (tranche 7b) ────────────────────────────────────────────────────────────────────────

// Scénario « Tranche 7b — Bloquer », règles détaillées « Commentaires déjà écrits » ; règles 1, 2,
// 2b et 8 de la relecture du plan (24/10/2026). Le commentaire de l'autre devient, pour les deux
// personnes seulement, un emplacement sans auteur ni texte : « blocked » pour qui a bloqué,
// « unavailable » pour l'autre ; comme les autres emplacements, il n'apparaît que s'il garde des
// réponses visibles. Le projet est celui de Léa ; Max et Zoé sont bloqués l'un avec l'autre.
describe('the comments of blocked members', () => {
  let zoeId: string

  beforeEach(async () => {
    zoeId = Me.parse(await (await send('GET', '/v1/me', zoe)).json()).id
  })

  /** `cookie` bloque le membre `memberId` (PUT /v1/members/{id}/block). */
  const block = async (memberId: string, cookie: string) => {
    later()
    await expectDone(await send('PUT', `/v1/members/${encodeURIComponent(memberId)}/block`, cookie))
  }

  // Règle 8 : les deux emplacements, chacun pour une seule personne.
  it('shows the comment of a member I blocked as "blocked", and mine as "unavailable" to her', async () => {
    const project = await publish(lea)
    const maxRoot = await comment(project.id, max, 'Le commentaire de Max')
    await comment(project.id, lea, 'Réponse de Léa à Max', maxRoot.id)
    const zoeRoot = await comment(project.id, zoe, 'Le commentaire de Zoé')
    await comment(project.id, lea, 'Réponse de Léa à Zoé', zoeRoot.id)

    await block(maxId, zoe) // Zoé bloque Max

    expect(await threads(project.id, zoe)).toEqual([
      ['Le commentaire de Zoé', 'Réponse de Léa à Zoé'],
      ['(blocked)', 'Réponse de Léa à Max'],
    ])
    expect(await threads(project.id, max)).toEqual([
      ['(unavailable)', 'Réponse de Léa à Zoé'],
      ['Le commentaire de Max', 'Réponse de Léa à Max'],
    ])
    // Les autres membres, l'autrice du projet comprise, ne voient aucune différence.
    expect(await threads(project.id, lea)).toEqual([
      ['Le commentaire de Zoé', 'Réponse de Léa à Zoé'],
      ['Le commentaire de Max', 'Réponse de Léa à Max'],
    ])
  })

  it('gives neither author, text nor mentions in a placeholder', async () => {
    const project = await publish(lea)
    const { handle } = Me.parse(await (await send('GET', '/v1/me', lea)).json())
    const root = await comment(project.id, max, `Un texte de Max pour @${handle}`)
    await comment(project.id, lea, 'Réponse de Léa', root.id)
    await block(zoeId, max) // c'est Max qui bloque : Zoé lit « indisponible »

    const res = await send('GET', commentsPath(project.id), zoe)
    const raw = await res.text()
    const [placeholder] = CommentPage.parse(JSON.parse(raw)).items
    expect(placeholder).toMatchObject({
      state: 'unavailable',
      author: null,
      body: '',
      mentions: [],
      isMine: false,
    })
    expect(raw).not.toContain(maxId)
    expect(raw).not.toContain('Un texte de Max')
  })

  it('leaves out a placeholder without visible replies, and a reply of the other one', async () => {
    const project = await publish(lea)
    await comment(project.id, max, 'Racine seule de Max')
    const leaRoot = await comment(project.id, lea, 'Racine de Léa')
    await comment(project.id, max, 'Réponse de Max', leaRoot.id)
    await comment(project.id, zoe, 'Réponse de Zoé', leaRoot.id)
    await block(maxId, zoe)

    expect(await threads(project.id, zoe)).toEqual([['Racine de Léa', 'Réponse de Zoé']])
    expect(await threads(project.id, max)).toEqual([
      ['Racine de Léa', 'Réponse de Max'],
      ['Racine seule de Max'],
    ])
  })

  it('shows everything again after unblocking', async () => {
    const project = await publish(lea)
    await comment(project.id, max, 'Le commentaire de Max')
    await block(maxId, zoe)
    later()
    await expectDone(await send('DELETE', `/v1/members/${maxId}/block`, zoe))

    expect(await threads(project.id, zoe)).toEqual([['Le commentaire de Max']])
  })

  it('refuses to reply to a comment of the other one, in both directions', async () => {
    const project = await publish(lea)
    const maxRoot = await comment(project.id, max, 'Racine de Max')
    const zoeRoot = await comment(project.id, zoe, 'Racine de Zoé')
    await block(maxId, zoe)

    await expectError(await postComment(project.id, zoe, 'Réponse', maxRoot.id), 404, 'not_found')
    await expectError(await postComment(project.id, max, 'Réponse', zoeRoot.id), 404, 'not_found')
    // Témoin : chacun répond encore à Léa, et commente le projet.
    expect((await postComment(project.id, zoe, 'Un mot pour Léa')).status).toBe(201)
    expect((await postComment(project.id, max, 'Un mot pour Léa')).status).toBe(201)
  })

  // Précision 4 : le nombre de commentaires reste le même pour tous.
  it('keeps the same count of comments for everyone', async () => {
    const project = await publish(lea)
    await comment(project.id, max, 'Le commentaire de Max')
    await comment(project.id, zoe, 'Le commentaire de Zoé')
    await block(maxId, zoe)

    expect((await readProject(project.id, zoe)).commentCount).toBe(2)
    expect((await readProject(project.id, max)).commentCount).toBe(2)
  })

  // Règle 1 (B1) : l'auteur d'un projet garde la modération de son espace, quel que soit le sens du
  // blocage : il lit le commentaire, le masque, le signale.
  it.each([
    ['the author of the project blocked the commenter', 'author'],
    ['the commenter blocked the author of the project', 'commenter'],
  ])('lets the author of the project read, hide and report a comment when %s', async (_, who) => {
    const project = await publish(lea)
    const root = await comment(project.id, max, 'Un commentaire chez Léa')
    if (who === 'author') await block(maxId, lea)
    else await block(leaId, max)

    expect(await threads(project.id, lea)).toEqual([['Un commentaire chez Léa']])
    later()
    const report = await send('POST', '/v1/reports', lea, {
      target: { kind: 'comment', id: root.id },
      reason: 'other',
    })
    expect(report.status).toBe(201)
    await expectDone(await hide(project.id, root.id, lea))
    expect(await threads(project.id, lea)).toEqual([['(hidden) Un commentaire chez Léa']])
  })

  // Règle 2 (B2) : un commentaire qui me mentionne reste lisible pour moi si son auteur m'a bloqué
  // (mention écrite avant le blocage) ; pas si c'est moi qui l'ai bloqué.
  it('keeps readable a comment that mentions me when its author blocked me', async () => {
    const project = await publish(lea)
    const { handle: zoeHandle } = Me.parse(await (await send('GET', '/v1/me', zoe)).json())
    await comment(project.id, max, `Je parle de @${zoeHandle} dans son dos`)
    await block(zoeId, max) // Max bloque Zoé après l'avoir mentionnée

    const [root] = (await readComments(project.id, zoe)).items
    expect(root).toMatchObject({ state: 'visible', body: `Je parle de @${zoeHandle} dans son dos` })
  })

  it('hides a comment that mentions me when I blocked its author', async () => {
    const project = await publish(lea)
    const { handle: zoeHandle } = Me.parse(await (await send('GET', '/v1/me', zoe)).json())
    await comment(project.id, max, `Je parle de @${zoeHandle}`)
    await block(maxId, zoe) // c'est Zoé qui bloque

    expect(await threads(project.id, zoe)).toEqual([])
  })

  // Règle 2b : mentionner un membre qu'on a bloqué est refusé (création comme modification) ;
  // mentionner un membre qui m'a bloqué passe, sans lien ni mention : rien ne trahit le blocage.
  it('refuses to write or edit a comment that mentions a member I blocked', async () => {
    const project = await publish(lea)
    const { handle: zoeHandle } = Me.parse(await (await send('GET', '/v1/me', zoe)).json())
    const mine = await comment(project.id, max, 'Un commentaire sans mention')
    await block(zoeId, max)

    await expectError(
      await postComment(project.id, max, `Bonjour @${zoeHandle}`),
      422,
      'blocked_mention',
    )
    await expectError(
      await editComment(project.id, mine.id, max, `Bonjour @${zoeHandle}`),
      422,
      'blocked_mention',
    )
    // Témoin : sans la mention, le commentaire passe.
    expect((await postComment(project.id, max, 'Bonjour à tous')).status).toBe(201)
  })

  it('writes a mention of a member who blocked me as plain text', async () => {
    const project = await publish(lea)
    const { handle: zoeHandle } = Me.parse(await (await send('GET', '/v1/me', zoe)).json())
    await block(maxId, zoe) // Zoé bloque Max

    const written = await comment(project.id, max, `Bonjour @${zoeHandle}`)

    expect(written).toMatchObject({ body: `Bonjour @${zoeHandle}`, mentions: [] })
    expect((await readComments(project.id, lea)).items[0]?.mentions).toEqual([])
  })
})
