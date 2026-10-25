// Tests d'intégration de la tranche 7a : signaler un contenu (POST /v1/reports). Scénario :
// docs/scenarios/phase-1.md, « Tranche 7a — Signaler » ; règles 5 à 8 de la relecture du plan
// (22/10/2026). Trois membres : Léa (l'autrice du projet « Météo », de ses notes et d'un
// commentaire), Max (qui signale) et Zoé (une autre, qui signale aussi). Ce que l'administrateur
// fait des signalements est testé dans moderation.test.ts.
//
// Ce que la route promet :
// - un membre connecté signale un contenu qu'il voit, jamais le sien, une fois par contenu ;
// - un contenu inconnu, privé, retiré, masqué ou supprimé reçoit la même réponse 404, mot pour
//   mot : on ne peut pas sonder l'existence d'un contenu en le signalant ;
// - le texte visé est copié depuis la base au moment du signalement, jamais pris du client ;
// - 20 signalements par jour au plus, compteur consulté avant même de lire le corps.
//
// Le temps est maîtrisé par le test (fausse horloge, voir comments.test.ts).
import {
  CreatedReport,
  ErrorResponse,
  NotificationPage,
  ProjectNote,
  REPORTS_PER_DAY,
  ReportSnapshot,
  ReportTargetPreview,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let leaId: string
let maxId: string
let meteo: { id: string } // le projet public de Léa

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')

const leaAccount = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember(leaAccount)
  max = await ctx.verifiedMember(maxAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  leaId = (await act.me(lea)).id
  maxId = (await act.me(max)).id
  meteo = await act.publish(lea, 'Météo', { pitch: 'La pluie de demain, quartier par quartier.' })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Un identifiant bien formé, qui ne désigne rien. */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Demande un signalement ; rend la réponse brute. */
const postReport = (cookie: string | null, body: unknown) => {
  later()
  return act.send('POST', '/v1/reports', cookie, body)
}

const target = (kind: string, id: string) => ({ target: { kind, id }, reason: 'other' })

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Deux réponses 404 identiques, mot pour mot : rien ne distingue l'une de l'autre. */
const expectSameNotFound = async (res: Response, reference: Response) => {
  expect(res.status).toBe(404)
  expect(reference.status).toBe(404)
  expect(await res.json()).toEqual(await reference.json())
}

/** La réponse de référence : un projet qui n'existe pas. */
const unknownProject = () => postReport(max, target('project', UNKNOWN))

const postNote = async (projectId: string, cookie: string, body: string) => {
  later()
  const res = await act.send('POST', `/v1/projects/${projectId}/notes`, cookie, { body })
  expect(res.status).toBe(201)
  return ProjectNote.parse(await res.json())
}

/** Les signalements gardés en base, du plus ancien au plus récent. */
const storedReports = () =>
  ctx.db.select().from(schema.contentReport).orderBy(schema.contentReport.createdAt)

describe('reporting a content', () => {
  it('asks to sign in without a session', async () => {
    await expectError(await postReport(null, target('project', meteo.id)), 401, 'unauthorized')
    // Témoin : la même demande, avec la session de Max, est acceptée (la route existe).
    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)
  })

  it('records the report of a project, with who reported, the author and the reason', async () => {
    const res = await postReport(max, {
      target: { kind: 'project', id: meteo.id },
      reason: 'scam_spam',
      details: 'Le lien de la démo mène à une page de paiement.',
    })

    expect(res.status).toBe(201)
    const { id } = CreatedReport.parse(await res.json())
    expect(await storedReports()).toEqual([
      expect.objectContaining({
        id,
        reporterId: maxId,
        targetKind: 'project',
        targetId: meteo.id,
        projectId: meteo.id,
        targetAuthorId: leaId,
        reason: 'scam_spam',
        details: 'Le lien de la démo mène à une page de paiement.',
        status: 'open',
        createdAt: new Date(Date.now()),
        decidedAt: null,
        decisionId: null,
      }),
    ])
  })

  it('answers with the id of the report, and nothing else', async () => {
    const res = await postReport(max, target('project', meteo.id))

    expect(Object.keys((await res.json()) as object)).toEqual(['id'])
  })

  it('reports a note, a comment, a reply and a profile, each with its project and author', async () => {
    const note = await postNote(meteo.id, lea, 'v2 : mode hors ligne.')
    const root = await act.comment(meteo.id, zoe, 'Un commentaire de Zoé')
    later()
    const reply = await act.comment(meteo.id, lea, 'La réponse de Léa', root.id)

    for (const [kind, id] of [
      ['note', note.id],
      ['comment', root.id],
      ['comment', reply.id],
      ['member', leaId],
    ] as const) {
      expect((await postReport(max, target(kind, id))).status, `${kind} ${id}`).toBe(201)
    }

    const rows = await storedReports()
    expect(rows.map((r) => [r.targetKind, r.targetId, r.projectId, r.targetAuthorId])).toEqual([
      ['note', note.id, meteo.id, leaId],
      ['comment', root.id, meteo.id, (await act.me(zoe)).id],
      ['comment', reply.id, meteo.id, leaId],
      // Un profil n'a pas de projet : pas de lien « Voir » vers un projet.
      ['member', leaId, null, leaId],
    ])
  })

  it('refuses an illegal content without an explanation', async () => {
    // Plan, règle 36 (article 16 du DSA) : une explication pour un contenu dit illégal.
    for (const details of [undefined, '', '   ']) {
      await expectError(
        await postReport(max, {
          target: { kind: 'project', id: meteo.id },
          reason: 'illegal',
          ...(details !== undefined && { details }),
        }),
        400,
        'validation',
      )
    }
    expect(await storedReports()).toHaveLength(0)
  })

  it('accepts each of the seven reasons', async () => {
    const reasons = [
      'illegal',
      'harassment',
      'sexual_violent',
      'scam_spam',
      'impersonation',
      'privacy',
      'other',
    ]
    for (const reason of reasons) {
      const project = await act.publish(lea, `Projet ${reason}`)
      // Un contenu illégal demande une précision (plan, règle 36).
      const res = await postReport(max, {
        target: { kind: 'project', id: project.id },
        reason,
        ...(reason === 'illegal' && { details: 'Il publie une adresse privée.' }),
      })
      expect(res.status, reason).toBe(201)
    }
    await expectError(
      await postReport(max, { target: { kind: 'project', id: meteo.id }, reason: 'boring' }),
      400,
      'validation',
    )
  })

  it('leaves the content visible to everyone, and does not tell its author', async () => {
    await act.openNotifications(lea)
    const before = NotificationPage.parse(
      await (await act.send('GET', '/v1/notifications', lea)).json(),
    )

    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)

    // Le projet reste affiché pour tous tant que rien n'est décidé.
    expect((await act.send('GET', `/v1/projects/${meteo.id}`, zoe)).status).toBe(200)
    const discover = await (await act.send('GET', '/v1/feed/discover', zoe)).text()
    expect(discover).toContain(meteo.id)
    // Léa n'est pas prévenue : ses notifications n'ont pas bougé, et rien n'y nomme Max.
    const after = await act.send('GET', '/v1/notifications', lea)
    const text = await after.text()
    expect(JSON.parse(text).items).toEqual(before.items)
    expect(text).not.toContain(maxId)
  })
})

