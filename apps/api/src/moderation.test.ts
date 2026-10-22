// Tests d'intégration de la tranche 6d : la modération. L'administrateur lit la file des
// signalements (GET /v1/moderation/reports), les contenus retirés (GET /v1/moderation/removed), et
// décide (POST /v1/moderation/decisions) : retirer, classer sans suite, rétablir. Scénario :
// docs/scenarios/phase-1.md, « Tranche 6d — Signaler » ; règles 1, 4 et 9 à 14 de la relecture du
// plan (22/10/2026).
//
// Quatre membres : Léa (l'autrice du projet « Météo »), Max (qui signale et commente), Zoé (une
// autre, qui montre ce que voient les autres membres) et Louis, l'administrateur. Le rôle se donne
// directement en base (act.makeAdmin), comme le fait le script infra/grant-admin.sh : aucune route
// ne le donne.
//
// Ce qui est vérifié :
// - pour tout autre que l'administrateur, ces routes répondent comme une adresse inexistante ;
// - la file regroupe les signalements par cible, du plus ancien au plus récent, sans jamais dire
//   qui a signalé ;
// - un contenu retiré disparaît pour les autres, partout, et reste visible de son auteur avec
//   l'explication ; un commentaire retiré ne se lit plus, même par l'auteur du projet ;
// - chaque décision est gardée : qui, quand, quelle action, quel fondement, quelle explication.
//
// PGlite n'a qu'une connexion : deux décisions « en même temps » y passent l'une après l'autre. Le
// test de la règle 12 vérifie donc la seconde décision, pas la course elle-même.
import {
  CommentPage,
  ErrorResponse,
  type ModerationDecisionInput,
  ModerationQueuePage,
  NotificationPage,
  Project,
  ProjectNote,
  RemovedPage,
  type ReportTarget,
  toolSlug,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let louis: string
let leaId: string
let maxId: string
let zoeId: string
let louisId: string
let meteo: Project // le projet public de Léa

const SECOND = 1000
const START = new Date('2026-06-15T08:00:00.000Z')
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
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
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  louisId = (await act.me(louis)).id
  await act.makeAdmin(louisId)
  meteo = await act.publish(lea, 'Météo', {
    pitch: 'La pluie de demain, quartier par quartier.',
    tools: ['Mistral'],
  })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)
const nowIso = () => new Date(Date.now()).toISOString()

const projectTarget = (id = meteo.id): ReportTarget => ({ kind: 'project', id })

/** Signale, une seconde après ce qui précède. */
const report = async (cookie: string, target: ReportTarget, reason = 'other', details?: string) => {
  later()
  return act.report(cookie, target, reason as 'other', details)
}

/** Retire une cible (Louis), avec un fondement et une explication. */
const remove = async (target: ReportTarget, explanation = 'Publicité déguisée.') => {
  later()
  return act.decide(louis, { action: 'remove', target, ground: 'rules', explanation })
}
const decideRaw = (cookie: string | null, body: unknown) => {
  later()
  return act.send('POST', '/v1/moderation/decisions', cookie, body)
}

