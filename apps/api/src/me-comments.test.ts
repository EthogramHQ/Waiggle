// Tests d'intégration de R11, « Mes commentaires » : la liste de tous les commentaires et réponses
// d'un membre (GET /v1/me/comments), sur n'importe quel projet, qu'il le voie encore ou non, et leur
// suppression depuis cette liste (DELETE /v1/me/comments/{commentId}). Scénario :
// docs/scenarios/refonte.md, « R11 », « Mes commentaires » ; relecture de sécurité du plan (S-C3 :
// `replyTo` ne dit que l'identifiant de la racine ; le même 404 pour un commentaire inconnu, mal
// formé, supprimé ou d'un autre ; le quota `projectChange` partagé avec l'ancienne route et compté
// avant tout examen ; le curseur vérifié par `CursorDate`).
//
// Pourquoi une route à part pour supprimer : l'ancienne (DELETE /v1/projects/{id}/comments/{id})
// cherche d'abord le projet, et refuse donc un commentaire sur un projet devenu privé, retiré par la
// modération, d'un membre bloqué ou d'une ruche quittée. Le membre doit pourtant pouvoir effacer ce
// qu'il a écrit (droit à l'effacement).
//
// Cinq membres : Léa (qui commente, et lit sa liste), Max (l'auteur des projets), Zoé (une autre
// commentatrice), Sam (un autre membre, qui signale) et Louis (l'administrateur). Un projet retiré
// ou un commentaire retiré sont posés en base, comme le ferait la décision de la modération ; seule
// la couverture retirée passe par la modération, comme dans l'appli (ce que la décision écrit n'est
// pas supposé ici).
import {
  CommentReply,
  ErrorResponse,
  MY_DATA_PAGE_SIZE,
  MyCommentsPage,
  type ReportPart,
  type ReportTarget,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-rows'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let lea: string // cookies de session
let max: string
let zoe: string
let sam: string
let louis: string
let leaId: string
let maxId: string

const START = new Date('2026-11-16T08:00:00.000Z')
/** Un identifiant bien formé, qui ne désigne aucun commentaire. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  const member = (name: string, local: string) =>
    ctx.verifiedMember({
      name,
      email: `${local}@example.com`,
      password: `${local}-long-password`,
    })
  lea = await member('Léa', 'lea')
  max = await member('Max', 'max')
  zoe = await member('Zoé', 'zoe')
  sam = await member('Sam', 'sam')
  louis = await member('Louis', 'louis')
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

// ─── Les adresses et les lectures ────────────────────────────────────────────────────────────────

const listPath = (cursor?: string) =>
  `/v1/me/comments${cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`}`
const minePath = (commentId: string) => `/v1/me/comments/${encodeURIComponent(commentId)}`

/** Lit une page de « Mes commentaires » (200 attendu) et la vérifie par le contrat. */
const myComments = async (cookie: string, cursor?: string) => {
  const res = await act.send('GET', listPath(cursor), cookie)
  expect(res.status, 'GET /v1/me/comments').toBe(200)
  return MyCommentsPage.parse(await res.json())
}

/** La réponse brute de la première page : on y cherche ce qui ne doit pas s'y trouver. */
const rawList = async (cookie: string) => {
  const res = await act.send('GET', listPath(), cookie)
  expect(res.status, 'GET /v1/me/comments').toBe(200)
  return res.text()
}

/** L'élément de la liste qui porte ce commentaire. */
const itemOf = async (cookie: string, commentId: string) => {
  const found = (await myComments(cookie)).items.find((item) => item.id === commentId)
  if (!found) throw new Error(`comment ${commentId} is not in the list`)
  return found
}

/** Supprime depuis « Mes commentaires » ; réponse brute. */
const deleteMine = (commentId: string, cookie: string | null) =>
  act.send('DELETE', minePath(commentId), cookie)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Une réponse 204 : réussie, et sans corps. */
const expectDone = async (res: Response) => {
  expect(res.status).toBe(204)
  expect(await res.text()).toBe('')
}

// ─── Les gestes ──────────────────────────────────────────────────────────────────────────────────

/** Max publie un projet (public par défaut), une seconde plus tard. */
const publish = async (title: string, cookie = max, body: object = {}) => {
  later()
  return act.publish(cookie, title, body)
}

/**
 * Publie un commentaire, ou une réponse, une seconde plus tard ; rend l'identifiant et la date
 * (`CommentReply` : les champs communs à un commentaire et à une réponse).
 */
const comment = async (projectId: string, cookie: string, body: string, replyTo?: string) => {
  later()
  const res = await act.send(
    'POST',
    `/v1/projects/${projectId}/comments`,
    cookie,
    replyTo === undefined ? { body } : { body, replyTo },
  )
  expect(res.status, 'comment').toBe(201)
  return CommentReply.parse(await res.json())
}

/** La ligne d'un commentaire en base (null s'il est effacé). */
const storedComment = async (commentId: string) => {
  const [row] = await ctx.db
    .select({
      body: schema.projectComment.body,
      authorId: schema.projectComment.authorId,
      deletedAt: schema.projectComment.deletedAt,
    })
    .from(schema.projectComment)
    .where(eq(schema.projectComment.id, commentId))
  return row ?? null
}

/** La modération retire un projet entier (posé en base, comme dans testers.test.ts). */
const removeProject = (projectId: string) =>
  ctx.db
    .update(schema.project)
    .set({ removedAt: new Date() })
    .where(eq(schema.project.id, projectId))

/** La modération retire un commentaire (posé en base, comme dans comments.test.ts). */
const removeComment = (commentId: string) =>
  ctx.db
    .update(schema.projectComment)
    .set({ removedAt: new Date() })
    .where(eq(schema.projectComment.id, commentId))

/** Ajoute une photo à la galerie d'un projet ; rend son identifiant et sa clé de stockage. */
const addPhoto = async (projectId: string, cookie = max) => {
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(800, 600)),
  })
  expect(res.status, 'visual').toBe(201)
  const rows = await ctx.db
    .select({ id: schema.projectMedia.id, key: schema.projectMedia.storageKey })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.projectId, projectId))
  const added = rows.at(-1)
  if (!added) throw new Error('no photo')
  return added
}

