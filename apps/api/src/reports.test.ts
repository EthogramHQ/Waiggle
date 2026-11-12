// Tests d'intégration de la tranche 7a : signaler un contenu (POST /v1/reports). Scénario :
// docs/scenarios/phase-1.md, « Tranche 7a — Signaler » ; règles 5 à 8 de la relecture du plan
// (22/10/2026). Trois membres : Léa (l'autrice du projet « Météo », de ses mises à jour et d'un
// commentaire), Max (qui signale) et Zoé (une autre, qui signale aussi). Ce que l'administrateur
// fait des signalements est testé dans moderation.test.ts.
//
// Tranche R7a : la mise à jour d'un projet (`update`) remplace la note du Journal, effacée. On la
// signale comme une note : même règle de visibilité, sa copie porte son titre, sa version, ses
// lignes et ses photos avec leur description (relecture de sécurité A8). La copie d'un projet ne
// garde que ses photos à lui (galerie, portrait), jamais celles des mises à jour ni celles en
// attente. Un ancien signalement de note ne peut plus être fait (B1).
//
// Ce que la route promet :
// - un membre connecté signale un contenu qu'il voit, jamais le sien, une fois par contenu ;
// - un contenu inconnu, privé, retiré, masqué ou supprimé reçoit la même réponse 404, mot pour
//   mot : on ne peut pas sonder l'existence d'un contenu en le signalant ;
// - le texte visé est copié depuis la base au moment du signalement, jamais pris du client ;
// - 20 signalements par jour au plus, compteur consulté avant même de lire le corps.
//
// Tranche R7b : un appel à tester (`call`) et un message d'un fil de testeur (`message`) se signalent
// seulement par qui les voit (fin du fichier).
//
// Le temps est maîtrisé par le test (fausse horloge, voir comments.test.ts).
import { randomUUID } from 'node:crypto'
import {
  CreatedReport,
  ErrorResponse,
  ModerationQueuePage,
  type NewProjectUpdate,
  NotificationPage,
  Project,
  ProjectUpdate,
  ProjectUpdatePage,
  ProjectVisual,
  REPORTS_PER_DAY,
  ReportSnapshot,
  ReportTargetPreview,
  TesterCall,
  TesterMedia,
  TesterMessage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { jpegImage, visualForm } from './testing/images'

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

/**
 * Publie une mise à jour (POST /v1/projects/{id}/updates) et la rend. Le corps est toujours
 * complet, comme l'envoie l'appli : titre et version (null quand l'auteur les laisse vides), une à
 * cinq lignes, les photos déjà envoyées « en attente », et l'avant / après.
 */
const postUpdate = async (
  projectId: string,
  cookie: string,
  changes: Partial<NewProjectUpdate> = {},
) => {
  later()
  const body: NewProjectUpdate = {
    title: null,
    version: null,
    lines: [{ family: 'new', text: 'Un mode hors ligne' }],
    photos: [],
    beforeAfter: false,
    ...changes,
  }
  const res = await act.send('POST', `/v1/projects/${projectId}/updates`, cookie, body)
  expect(res.status).toBe(201)
  return ProjectUpdate.parse(await res.json())
}

/** Une mise à jour dont la seule ligne est ce texte (pour la reconnaître dans une copie). */
const postLine = (projectId: string, cookie: string, text: string) =>
  postUpdate(projectId, cookie, { lines: [{ family: 'new', text }] })

/** La clé de stockage d'une photo, lue en base (la réponse ne la donne jamais telle quelle). */
const storageKeyOf = async (photoId: string) => {
  const [row] = await ctx.db
    .select({ key: schema.projectMedia.storageKey })
    .from(schema.projectMedia)
    .where(eq(schema.projectMedia.id, photoId))
  if (!row) throw new Error(`no photo ${photoId}`)
  return row.key
}

/**
 * Envoie une photo « en attente » pour la prochaine mise à jour de ce projet (`slot=update`) : la
 * route répond par la photo elle-même (ProjectVisual). Rend son identifiant et sa clé de stockage.
 */
const pendingPhoto = async (projectId: string, cookie: string, color = '#d9a441') => {
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(800, 600, color), 'update'),
  })
  expect(res.status).toBe(201)
  const { id } = ProjectVisual.parse(await res.json())
  return { id, key: await storageKeyOf(id) }
}

/** Ajoute une photo à la galerie du projet ; rend sa clé de stockage. */
const galleryPhoto = async (projectId: string, cookie: string) => {
  later()
  const res = await ctx.request(`/v1/projects/${projectId}/visuals`, {
    method: 'POST',
    headers: { cookie },
    body: visualForm(await jpegImage(1200, 800, '#3b7a9e'), 'gallery'),
  })
  expect(res.status).toBe(201)
  const visual = Project.parse(await res.json()).visuals.at(-1)
  if (!visual) throw new Error('no gallery photo')
  return storageKeyOf(visual.id)
}