const readQueue = async (cookie = louis, cursor?: string) => {
  const query = cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`
  const res = await act.send('GET', `/v1/moderation/reports${query}`, cookie)
  expect(res.status).toBe(200)
  return ModerationQueuePage.parse(await res.json())
}
const readRemoved = async (cookie = louis) => {
  const res = await act.send('GET', '/v1/moderation/removed', cookie)
  expect(res.status).toBe(200)
  return RemovedPage.parse(await res.json())
}

const readProject = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${id}`, cookie)
  expect(res.status).toBe(200)
  return Project.parse(await res.json())
}
const readComments = async (projectId: string, cookie: string) => {
  const res = await act.send('GET', `/v1/projects/${projectId}/comments`, cookie)
  expect(res.status).toBe(200)
  return CommentPage.parse(await res.json())
}
const postNote = async (projectId: string, cookie: string, body: string) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/notes`, cookie, { body })
  expect(res.status).toBe(201)
  return ProjectNote.parse(await res.json())
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Deux réponses identiques, statut et corps : rien ne distingue l'une de l'autre. */
const expectSame = async (res: Response, reference: Response, label: string) => {
  expect(res.status, label).toBe(reference.status)
  expect(await res.json(), label).toEqual(await reference.json())
}

const reportsInBase = () =>
  ctx.db.select().from(schema.contentReport).orderBy(schema.contentReport.createdAt)
const decisionsInBase = () =>
  ctx.db.select().from(schema.moderationDecision).orderBy(schema.moderationDecision.createdAt)

// ─── Règle 9 : la garde ──────────────────────────────────────────────────────────────────────────

describe('the moderation routes, for anyone but an administrator', () => {
  const routes = [
    ['GET', '/v1/moderation/reports'],
    ['GET', '/v1/moderation/removed'],
    ['POST', '/v1/moderation/decisions'],
  ] as const
  const validDecision = { action: 'dismiss', target: { kind: 'project', id: UNKNOWN } }

  /** La même demande vers une adresse qui n'existe pas : la réponse de référence. */
  const nowhere = (method: string, cookie: string | null, body?: unknown) =>
    act.send(method, '/v1/inexistant', cookie, body)

  it('answer like a route that does not exist: anonymous, member, revoked administrator', async () => {
    await act.makeAdmin(zoeId)
    await act.revokeAdmin(zoeId)

    for (const [who, cookie] of [
      ['anonymous', null],
      ['member', max],
      ['revoked', zoe],
    ] as const) {
      for (const [method, path] of routes) {
        const body = method === 'POST' ? validDecision : undefined
        const res = await act.send(method, path, cookie, body)
        expect(res.status, `${who} ${method} ${path}`).toBe(404)
        await expectSame(res, await nowhere(method, cookie, body), `${who} ${method} ${path}`)
      }
    }
    // Témoin : l'administrateur, lui, lit la file (les routes existent).
    expect((await act.send('GET', '/v1/moderation/reports', louis)).status).toBe(200)
  })

  it('check the role before the body: an invalid decision from a member is a plain 404', async () => {
    for (const body of [
      { action: 'explode' },
      { action: 'remove', target: projectTarget() },
      'x',
    ]) {
      const res = await decideRaw(max, body)
      expect(res.status).toBe(404)
      await expectSame(res, await nowhere('POST', max, body), JSON.stringify(body))
    }
    // Témoin : le même corps invalide, envoyé par l'administrateur, est refusé par la validation.
    await expectError(await decideRaw(louis, { action: 'explode' }), 400, 'validation')
  })

  it('read the role at each request: a revoked administrator loses access at once', async () => {
    expect((await act.send('GET', '/v1/moderation/reports', louis)).status).toBe(200)

    await act.revokeAdmin(louisId)

    // La même session, sans reconnexion.
    expect((await act.send('GET', '/v1/moderation/reports', louis)).status).toBe(404)
    expect((await act.me(louis)).isAdmin).toBe(false)
  })
})

describe('the administrator role', () => {
  it('shows in « me » for an administrator only', async () => {
    expect((await act.me(louis)).isAdmin).toBe(true)
    expect((await act.me(max)).isAdmin).toBe(false)
  })

  it('cannot be given through the API', async () => {
    await act.send('PATCH', '/v1/me', max, { isAdmin: true })
    await act.send('POST', '/api/auth/update-user', max, { isAdmin: true, role: 'admin' })

    expect((await act.me(max)).isAdmin).toBe(false)
    expect((await act.send('GET', '/v1/moderation/reports', max)).status).toBe(404)
    // Témoin : le rôle donné en base, lui, se voit.
    expect((await act.me(louis)).isAdmin).toBe(true)
  })
})

// ─── La file ─────────────────────────────────────────────────────────────────────────────────────

describe('the queue', () => {
  it('groups the reports by target, oldest first, with the reasons counted and the details', async () => {
    const note = await postNote(meteo.id, lea, 'Une note signalée')
    await report(max, projectTarget(), 'scam_spam', 'Le lien mène à une page de paiement.')
    const first = nowIso()
    await report(zoe, { kind: 'note', id: note.id }, 'other')
    await report(zoe, projectTarget(), 'scam_spam')
    await report(louis, projectTarget(), 'other', 'Vu aussi.')
    const last = nowIso()

    const page = await readQueue()

    expect(page.items.map((item) => item.target)).toEqual([
      projectTarget(),
      { kind: 'note', id: note.id },
    ])
    expect(page.items[0]).toEqual({
      target: projectTarget(),
      projectId: meteo.id,
      snapshot: expect.stringContaining('Météo'),
      state: 'present',
      concernsMe: false,
      reasons: [
        { reason: 'scam_spam', count: 2 },
        { reason: 'other', count: 1 },
      ],
      details: ['Vu aussi.', 'Le lien mène à une page de paiement.'],
      count: 3,
      firstReportedAt: first,
      lastReportedAt: last,
    })
    expect(page.items[1]).toMatchObject({
      projectId: meteo.id,
      count: 1,
      snapshot: 'Une note signalée',
    })
    expect(page.nextCursor).toBeNull()
  })

  // Règle 14 : la file ne dit jamais qui a signalé.
  it('never says who reported', async () => {
    await report(max, projectTarget(), 'harassment', 'Précision de Max')
    await report(zoe, { kind: 'member', id: leaId }, 'impersonation')

    const res = await act.send('GET', '/v1/moderation/reports', louis)
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(text).toContain('Précision de Max') // témoin : la file est bien là
    for (const leak of [maxId, zoeId, 'max@example.com', 'zoe@example.com', '"Max"', 'Zoé']) {
      expect(text, leak).not.toContain(leak)
    }
  })

  it('shows the queue 20 targets at a time', async () => {
    for (let i = 1; i <= 21; i++) {
      const comment = await act.comment(meteo.id, lea, `Commentaire ${i}`)
      await report(i <= 20 ? max : zoe, { kind: 'comment', id: comment.id })
    }

    const first = await readQueue()
    expect(first.items).toHaveLength(20)
    expect(first.items[0]?.snapshot).toBe('Commentaire 1')
    expect(first.nextCursor).not.toBeNull()
    const second = await readQueue(louis, first.nextCursor ?? undefined)
    expect(second.items.map((item) => item.snapshot)).toEqual(['Commentaire 21'])
    expect(second.nextCursor).toBeNull()
  })

  it('closes on its own the reports of a content deleted by its author', async () => {
    const comment = await act.comment(meteo.id, zoe, 'Un commentaire bientôt supprimé')
    await report(max, { kind: 'comment', id: comment.id })
    await act.deleteComment(meteo.id, comment.id, zoe)

    const page = await readQueue()

    expect(page.items.filter((item) => item.state === 'present')).toEqual([])
    expect((await reportsInBase()).map((r) => r.status)).toEqual(['void'])
  })
})

// ─── Retirer ─────────────────────────────────────────────────────────────────────────────────────

describe('removing a project', () => {
  it('records the decision and closes every open report of the project', async () => {
    await report(max, projectTarget(), 'scam_spam')
    await report(zoe, projectTarget(), 'other')

    const decision = await remove(projectTarget())

    expect(decision).toMatchObject({ action: 'remove', createdAt: nowIso() })
    expect(await decisionsInBase()).toEqual([
      expect.objectContaining({
        id: decision.id,
        targetKind: 'project',
        targetId: meteo.id,
        action: 'remove',
        ground: 'rules',
        explanation: 'Publicité déguisée.',
        adminId: louisId,
        createdAt: new Date(Date.now()),
      }),
    ])
    expect((await reportsInBase()).map((r) => [r.status, r.decisionId, r.decidedAt])).toEqual([
      ['removed', decision.id, new Date(Date.now())],
      ['removed', decision.id, new Date(Date.now())],
    ])
    expect((await readQueue()).items).toEqual([])
  })

  it('hides it from every other member, everywhere, like an unknown project', async () => {
    const velo = await act.publish(lea, 'Vélo', { tools: ['Mistral'] })
    await act.followMember(leaId, zoe)
    await report(max, projectTarget())
    await remove(projectTarget())

    // Sa page et ses sous-routes : la même réponse qu'un projet inconnu.
    for (const [method, suffix] of [
      ['GET', ''],
      ['GET', '/comments'],
      ['PUT', '/reactions/bravo'],
      ['POST', '/follow'],
    ] as const) {
      const res = await act.send(method, `/v1/projects/${meteo.id}${suffix}`, zoe)
      await expectSame(res, await act.send(method, `/v1/projects/${UNKNOWN}${suffix}`, zoe), suffix)
    }
    // Les listes : absent du fil, de la page de Léa, de l'étiquette. Témoin : « Vélo » y est.
    for (const path of [
      '/v1/feed/discover',
      '/v1/feed/following',
      `/v1/members/${leaId}`,
      `/v1/tags/${toolSlug('Mistral')}`,
    ]) {
      const res = await act.send('GET', path, zoe)
      expect(res.status, path).toBe(200)
      const text = await res.text()
      expect(text, path).toContain(velo.id)
      expect(text, path).not.toContain(meteo.id)
    }
  })

  it('stays visible to its author, with the ground, the explanation and the date', async () => {
    await report(max, projectTarget())
    await remove(projectTarget(), 'Le lien de la démo mène à une arnaque.')
    const removedAt = nowIso()

    const res = await act.send('GET', `/v1/projects/${meteo.id}`, lea)
    const text = await res.clone().text()
    const project = Project.parse(await res.json())

    expect(project.removal).toEqual({
      ground: 'rules',
      explanation: 'Le lien de la démo mène à une arnaque.',
      at: removedAt,
      afterReport: true,
    })
    // Règle 14 : ni l'administrateur, ni la personne qui a signalé.
    for (const leak of [louisId, maxId, 'Louis', 'Max']) expect(text, leak).not.toContain(leak)
  })

  it('says it did not follow a report when the administrator reported it himself', async () => {
    // Précision 2 du plan : un retrait demandé par e-mail ; Louis signale lui-même, puis retire.
    await report(louis, projectTarget(), 'illegal')
    await remove(projectTarget())

    expect((await readProject(meteo.id, lea)).removal?.afterReport).toBe(false)
  })

  it('gives no removal to a project that is not removed', async () => {
    expect((await readProject(meteo.id, lea)).removal).toBeNull()
    expect((await readProject(meteo.id, zoe)).removal).toBeNull()
  })
})

describe('removing a note', () => {
  it('hides it from the others, and shows it to its author with the removal', async () => {
    await act.followMember(leaId, zoe)
    const kept = await postNote(meteo.id, lea, 'Une note qui reste')
    const note = await postNote(meteo.id, lea, 'Une note publicitaire')
    await report(max, { kind: 'note', id: note.id })
    await remove({ kind: 'note', id: note.id }, 'Publicité.')

    expect((await readProject(meteo.id, zoe)).notes.map((n) => n.body)).toEqual([kept.body])
    const following = await (await act.send('GET', '/v1/feed/following', zoe)).text()
    expect(following).toContain(kept.id)
    expect(following).not.toContain(note.id)

    const mine = (await readProject(meteo.id, lea)).notes.find((n) => n.id === note.id)
    expect(mine?.removal).toEqual({
      ground: 'rules',
      explanation: 'Publicité.',
      at: nowIso(),
      afterReport: true,
    })
  })
})

// Règle 1 : un commentaire retiré n'est lisible que par son auteur, jamais par l'auteur du projet.
describe('removing a comment', () => {
  it('leaves a « removed » placeholder for everyone else, the author of the project included', async () => {
    const { handle } = await act.me(zoe)
    const root = await act.comment(meteo.id, max, `Un texte insultant pour @${handle}`)
    later()
    await act.comment(meteo.id, zoe, 'La réponse de Zoé', root.id)
    await report(zoe, { kind: 'comment', id: root.id }, 'harassment')
    await remove({ kind: 'comment', id: root.id }, 'Insulte.')

    for (const [who, cookie] of [
      ['Léa, author of the project', lea],
      ['Zoé', zoe],
    ] as const) {
      const page = await readComments(meteo.id, cookie)
      expect(page.items, who).toHaveLength(1)
      expect(page.items[0], who).toMatchObject({
        id: root.id,
        state: 'removed',
        author: null,
        body: '',
        mentions: [],
        removal: null,
      })
      // Les réponses restent.
      expect(
        page.items[0]?.replies.map((r) => r.body),
        who,
      ).toEqual(['La réponse de Zoé'])
      expect(JSON.stringify(page), who).not.toContain('insultant')
    }
  })

  it('shows the comment to its author, with the removal', async () => {
    const root = await act.comment(meteo.id, max, 'Le commentaire de Max')
    await report(zoe, { kind: 'comment', id: root.id })
    await remove({ kind: 'comment', id: root.id }, 'Hors sujet.')

    const [mine] = (await readComments(meteo.id, max)).items
    expect(mine).toMatchObject({
      id: root.id,
      state: 'removed',
      body: 'Le commentaire de Max',
      isMine: true,
      removal: { ground: 'rules', explanation: 'Hors sujet.', at: nowIso(), afterReport: true },
    })
  })

  it('drops a removed comment without replies, and from the count', async () => {
    await act.comment(meteo.id, zoe, 'Un commentaire qui reste')
    const lone = await act.comment(meteo.id, max, 'Un commentaire seul')
    expect((await readProject(meteo.id, zoe)).commentCount).toBe(2)
    await report(zoe, { kind: 'comment', id: lone.id })
    await remove({ kind: 'comment', id: lone.id })

    for (const cookie of [lea, zoe]) {
      expect((await readComments(meteo.id, cookie)).items.map((c) => c.body)).toEqual([
        'Un commentaire qui reste',
      ])
      expect((await readProject(meteo.id, cookie)).commentCount).toBe(1)
    }
  })
})

// Règle 4 : un contenu retiré ne se modifie plus, et on ne lui répond plus.
describe('a removed content', () => {
  it('cannot be edited by its author while it is removed', async () => {
    const comment = await act.comment(meteo.id, max, 'Le commentaire de Max')
    await report(zoe, projectTarget())
    await report(zoe, { kind: 'comment', id: comment.id })
    await remove(projectTarget())
    await remove({ kind: 'comment', id: comment.id })

    await expectError(
      await act.send('PATCH', `/v1/projects/${meteo.id}`, lea, {
        title: 'Météo, nouvelle version',
      }),
      409,
      'removed',
    )
    await expectError(
      await act.send('PATCH', `/v1/projects/${meteo.id}`, lea, { visibility: 'private' }),
      409,
      'removed',
    )
    await expectError(
      await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${comment.id}`, max, {
        body: 'Un texte corrigé',
      }),
      409,
      'removed',
    )
  })

  it('cannot be answered, even by its author', async () => {
    const root = await act.comment(meteo.id, max, 'Le commentaire de Max')
    await report(zoe, { kind: 'comment', id: root.id })
    await remove({ kind: 'comment', id: root.id })

    for (const cookie of [zoe, max, lea]) {
      later()
      const res = await act.send('POST', `/v1/projects/${meteo.id}/comments`, cookie, {
        body: 'Une réponse',
        replyTo: root.id,
      })
      await expectError(res, 404, 'not_found')
    }
    // Témoin : un commentaire nouveau, lui, se publie toujours sur le projet.
    later()
    const fresh = await act.send('POST', `/v1/projects/${meteo.id}/comments`, zoe, {
      body: 'Salut',
    })
    expect(fresh.status).toBe(201)
  })

  it('stays private when restored, if its author had made it private', async () => {
    await report(max, projectTarget())
    await act.setVisibility(meteo.id, lea, 'private')
    await remove(projectTarget())
    later()
    await act.decide(louis, { action: 'restore', target: projectTarget() })

    expect((await act.send('GET', `/v1/projects/${meteo.id}`, zoe)).status).toBe(404)
    expect(await readProject(meteo.id, lea)).toMatchObject({ visibility: 'private', removal: null })
  })
})

