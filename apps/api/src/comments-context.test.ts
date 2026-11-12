// Tests d'intégration de R8 : « Voir en contexte » (GET /v1/comments/{commentId}/context). Une
// notification de commentaire, de réponse ou de mention mène à la page du projet, feuille des
// commentaires ouverte sur ce commentaire ; l'appli demande d'abord son fil entier. Scénario :
// docs/scenarios/refonte.md, « R8 — Les notifications », « Voir en contexte » ; plan R8, « Choix
// de la session » 3, « API » (BE-B) et « Ce qui change au plan » (sec-B2).
//
// Ce qui est vérifié :
// - la route rend `{ projectId, thread }` : le fil du commentaire visé (sa racine et ses réponses),
//   exactement comme la liste des commentaires le montre à ce membre, qu'il vise une réponse ou la
//   racine ;
// - mêmes règles que la liste : un commentaire masqué ne se voit que de son auteur et de l'auteur
//   du projet, un retiré que de son auteur, un blocage cache le commentaire de l'autre, sauf celui
//   qui mentionne le lecteur quand c'est l'auteur qui l'a bloqué ;
// - tout ce qui ne se voit pas ou n'existe plus répond le même 404 qu'un identifiant inconnu, mot
//   pour mot : rien n'en laisse deviner l'existence.
//
// Une route absente répond déjà 404 : chaque test de refus a donc un témoin qui, lui, reçoit le fil.
// Cinq membres : Léa publie « Le ciel de ce soir » ; Max et Zoé commentent ; Sam signale ; Louis
// est l'administrateur qui retire.
import { type Comment, CommentContext, CommentPage, ErrorResponse } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let sam: string
let louis: string
let maxId: string
let zoeId: string

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'lea-long-pw-1',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-pw-1',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  sam = await ctx.verifiedMember({
    name: 'Sam',
    email: 'sam@example.com',
    password: 'sam-long-pw-1',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-pw-1',
  })
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  await act.makeAdmin((await act.me(louis)).id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge d'une seconde : deux gestes n'ont jamais la même date. */
const later = () => vi.setSystemTime(Date.now() + 1000)

/** Publie le projet de Léa (public par défaut). */
const publish = async (body: object = {}) => {
  later()
  return act.publish(lea, 'Le ciel de ce soir', body)
}

/** Un commentaire, ou une réponse si `replyTo` est donné, une seconde après ce qui précède. */
const comment = async (projectId: string, cookie: string, body: string, replyTo?: string) => {
  later()
  return act.comment(projectId, cookie, body, replyTo)
}

/** La demande de l'appli : le contexte d'un commentaire, pour ce membre (aucune session si null). */
const askContext = (commentId: string, cookie: string | null) =>
  act.send('GET', `/v1/comments/${encodeURIComponent(commentId)}/context`, cookie)

/** Le contexte d'un commentaire, qui doit se voir : 200, au contrat. */
const contextOf = async (commentId: string, cookie: string) => {
  const res = await askContext(commentId, cookie)
  expect(res.status, commentId).toBe(200)
  return CommentContext.parse(await res.json())
}

/** Le fil d'une racine tel que la liste des commentaires le montre à ce membre (undefined : absent). */
const listedThread = async (projectId: string, rootId: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/comments`, cookie)
  expect(res.status).toBe(200)
  return CommentPage.parse(await res.json()).items.find((item: Comment) => item.id === rootId)
}

/**
 * Le contexte refusé : le même 404 `not_found` qu'un identifiant inconnu, statut et corps mot pour
 * mot. `label` dit quel cas a échoué.
 */
const expectSameNotFound = async (commentId: string, cookie: string, label: string) => {
  const reference = await askContext(UNKNOWN, cookie)
  const referenceBody = await reference.text()
  expect(reference.status).toBe(404)
  expect(ErrorResponse.parse(JSON.parse(referenceBody)).error.code).toBe('not_found')
  const res = await askContext(commentId, cookie)
  expect(res.status, label).toBe(404)
  expect(await res.text(), label).toBe(referenceBody)
}

/** Retire un commentaire : Sam le signale, Louis décide (un retrait exige un signalement ouvert). */
const removeComment = async (id: string) => {
  later()
  await act.report(sam, { kind: 'comment', id })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'comment', id },
    ground: 'rules',
    explanation: 'Propos insultants.',
  })
}

/** Retire un projet de la même façon. */
const removeProject = async (id: string) => {
  later()
  await act.report(sam, { kind: 'project', id })
  later()
  await act.decide(louis, {
    action: 'remove',
    target: { kind: 'project', id },
    ground: 'rules',
    explanation: 'Publicité déguisée.',
  })
}

// ─── Le fil ──────────────────────────────────────────────────────────────────────────────────────

describe('the context of a comment', () => {
  it('gives the whole thread of a reply and its project, exactly as the list shows it', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Quelle belle lune')
    const first = await comment(project.id, zoe, 'Oui, très ronde', root.id)
    await comment(project.id, lea, 'Merci à vous deux', root.id)
    // Un autre fil, plus récent : il n'entre pas dans le contexte.
    await comment(project.id, sam, 'Un autre fil')

    const context = await contextOf(first.id, zoe)

    expect(context.projectId).toBe(project.id)
    expect(context.thread).toEqual(await listedThread(project.id, root.id, zoe))
    expect(context.thread.id).toBe(root.id)
    expect(context.thread.replies.map((reply) => reply.body)).toEqual([
      'Oui, très ronde',
      'Merci à vous deux',
    ])
  })

  it('gives the same thread for the root itself', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Quelle belle lune')
    const reply = await comment(project.id, zoe, 'Oui, très ronde', root.id)

    expect(await contextOf(root.id, lea)).toEqual(await contextOf(reply.id, lea))
    expect((await contextOf(root.id, lea)).thread).toEqual(
      await listedThread(project.id, root.id, lea),
    )
  })

  it('tells the projects apart: the project of the comment, never the one the app has open', async () => {
    const ciel = await publish()
    const other = await act.publish(max, 'Les étoiles filantes')
    later()
    const there = await comment(other.id, zoe, 'Une étoile !')

    expect((await contextOf(there.id, lea)).projectId).toBe(other.id)
    expect((await contextOf(there.id, lea)).projectId).not.toBe(ciel.id)
  })

  it('keeps the placeholder of a root deleted by its author above the targeted reply', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Une racine bientôt supprimée')
    const reply = await comment(project.id, zoe, 'Une réponse qui reste', root.id)
    later()
    await act.deleteComment(project.id, root.id, max)

    const context = await contextOf(reply.id, zoe)

    expect(context.thread).toEqual(await listedThread(project.id, root.id, zoe))
    expect(context.thread).toMatchObject({ state: 'deleted', author: null, body: '' })
    expect(JSON.stringify(context)).not.toContain('Une racine bientôt supprimée')
  })

  it('is documented in the API contract', async () => {
    const doc = (await (await ctx.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }
    expect(Object.keys(doc.paths['/v1/comments/{commentId}/context'] ?? {})).toContain('get')
  })
})

// ─── Le même 404 ─────────────────────────────────────────────────────────────────────────────────

describe('a comment the member cannot see', () => {
  it('asks to sign in first', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Quelle belle lune')

    const res = await askContext(root.id, null)
    expect(res.status).toBe(401)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unauthorized')
    // Témoin : avec une session, le fil.
    expect((await contextOf(root.id, zoe)).thread.id).toBe(root.id)
  })

  it('answers the same 404 for a hidden, a removed and a deleted reply under a visible root, and an unknown id', async () => {
    const project = await publish()
    const root = await comment(project.id, lea, 'Ce soir, la lune')
    const hidden = await comment(project.id, max, 'Une réponse masquée', root.id)
    const removed = await comment(project.id, max, 'Une réponse retirée', root.id)
    const deleted = await comment(project.id, max, 'Une réponse supprimée', root.id)
    const visible = await comment(project.id, max, 'Une réponse visible', root.id)
    later()
    await act.hide(project.id, hidden.id, lea)
    await removeComment(removed.id)
    later()
    await act.deleteComment(project.id, deleted.id, max)

    await expectSameNotFound(hidden.id, zoe, 'hidden')
    await expectSameNotFound(removed.id, zoe, 'removed')
    await expectSameNotFound(deleted.id, zoe, 'deleted')
    await expectSameNotFound(deleted.id, max, 'deleted, for its own author')
    // Témoin : la réponse visible du même fil se trouve, sans les trois autres.
    const context = await contextOf(visible.id, zoe)
    expect(context.thread.replies.map((reply) => reply.body)).toEqual(['Une réponse visible'])
    expect(JSON.stringify(context)).not.toContain('Une réponse masquée')
    expect(JSON.stringify(context)).not.toContain('Une réponse retirée')
  })

  it('answers the same 404 for a deleted lone root, a malformed id and a comment of a private project', async () => {
    const project = await publish()
    const lone = await comment(project.id, max, 'Un commentaire seul')
    later()
    await act.deleteComment(project.id, lone.id, max)
    const draft = await act.publish(lea, 'Brouillon', { visibility: 'private' })
    const note = await comment(draft.id, lea, 'Une note pour moi')

    await expectSameNotFound(lone.id, max, 'deleted root')
    await expectSameNotFound('pas-un-uuid', zoe, 'malformed')
    // Un autre membre ne voit rien du projet privé de Léa.
    await expectSameNotFound(note.id, max, 'private project, another member')
    // Témoin : Léa, elle, retrouve sa note.
    expect((await contextOf(note.id, lea)).projectId).toBe(draft.id)
  })

  it('answers the same 404 to the author of a private project for the comment of another', async () => {
    const project = await publish()
    const fromMax = await comment(project.id, max, 'Écrit quand le projet était public')
    const fromLea = await comment(project.id, lea, 'Ma propre note')
    later()
    await act.setVisibility(project.id, lea, 'private')

    await expectSameNotFound(fromMax.id, lea, 'author of the private project')
    await expectSameNotFound(fromMax.id, zoe, 'another member')
    await expectSameNotFound(fromMax.id, max, 'the author of the comment')
    // Témoin : sa propre note, comme dans la liste.
    expect((await contextOf(fromLea.id, lea)).thread).toEqual(
      await listedThread(project.id, fromLea.id, lea),
    )
  })

  it('answers the same 404 for a comment on a project removed by the moderation', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Quelle belle lune')
    // Témoin d'avant le retrait : le fil se trouve.
    expect((await contextOf(root.id, zoe)).thread.id).toBe(root.id)

    await removeProject(project.id)

    await expectSameNotFound(root.id, zoe, 'removed project')
  })
})

// ─── Masqué, retiré : ce que leurs auteurs voient encore ─────────────────────────────────────────

describe('a hidden or removed comment, for those who still read it', () => {
  it('finds a hidden reply for the project author', async () => {
    const project = await publish()
    const root = await comment(project.id, zoe, 'Quelle belle lune')
    const reply = await comment(project.id, max, 'Une réponse déplacée', root.id)
    later()
    await act.hide(project.id, reply.id, lea)

    const context = await contextOf(reply.id, lea)

    expect(context.thread).toEqual(await listedThread(project.id, root.id, lea))
    expect(context.thread.replies).toEqual([
      expect.objectContaining({ id: reply.id, state: 'hidden', body: 'Une réponse déplacée' }),
    ])
    // Son auteur aussi le retrouve ; Zoé, non.
    expect((await contextOf(reply.id, max)).thread.replies.map((r) => r.id)).toEqual([reply.id])
    await expectSameNotFound(reply.id, zoe, 'hidden, another member')
  })

  it('finds a removed comment for its author alone, with its removal, as the list does', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Un commentaire retiré')
    await removeComment(root.id)

    const context = await contextOf(root.id, max)

    expect(context.thread).toEqual(await listedThread(project.id, root.id, max))
    expect(context.thread).toMatchObject({ state: 'removed', body: 'Un commentaire retiré' })
    expect(context.thread.removal).not.toBeNull()
    // L'autrice du projet ne lit plus un contenu retiré : le même 404.
    await expectSameNotFound(root.id, lea, 'removed, author of the project')
  })
})

// ─── Les blocages ────────────────────────────────────────────────────────────────────────────────

describe('the context and blocks', () => {
  it('answers the same 404 for a comment of a member blocked either way', async () => {
    const project = await publish()
    const fromMax = await comment(project.id, max, 'Écrit par Max')
    const fromZoe = await comment(project.id, zoe, 'Écrit par Zoé')
    later()
    await act.block(maxId, zoe) // Zoé bloque Max

    await expectSameNotFound(fromMax.id, zoe, 'blocked by the viewer')
    await expectSameNotFound(fromZoe.id, max, 'the viewer is blocked')
    // Témoin : Sam, hors du blocage, lit les deux.
    expect((await contextOf(fromMax.id, sam)).thread.id).toBe(fromMax.id)
    expect((await contextOf(fromZoe.id, sam)).thread.id).toBe(fromZoe.id)
  })

  it('shows the placeholder of a blocked root above a reply the viewer may read, as the list does', async () => {
    const project = await publish()
    const root = await comment(project.id, max, 'Écrit par Max')
    const reply = await comment(project.id, lea, 'Réponse de Léa', root.id)
    later()
    await act.block(maxId, zoe)

    const context = await contextOf(reply.id, zoe)

    expect(context.thread).toEqual(await listedThread(project.id, root.id, zoe))
    expect(context.thread).toMatchObject({ state: 'blocked', author: null, body: '' })
    expect(JSON.stringify(context)).not.toContain('Écrit par Max')
  })

  it('finds a reply mentioning the viewer from a member who blocked him, as the list does', async () => {
    const project = await publish()
    const { handle: zoeHandle } = await act.me(zoe)
    const root = await comment(project.id, lea, 'Ce soir, la lune')
    const mention = await comment(project.id, max, `Regarde @${zoeHandle}`, root.id)
    const plain = await comment(project.id, max, 'Sans mention', root.id)
    later()
    await act.block(zoeId, max) // Max bloque Zoé après l'avoir mentionnée

    const context = await contextOf(mention.id, zoe)

    expect(context.thread).toEqual(await listedThread(project.id, root.id, zoe))
    expect(context.thread.replies.map((reply) => reply.id)).toEqual([mention.id])
    // La réponse sans mention reste cachée, comme dans la liste.
    await expectSameNotFound(plain.id, zoe, 'no mention')
  })

  it('never finds a reply mentioning the viewer when the viewer blocked its author', async () => {
    const project = await publish()
    const { handle: zoeHandle } = await act.me(zoe)
    const root = await comment(project.id, lea, 'Ce soir, la lune')
    const mention = await comment(project.id, max, `Regarde @${zoeHandle}`, root.id)
    later()
    await act.block(maxId, zoe) // c'est Zoé qui bloque

    await expectSameNotFound(mention.id, zoe, 'mention, blocked by the viewer')
    // Témoin : la racine de Léa se trouve.
    expect((await contextOf(root.id, zoe)).thread.replies).toEqual([])
  })

  it('lets the author of the project read on her project the comment of a member blocked with her', async () => {
    const project = await publish()
    const fromMax = await comment(project.id, max, 'Écrit par Max chez Léa')
    later()
    await act.block(maxId, lea)

    const context = await contextOf(fromMax.id, lea)

    expect(context.thread).toEqual(await listedThread(project.id, fromMax.id, lea))
    expect(context.thread.body).toBe('Écrit par Max chez Léa')
  })
})