/** Retire une mise à jour en base, comme la modération (removed_at posé). */
const removeInBase = (updateId: string) =>
  ctx.db
    .update(schema.projectUpdate)
    .set({ removedAt: new Date() })
    .where(eq(schema.projectUpdate.id, updateId))

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

  it('reports an update, a comment, a reply and a profile, each with its project and author', async () => {
    const update = await postUpdate(meteo.id, lea, {
      title: 'Le mode hors ligne',
      version: 'v2',
      lines: [{ family: 'new', text: 'La météo se lit sans réseau' }],
    })
    const root = await act.comment(meteo.id, zoe, 'Un commentaire de Zoé')
    later()
    const reply = await act.comment(meteo.id, lea, 'La réponse de Léa', root.id)

    for (const [kind, id] of [
      ['update', update.id],
      ['comment', root.id],
      ['comment', reply.id],
      ['member', leaId],
    ] as const) {
      expect((await postReport(max, target(kind, id))).status, `${kind} ${id}`).toBe(201)
    }

    const rows = await storedReports()
    expect(rows.map((r) => [r.targetKind, r.targetId, r.projectId, r.targetAuthorId])).toEqual([
      // La mise à jour est rangée sous son projet, et son autrice est celle du projet.
      ['update', update.id, meteo.id, leaId],
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

  it('copies the title, version and lines of an update, and the text of a comment', async () => {
    const update = await postUpdate(meteo.id, lea, {
      title: 'Un titre très particulier',
      version: 'v9.9-particulière',
      lines: [
        { family: 'new', text: 'Une première ligne très particulière' },
        { family: 'fixed', text: 'Une seconde ligne très particulière' },
      ],
    })
    const comment = await act.comment(meteo.id, zoe, 'Un commentaire très particulier')

    const copy = await snapshotOf(await report('update', update.id))
    for (const text of [
      'Un titre très particulier',
      'v9.9-particulière',
      'Une première ligne très particulière',
      'Une seconde ligne très particulière',
    ]) {
      expect(copy).toContain(text)
    }
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
      target('update', '42'),
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

  // Relecture de sécurité B1 (R7a) : la note n'existe plus. Ce qu'un membre envoie
  // (ReportTargetKind) refuse `note`, même avec un identifiant bien formé ; seules les lignes déjà
  // gardées en base la portent encore (StoredReportTargetKind).
  it('refuses a new report on a journal note', async () => {
    const noteId = randomUUID()
    await expectError(await postReport(max, target('note', noteId)), 400, 'validation')
    const preview = await act.send(
      'GET',
      `/v1/reports/target?${new URLSearchParams({ kind: 'note', id: noteId })}`,
      max,
    )
    await expectError(preview, 400, 'validation')
    expect(await storedReports()).toEqual([])
    // Témoin : une mise à jour, elle, se signale.
    const update = await postUpdate(meteo.id, lea)
    expect((await postReport(max, target('update', update.id))).status).toBe(201)
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

  // Relecture de sécurité A8 (R7a) : la même règle que pour la note d'avant (`target.ts`), la
  // visibilité du projet, puis « non retirée, ou son auteur ». Un projet retiré par la modération
  // ou un blocage, dans un sens ou dans l'autre, cachent aussi ses mises à jour.
  it('refuses to report an update of a private, removed or blocked project like an unknown one', async () => {
    const draft = await act.publish(lea, 'Brouillon', { visibility: 'private' })
    const secret = await postLine(draft.id, lea, 'Une idée encore secrète')
    const velo = await act.publish(lea, 'Vélo')
    const onRemovedProject = await postLine(velo.id, lea, 'Sur un projet bientôt retiré')
    await ctx.db
      .update(schema.project)
      .set({ removedAt: new Date() })
      .where(eq(schema.project.id, velo.id))
    const removed = await postLine(meteo.id, lea, 'Une mise à jour retirée')
    await removeInBase(removed.id)

    for (const id of [UNKNOWN, secret.id, onRemovedProject.id, removed.id]) {
      await expectSameNotFound(await postReport(max, target('update', id)), await unknownProject())
    }
    // Le blocage, dans un sens puis dans l'autre : la mise à jour visible de Léa devient inconnue.
    const visible = await postLine(meteo.id, lea, 'Une mise à jour visible')
    for (const [blocked, cookie] of [
      [leaId, max],
      [maxId, lea],
    ] as const) {
      later()
      await act.block(blocked, cookie)
      await expectSameNotFound(
        await postReport(max, target('update', visible.id)),
        await unknownProject(),
      )
      await act.unblock(blocked, cookie)
    }
    expect(await storedReports()).toEqual([])
    // Témoin : sans blocage, la mise à jour visible se signale.
    expect((await postReport(max, target('update', visible.id))).status).toBe(201)
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
  it('refuses to report her own project, update, comment or profile', async () => {
    const update = await postLine(meteo.id, lea, 'Ma mise à jour')
    const comment = await act.comment(meteo.id, lea, 'Mon commentaire')

    for (const [kind, id] of [
      ['project', meteo.id],
      ['update', update.id],
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
    const update = await postUpdate(meteo.id, lea, {
      title: 'Un titre à lire',
      version: 'v1.2',
      lines: [
        { family: 'new', text: 'Une ligne à lire' },
        { family: 'polish', text: 'Une autre ligne à lire' },
      ],
    })
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
    // Une mise à jour : son titre et ses lignes (contrat, ReportTargetPreview.text).
    const updatePreview = await readPreview(max, 'update', update.id)
    expect(updatePreview).toEqual({
      target: { kind: 'update', id: update.id },
      text: expect.any(String),
      projectId: meteo.id,
      author,
    })
    for (const text of ['Un titre à lire', 'Une ligne à lire', 'Une autre ligne à lire']) {
      expect(updatePreview.text).toContain(text)
    }
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
    const secret = await postLine(draft.id, lea, 'Une idée encore secrète')
    const removed = await postLine(meteo.id, lea, 'Une mise à jour retirée')
    await removeInBase(removed.id)
    const hidden = await act.comment(meteo.id, zoe, 'Un commentaire masqué par Léa')
    await act.hide(meteo.id, hidden.id, lea)
    const deleted = await act.comment(meteo.id, zoe, 'Un commentaire supprimé')
    await act.deleteComment(meteo.id, deleted.id, zoe)

    for (const [kind, id] of [
      ['project', draft.id],
      ['project', velo.id],
      ['update', UNKNOWN],
      ['update', secret.id],
      ['update', removed.id],
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
    const update = await postLine(meteo.id, lea, 'Ma mise à jour')

    for (const [kind, id] of [
      ['project', meteo.id],
      ['update', update.id],
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
        // « Mistral » est un outil du catalogue depuis 0017, plus un alias de Le Chat.
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

  it('copies the body of a comment', async () => {
    const comment = await act.comment(meteo.id, lea, 'Le texte du commentaire')

    expect(await copyOf('comment', comment.id)).toEqual([
      { field: 'body', value: 'Le texte du commentaire' },
    ])
  })

  // Relecture de sécurité A8 (R7a), règle R12 : la copie d'une mise à jour, dans l'ordre de la page.
  // Le titre, la version, une entrée `line` par ligne (son texte, tiré du jsonb), puis chaque photo
  // rattachée (sa clé) suivie de sa description, quand elle en a une. Une photo encore en attente
  // sur le même projet n'en fait pas partie : elle n'est pas publiée.
  it('copies the title, version, lines, photos and photo descriptions of a reported update', async () => {
    const before = await pendingPhoto(meteo.id, lea, '#1b2a4a')
    const after = await pendingPhoto(meteo.id, lea, '#f2c14e')
    const update = await postUpdate(meteo.id, lea, {
      title: 'La carte des averses',
      version: 'v1.2',
      lines: [
        { family: 'new', text: 'Une carte des averses heure par heure' },
        { family: 'fixed', text: 'Le quartier du port ne disparaît plus' },
      ],
      photos: [
        { id: before.id, description: 'La carte vide, avant' },
        { id: after.id, description: null },
      ],
      beforeAfter: true,
    })
    const stillPending = await pendingPhoto(meteo.id, lea, '#9e3b7a')

    const copy = await copyOf('update', update.id)

    expect(copy).toEqual([
      { field: 'title', value: 'La carte des averses' },
      { field: 'version', value: 'v1.2' },
      { field: 'line', value: 'Une carte des averses heure par heure' },
      { field: 'line', value: 'Le quartier du port ne disparaît plus' },
      { field: 'photo', value: before.key },
      { field: 'photoDescription', value: 'La carte vide, avant' },
      { field: 'photo', value: after.key },
    ])
    expect(JSON.stringify(copy)).not.toContain(stillPending.key)
  })

  it('copies only the lines of an update without title, version or photos', async () => {
    const update = await postUpdate(meteo.id, lea, {
      lines: [{ family: 'polish', text: 'Des icônes plus lisibles' }],
    })

    expect(await copyOf('update', update.id)).toEqual([
      { field: 'line', value: 'Des icônes plus lisibles' },
    ])
  })

  // A8, règle R12 : la copie d'un projet ne garde que ses photos à lui (galerie, portrait). Les
  // photos d'une mise à jour, et celles encore en attente, n'y entrent pas, ni comme « cover » ni
  // comme « photo ». La file (ses images encore là) lit la même règle.
  it('never copies pending or update photos into the report of a project', async () => {
    const galleryKey = await galleryPhoto(meteo.id, lea)
    const attached = await pendingPhoto(meteo.id, lea, '#1b2a4a')
    await postUpdate(meteo.id, lea, { photos: [{ id: attached.id, description: 'Une capture' }] })
    const pending = await pendingPhoto(meteo.id, lea, '#f2c14e')

    const copy = await copyOf('project', meteo.id)

    expect(
      copy.filter((entry) => ['cover', 'photo', 'photoDescription'].includes(entry.field)),
    ).toEqual([{ field: 'cover', value: galleryKey }])
    for (const key of [attached.key, pending.key]) {
      expect(JSON.stringify(copy)).not.toContain(key)
    }
    // La file : une seule image, celle de la galerie, encore là.
    await act.makeAdmin((await act.me(zoe)).id)
    const res = await act.send('GET', '/v1/moderation/reports', zoe)
    expect(res.status).toBe(200)
    const [item] = ModerationQueuePage.parse(await res.json()).items
    expect(item?.target).toEqual({ kind: 'project', id: meteo.id })
    expect(item?.images).toEqual([{ field: 'cover', state: 'present' }])
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

  // R7a : une mise à jour ne se modifie pas (on la supprime, on en publie une autre) ; une fois
  // classée, sa copie reste celle que la modération a lue.
  it('refuses to report again an update the moderation already examined', async () => {
    const update = await postLine(meteo.id, lea, 'Une mise à jour')
    expect((await postReport(max, target('update', update.id))).status).toBe(201)
    later()
    await act.decide(zoe, { action: 'dismiss', target: { kind: 'update', id: update.id } })

    await expectError(await postReport(max, target('update', update.id)), 409, 'already_examined')
    expect((await storedReports()).map((r) => r.status)).toEqual(['dismissed'])
  })
})

// Tranche 7c (S3, plan « File et copies ») : une copie d'avant 7b, un texte seul (`text`), compte
// égale à une copie de 7b si ce texte est celui que 7a aurait copié de la même cible. Cela ne vaut
// que pour une note ou un commentaire (7a en gardait tout le texte) ; pour un projet ou un profil,
// 7a ne gardait qu'une partie (titre et pitch, nom et pseudo) : jamais égale. R7a : les notes sont
// effacées, il ne reste que le commentaire ; une mise à jour n'a jamais eu de copie de 7a.
describe('a copy written before slice 7b', () => {
  beforeEach(async () => {
    await act.makeAdmin((await act.me(zoe)).id)
  })

  /** Un signalement de Max tel que 7a l'écrivait : la copie est un texte seul. */
  const oldReport = async (
    kind: 'project' | 'comment' | 'member',
    id: string,
    text: string,
    status: 'open' | 'dismissed',
  ) => {
    later()
    await ctx.db.insert(schema.contentReport).values({
      id: randomUUID(),
      reporterId: maxId,
      targetKind: kind,
      targetId: id,
      projectId: kind === 'member' ? null : meteo.id,
      targetAuthorId: leaId,
      reason: 'other',
      details: null,
      snapshot: [{ field: 'text', value: text }],
      status,
      createdAt: new Date(Date.now()),
      decidedAt: status === 'open' ? null : new Date(Date.now()),
    })
  }

  it('refuses to report again a comment unchanged since a dismissal of slice 7a', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire')
    await oldReport('comment', comment.id, 'Un commentaire', 'dismissed')

    await expectError(await postReport(max, target('comment', comment.id)), 409, 'already_examined')
    expect((await storedReports()).map((r) => r.status)).toEqual(['dismissed'])
  })

  it('accepts a new report of a comment changed since a dismissal of slice 7a', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire devenu méchant')
    await oldReport('comment', comment.id, 'Un commentaire', 'dismissed')

    expect((await postReport(max, target('comment', comment.id))).status).toBe(201)
  })

  // S3 : un projet classé en 7a, dont le lien de démo a changé depuis (7a ne l'avait pas copié).
  it('never takes a copy of slice 7a as equal for a project or a profile', async () => {
    await oldReport(
      'project',
      meteo.id,
      'Météo\n\nLa pluie de demain, quartier par quartier.',
      'dismissed',
    )
    await oldReport('member', leaId, 'Léa', 'dismissed')
    later()
    const edit = await act.send('PATCH', `/v1/projects/${meteo.id}`, lea, {
      demoUrl: 'https://example.com/une-autre-demo',
    })
    expect(edit.status).toBe(200)

    expect((await postReport(max, target('project', meteo.id))).status).toBe(201)
    expect((await postReport(max, target('member', leaId))).status).toBe(201)
  })

  it('does not say that the copies differ between a 7a copy and an equal 7b copy', async () => {
    const comment = await act.comment(meteo.id, lea, 'Un commentaire')
    await oldReport('comment', comment.id, 'Un commentaire', 'open')
    // Zoé signale le même commentaire, inchangé : sa copie est celle de 7b ({ field: 'body' }).
    expect((await postReport(zoe, target('comment', comment.id))).status).toBe(201)

    const res = await act.send('GET', '/v1/moderation/reports', zoe)
    expect(res.status).toBe(200)
    const [item] = ModerationQueuePage.parse(await res.json()).items
    expect(item).toMatchObject({ target: { kind: 'comment', id: comment.id }, count: 2 })
    expect(item?.snapshotsDiffer).toBe(false)
  })

  it('says that the copies differ between a 7a copy of a project and a 7b copy', async () => {
    await oldReport(
      'project',
      meteo.id,
      'Météo\n\nLa pluie de demain, quartier par quartier.',
      'open',
    )
    expect((await postReport(zoe, target('project', meteo.id))).status).toBe(201)

    const res = await act.send('GET', '/v1/moderation/reports', zoe)
    const [item] = ModerationQueuePage.parse(await res.json()).items
    expect(item?.snapshotsDiffer).toBe(true)
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
    const update = await postLine(meteo.id, lea, 'Une mise à jour de Léa')
    const zoeProject = await act.publish(zoe, 'Recettes')
    const comment = await act.comment(zoeProject.id, lea, 'Un commentaire de Léa chez Zoé')

    for (const blockNow of [() => block(leaId, max), () => block(maxId, lea)]) {
      await blockNow()
      for (const [kind, id] of [
        ['project', meteo.id],
        ['update', update.id],
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

// ─── R7a : retirer une mise à jour, ses photos avec elle ─────────────────────────────────────────

// Plan R7a, « Modération et données » (le retrait d'une mise à jour retire aussi ses photos, par
// isVisualVisibleTo) et relecture de sécurité A8. Zoé est l'administratrice ; Max a gardé
// l'adresse des photos. Une photo retirée doit lui répondre exactement comme un fichier inconnu
// (statut, type et corps) ; Léa, l'autrice, la voit toujours. Rétablie, elle se montre de nouveau.
describe('removing an update', () => {
  beforeEach(async () => {
    await act.makeAdmin((await act.me(zoe)).id)
  })

  const open = (path: string, cookie: string) => ctx.request(path, { headers: { cookie } })
  const timelineIds = async (cookie: string) => {
    const res = await act.send('GET', `/v1/projects/${meteo.id}/updates`, cookie)
    expect(res.status).toBe(200)
    return ProjectUpdatePage.parse(await res.json()).items.map((item) => item.id)
  }

  it('hides the photos of an update as soon as the moderation removes it, and shows them again once restored', async () => {
    const before = await pendingPhoto(meteo.id, lea, '#1b2a4a')
    const after = await pendingPhoto(meteo.id, lea, '#f2c14e')
    const update = await postUpdate(meteo.id, lea, {
      lines: [{ family: 'new', text: 'Une publicité déguisée' }],
      photos: [
        { id: before.id, description: 'Avant' },
        { id: after.id, description: 'Après' },
      ],
      beforeAfter: true,
    })
    const paths = update.photos.map((photo) => new URL(photo.url).pathname)
    expect(paths).toHaveLength(2)
    const unknown = `/media/visuals/${UNKNOWN}.webp`
    // Témoin, avant le retrait : Max voit les photos et la mise à jour.
    for (const path of paths) expect((await open(path, max)).status, path).toBe(200)
    expect(await timelineIds(max)).toContain(update.id)

    const target = { kind: 'update', id: update.id } as const
    later()
    await act.report(max, target)
    later()
    await act.decide(zoe, {
      action: 'remove',
      target,
      ground: 'rules',
      explanation: 'Une publicité déguisée en mise à jour.',
    })

    for (const path of paths) {
      const res = await open(path, max)
      const reference = await open(unknown, max)
      expect(res.status, path).toBe(404)
      expect(res.status, path).toBe(reference.status)
      expect(res.headers.get('content-type'), path).toBe(reference.headers.get('content-type'))
      expect(await res.text(), path).toBe(await reference.text())
      // Léa, l'autrice, voit encore sa mise à jour retirée : ses photos aussi.
      expect((await open(path, lea)).status, path).toBe(200)
    }
    expect(await timelineIds(max)).not.toContain(update.id)
    expect(await timelineIds(lea)).toContain(update.id)

    later()
    await act.decide(zoe, { action: 'restore', target })

    for (const path of paths) expect((await open(path, max)).status, path).toBe(200)
    expect(await timelineIds(max)).toContain(update.id)
  })

  it('closes the open reports of the update and keeps the decision on it', async () => {
    const update = await postLine(meteo.id, lea, 'Une mise à jour signalée deux fois')
    const target = { kind: 'update', id: update.id } as const
    later()
    await act.report(max, target)
    later()
    await act.report(zoe, target, 'scam_spam')
    later()
    // Zoé a signalé elle aussi : une administratrice peut décider de ce qu'elle a signalé (seuls
    // ses propres contenus lui sont refusés, règle 11).
    const decision = await act.decide(zoe, {
      action: 'remove',
      target,
      ground: 'rules',
      explanation: 'Publicité.',
    })

    expect((await storedReports()).map((r) => [r.status, r.decisionId])).toEqual([
      ['removed', decision.id],
      ['removed', decision.id],
    ])
    const [decided] = await ctx.db.select().from(schema.moderationDecision)
    expect(decided).toMatchObject({
      id: decision.id,
      targetKind: 'update',
      targetId: update.id,
      targetMemberId: leaId,
    })
    const [row] = await ctx.db
      .select({
        removedAt: schema.projectUpdate.removedAt,
        removalId: schema.projectUpdate.removalId,
      })
      .from(schema.projectUpdate)
      .where(eq(schema.projectUpdate.id, update.id))
    expect(row).toEqual({ removedAt: new Date(Date.now()), removalId: decision.id })
  })
})

// ─── R7b : le coin des testeurs, un appel et un message de fil ──────────────────────────────────

// Plan R7b, « Modération et données » ; décision 2 de Louis (11/11/2026) et relecture de sécurité
// B3 : on ne signale que ce qu'on voit. Un appel se voit des testeurs actuels du projet (et de son
// auteur, qui ne signale pas le sien) ; un message, de l'autre personne de son fil seulement :
// l'auteur du projet pour un message du testeur, le testeur pour une réponse de l'auteur. Le testeur
// garde son fil, donc le droit de signaler les réponses de l'auteur, après un départ, un retrait par
// l'auteur ou un blocage dans un sens ou dans l'autre (sec-B3) ; un coin fermé (projet privé, retiré,
// auteur suspendu) lui est introuvable. Pour tout autre membre, la même réponse 404 qu'une cible
// inconnue, mot pour mot. Le signaleur reste inconnu de l'autre : rien ne le prévient.
//
// La copie suit celle d'une mise à jour (moderation/inputs.ts) : le texte sous `body` (le texte d'un
// commentaire), la photo d'un appel ou la capture d'un retour sous `photo` (sa clé seulement),
// suivie de sa description pour une photo d'appel (`photoDescription`).
//
// Léa est l'autrice du projet testable « Décollage » ; Max en est le testeur ; Zoé n'est rien au
// début (puis, selon le test, une autre testeuse).
describe('reporting in the testers corner', () => {
  let corner: { id: string } // le projet testable de Léa
  let zoeId: string

  const TESTABLE = { status: 'testable', demoUrl: 'https://demo.example.com/' }
  const projectPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}`

  /** Une réponse 204 : réussie, et sans corps. */
  const expectDone = async (res: Response) => {
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  }
  const join = async (projectId: string, cookie: string) => {
    later()
    await expectDone(await act.send('POST', `${projectPath(projectId)}/testers`, cookie))
  }
  const quit = async (projectId: string, cookie: string) => {
    later()
    await expectDone(await act.send('DELETE', `${projectPath(projectId)}/testers`, cookie))
  }
  /** L'autrice retire un membre de ses testeurs (DELETE …/testers/{memberId}). */
  const removeTester = async (projectId: string, memberId: string) => {
    later()
    await expectDone(
      await act.send(
        'DELETE',
        `${projectPath(projectId)}/testers/${encodeURIComponent(memberId)}`,
        lea,
      ),
    )
  }

  /** Envoie une image du coin (photo d'appel ou capture), « en attente » ; rend son id et sa clé. */
  const upload = async (projectId: string, cookie: string, kind: 'call' | 'capture') => {
    later()
    const form = new FormData()
    form.append(
      'file',
      new File([new Uint8Array(await jpegImage(800, 600))], 'image.jpg', { type: 'image/jpeg' }),
    )
    form.append('kind', kind)
    const res = await ctx.request(`${projectPath(projectId)}/testers/media`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(res.status).toBe(201)
    const { id } = TesterMedia.parse(await res.json())
    const [row] = await ctx.db
      .select({ key: schema.testerMedia.storageKey })
      .from(schema.testerMedia)
      .where(eq(schema.testerMedia.id, id))
    if (!row) throw new Error(`no tester media ${id}`)
    return { id, key: row.key }
  }

  /** Léa lance un appel, sans photo, ou avec une photo et sa description. */
  const launch = async (
    text: string,
    photo: { id: string; description: string | null } | null = null,
    projectId = corner.id,
  ) => {
    later()
    const res = await act.send('POST', `${projectPath(projectId)}/calls`, lea, {
      text,
      photoId: photo?.id ?? null,
      photoDescription: photo?.description ?? null,
    })
    expect(res.status).toBe(201)
    return TesterCall.parse(await res.json())
  }

  /** Envoie un message dans le fil de ce testeur, et vérifie qu'il est accepté. */
  const send = async (testerId: string, cookie: string, body: object, projectId = corner.id) => {
    later()
    const res = await act.send(
      'POST',
      `${projectPath(projectId)}/threads/${encodeURIComponent(testerId)}/messages`,
      cookie,
      body,
    )
    expect(res.status).toBe(201)
    return TesterMessage.parse(await res.json())
  }
  const feedback = (text: string | null, captureId: string | null = null) => ({
    kind: 'feedback',
    outcome: 'partly',
    device: 'phone',
    text,
    captureId,
  })
  const reply = (text: string) => ({ kind: 'reply', text })

  /** Max envoie un retour, puis Léa lui répond : le fil de Max. */
  const maxThread = async () => {
    const sent = await send(maxId, max, feedback('Le score repart à zéro au niveau 3.'))
    const answer = await send(maxId, lea, reply('Merci Max, je regarde ça ce soir.'))
    return { feedback: sent, reply: answer }
  }

  const unknownCall = () => postReport(max, target('call', UNKNOWN))
  const unknownMessage = () => postReport(max, target('message', UNKNOWN))
  const previewOf = (cookie: string, kind: string, id: string) =>
    act.send('GET', `/v1/reports/target?${new URLSearchParams({ kind, id })}`, cookie)

  beforeEach(async () => {
    corner = await act.publish(lea, 'Décollage', {
      pitch: 'Un quiz de l’espace pour les petits.',
      ...TESTABLE,
    })
    await join(corner.id, max)
    zoeId = (await act.me(zoe)).id
  })

  describe('a call to test', () => {
    it('lets a tester report a call, kept under its project and its author', async () => {
      const call = await launch('Essayez le niveau 3 ce week-end, surtout sur téléphone.')

      const res = await postReport(max, target('call', call.id))

      expect(res.status).toBe(201)
      const { id } = CreatedReport.parse(await res.json())
      expect(await storedReports()).toEqual([
        expect.objectContaining({
          id,
          reporterId: maxId,
          targetKind: 'call',
          targetId: call.id,
          projectId: corner.id,
          targetAuthorId: leaId,
          status: 'open',
        }),
      ])
    })

    it('copies the text of a call, then the key of its photo and its description', async () => {
      const photo = await upload(corner.id, lea, 'call')
      const call = await launch('Testez la fusée sur tablette.', {
        id: photo.id,
        description: 'La fusée sur la rampe de lancement',
      })

      expect((await postReport(max, target('call', call.id))).status).toBe(201)

      const [row] = await storedReports()
      expect(ReportSnapshot.parse(row?.snapshot)).toEqual([
        { field: 'body', value: 'Testez la fusée sur tablette.' },
        { field: 'photo', value: photo.key },
        { field: 'photoDescription', value: 'La fusée sur la rampe de lancement' },
      ])
    })

    it('refuses a call to a member who does not test the project, like an unknown call', async () => {
      const call = await launch('Un appel pour les testeurs seulement.')

      await expectSameNotFound(await postReport(zoe, target('call', call.id)), await unknownCall())
      await expectSameNotFound(await previewOf(zoe, 'call', call.id), await unknownCall())
      // Témoin : Max, testeur, le signale.
      expect((await postReport(max, target('call', call.id))).status).toBe(201)
      expect((await storedReports()).map((r) => r.reporterId)).toEqual([maxId])
    })

    it('refuses a call to a former tester, a removed tester and a tester kept apart by a block', async () => {
      const first = await launch('Le premier appel.')
      await quit(corner.id, max)
      await expectSameNotFound(await postReport(max, target('call', first.id)), await unknownCall())
      // Témoin : revenu parmi les testeurs, Max le signale.
      await join(corner.id, max)
      expect((await postReport(max, target('call', first.id))).status).toBe(201)

      const second = await launch('Le deuxième appel.')
      await removeTester(corner.id, maxId)
      await expectSameNotFound(
        await postReport(max, target('call', second.id)),
        await unknownCall(),
      )

      // Un blocage vaut un départ (décision 6), dans un sens comme dans l'autre.
      await join(corner.id, zoe)
      const third = await launch('Le troisième appel.')
      later()
      await act.block(leaId, zoe)
      await expectSameNotFound(await postReport(zoe, target('call', third.id)), await unknownCall())
      expect((await storedReports()).map((r) => r.targetId)).toEqual([first.id])
    })

    it('refuses a removed call, or a call of a closed corner, like an unknown one', async () => {
      // Témoins : Zoé, testeuse elle aussi, signale chaque appel avant le retrait ou la fermeture.
      await join(corner.id, zoe)
      const removed = await launch('Un appel retiré par la modération.')
      expect((await postReport(zoe, target('call', removed.id))).status).toBe(201)
      await ctx.db
        .update(schema.testerCall)
        .set({ removedAt: new Date() })
        .where(eq(schema.testerCall.id, removed.id))
      await expectSameNotFound(
        await postReport(max, target('call', removed.id)),
        await unknownCall(),
      )

      const kept = await launch('Un appel d’un coin qui se ferme.')
      expect((await postReport(zoe, target('call', kept.id))).status).toBe(201)
      later()
      await act.setVisibility(corner.id, lea, 'private')
      await expectSameNotFound(await postReport(max, target('call', kept.id)), await unknownCall())
      expect((await storedReports()).map((r) => r.reporterId)).toEqual([zoeId, zoeId])
    })

    it('refuses the author to report her own call', async () => {
      const call = await launch('Mon propre appel.')

      await expectError(await postReport(lea, target('call', call.id)), 422, 'own_content')
      expect(await storedReports()).toEqual([])
    })

    it('previews the text of a call, its project and its author', async () => {
      const call = await launch('Essayez le mode nuit.')
      const { handle } = await act.me(lea)

      const res = await previewOf(max, 'call', call.id)

      expect(res.status).toBe(200)
      expect(ReportTargetPreview.parse(await res.json())).toEqual({
        target: { kind: 'call', id: call.id },
        text: 'Essayez le mode nuit.',
        projectId: corner.id,
        author: { id: leaId, name: 'Léa', handle, isBlocked: false },
      })
    })
  })

  describe('a message of a thread', () => {
    it('lets the author report a feedback of her thread, with its text and the key of its capture', async () => {
      const capture = await upload(corner.id, max, 'capture')
      const sent = await send(maxId, max, feedback('Le score repart à zéro.', capture.id))

      const res = await postReport(lea, target('message', sent.id))

      expect(res.status).toBe(201)
      const [row] = await storedReports()
      expect(row).toMatchObject({
        reporterId: leaId,
        targetKind: 'message',
        targetId: sent.id,
        projectId: corner.id,
        targetAuthorId: maxId,
        status: 'open',
      })
      // Une capture n'a pas de description (son nom lu est fixe, relecture sec-A15).
      expect(ReportSnapshot.parse(row?.snapshot)).toEqual([
        { field: 'body', value: 'Le score repart à zéro.' },
        { field: 'photo', value: capture.key },
      ])
    })

    it('copies only the capture of a feedback sent without a text', async () => {
      const capture = await upload(corner.id, max, 'capture')
      const sent = await send(maxId, max, feedback(null, capture.id))

      expect((await postReport(lea, target('message', sent.id))).status).toBe(201)

      const [row] = await storedReports()
      expect(ReportSnapshot.parse(row?.snapshot)).toEqual([{ field: 'photo', value: capture.key }])
    })

    it('lets a tester report a reply the author sent him, kept under the author', async () => {
      const { reply: answer } = await maxThread()

      expect((await postReport(max, target('message', answer.id))).status).toBe(201)

      const [row] = await storedReports()
      expect(row).toMatchObject({
        reporterId: maxId,
        targetKind: 'message',
        targetId: answer.id,
        projectId: corner.id,
        targetAuthorId: leaId,
      })
      expect(ReportSnapshot.parse(row?.snapshot)).toEqual([
        { field: 'body', value: 'Merci Max, je regarde ça ce soir.' },
      ])
    })

    it('lets a removed tester report a reply the author sent him', async () => {
      const { reply: answer } = await maxThread()
      await removeTester(corner.id, maxId)

      expect((await postReport(max, target('message', answer.id))).status).toBe(201)
    })

    it('lets a former tester who quit report a reply of his thread', async () => {
      const { reply: answer } = await maxThread()
      await quit(corner.id, max)

      expect((await postReport(max, target('message', answer.id))).status).toBe(201)
    })

    it('lets a tester who blocked the author report a reply of his thread', async () => {
      const { reply: answer } = await maxThread()
      later()
      await act.block(leaId, max) // Max bloque Léa

      expect((await postReport(max, target('message', answer.id))).status).toBe(201)
    })

    it('lets a tester blocked by the author report a reply of his thread, and the author his feedback', async () => {
      const thread = await maxThread()
      later()
      await act.block(maxId, lea) // Léa bloque Max

      expect((await postReport(max, target('message', thread.reply.id))).status).toBe(201)
      // L'autrice lit tout chez elle (décision 2 : le fil reste lisible des deux côtés).
      expect((await postReport(lea, target('message', thread.feedback.id))).status).toBe(201)
    })

    it('previews a reply without the author handle once a block separates them', async () => {
      const { reply: answer } = await maxThread()
      const { handle } = await act.me(lea)
      const before = await previewOf(max, 'message', answer.id)
      expect(before.status).toBe(200)
      expect(ReportTargetPreview.parse(await before.json())).toEqual({
        target: { kind: 'message', id: answer.id },
        text: 'Merci Max, je regarde ça ce soir.',
        projectId: corner.id,
        author: { id: leaId, name: 'Léa', handle, isBlocked: false },
      })

      later()
      await act.block(leaId, max)

      const after = await previewOf(max, 'message', answer.id)
      expect(after.status).toBe(200)
      expect(ReportTargetPreview.parse(await after.json()).author).toEqual({
        id: leaId,
        name: 'Léa',
        handle: null,
        isBlocked: true,
      })
    })

    it('refuses a message to every member outside the thread, like an unknown message', async () => {
      const thread = await maxThread()
      // Zoé teste aussi le projet : elle a son fil à elle, jamais celui de Max.
      await join(corner.id, zoe)
      await send(zoeId, zoe, feedback('Mon retour à moi.'))

      for (const message of [thread.feedback, thread.reply]) {
        await expectSameNotFound(
          await postReport(zoe, target('message', message.id)),
          await unknownMessage(),
        )
        await expectSameNotFound(
          await previewOf(zoe, 'message', message.id),
          await unknownMessage(),
        )
      }
      expect(await storedReports()).toEqual([])
      // Témoins : les deux personnes du fil, elles, signalent le message de l'autre.
      expect((await postReport(lea, target('message', thread.feedback.id))).status).toBe(201)
      expect((await postReport(max, target('message', thread.reply.id))).status).toBe(201)
    })

    it('refuses to report her own message', async () => {
      const thread = await maxThread()

      await expectError(
        await postReport(max, target('message', thread.feedback.id)),
        422,
        'own_content',
      )
      await expectError(
        await postReport(lea, target('message', thread.reply.id)),
        422,
        'own_content',
      )
      expect(await storedReports()).toEqual([])
    })

    it('refuses a message removed by the moderation to the other person, like an unknown one', async () => {
      const thread = await maxThread()
      for (const message of [thread.feedback, thread.reply]) {
        await ctx.db
          .update(schema.testerMessage)
          .set({ removedAt: new Date() })
          .where(eq(schema.testerMessage.id, message.id))
      }

      await expectSameNotFound(
        await postReport(lea, target('message', thread.feedback.id)),
        await unknownMessage(),
      )
      await expectSameNotFound(
        await postReport(max, target('message', thread.reply.id)),
        await unknownMessage(),
      )
      expect(await storedReports()).toEqual([])
      // Témoin : un autre retour de Max, resté en place, se signale.
      const kept = await send(maxId, max, feedback('Un second retour, resté en place.'))
      expect((await postReport(lea, target('message', kept.id))).status).toBe(201)
    })

    it('refuses a reply of a closed corner to the tester, and lets the author report a feedback there', async () => {
      const thread = await maxThread()
      later()
      await act.setVisibility(corner.id, lea, 'private')

      await expectSameNotFound(
        await postReport(max, target('message', thread.reply.id)),
        await unknownMessage(),
      )
      expect((await postReport(lea, target('message', thread.feedback.id))).status).toBe(201)
    })

    it('tells the author of a reported reply nothing, and never names who reported', async () => {
      const { reply: answer } = await maxThread()
      await act.openNotifications(lea)
      const before = NotificationPage.parse(
        await (await act.send('GET', '/v1/notifications', lea)).json(),
      )

      expect((await postReport(max, target('message', answer.id))).status).toBe(201)

      const after = NotificationPage.parse(
        await (await act.send('GET', '/v1/notifications', lea)).json(),
      )
      expect(after.items).toEqual(before.items)
    })
  })
})