// ─── Classer, rétablir ───────────────────────────────────────────────────────────────────────────

describe('dismissing', () => {
  it('leaves the content, closes the reports and keeps the decision', async () => {
    await report(max, projectTarget())
    await report(zoe, projectTarget())
    later()

    const decision = await act.decide(louis, { action: 'dismiss', target: projectTarget() })

    expect(await readProject(meteo.id, zoe)).toMatchObject({ id: meteo.id, removal: null })
    expect((await readQueue()).items).toEqual([])
    expect((await reportsInBase()).map((r) => [r.status, r.decisionId])).toEqual([
      ['dismissed', decision.id],
      ['dismissed', decision.id],
    ])
    expect(await decisionsInBase()).toEqual([
      expect.objectContaining({
        action: 'dismiss',
        targetKind: 'project',
        targetId: meteo.id,
        ground: null,
        explanation: null,
        adminId: louisId,
        createdAt: new Date(Date.now()),
      }),
    ])
  })

  it('is the only action on a profile', async () => {
    await report(max, { kind: 'member', id: leaId }, 'impersonation')

    const res = await decideRaw(louis, {
      action: 'remove',
      target: { kind: 'member', id: leaId },
      ground: 'rules',
      explanation: 'Usurpation.',
    })
    expect(res.status).toBe(422)
    expect((await reportsInBase()).map((r) => r.status)).toEqual(['open'])

    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'member', id: leaId } })
    expect((await reportsInBase()).map((r) => r.status)).toEqual(['dismissed'])
  })
})