/** Retire une partie, comme la modération : Sam la signale, puis Louis décide. */
const removePart = async (target: ReportTarget, part: ReportPart) => {
  later()
  const res = await act.send('POST', '/v1/reports', sam, { target, part, reason: 'other' })
  expect(res.status, 'report').toBe(201)
  later()
  await act.decide(louis, {
    action: 'remove',
    target,
    part,
    ground: 'rules',
    explanation: 'Cette photo ne respecte pas les règles de la communauté.',
  })
}

/** Ce que la liste montre du projet d'un commentaire de Léa, sur un projet de Max sans photo. */
const projectOfMax = (id: string, title: string) => ({
  id,
  title,
  cover: null,
  author: { name: 'Max' },
})

// ─── La liste ────────────────────────────────────────────────────────────────────────────────────

describe('the list of my comments', () => {
  it('lists my comments and replies on every project, newest first, and nothing written by others', async () => {
    const meteo = await publish('Météo')
    const jardin = await publish('Jardin')
    const mine = await comment(meteo.id, lea, 'Super idée, je teste ce soir.')
    const ofZoe = await comment(jardin.id, zoe, 'Le commentaire de Zoé')
    const reply = await comment(jardin.id, lea, 'Moi aussi !', ofZoe.id)
    await comment(meteo.id, zoe, 'Une autre remarque de Zoé')

    const page = await myComments(lea)

    // Tout le contenu, champ par champ : la réponse ne dit de la racine que son identifiant (ni
    // son auteur ni son texte, S-C3), et le projet ne dit de son auteur que son nom.
    expect(page).toEqual({
      items: [
        {
          id: reply.id,
          projectId: jardin.id,
          project: projectOfMax(jardin.id, 'Jardin'),
          replyTo: ofZoe.id,
          hasReplies: false,
          body: 'Moi aussi !',
          createdAt: reply.createdAt,
          editedAt: null,
          hidden: false,
          removed: false,
        },
        {
          id: mine.id,
          projectId: meteo.id,
          project: projectOfMax(meteo.id, 'Météo'),
          replyTo: null,
          hasReplies: false,
          body: 'Super idée, je teste ce soir.',
          createdAt: mine.createdAt,
          editedAt: null,
          hidden: false,
          removed: false,
        },
      ],
      nextCursor: null,
    })
    const raw = await rawList(lea)
    expect(raw).not.toContain('Zoé')
    // Zoé, elle, ne lit que les siens.
    expect((await myComments(zoe)).items.map((item) => item.id)).not.toContain(mine.id)
  })

  it('tells a root with replies, an edited, a hidden and a removed comment, and keeps their text for me', async () => {
    const meteo = await publish('Météo')
    const answered = await comment(meteo.id, lea, 'Une question')
    await comment(meteo.id, max, 'Une réponse de Max', answered.id)
    const edited = await comment(meteo.id, lea, 'Premier jet')
    later()
    const patched = await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${edited.id}`, lea, {
      body: 'Texte corrigé',
    })
    expect(patched.status).toBe(200)
    const editedAt = new Date().toISOString()
    const hidden = await comment(meteo.id, lea, 'Masqué par Max')
    later()
    await act.hide(meteo.id, hidden.id, max)
    const removed = await comment(meteo.id, lea, 'Retiré par la modération')
    await removeComment(removed.id)

    expect(await itemOf(lea, answered.id)).toMatchObject({ hasReplies: true, editedAt: null })
    expect(await itemOf(lea, edited.id)).toMatchObject({ body: 'Texte corrigé', editedAt })
    expect(await itemOf(lea, hidden.id)).toMatchObject({
      body: 'Masqué par Max',
      hidden: true,
      removed: false,
    })
    expect(await itemOf(lea, removed.id)).toMatchObject({
      body: 'Retiré par la modération',
      hidden: false,
      removed: true,
    })
  })

  it('leaves out a comment I deleted, a root kept as « Commentaire supprimé » included', async () => {
    const meteo = await publish('Météo')
    const alone = await comment(meteo.id, lea, 'Seul')
    const root = await comment(meteo.id, lea, 'Avec une réponse')
    await comment(meteo.id, zoe, 'La réponse de Zoé', root.id)
    const kept = await comment(meteo.id, lea, 'Gardé')
    later()
    await act.deleteComment(meteo.id, alone.id, lea)
    await act.deleteComment(meteo.id, root.id, lea)

    expect((await myComments(lea)).items.map((item) => item.id)).toEqual([kept.id])
  })

  it('shows 30 per page, newest first, then the next ones with the cursor', async () => {
    const meteo = await publish('Météo')
    const jardin = await publish('Jardin')
    const written: string[] = []
    for (let i = 1; i <= MY_DATA_PAGE_SIZE + 5; i++) {
      written.push((await comment(i % 2 ? meteo.id : jardin.id, lea, `Commentaire ${i}`)).id)
    }

    const first = await myComments(lea)
    expect(first.items).toHaveLength(MY_DATA_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
    const second = await myComments(lea, first.nextCursor ?? undefined)
    expect(second.items).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual([...written].reverse())
  })

  it('answers 400 to a cursor dated in year 0000 or 9999, or that is not ours, never 500', async () => {
    const meteo = await publish('Météo')
    await comment(meteo.id, lea, 'Un commentaire')
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
    // Témoin : la liste se lit sans curseur.
    expect((await myComments(lea)).items).toHaveLength(1)

    for (const cursor of [
      encode({ at: '0000-01-01T00:00:00Z', id: UNKNOWN }),
      encode({ at: '9999-12-31T23:59:59Z', id: UNKNOWN }),
      encode({ page: 2 }),
      "'OR1=1",
      'a'.repeat(201),
    ]) {
      await expectError(await act.send('GET', listPath(cursor), lea), 400, 'validation')
    }
  })

  it('refuses a visitor without session with 401, on the list and on deleting', async () => {
    const meteo = await publish('Météo')
    const mine = await comment(meteo.id, lea, 'Un commentaire')

    await expectError(await act.send('GET', listPath(), null), 401, 'unauthorized')
    await expectError(await deleteMine(mine.id, null), 401, 'unauthorized')
    // Témoin : avec sa session, Léa lit sa liste, et son commentaire est toujours là.
    expect((await myComments(lea)).items.map((item) => item.id)).toEqual([mine.id])
  })
})

// ─── Le projet qu'elle ne voit plus ──────────────────────────────────────────────────────────────

describe('the project of a comment, once I no longer see it', () => {
  it('shows the project as null once it became private or was removed, and keeps my comment', async () => {
    const meteo = await publish('Météo')
    const jardin = await publish('Jardin')
    const mine = await publish('Mon carnet', lea)
    const onMeteo = await comment(meteo.id, lea, 'Premier avis')
    const onJardin = await comment(jardin.id, lea, 'Deuxième avis')
    const onMine = await comment(mine.id, lea, 'Sur mon carnet')
    // Témoin : les projets se voient.
    expect((await itemOf(lea, onMeteo.id)).project).toEqual(projectOfMax(meteo.id, 'Météo'))

    later()
    await act.setVisibility(meteo.id, max, 'private')
    await removeProject(jardin.id)
    await act.setVisibility(mine.id, lea, 'private')

    expect(await itemOf(lea, onMeteo.id)).toMatchObject({
      projectId: meteo.id,
      project: null,
      body: 'Premier avis',
    })
    expect(await itemOf(lea, onJardin.id)).toMatchObject({ projectId: jardin.id, project: null })
    // Son propre projet devenu privé, elle le voit encore.
    expect((await itemOf(lea, onMine.id)).project).toMatchObject({
      id: mine.id,
      title: 'Mon carnet',
    })
    const raw = await rawList(lea)
    for (const title of ['Météo', 'Jardin']) expect(raw).not.toContain(title)
    expect(raw).not.toContain('"name":"Max"')
  })

  it('shows the project as null once its author and the reader are blocked, either way', async () => {
    const meteo = await publish('Météo')
    const onMeteo = await comment(meteo.id, lea, 'Premier avis')
    // Témoin : sans blocage, le projet et le nom de Max se lisent.
    expect((await itemOf(lea, onMeteo.id)).project).toEqual(projectOfMax(meteo.id, 'Météo'))

    later()
    await act.block(maxId, lea) // Léa bloque Max
    expect((await itemOf(lea, onMeteo.id)).project).toBeNull()
    expect(await rawList(lea)).not.toContain('Météo')

    later()
    await act.unblock(maxId, lea)
    expect((await itemOf(lea, onMeteo.id)).project).toEqual(projectOfMax(meteo.id, 'Météo'))
    later()
    await act.block(leaId, max) // Max bloque Léa
    const shown = await itemOf(lea, onMeteo.id)
    expect(shown.project).toBeNull()
    expect(shown.body).toBe('Premier avis')
    expect(await rawList(lea)).not.toContain('"name":"Max"')
  })

  it('shows the project as null once the reader has left the hive it is reserved to', async () => {
    const famille = await hives.createHive('Famille', maxId, [leaId])
    const album = await publish('Album de famille')
    await hives.reserve(album.id, famille)
    const onAlbum = await comment(album.id, lea, 'Quelles belles photos')
    // Témoin : membre de la ruche, Léa voit le projet.
    expect((await itemOf(lea, onAlbum.id)).project).toEqual(
      projectOfMax(album.id, 'Album de famille'),
    )

    await hives.removeMember(famille, leaId)

    const shown = await itemOf(lea, onAlbum.id)
    expect(shown).toMatchObject({
      projectId: album.id,
      project: null,
      body: 'Quelles belles photos',
    })
    expect(await rawList(lea)).not.toContain('Album de famille')
  })

  it('never shows the removed cover of the project of a comment', async () => {
    const meteo = await publish('Météo')
    const first = await addPhoto(meteo.id)
    const second = await addPhoto(meteo.id)
    const onMeteo = await comment(meteo.id, lea, 'Premier avis')
    // Témoin : la 1re photo est la couverture.
    expect((await itemOf(lea, onMeteo.id)).project?.cover?.id).toBe(first.id)
    expect(await rawList(lea)).toContain(first.key)

    await removePart({ kind: 'project', id: meteo.id }, { field: 'cover', mediaId: first.id })

    expect((await itemOf(lea, onMeteo.id)).project?.cover?.id).toBe(second.id)
    expect(await rawList(lea)).not.toContain(first.key)
  })
})

// ─── Supprimer ───────────────────────────────────────────────────────────────────────────────────

describe('deleting one of my comments', () => {
  it('deletes my comment with 204, even on a project I no longer see', async () => {
    const meteo = await publish('Météo')
    const jardin = await publish('Jardin')
    const potager = await publish('Potager')
    const fusee = await publish('Fusée')
    const famille = await hives.createHive('Famille', maxId, [leaId])
    const album = await publish('Album de famille')
    await hives.reserve(album.id, famille)
    const onPrivate = await comment(meteo.id, lea, 'Sur un projet devenu privé')
    const onRemoved = await comment(jardin.id, lea, 'Sur un projet retiré')
    const blockedByMe = await comment(potager.id, lea, 'Chez Max, que je bloque')
    const onAlbum = await comment(album.id, lea, 'Dans une ruche quittée')
    later()
    await act.setVisibility(meteo.id, max, 'private')
    await removeProject(jardin.id)
    await hives.removeMember(famille, leaId)
    later()
    // Témoin : l'ancienne route refuse, faute de voir le projet (le scénario : « aujourd'hui,
    // l'API le refuse »).
    await expectError(
      await act.send('DELETE', `/v1/projects/${meteo.id}/comments/${onPrivate.id}`, lea),
      404,
      'not_found',
    )

    for (const gone of [onPrivate, onRemoved, onAlbum])
      await expectDone(await deleteMine(gone.id, lea))
    await act.block(maxId, lea)
    await expectDone(await deleteMine(blockedByMe.id, lea))
    // Max bloque Léa à son tour : elle supprime encore.
    later()
    await act.unblock(maxId, lea)
    const blockedByMax = await comment(fusee.id, lea, 'Chez Max, qui me bloque')
    later()
    await act.block(leaId, max)
    await expectDone(await deleteMine(blockedByMax.id, lea))

    for (const gone of [onPrivate, onRemoved, blockedByMe, onAlbum, blockedByMax]) {
      expect(await storedComment(gone.id), gone.id).toBeNull()
    }
    expect((await myComments(lea)).items).toEqual([])
  })

  it('keeps a root with replies as « Commentaire supprimé », with its replies, as on the project', async () => {
    const meteo = await publish('Météo')
    const root = await comment(meteo.id, lea, 'Une question')
    const replyOfZoe = await comment(meteo.id, zoe, 'La réponse de Zoé', root.id)
    const replyOfLea = await comment(meteo.id, lea, 'Ma propre réponse', root.id)

    await expectDone(await deleteMine(replyOfLea.id, lea))
    await expectDone(await deleteMine(root.id, lea))

    // La règle d'aujourd'hui : texte et auteur effacés pour de bon, la place gardée.
    expect(await storedComment(root.id)).toEqual({
      body: '',
      authorId: null,
      deletedAt: new Date(),
    })
    expect(await storedComment(replyOfLea.id)).toBeNull()
    expect(await storedComment(replyOfZoe.id)).toMatchObject({ body: 'La réponse de Zoé' })
    expect((await myComments(lea)).items).toEqual([])
  })

  it("refuses another member's comment with the same 404 as an unknown one", async () => {
    const meteo = await publish('Météo')
    const ofZoe = await comment(meteo.id, zoe, 'Le commentaire de Zoé')
    // Un commentaire de Max sur son projet privé : Léa ne le voit pas non plus.
    const secret = await publish('Carnet secret', max, { visibility: 'private' })
    const ofMaxPrivate = await comment(secret.id, max, 'Une note pour moi')
    const deleted = await comment(meteo.id, lea, 'Bientôt supprimé')
    await expectDone(
      await act.send('DELETE', `/v1/projects/${meteo.id}/comments/${deleted.id}`, lea),
    )
    const unknown = await deleteMine(UNKNOWN, lea)
    expect(unknown.status).toBe(404)
    const unknownBody = await unknown.text()

    for (const [what, id] of [
      ['public, of another', ofZoe.id],
      ['private, of another', ofMaxPrivate.id],
      ['already deleted', deleted.id],
      ['malformed', 'pas-un-identifiant'],
    ] as const) {
      const res = await deleteMine(id, lea)
      expect(res.status, what).toBe(404)
      expect(await res.text(), what).toBe(unknownBody)
    }
    expect(await storedComment(ofZoe.id)).toMatchObject({ body: 'Le commentaire de Zoé' })
    expect(await storedComment(ofMaxPrivate.id)).toMatchObject({ body: 'Une note pour moi' })
    // Témoin : son propre commentaire, lui, se supprime (une route absente répond aussi 404).
    const mine = await comment(meteo.id, lea, 'Le mien')
    await expectDone(await deleteMine(mine.id, lea))
  })

  it('counts even malformed requests', async () => {
    const meteo = await publish('Météo')
    const mine = await comment(meteo.id, lea, 'Le mien')
    // 60 changements par heure, partagés avec l'ancienne route : Léa en a déjà fait 58.
    await ctx.db
      .insert(schema.apiRateLimit)
      .values({ key: memberCounterKeys(leaId).projectChange, count: 58, windowStart: Date.now() })

    // La 59e : une adresse mal formée, sur la nouvelle route ; la 60e : l'ancienne, sur un
    // commentaire inconnu.
    expect((await deleteMine('pas-un-identifiant', lea)).status).toBe(404)
    expect(
      (await act.send('DELETE', `/v1/projects/${meteo.id}/comments/${UNKNOWN}`, lea)).status,
    ).toBe(404)

    const res = await deleteMine(mine.id, lea)
    await expectError(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(await storedComment(mine.id)).toMatchObject({ body: 'Le mien' })
    // L'ancienne route est arrêtée aussi : un seul compteur.
    await expectError(
      await act.send('DELETE', `/v1/projects/${meteo.id}/comments/${mine.id}`, lea),
      429,
      'rate_limited',
    )
  })
})
