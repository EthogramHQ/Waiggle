// Tests d'intégration de la tranche 7a : la modération. L'administrateur lit la file des
// signalements (GET /v1/moderation/reports), les contenus retirés (GET /v1/moderation/removed), et
// décide (POST /v1/moderation/decisions) : retirer, classer sans suite, rétablir. Scénario :
// docs/scenarios/phase-1.md, « Tranche 7a — Signaler » ; règles 1, 4 et 9 à 14 de la relecture du
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
// Tranche 7c (« Administrer », fin du fichier) : les garde-fous de la modération (une décision à
// la fois par cible, 50 décisions par jour, le mot de passe redemandé), le rappel des décisions
// passées sur chaque carte (`authorRecord`) et une ligne invalide en base qui n'abîme pas la file.
//
// PGlite n'a qu'une connexion : deux décisions « en même temps » y passent l'une après l'autre. Le
// test de la règle 12 vérifie donc la seconde décision, pas la course elle-même.
import { randomUUID } from 'node:crypto'
import {
  CommentPage,
  ErrorResponse,
  MODERATION_DECISIONS_PER_DAY,
  MODERATION_PASSWORD_FAILURES_PER_DAY,
  type ModerationDecisionInput,
  ModerationQueuePage,
  NotificationPage,
  Project,
  ProjectNote,
  REMOVALS_BEFORE_PASSWORD,
  RemovedPage,
  type ReportTarget,
  SUSPENSIONS_BEFORE_PASSWORD,
  toolSlug,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
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
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const LOUIS_PASSWORD = 'louis-long-password'
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
    password: LOUIS_PASSWORD,
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
      // Tranche 7b : la copie la plus récente, champ par champ, ses images, et si les copies diffèrent.
      snapshot: expect.arrayContaining([{ field: 'title', value: 'Météo' }]),
      images: [],
      snapshotsDiffer: false,
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
      // Tranche 7c : le rappel de ce que la modération a déjà décidé pour Léa (rien encore).
      authorRecord: {
        memberId: leaId,
        removals: 0,
        suspensions: 0,
        suspendedNow: false,
        canSuspend: true,
      },
    })
    expect(page.items[1]).toMatchObject({
      projectId: meteo.id,
      count: 1,
      snapshot: [{ field: 'body', value: 'Une note signalée' }],
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
    expect(first.items[0]?.snapshot).toEqual([{ field: 'body', value: 'Commentaire 1' }])
    expect(first.nextCursor).not.toBeNull()
    const second = await readQueue(louis, first.nextCursor ?? undefined)
    expect(second.items.map((item) => item.snapshot)).toEqual([
      [{ field: 'body', value: 'Commentaire 21' }],
    ])
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
    await report(louis, projectTarget(), 'illegal', 'Demande reçue par e-mail.')
    await remove(projectTarget())

    expect((await readProject(meteo.id, lea)).removal?.afterReport).toBe(false)
  })

  // Relecture de sécurité de 4966555 (C2) : les photos d'un projet retiré ne se servent plus à
  // qui a gardé leur adresse. /media/<clé> doit répondre à Zoé exactement comme pour une clé qui
  // n'existe pas (statut, type et corps), sinon l'adresse dirait que la photo existe encore.
  it('stops serving its photos to the others, like an unknown file, and keeps them for its author', async () => {
    later()
    const added = await ctx.request(`/v1/projects/${meteo.id}/visuals`, {
      method: 'POST',
      headers: { cookie: lea },
      body: visualForm(await jpegImage(1200, 800)),
    })
    expect(added.status).toBe(201)
    const url = Project.parse(await added.json()).visuals[0]?.url ?? ''
    const open = (path: string, cookie: string) => ctx.request(path, { headers: { cookie } })
    const photo = new URL(url).pathname
    const unknown = `/media/visuals/${UNKNOWN}.webp`
    expect((await open(photo, zoe)).status).toBe(200) // témoin, avant le retrait

    await report(max, projectTarget())
    await remove(projectTarget())

    const res = await open(photo, zoe)
    const reference = await open(unknown, zoe)
    expect(res.status).toBe(404)
    expect(res.status).toBe(reference.status)
    expect(res.headers.get('content-type')).toBe(reference.headers.get('content-type'))
    expect(await res.text()).toBe(await reference.text())
    // Léa, son autrice, voit encore son projet retiré : ses photos aussi.
    expect((await open(photo, lea)).status).toBe(200)
  })

  it('gives no removal to a project that is not removed', async () => {
    expect((await readProject(meteo.id, lea)).removal).toBeNull()
    expect((await readProject(meteo.id, zoe)).removal).toBeNull()
  })
})