describe('restoring', () => {
  it('shows the content again to everyone, and keeps both decisions', async () => {
    await report(max, projectTarget())
    await remove(projectTarget())
    expect((await readRemoved()).items.map((item) => item.target)).toEqual([projectTarget()])
    later()

    await act.decide(louis, { action: 'restore', target: projectTarget() })

    expect(await readProject(meteo.id, zoe)).toMatchObject({ id: meteo.id, removal: null })
    expect((await readProject(meteo.id, lea)).removal).toBeNull()
    expect((await readRemoved()).items).toEqual([])
    expect((await decisionsInBase()).map((d) => [d.action, d.adminId])).toEqual([
      ['remove', louisId],
      ['restore', louisId],
    ])
  })
})

describe('the list of removed contents', () => {
  it('gives each removed content with its text, ground and explanation, newest first', async () => {
    const note = await postNote(meteo.id, lea, 'Une note publicitaire')
    await report(max, { kind: 'note', id: note.id })
    await report(max, projectTarget())
    await remove({ kind: 'note', id: note.id }, 'Publicité.')
    const noteAt = nowIso()
    await remove(projectTarget(), 'Arnaque.')
    const projectAt = nowIso()

    const res = await act.send('GET', '/v1/moderation/removed', louis)
    const text = await res.clone().text()
    const page = RemovedPage.parse(await res.json())

    expect(page.items).toEqual([
      {
        target: projectTarget(),
        projectId: meteo.id,
        text: expect.stringContaining('Météo'),
        ground: 'rules',
        explanation: 'Arnaque.',
        removedAt: projectAt,
        concernsMe: false,
      },
      {
        target: { kind: 'note', id: note.id },
        projectId: meteo.id,
        text: 'Une note publicitaire',
        ground: 'rules',
        explanation: 'Publicité.',
        removedAt: noteAt,
        concernsMe: false,
      },
    ])
    expect(text).not.toContain(maxId)
  })
})