// Règle 7 : le texte visé est lu en base au moment du signalement.
describe('the copy of the reported text', () => {
  const snapshotOf = async (id: string) => {
    const [row] = await ctx.db
      .select({ snapshot: schema.contentReport.snapshot })
      .from(schema.contentReport)
      .where(eq(schema.contentReport.id, id))
    // Tranche 7b : la copie est un tableau de champs ; ces tests lisent tous ses textes ensemble.
    return ReportSnapshot.parse(row?.snapshot)
      .map((entry) => entry.value)
      .join('\n')
  }
  const report = async (kind: string, id: string) => {
    const res = await postReport(max, target(kind, id))
    expect(res.status).toBe(201)
    return CreatedReport.parse(await res.json()).id
  }

  it('copies the title and pitch of a project', async () => {
    const snapshot = await snapshotOf(await report('project', meteo.id))

    expect(snapshot).toContain('Météo')
    expect(snapshot).toContain('La pluie de demain, quartier par quartier.')
  })

  it('copies the text of a note and of a comment', async () => {
    const note = await postNote(meteo.id, lea, 'Une note très particulière')
    const comment = await act.comment(meteo.id, zoe, 'Un commentaire très particulier')

    expect(await snapshotOf(await report('note', note.id))).toContain('Une note très particulière')
    expect(await snapshotOf(await report('comment', comment.id))).toContain(
      'Un commentaire très particulier',
    )
  })

  it('copies the name, handle and bio of a profile', async () => {
    await act.updateProfile(lea, { bio: 'Je fabrique des agents météo.' })
    const { handle } = await act.me(lea)

    const snapshot = await snapshotOf(await report('member', leaId))

    expect(snapshot).toContain('Léa')
    expect(snapshot).toContain(handle)
    expect(snapshot).toContain('Je fabrique des agents météo.')
  })

  it('keeps the text as it was, even after the author edits it', async () => {
    const comment = await act.comment(meteo.id, zoe, 'Le texte au moment du signalement')
    const id = await report('comment', comment.id)
    later()
    const edit = await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${comment.id}`, zoe, {
      body: 'Un texte tout gentil',
    })
    expect(edit.status).toBe(200)

    expect(await snapshotOf(id)).toContain('Le texte au moment du signalement')
    expect(await snapshotOf(id)).not.toContain('tout gentil')
  })

  it('never takes the text from the request', async () => {
    const res = await postReport(max, {
      ...target('project', meteo.id),
      snapshot: 'Un texte inventé par le client',
    })
    expect(res.status).toBe(201)

    const snapshot = await snapshotOf(CreatedReport.parse(await res.json()).id)
    expect(snapshot).not.toContain('inventé')
    expect(snapshot).toContain('Météo')
  })
})

describe('the details of a report', () => {
  it('keeps 500 characters at most, and refuses more', async () => {
    const ok = await postReport(max, { ...target('project', meteo.id), details: 'a'.repeat(500) })
    expect(ok.status).toBe(201)
    const other = await act.publish(lea, 'Vélo')
    await expectError(
      await postReport(max, { ...target('project', other.id), details: 'a'.repeat(501) }),
      400,
      'validation',
    )
  })

  it('counts empty details as none', async () => {
    expect(
      (await postReport(max, { ...target('project', meteo.id), details: '   \n ' })).status,
    ).toBe(201)

    const [row] = await storedReports()
    expect(row?.details).toBeNull()
  })
})

// Règle 6 : l'identifiant est validé selon la sorte, avant toute requête en base.
describe('a malformed target', () => {
  it('answers 400, never 500, for an id that does not fit its kind', async () => {
    for (const body of [
      target('project', 'pas-un-uuid'),
      target('note', '42'),
      target('comment', leaId),
      target('member', '../admin'),
      target('member', ''),
      target('reaction', meteo.id),
      { reason: 'other' },
      { target: { kind: 'project', id: meteo.id } },
    ]) {
      await expectError(await postReport(max, body), 400, 'validation')
    }
    expect(await storedReports()).toEqual([])
  })
})

// Règle 5 : une seule réponse 404 pour un contenu inconnu, privé, retiré, masqué ou supprimé.
describe('a content the member cannot see', () => {
  it('answers the same 404 for an unknown project and a private one', async () => {
    const draft = await act.publish(lea, 'Brouillon', { visibility: 'private' })

    await expectSameNotFound(
      await postReport(max, target('project', draft.id)),
      await unknownProject(),
    )
    // Témoin : le projet public de Léa, lui, se signale (la route existe).
    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)
  })

  it('answers the same 404 for a project removed by the moderation', async () => {
    const velo = await act.publish(lea, 'Vélo')
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, meteo.id))

    await expectSameNotFound(
      await postReport(max, target('project', meteo.id)),
      await unknownProject(),
    )
    // Témoin : un autre projet de Léa, pas retiré, se signale.
    expect((await postReport(max, target('project', velo.id))).status).toBe(201)
  })

  it('answers the same 404 for an unknown note, a note of a private project and a removed note', async () => {
    const draft = await act.publish(lea, 'Brouillon', { visibility: 'private' })
    const secret = await postNote(draft.id, lea, 'Une idée encore secrète')
    const removed = await postNote(meteo.id, lea, 'Une note retirée')
    await ctx.db
      .update(schema.projectNote)
      .set({ removedAt: new Date() })
      .where(eq(schema.projectNote.id, removed.id))

    for (const id of [UNKNOWN, secret.id, removed.id]) {
      await expectSameNotFound(await postReport(max, target('note', id)), await unknownProject())
    }
    // Témoin : une note visible se signale.
    const visible = await postNote(meteo.id, lea, 'Une note visible')
    expect((await postReport(max, target('note', visible.id))).status).toBe(201)
  })

  it('answers the same 404 for a comment unknown, hidden, deleted, removed or on a private project', async () => {
    const hidden = await act.comment(meteo.id, zoe, 'Un commentaire masqué par Léa')
    await act.hide(meteo.id, hidden.id, lea)
    const deleted = await act.comment(meteo.id, zoe, 'Un commentaire supprimé')
    await act.deleteComment(meteo.id, deleted.id, zoe)
    const removed = await act.comment(meteo.id, zoe, 'Un commentaire retiré')
    await ctx.db
      .update(schema.projectComment)
      .set({ removedAt: new Date() })
      .where(eq(schema.projectComment.id, removed.id))
    const draft = await act.publish(lea, 'Bientôt privé')
    const onDraft = await act.comment(draft.id, zoe, 'Sur un projet devenu privé')
    await act.setVisibility(draft.id, lea, 'private')

    for (const id of [UNKNOWN, hidden.id, deleted.id, removed.id, onDraft.id]) {
      await expectSameNotFound(await postReport(max, target('comment', id)), await unknownProject())
    }
    // Témoin : un commentaire visible se signale.
    const visible = await act.comment(meteo.id, zoe, 'Un commentaire visible')
    expect((await postReport(max, target('comment', visible.id))).status).toBe(201)
  })

  it('answers the same 404 for an unknown member and a deleted account', async () => {
    await act.deleteAccount(zoe, 'zoe-long-pw-1')
    const zoeRow = await ctx.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'zoe@example.com'))
    expect(zoeRow).toEqual([])

    await expectSameNotFound(
      await postReport(max, target('member', 'no-such-member')),
      await unknownProject(),
    )
    // Témoin : le profil de Léa se signale.
    expect((await postReport(max, target('member', leaId))).status).toBe(201)
  })

  // Relecture de sécurité de 4966555 (C3) : un compte dont l'adresse n'a jamais été vérifiée n'est
  // pas un membre (il n'a ni pseudo ni profil visible). Le signaler, ou lire son aperçu, doit
  // répondre la même 404 qu'un membre inconnu : sinon la route dirait qu'une inscription existe.
  it('answers the same 404 for a member whose email was never verified', async () => {
    await ctx.signUp({ name: 'Tom', email: 'tom@example.com', password: 'tom-long-password' })
    const [tom] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'tom@example.com'))
    if (!tom) throw new Error('Tom should exist, unverified')

    await expectSameNotFound(
      await postReport(max, target('member', tom.id)),
      await postReport(max, target('member', 'no-such-member')),
    )
    const previewOf = (id: string) =>
      act.send('GET', `/v1/reports/target?${new URLSearchParams({ kind: 'member', id })}`, max)
    await expectSameNotFound(await previewOf(tom.id), await previewOf('no-such-member'))
    expect(await storedReports()).toEqual([])
    // Témoin : le profil de Léa, vérifié, se lit et se signale.
    expect((await previewOf(leaId)).status).toBe(200)
    expect((await postReport(max, target('member', leaId))).status).toBe(201)
  })

  // Règle 5 : la visibilité passe avant « déjà signalé ».
  it('answers 404, not 409, for a content reported and then made private', async () => {
    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)
    await act.setVisibility(meteo.id, lea, 'private')

    await expectSameNotFound(
      await postReport(max, target('project', meteo.id)),
      await unknownProject(),
    )
  })
})

describe('reporting what one cannot report', () => {
  it('refuses to report her own project, note, comment or profile', async () => {
    const note = await postNote(meteo.id, lea, 'Ma note')
    const comment = await act.comment(meteo.id, lea, 'Mon commentaire')

    for (const [kind, id] of [
      ['project', meteo.id],
      ['note', note.id],
      ['comment', comment.id],
      ['member', leaId],
    ] as const) {
      await expectError(await postReport(lea, target(kind, id)), 422, 'own_content')
    }
    expect(await storedReports()).toEqual([])
  })

  it('refuses to report the same content twice, but lets another member report it', async () => {
    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)

    await expectError(
      await postReport(max, { target: { kind: 'project', id: meteo.id }, reason: 'other' }),
      409,
      'already_reported',
    )
    expect((await postReport(zoe, target('project', meteo.id))).status).toBe(201)
    expect(await storedReports()).toHaveLength(2)
  })
})

describe('the limit of reports', () => {
  it('answers 20 reports a day, counting malformed ones, then asks to wait', async () => {
    // 19 vrais signalements, chacun sur un commentaire différent de Léa.
    for (let i = 1; i < REPORTS_PER_DAY; i++) {
      const comment = await act.comment(meteo.id, lea, `Commentaire ${i}`)
      expect((await postReport(max, target('comment', comment.id))).status, String(i)).toBe(201)
    }
    // Le 20e, mal formé, compte aussi : le compteur passe avant la validation.
    await expectError(await postReport(max, target('project', 'x')), 400, 'validation')

    await expectError(await postReport(max, target('project', meteo.id)), 429, 'rate_limited')
    // Au-delà du plafond, même un corps illisible reçoit 429 : le corps n'est pas lu.
    const garbage = await ctx.request('/v1/reports', {
      method: 'POST',
      headers: { cookie: max, 'content-type': 'application/json' },
      body: '{ pas du JSON',
    })
    await expectError(garbage, 429, 'rate_limited')
    // Chaque membre a son compteur ; un jour plus tard, Max signale de nouveau.
    expect((await postReport(zoe, target('project', meteo.id))).status).toBe(201)
    later(DAY)
    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)
  })
})

// Règle 26 : la page « Signaler » lit sa cible par GET /v1/reports/target, avec la même règle de
// visibilité que le signalement lui-même. Un lien fabriqué ne fait donc ni lire, ni signaler,
// autre chose que ce que le membre voit.
describe('the preview of the target', () => {
  const previewPath = (kind: string, id: string) =>
    `/v1/reports/target?${new URLSearchParams({ kind, id })}`
  const preview = (cookie: string | null, kind: string, id: string) =>
    act.send('GET', previewPath(kind, id), cookie)
  const readPreview = async (cookie: string, kind: string, id: string) => {
    const res = await preview(cookie, kind, id)
    expect(res.status, `${kind} ${id}`).toBe(200)
    return ReportTargetPreview.parse(await res.json())
  }
  const unknownPreview = () => preview(max, 'project', UNKNOWN)

  it('gives the current text and the project of each kind of target', async () => {
    const note = await postNote(meteo.id, lea, 'Une note à lire')
    const comment = await act.comment(meteo.id, lea, 'Un commentaire à lire')
    const { handle } = await act.me(lea)
    const author = { id: leaId, name: 'Léa', handle, isBlocked: false }

    expect(await readPreview(max, 'project', meteo.id)).toEqual({
      target: { kind: 'project', id: meteo.id },
      text: expect.stringContaining('Météo'),
      projectId: meteo.id,
      author, // tranche 7b : l’autrice de la cible, pour « Bloquer aussi @x »
    })
    expect((await readPreview(max, 'project', meteo.id)).text).toContain(
      'La pluie de demain, quartier par quartier.',
    )
    expect(await readPreview(max, 'note', note.id)).toEqual({
      target: { kind: 'note', id: note.id },
      text: 'Une note à lire',
      projectId: meteo.id,
      author,
    })
    expect(await readPreview(max, 'comment', comment.id)).toEqual({
      target: { kind: 'comment', id: comment.id },
      text: 'Un commentaire à lire',
      projectId: meteo.id,
      author,
    })
    const member = await readPreview(max, 'member', leaId)
    expect(member).toMatchObject({ target: { kind: 'member', id: leaId }, projectId: null, author })
    expect(member.text).toContain('Léa')
    expect(member.text).toContain(handle)
  })

  it('asks to sign in without a session', async () => {
    await expectError(await preview(null, 'project', meteo.id), 401, 'unauthorized')
    // Témoin : avec la session de Max, la cible se lit.
    expect((await preview(max, 'project', meteo.id)).status).toBe(200)
  })

  it('answers the same 404 as the report for what the member cannot see', async () => {
    const draft = await act.publish(lea, 'Brouillon', { visibility: 'private' })
    const velo = await act.publish(lea, 'Vélo')
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, velo.id))
    const secret = await postNote(draft.id, lea, 'Une idée encore secrète')
    const hidden = await act.comment(meteo.id, zoe, 'Un commentaire masqué par Léa')
    await act.hide(meteo.id, hidden.id, lea)
    const deleted = await act.comment(meteo.id, zoe, 'Un commentaire supprimé')
    await act.deleteComment(meteo.id, deleted.id, zoe)

    for (const [kind, id] of [
      ['project', draft.id],
      ['project', velo.id],
      ['note', UNKNOWN],
      ['note', secret.id],
      ['comment', hidden.id],
      ['comment', deleted.id],
      ['member', 'no-such-member'],
    ] as const) {
      await expectSameNotFound(await preview(max, kind, id), await unknownPreview())
    }
    // Le signalement répond la même chose, mot pour mot.
    await expectSameNotFound(
      await postReport(max, target('project', draft.id)),
      await unknownPreview(),
    )
    // Témoin : le projet public se lit.
    expect((await preview(max, 'project', meteo.id)).status).toBe(200)
  })

  it('answers 400 for an id that does not fit its kind', async () => {
    for (const [kind, id] of [
      ['project', 'pas-un-uuid'],
      ['comment', leaId],
      ['member', '../admin'],
      ['reaction', meteo.id],
    ]) {
      await expectError(await preview(max, kind as string, id as string), 400, 'validation')
    }
    const res = await act.send('GET', '/v1/reports/target', max)
    await expectError(res, 400, 'validation')
  })

  it('refuses her own content, as the report does', async () => {
    const note = await postNote(meteo.id, lea, 'Ma note')

    for (const [kind, id] of [
      ['project', meteo.id],
      ['note', note.id],
      ['member', leaId],
    ] as const) {
      await expectError(await preview(lea, kind, id), 422, 'own_content')
    }
  })
})

// ─── Tranche 7b : copie complète, re-signaler, bloquer ───────────────────────────────────────────

// Scénario « Tranche 7b — Bloquer », « Copie complète au signalement » ; règles 1, 2, 14 et 15 de
// la relecture du plan (24/10/2026).
describe('the full copy of a report', () => {
  const copyOf = async (kind: string, id: string) => {
    const res = await postReport(max, target(kind, id))
    expect(res.status).toBe(201)
    const [row] = await ctx.db
      .select({ snapshot: schema.contentReport.snapshot })
      .from(schema.contentReport)
      .where(eq(schema.contentReport.id, CreatedReport.parse(await res.json()).id))
    return ReportSnapshot.parse(row?.snapshot)
  }

  it('copies every text of a project, one field per entry', async () => {
    const velo = await act.publish(lea, 'Vélo', {
      pitch: 'Un pitch de vélo.',
      description: 'Une description de vélo.',
      prompts: ['Premier prompt', 'Second prompt'],
      tools: ['Mistral', 'Cursor'],
      demoUrl: 'https://velo.dev/',
    })

    const copy = await copyOf('project', velo.id)

    expect(copy).toEqual(
      expect.arrayContaining([
        { field: 'title', value: 'Vélo' },
        { field: 'pitch', value: 'Un pitch de vélo.' },
        { field: 'description', value: 'Une description de vélo.' },
        { field: 'prompt', value: 'Premier prompt' },
        { field: 'prompt', value: 'Second prompt' },
        { field: 'tools', value: 'Mistral, Cursor' },
        { field: 'demoUrl', value: 'https://velo.dev/' },
      ]),
    )
  })

  it('copies every text of a profile, its favorite tools included', async () => {
    await act.updateProfile(lea, { bio: 'Une bio de Léa.', favoriteTools: ['Claude', 'Cursor'] })
    const { handle } = await act.me(lea)

    expect(await copyOf('member', leaId)).toEqual(
      expect.arrayContaining([
        { field: 'name', value: 'Léa' },
        { field: 'handle', value: handle },
        { field: 'bio', value: 'Une bio de Léa.' },
        { field: 'favoriteTools', value: 'Claude, Cursor' },
      ]),
    )
  })

  it('copies the body of a note and of a comment', async () => {
    const note = await postNote(meteo.id, lea, 'Le texte de la note')
    const comment = await act.comment(meteo.id, lea, 'Le texte du commentaire')

    expect(await copyOf('note', note.id)).toEqual([{ field: 'body', value: 'Le texte de la note' }])
    expect(await copyOf('comment', comment.id)).toEqual([
      { field: 'body', value: 'Le texte du commentaire' },
    ])
  })

  // Règle 16 : les copies d'avant 7b, un texte seul, restent lisibles (champ `text`).
  it('reads a copy written before this slice as a single text field', () => {
    expect(ReportSnapshot.parse([{ field: 'text', value: 'Une ancienne copie' }])).toEqual([
      { field: 'text', value: 'Une ancienne copie' },
    ])
  })
})

// Règle 14 (S6, J2) : un nouveau signalement est permis quand le précédent de la même personne est
// clos et que le contenu a changé depuis ; inchangé, un code à part (`already_examined`).
describe('reporting again', () => {
  const dismiss = async (id: string) => {
    later()
    await act.decide(zoe, { action: 'dismiss', target: { kind: 'comment', id } })
  }

  beforeEach(async () => {
    await act.makeAdmin((await act.me(zoe)).id)
  })

  it('refuses while the first report is open', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire')
    expect((await postReport(max, target('comment', comment.id))).status).toBe(201)

    await expectError(await postReport(max, target('comment', comment.id)), 409, 'already_reported')
  })

  it('refuses a content unchanged since the moderation examined it, with its own code', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire')
    expect((await postReport(max, target('comment', comment.id))).status).toBe(201)
    await dismiss(comment.id)

    await expectError(await postReport(max, target('comment', comment.id)), 409, 'already_examined')
    expect(await storedReports()).toHaveLength(1)
  })

  it('accepts a new report of a content changed since', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire')
    expect((await postReport(max, target('comment', comment.id))).status).toBe(201)
    await dismiss(comment.id)
    later()
    const edit = await act.send('PATCH', `/v1/projects/${meteo.id}/comments/${comment.id}`, lea, {
      body: 'Un commentaire devenu méchant',
    })
    expect(edit.status).toBe(200)

    expect((await postReport(max, target('comment', comment.id))).status).toBe(201)
    const rows = await storedReports()
    expect(rows.map((r) => r.status)).toEqual(['dismissed', 'open'])
    expect(ReportSnapshot.parse(rows[1]?.snapshot)).toEqual([
      { field: 'body', value: 'Un commentaire devenu méchant' },
    ])
    // Et une seule fois : le second est ouvert.
    await expectError(await postReport(max, target('comment', comment.id)), 409, 'already_reported')
  })
})

describe('reporting a blocked member', () => {
  const block = async (memberId: string, cookie: string) => {
    later()
    await act.block(memberId, cookie)
  }
  const previewOf = (cookie: string, kind: string, id: string) =>
    act.send('GET', `/v1/reports/target?${new URLSearchParams({ kind, id })}`, cookie)

  it('answers 404 for a content of a member blocked either way, as for an unknown one', async () => {
    const note = await postNote(meteo.id, lea, 'Une note de Léa')
    const zoeProject = await act.publish(zoe, 'Recettes')
    const comment = await act.comment(zoeProject.id, lea, 'Un commentaire de Léa chez Zoé')

    for (const blockNow of [() => block(leaId, max), () => block(maxId, lea)]) {
      await blockNow()
      for (const [kind, id] of [
        ['project', meteo.id],
        ['note', note.id],
        ['comment', comment.id],
      ] as const) {
        await expectSameNotFound(await postReport(max, target(kind, id)), await unknownProject())
        await expectSameNotFound(await previewOf(max, kind, id), await unknownProject())
      }
      await act.unblock(leaId, max)
      await act.unblock(maxId, lea)
    }
    expect(await storedReports()).toEqual([])
  })

  // Précision 2 : qui a bloqué peut encore signaler le profil ; qui est bloqué, non.
  it('lets who blocked report the profile, and answers 404 to who is blocked', async () => {
    await block(leaId, max) // Max bloque Léa

    const preview = await previewOf(max, 'member', leaId)
    expect(preview.status).toBe(200)
    expect(ReportTargetPreview.parse(await preview.json()).author).toMatchObject({
      id: leaId,
      isBlocked: true,
    })
    expect((await postReport(max, target('member', leaId))).status).toBe(201)
    await expectSameNotFound(
      await postReport(lea, target('member', maxId)),
      await postReport(lea, target('member', 'no-such-member')),
    )
  })

  it('says whether I already blocked the author of the target', async () => {
    const comment = await act.comment(meteo.id, zoe, 'Un commentaire de Zoé')
    const { handle } = await act.me(zoe)

    const preview = await previewOf(max, 'comment', comment.id)
    expect(ReportTargetPreview.parse(await preview.json()).author).toEqual({
      id: (await act.me(zoe)).id,
      name: 'Zoé',
      handle,
      isBlocked: false,
    })
  })

  // Règle 2 (B2) : un commentaire qui me mentionne, écrit avant que son auteur me bloque, reste
  // signalable par moi.
  it('lets me report a comment that mentions me, after its author blocked me', async () => {
    const { handle } = await act.me(max)
    const zoeProject = await act.publish(zoe, 'Recettes')
    const comment = await act.comment(zoeProject.id, lea, `Je parle de @${handle} dans son dos`)
    await block(maxId, lea) // Léa bloque Max

    expect((await postReport(max, target('comment', comment.id))).status).toBe(201)
  })

  // Règle 1 (B1) : l'auteur d'un projet signale un commentaire chez lui, quel que soit le blocage.
  it('lets the author of a project report a comment on it, whoever blocked whom', async () => {
    const comment = await act.comment(meteo.id, max, 'Un commentaire de Max chez Léa')
    await block(maxId, lea)

    expect((await postReport(lea, target('comment', comment.id))).status).toBe(201)
  })
})