describe('removing a note', () => {
  it('hides it from the others, and shows it to its author with the removal', async () => {
    // Suivre le projet, pas son autrice : seules les notes des projets suivis arrivent dans le fil
    // « Abonnements » (tranche 4) ; suivre un membre n'y fait venir que ses nouveaux projets.
    expect((await act.send('POST', `/v1/projects/${meteo.id}/follow`, zoe)).status).toBe(204)
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
    // Le commentaire d'abord : une fois le projet retiré, Max ne le voit plus du tout (404,
    // règle 5), et la règle 4 ne peut plus se lire sur son commentaire.
    await remove({ kind: 'comment', id: comment.id })
    await expectError(
      await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${comment.id}`, max, {
        body: 'Un texte corrigé',
      }),
      409,
      'removed',
    )

    await remove(projectTarget())
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

// Règles 4 et 30, sous le verrou (relecture de sécurité de 7a) : les gardes lisent l'état du projet
// AVANT la transaction qui écrit. Si la modération le retire entre les deux, l'écriture doit le voir
// et répondre comme la garde. Pour placer le retrait exactement là, on intercepte la première
// transaction ouverte par la route : juste avant elle, le projet est retiré en base (comme le ferait
// une décision de l'administrateur arrivée au même instant). La garde, elle, a déjà dit « le tien ».
describe('a removal that lands between the guard and the write', () => {
  /** Retire `projectId` en base juste avant la prochaine transaction, puis la laisse se faire. */
  const removeBeforeNextTransaction = (projectId: string) => {
    const original = ctx.db.transaction.bind(ctx.db)
    const spy = vi.spyOn(ctx.db, 'transaction')
    spy.mockImplementationOnce(async (run, config) => {
      await ctx.db
        .update(schema.project)
        .set({ removedAt: new Date() })
        .where(eq(schema.project.id, projectId))
      return original(run, config)
    })
    return spy
  }

  it('does not save a change to the project', async () => {
    const spy = removeBeforeNextTransaction(meteo.id)
    later()
    const res = await act.send('PATCH', `/v1/projects/${meteo.id}`, lea, { title: 'Autre titre' })
    expect(spy).toHaveBeenCalled()
    await expectError(res, 409, 'removed')
    const [row] = await ctx.db
      .select({ title: schema.project.title })
      .from(schema.project)
      .where(eq(schema.project.id, meteo.id))
    expect(row?.title).toBe('Météo')
  })

  it('does not add a photo, and drops its file', async () => {
    const spy = removeBeforeNextTransaction(meteo.id)
    later()
    const res = await ctx.request(`/v1/projects/${meteo.id}/visuals`, {
      method: 'POST',
      headers: { cookie: lea },
      body: visualForm(await jpegImage(1200, 800)),
    })
    expect(spy).toHaveBeenCalled()
    await expectError(res, 409, 'removed')
    expect(await ctx.db.select().from(schema.projectMedia)).toEqual([])
    expect([...ctx.storage.files.keys()].filter((key) => key.startsWith('visuals/'))).toEqual([])
  })

  it('does not add a note', async () => {
    const spy = removeBeforeNextTransaction(meteo.id)
    later()
    const res = await act.send('POST', `/v1/projects/${meteo.id}/notes`, lea, { body: 'Une note' })
    expect(spy).toHaveBeenCalled()
    await expectError(res, 409, 'removed')
    expect(await ctx.db.select().from(schema.projectNote)).toEqual([])
  })

  it('does not add a comment: removed for the author of the project, unknown for another', async () => {
    removeBeforeNextTransaction(meteo.id)
    later()
    const own = await act.send('POST', `/v1/projects/${meteo.id}/comments`, lea, { body: 'Merci' })
    await expectError(own, 409, 'removed')

    // Rétabli en base, puis retiré de nouveau pendant le commentaire de Max : pour lui, un projet
    // retiré est introuvable, comme partout ailleurs (404, rien ne révèle le retrait).
    await ctx.db
      .update(schema.project)
      .set({ removedAt: null })
      .where(eq(schema.project.id, meteo.id))
    removeBeforeNextTransaction(meteo.id)
    later()
    const other = await act.send('POST', `/v1/projects/${meteo.id}/comments`, max, {
      body: 'Bravo',
    })
    await expectError(other, 404, 'not_found')
    expect(await ctx.db.select().from(schema.projectComment)).toEqual([])
  })

  it('does not save an edit to a comment on the removed project of its author', async () => {
    const comment = await act.comment(meteo.id, lea, 'Merci à tous')
    removeBeforeNextTransaction(meteo.id)
    later()
    const res = await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${comment.id}`, lea, {
      body: 'Un texte corrigé',
    })
    await expectError(res, 409, 'removed')
    const [row] = await ctx.db
      .select({ body: schema.projectComment.body })
      .from(schema.projectComment)
      .where(eq(schema.projectComment.id, comment.id))
    expect(row?.body).toBe('Merci à tous')
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

// ─── Tranche 7b : copies, images, blocages ───────────────────────────────────────────────────────

// Règle 13 (B3, S11) : la file montre la copie la plus récente parmi les signalements ouverts, et
// dit quand les copies diffèrent (le contenu a changé entre deux signalements).
describe('the copy shown in the queue', () => {
  it('shows the most recent copy, and says that the copies differ', async () => {
    const comment = await act.comment(meteo.id, lea, 'Première version')
    await report(max, { kind: 'comment', id: comment.id })
    later()
    const edit = await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${comment.id}`, lea, {
      body: 'Seconde version',
    })
    expect(edit.status).toBe(200)
    await report(zoe, { kind: 'comment', id: comment.id })

    const [item] = (await readQueue()).items
    expect(item).toMatchObject({
      snapshot: [{ field: 'body', value: 'Seconde version' }],
      snapshotsDiffer: true,
      count: 2,
    })
  })

  it('says the copies are the same when nothing changed', async () => {
    await report(max, projectTarget())
    await report(zoe, projectTarget())

    expect((await readQueue()).items[0]?.snapshotsDiffer).toBe(false)
  })

  // Règle 15 (J1) : la copie garde la clé des images ; la file dit si elles sont encore là, jamais
  // leur clé.
  it('says whether each image of the copy is still there, without its key', async () => {
    const upload = await ctx.request(`/v1/projects/${meteo.id}/visuals`, {
      method: 'POST',
      headers: { cookie: lea },
      body: visualForm(await jpegImage(800, 600), 'gallery'),
    })
    expect(upload.status).toBe(201)
    const [media] = await ctx.db
      .select({ key: schema.projectMedia.storageKey })
      .from(schema.projectMedia)
      .where(eq(schema.projectMedia.projectId, meteo.id))
    await report(max, projectTarget())

    const before = await act.send('GET', '/v1/moderation/reports', louis)
    const raw = await before.text()
    expect(ModerationQueuePage.parse(JSON.parse(raw)).items[0]?.images.map((i) => i.state)).toEqual(
      ['present'],
    )
    expect(raw).not.toContain(media?.key ?? 'no key')

    await ctx.db.delete(schema.projectMedia).where(eq(schema.projectMedia.projectId, meteo.id))
    expect((await readQueue()).items[0]?.images.map((i) => i.state)).toEqual(['gone'])
  })
})

// Précision 7 et règle 17 (S9, J13) : la modération ignore les blocages, sauf pour dire « Te
// concerne » à un administrateur qui a lui-même bloqué l'auteur visé.
describe('the moderation and blocks', () => {
  it('shows the queue and lets the administrator decide, even when the author blocked him', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire de Léa')
    await report(max, { kind: 'comment', id: comment.id })
    await report(max, projectTarget())
    later()
    await act.block(louisId, lea) // Léa bloque l'administrateur

    const page = await readQueue()
    expect(page.items.map((item) => item.target.kind).sort()).toEqual(['comment', 'project'])
    expect(page.items.map((item) => item.concernsMe)).toEqual([false, false])
    expect(page.items.find((i) => i.target.kind === 'comment')?.snapshot).toEqual([
      { field: 'body', value: 'Un commentaire de Léa' },
    ])
    await remove({ kind: 'comment', id: comment.id })
    await remove(projectTarget())
    expect((await readQueue()).items).toEqual([])
  })

  it('flags a target whose author the administrator blocked', async () => {
    await report(max, projectTarget())
    await report(max, { kind: 'member', id: leaId })
    later()
    await act.block(leaId, louis) // l'administrateur a bloqué Léa

    expect((await readQueue()).items.map((item) => item.concernsMe)).toEqual([true, true])
    // Un autre administrateur n'est pas concerné.
    await act.makeAdmin(zoeId)
    expect((await readQueue(zoe)).items.map((item) => item.concernsMe)).toEqual([false, false])
  })

  // Règle 17 (relecture de la branche, B1) : le garde se vérifie sur la décision elle-même, pas
  // seulement sur l'indicateur « Te concerne » qui l'annonce. Retirer, classer et rétablir sont
  // refusés comme pour son propre contenu (422 « own_content »), et rien ne change en base.
  it('refuses his decisions on a member he blocked, and lets another administrator decide', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire de Léa')
    await report(max, { kind: 'comment', id: comment.id })
    await report(max, projectTarget())
    // Le commentaire est retiré avant le blocage : il y aura quelque chose à rétablir.
    await remove({ kind: 'comment', id: comment.id })
    later()
    await act.block(leaId, louis) // l'administrateur bloque Léa
    const reportsBefore = await reportsInBase()
    const decisionsBefore = await decisionsInBase()

    const decisions: ModerationDecisionInput[] = [
      { action: 'remove', target: projectTarget(), ground: 'rules', explanation: 'Bloquée.' },
      { action: 'dismiss', target: projectTarget() },
      { action: 'restore', target: { kind: 'comment', id: comment.id } },
    ]
    for (const decision of decisions) {
      await expectError(await decideRaw(louis, decision), 422, 'own_content')
    }
    expect(await reportsInBase()).toEqual(reportsBefore)
    expect(await decisionsInBase()).toEqual(decisionsBefore)
    expect((await readProject(meteo.id, zoe)).removal).toBeNull()

    // « Retirés » annonce le refus à Louis, et à lui seul.
    expect((await readRemoved()).items.map((item) => [item.target, item.concernsMe])).toEqual([
      [{ kind: 'comment', id: comment.id }, true],
    ])
    await act.makeAdmin(zoeId)
    expect((await readRemoved(zoe)).items.map((item) => item.concernsMe)).toEqual([false])
    // Témoin : Zoé, administratrice, rétablit le commentaire ; le refus venait bien du blocage.
    later()
    await act.decide(zoe, { action: 'restore', target: { kind: 'comment', id: comment.id } })
    expect((await readRemoved()).items).toEqual([])
  })
})

// ─── Tranche 7c : les garde-fous de la modération ────────────────────────────────────────────────

/** Un membre de plus, pour les tests qui suspendent plusieurs comptes. */
const newMember = async (name: string, email: string) => {
  const cookie = await ctx.verifiedMember({ name, email, password: 'a-long-password-1' })
  return { cookie, id: (await act.me(cookie)).id }
}

/** Suspend un membre (Louis), avec un fondement et une explication ; rend la réponse brute. */
const suspend = (
  memberId: string,
  duration: '7d' | '30d' | 'indefinite',
  extra: { password?: string; fromReport?: ReportTarget } = {},
) =>
  decideRaw(louis, {
    action: 'suspend',
    memberId,
    duration,
    ground: 'rules',
    explanation: 'Des messages insultants, plusieurs fois.',
    ...extra,
  })

/** Lève la suspension d'un membre (Louis) : plus tôt que prévu, ou parce qu'elle était une erreur. */
const lift = (memberId: string, cause: 'early' | 'error') =>
  decideRaw(louis, { action: 'lift', memberId, cause, explanation: 'Levée après relecture.' })

/** Retire une cible (Louis), avec ou sans mot de passe ; rend la réponse brute. */
const removeRaw = (target: ReportTarget, password?: string) =>
  decideRaw(louis, {
    action: 'remove',
    target,
    ground: 'rules',
    explanation: 'Publicité déguisée.',
    ...(password !== undefined && { password }),
  })

/** `n` commentaires de Léa, chacun signalé par Max (au plus 20 par jour). */
const reportedComments = async (n: number) => {
  const targets: ReportTarget[] = []
  for (let i = 1; i <= n; i++) {
    const comment = await act.comment(meteo.id, lea, `Commentaire ${i}`)
    const target: ReportTarget = { kind: 'comment', id: comment.id }
    await report(max, target)
    targets.push(target)
  }
  return targets
}

/** La carte de la file qui porte cette cible. */
const cardOf = async (target: ReportTarget) =>
  (await readQueue()).items.find(
    (item) => item.target.kind === target.kind && item.target.id === target.id,
  )

// Règle « une seule décision à la fois par cible » (plan 7c, Décisions) : retirer et classer
// exigent un signalement ouvert. PGlite n'a qu'une connexion : la course vraie (deux onglets au
// même instant) ne se rejoue pas ici ; on vérifie la seconde décision, dans les deux ordres.
describe('one decision at a time on a target', () => {
  it('refuses to remove what was just dismissed, and to dismiss what was just removed', async () => {
    await report(max, projectTarget())
    later()
    await act.decide(louis, { action: 'dismiss', target: projectTarget() })

    await expectError(await removeRaw(projectTarget()), 409, 'already_decided')
    // Le projet reste affiché : jamais un contenu retiré avec des signalements classés.
    expect((await readProject(meteo.id, zoe)).removal).toBeNull()
    expect((await reportsInBase()).map((r) => r.status)).toEqual(['dismissed'])

    const note = await postNote(meteo.id, lea, 'Une note publicitaire')
    await report(max, { kind: 'note', id: note.id })
    await remove({ kind: 'note', id: note.id })
    await expectError(
      await decideRaw(louis, { action: 'dismiss', target: { kind: 'note', id: note.id } }),
      409,
      'already_decided',
    )
    expect((await decisionsInBase()).map((d) => d.action)).toEqual(['dismiss', 'remove'])
  })
})

// Garde-fou : au plus 50 décisions par administrateur et par jour (MODERATION_DECISIONS_PER_DAY).
describe('the limit of decisions', () => {
  it('answers 50 decisions a day, counting malformed ones, then asks to wait', async () => {
    await report(max, projectTarget())
    // 50 demandes mal formées : chacune compte, le compteur passe avant la lecture du corps.
    for (let i = 1; i <= MODERATION_DECISIONS_PER_DAY; i++) {
      await expectError(await decideRaw(louis, { action: 'explode' }), 400, 'validation')
    }

    const res = await decideRaw(louis, { action: 'dismiss', target: projectTarget() })
    await expectError(res, 429, 'rate_limited')
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await decisionsInBase()).toEqual([])
    expect((await reportsInBase()).map((r) => r.status)).toEqual(['open'])

    // Chaque administrateur a son compteur ; un jour plus tard, Louis décide de nouveau.
    await act.makeAdmin(zoeId)
    await report(max, { kind: 'member', id: leaId })
    expect(
      (await decideRaw(zoe, { action: 'dismiss', target: { kind: 'member', id: leaId } })).status,
    ).toBe(201)
    later(DAY)
    expect((await decideRaw(louis, { action: 'dismiss', target: projectTarget() })).status).toBe(
      201,
    )
  })

  // S5 : le compteur passe APRÈS la garde. Sinon un membre saurait, à la 51e réponse (429 au lieu
  // de 404), qu'une route de modération existe.
  it('counts nothing for who is not an administrator: 60 times the same 404', async () => {
    const body = { action: 'dismiss', target: projectTarget() }
    for (let i = 1; i <= MODERATION_DECISIONS_PER_DAY + 10; i++) {
      const res = await decideRaw(max, body)
      await expectSame(res, await act.send('POST', '/v1/inexistant', max, body), `request ${i}`)
    }

    // Devenu administrateur, Max décide aussitôt : rien n'a été compté pendant qu'il ne l'était pas.
    await act.makeAdmin(maxId)
    await report(zoe, projectTarget())
    expect((await decideRaw(max, body)).status).toBe(201)
  })
})

// Garde-fou : le mot de passe redemandé au 11e retrait de l'heure (REMOVALS_BEFORE_PASSWORD), à la
// 4e suspension de 7 ou 30 jours du jour (SUSPENSIONS_BEFORE_PASSWORD, S11), et toujours pour une
// suspension sans fin. Absent : 403 `password_required` ; faux : 403 `wrong_password` ; dans les
// deux cas, rien n'est écrit.
describe('the password asked again', () => {
  it('is asked at the 11th removal of the hour: absent, wrong, then right', async () => {
    const targets = await reportedComments(REMOVALS_BEFORE_PASSWORD + 1)
    for (const target of targets.slice(0, REMOVALS_BEFORE_PASSWORD)) {
      expect((await removeRaw(target)).status).toBe(201)
    }
    const eleventh = targets[REMOVALS_BEFORE_PASSWORD] as ReportTarget

    await expectError(await removeRaw(eleventh), 403, 'password_required')
    await expectError(await removeRaw(eleventh, 'not-the-password'), 403, 'wrong_password')
    expect(await decisionsInBase()).toHaveLength(REMOVALS_BEFORE_PASSWORD)
    expect((await reportsInBase()).filter((r) => r.status === 'open')).toHaveLength(1)

    expect((await removeRaw(eleventh, LOUIS_PASSWORD)).status).toBe(201)
    expect(await decisionsInBase()).toHaveLength(REMOVALS_BEFORE_PASSWORD + 1)
  })

  it('is not asked again once the hour has passed', async () => {
    const targets = await reportedComments(REMOVALS_BEFORE_PASSWORD + 1)
    for (const target of targets.slice(0, REMOVALS_BEFORE_PASSWORD)) {
      expect((await removeRaw(target)).status).toBe(201)
    }

    later(HOUR)
    expect((await removeRaw(targets[REMOVALS_BEFORE_PASSWORD] as ReportTarget)).status).toBe(201)
  })

  it('is not asked to classify: dismissing never needs it', async () => {
    const targets = await reportedComments(REMOVALS_BEFORE_PASSWORD + 1)
    for (const target of targets.slice(0, REMOVALS_BEFORE_PASSWORD)) {
      expect((await removeRaw(target)).status).toBe(201)
    }
    // Témoin : un retrait de plus le demande.
    const last = targets[REMOVALS_BEFORE_PASSWORD] as ReportTarget
    await expectError(await removeRaw(last), 403, 'password_required')

    expect((await decideRaw(louis, { action: 'dismiss', target: last })).status).toBe(201)
  })

  it('is asked at the 4th suspension of 7 or 30 days in the day', async () => {
    const karim = await newMember('Karim', 'karim@example.com')
    const durations = ['7d', '30d', '7d'] as const
    const firstThree = [leaId, maxId, zoeId]
    expect(firstThree).toHaveLength(SUSPENSIONS_BEFORE_PASSWORD)
    for (const [i, memberId] of firstThree.entries()) {
      expect((await suspend(memberId, durations[i] ?? '7d')).status, memberId).toBe(201)
    }

    await expectError(await suspend(karim.id, '30d'), 403, 'password_required')
    await expectError(
      await suspend(karim.id, '30d', { password: 'not-the-password' }),
      403,
      'wrong_password',
    )
    expect(await decisionsInBase()).toHaveLength(SUSPENSIONS_BEFORE_PASSWORD)

    expect((await suspend(karim.id, '30d', { password: LOUIS_PASSWORD })).status).toBe(201)
    expect((await act.me(karim.cookie)).suspension).not.toBeNull()
  })

  it('is always asked for a suspension without end, even the first of the day', async () => {
    await expectError(await suspend(leaId, 'indefinite'), 403, 'password_required')
    await expectError(
      await suspend(leaId, 'indefinite', { password: 'not-the-password' }),
      403,
      'wrong_password',
    )
    expect(await decisionsInBase()).toEqual([])
    expect((await act.me(lea)).suspension).toBeNull()

    expect((await suspend(leaId, 'indefinite', { password: LOUIS_PASSWORD })).status).toBe(201)
    expect((await act.me(lea)).suspension).toMatchObject({ endsAt: null })
  })

  // S12 : au plus 5 mots de passe faux par jour ; ensuite 429, même avec le bon, et rien d'écrit.
  // Sans ce plafond, un compte d'administrateur volé (sa session) pourrait deviner le mot de passe.
  it('answers 429 after 5 wrong passwords in the day, even to the right one', async () => {
    for (let i = 1; i <= MODERATION_PASSWORD_FAILURES_PER_DAY; i++) {
      await expectError(
        await suspend(leaId, 'indefinite', { password: `wrong-${i}` }),
        403,
        'wrong_password',
      )
    }

    await expectError(
      await suspend(leaId, 'indefinite', { password: LOUIS_PASSWORD }),
      429,
      'rate_limited',
    )
    expect(await decisionsInBase()).toEqual([])
    expect((await act.me(lea)).suspension).toBeNull()

    // Un jour plus tard, le bon mot de passe passe de nouveau (la session de 7 jours dure encore).
    later(DAY)
    expect((await suspend(leaId, 'indefinite', { password: LOUIS_PASSWORD })).status).toBe(201)
  })

  // Relecture de sécurité de la branche (7c) : le premier refus du jour laisse une ligne dans les
  // journaux, une seule, sans identifiant ni corps (un compte volé peut-être, à aller voir).
  it('logs the first refusal of the day once, with no identifier and no password', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (let i = 1; i <= MODERATION_PASSWORD_FAILURES_PER_DAY; i++) {
        await suspend(leaId, 'indefinite', { password: `wrong-${i}` })
      }
      expect(warn).not.toHaveBeenCalled()

      for (let i = 0; i < 3; i++) await suspend(leaId, 'indefinite', { password: LOUIS_PASSWORD })

      expect(warn.mock.calls).toEqual([['Moderation password: daily failures reached']])
    } finally {
      warn.mockRestore()
    }
  })

  // S12 : un compte sans mot de passe (connexion par un autre moyen) ne peut pas confirmer.
  it('refuses as a wrong password the confirmation of an account without a password', async () => {
    await ctx.db
      .delete(schema.account)
      .where(and(eq(schema.account.userId, louisId), eq(schema.account.providerId, 'credential')))

    await expectError(
      await suspend(leaId, 'indefinite', { password: LOUIS_PASSWORD }),
      403,
      'wrong_password',
    )
    expect(await decisionsInBase()).toEqual([])
  })
})

// Le rappel sur chaque carte de la file (plan 7c, File et copies ; J10) : ce que la modération a
// déjà décidé pour le membre visé, sur l'année gardée. Ne comptent ni les retraits rétablis, ni
// les suspensions levées pour erreur.
describe('the record of the author on a card', () => {
  it('counts the removals and suspensions, but neither a restored removal nor a lift for error', async () => {
    const [first, second, third] = await reportedComments(3)
    await removeRaw(first as ReportTarget)
    await removeRaw(second as ReportTarget)
    later()
    await act.decide(louis, { action: 'restore', target: second as ReportTarget })
    // Une suspension levée pour erreur ne compte pas ; une levée plus tôt que prévu, si.
    expect((await suspend(leaId, '7d')).status).toBe(201)
    expect((await lift(leaId, 'error')).status).toBe(201)
    expect((await suspend(leaId, '7d')).status).toBe(201)
    expect((await lift(leaId, 'early')).status).toBe(201)

    expect((await cardOf(third as ReportTarget))?.authorRecord).toEqual({
      memberId: leaId,
      removals: 1,
      suspensions: 1,
      suspendedNow: false,
      canSuspend: true,
    })

    // Suspendue de nouveau : elle l'est en ce moment, et ne peut pas l'être deux fois.
    expect((await suspend(leaId, '30d', { password: LOUIS_PASSWORD })).status).toBe(201)
    expect((await cardOf(third as ReportTarget))?.authorRecord).toEqual({
      memberId: leaId,
      removals: 1,
      suspensions: 2,
      suspendedNow: true,
      canSuspend: false,
    })
  })

  it('cannot suspend oneself, nor an administrator in office', async () => {
    const zoeComment = await act.comment(meteo.id, zoe, 'Le commentaire de Zoé')
    await report(max, { kind: 'member', id: louisId })
    await report(max, { kind: 'comment', id: zoeComment.id })
    await report(max, projectTarget())
    await act.makeAdmin(zoeId)

    expect((await cardOf({ kind: 'member', id: louisId }))?.authorRecord).toMatchObject({
      memberId: louisId,
      canSuspend: false,
    })
    expect((await cardOf({ kind: 'comment', id: zoeComment.id }))?.authorRecord).toMatchObject({
      memberId: zoeId,
      canSuspend: false,
    })
    // Témoin : Léa, simple membre, peut l'être.
    expect((await cardOf(projectTarget()))?.authorRecord).toMatchObject({
      memberId: leaId,
      canSuspend: true,
    })
  })

  it('forgets a removal older than a year', async () => {
    const [old, recent] = await reportedComments(2)
    await removeRaw(old as ReportTarget)
    expect((await cardOf(recent as ReportTarget))?.authorRecord?.removals).toBe(1) // témoin

    // 366 jours plus tard (les sessions durent 7 jours : on se reconnecte).
    later(366 * DAY)
    louis = await act.signInAgain({ email: 'louis@example.com', password: LOUIS_PASSWORD })

    expect((await cardOf(recent as ReportTarget))?.authorRecord?.removals).toBe(0)
  })
})

// Plan 7c (File et copies) : chaque groupe de la file se retrouve par sa cible, plus par sa
// position. Une ligne invalide en base (posée à la main, ou par une version ancienne) est écartée
// sans décaler les nombres ni les dates des cartes voisines, et la file répond toujours.
describe('a broken row in the queue', () => {
  it('leaves out a report with an invalid target, and counts the others right', async () => {
    const note = await postNote(meteo.id, lea, 'Une note signalée')
    await report(max, projectTarget())
    const first = nowIso()
    // Deux lignes invalides, entre deux signalements valides : un identifiant qui n'est pas un
    // uuid, et une sorte de cible inconnue.
    later()
    for (const [targetKind, targetId] of [
      ['project', 'not-a-uuid'],
      ['planet', meteo.id],
    ] as const) {
      await ctx.db.insert(schema.contentReport).values({
        id: randomUUID(),
        reporterId: zoeId,
        targetKind,
        targetId,
        projectId: null,
        targetAuthorId: leaId,
        reason: 'other',
        details: 'Une ligne invalide',
        snapshot: [{ field: 'title', value: 'Invalide' }],
        status: 'open',
        createdAt: new Date(Date.now()),
      })
    }
    await report(zoe, projectTarget())
    const last = nowIso()
    await report(zoe, { kind: 'note', id: note.id })
    const noteAt = nowIso()

    const page = await readQueue()

    expect(page.items.map((item) => item.target)).toEqual([
      projectTarget(),
      { kind: 'note', id: note.id },
    ])
    expect(page.items[0]).toMatchObject({
      count: 2,
      firstReportedAt: first,
      lastReportedAt: last,
      details: [],
    })
    expect(page.items[1]).toMatchObject({
      count: 1,
      firstReportedAt: noteAt,
      lastReportedAt: noteAt,
    })
  })
})