describe('a decision on a missing target', () => {
  it('answers 404 to the administrator for an unknown target', async () => {
    await expectError(
      await decideRaw(louis, { action: 'dismiss', target: projectTarget(UNKNOWN) }),
      404,
      'not_found',
    )
    // Témoin : la même décision sur un projet signalé est acceptée.
    await report(max, projectTarget())
    expect((await decideRaw(louis, { action: 'dismiss', target: projectTarget() })).status).toBe(
      201,
    )
  })

  it('requires a ground and an explanation to remove', async () => {
    await report(max, projectTarget())
    for (const body of [
      { action: 'remove', target: projectTarget(), ground: 'rules' },
      { action: 'remove', target: projectTarget(), explanation: 'Pourquoi.' },
      { action: 'remove', target: projectTarget(), ground: 'rules', explanation: 'a'.repeat(501) },
    ]) {
      await expectError(await decideRaw(louis, body), 400, 'validation')
    }
    expect(await decisionsInBase()).toEqual([])
  })
})

// Règle 11 : un administrateur ne décide pas de ce qui le concerne.
describe('what concerns the administrator', () => {
  it('flags it in the queue, and refuses his decision on his own content or profile', async () => {
    const mine = await act.publish(louis, 'Le projet de Louis')
    await report(max, projectTarget(mine.id))
    await report(max, { kind: 'member', id: louisId })

    const page = await readQueue()
    expect(page.items.map((item) => item.concernsMe)).toEqual([true, true])

    const decisions: ModerationDecisionInput[] = [
      { action: 'remove', target: projectTarget(mine.id), ground: 'rules', explanation: 'Moi.' },
      { action: 'dismiss', target: projectTarget(mine.id) },
      { action: 'dismiss', target: { kind: 'member', id: louisId } },
    ]
    for (const decision of decisions) {
      await expectError(await decideRaw(louis, decision), 422, 'own_content')
    }
    expect(await decisionsInBase()).toEqual([])

    // Un autre administrateur, lui, peut décider.
    await act.makeAdmin(zoeId)
    later()
    await act.decide(zoe, { action: 'dismiss', target: projectTarget(mine.id) })
    expect((await readQueue(zoe)).items.map((item) => item.concernsMe)).toEqual([false])
  })
})

// Règle 12 : une décision déjà prise entre-temps.
describe('a decision already taken', () => {
  it('refuses to remove twice, or to dismiss what is already closed', async () => {
    await report(max, projectTarget())
    await remove(projectTarget())

    await expectError(
      await decideRaw(louis, {
        action: 'remove',
        target: projectTarget(),
        ground: 'rules',
        explanation: 'Encore.',
      }),
      409,
      'already_decided',
    )
    await expectError(
      await decideRaw(louis, { action: 'dismiss', target: projectTarget() }),
      409,
      'already_decided',
    )
    expect(await decisionsInBase()).toHaveLength(1)
  })

  it('refuses to restore a content that is not removed', async () => {
    await expectError(
      await decideRaw(louis, { action: 'restore', target: projectTarget() }),
      409,
      'already_decided',
    )
  })
})

// ─── Les notifications, vues de la modération (le détail est dans notifications.test.ts) ─────────

describe('who is told', () => {
  it('tells the author and the reporter, and never names the reporter to the author', async () => {
    await report(max, projectTarget(), 'scam_spam', 'Précision de Max')
    await remove(projectTarget())

    const res = await act.send('GET', '/v1/notifications', lea)
    const text = await res.text()
    const leaKinds = NotificationPage.parse(JSON.parse(text)).items.map((n) => n.kind)
    expect(leaKinds).toContain('removed')
    for (const leak of [maxId, 'max@example.com', 'Précision de Max', louisId]) {
      expect(text, leak).not.toContain(leak)
    }

    const maxPage = NotificationPage.parse(
      await (await act.send('GET', '/v1/notifications', max)).json(),
    )
    expect(maxPage.items.map((n) => n.kind)).toContain('report_handled')
  })
})

// ─── Questions des test-writer (23/10/2026), règles 29 et 30 du plan ──────────────────────────────

// Règle 30 : ajouter une note ou une photo à un projet retiré, c'est le modifier.
describe('adding to a removed project', () => {
  it('refuses a new note or a new photo while the project is removed', async () => {
    await report(max, projectTarget())
    await remove(projectTarget())

    later()
    await expectError(
      await act.send('POST', `/v1/projects/${meteo.id}/notes`, lea, { body: 'Une note de plus' }),
      409,
      'removed',
    )
    const photo = await ctx.request(`/v1/projects/${meteo.id}/visuals`, {
      method: 'POST',
      headers: { cookie: lea },
      body: visualForm(await jpegImage(1200, 800)),
    })
    await expectError(photo, 409, 'removed')
    expect((await readProject(meteo.id, lea)).notes).toEqual([])
  })
})

// Règle 29 : une cible supprimée par son auteur quitte la file, sans prévenir qui l'a signalée.
describe('a target deleted by its author', () => {
  it('leaves the queue, and its reporter is told nothing', async () => {
    const comment = await act.comment(meteo.id, zoe, 'Un commentaire bientôt supprimé')
    await report(max, { kind: 'comment', id: comment.id })
    await report(max, projectTarget()) // témoin : une cible encore là
    await act.deleteComment(meteo.id, comment.id, zoe)

    const page = await readQueue()

    expect(page.items.map((item) => item.target)).toEqual([projectTarget()])
    const maxPage = NotificationPage.parse(
      await (await act.send('GET', '/v1/notifications', max)).json(),
    )
    expect(maxPage.items.filter((n) => n.kind === 'report_handled')).toEqual([])
  })
})
