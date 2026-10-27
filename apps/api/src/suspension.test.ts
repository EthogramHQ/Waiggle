// Tests d'intégration de la tranche 7c : la suspension d'un compte. Un administrateur suspend un
// membre (POST /v1/moderation/decisions, action « suspend ») pour 7 jours, 30 jours ou sans fin,
// puis peut la lever (action « lift »). Pendant la suspension, le compte est en lecture seule : il
// lit tout, supprime ses contenus, exporte ses données, règle son compte, bloque et signale, mais
// ne publie plus et n'interagit plus. Scénario : docs/scenarios/phase-1.md, « Tranche 7c —
// Administrer » ; règles J1, J2, J6, J7, J13 (relecture juridique) et S4, S9, S10, S14, S15, S18,
// S19 (relecture de sécurité) du plan.
//
// Cinq membres : Karim (celui qu'on suspend), Inès (une autre, qui montre ce que voient les autres),
// Malik (qui signale), Louis et Sam, administrateurs. Le rôle se donne directement en base
// (act.makeAdmin), comme le fait le script infra/grant-admin.sh.
//
// Le temps est maîtrisé par le test (fausse horloge, posée avant l'API) : la fin d'une suspension
// se lit à la requête, sans tâche planifiée, et se vérifie à la milliseconde près. Une session dure
// 7 jours : un test qui avance l'horloge au-delà reconnecte ses membres (act.signInAgain).
//
// Les tables nouvelles (account_suspension) ne sont pas encore dans le schéma typé de @ruche/db :
// les tests les lisent par une requête SQL brute (`rows`), dont ils précisent eux-mêmes la forme.
import { contactEmail } from '@ruche/brand'
import {
  ErrorResponse,
  Member,
  ModerationDecision,
  type ModerationDecisionInput,
  type ReportTarget,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { nightlyPurge } from './jobs/nightly-purge'
import { decide } from './reports/decide'
import { purgeModeration } from './reports/retention'
import { activity } from './testing/activity'
import { createTestContext, TEST_AUTH_SECRET, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let karim: string // cookies de session
let ines: string
let malik: string
let louis: string
let sam: string
let karimId: string
let inesId: string
let malikId: string
let louisId: string
let samId: string

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')
const UNKNOWN_MEMBER = 'unknownMember0000000000000000000'
const DECISIONS = '/v1/moderation/decisions'
const EXPLANATION = 'Messages insultants répétés sous les projets des autres.'

// Karim écrit en anglais : l'e-mail de suspension doit partir dans sa langue, pas dans celle de
// l'administrateur.
const KARIM = {
  name: 'Karim',
  email: 'karim@example.com',
  password: 'karim-long-password',
  language: 'en',
}
const LOUIS = { name: 'Louis', email: 'louis@example.com', password: 'louis-long-password' }

type SuspendInput = Extract<ModerationDecisionInput, { action: 'suspend' }>
type LiftInput = Extract<ModerationDecisionInput, { action: 'lift' }>

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  karim = await ctx.verifiedMember(KARIM)
  ines = await ctx.verifiedMember({
    name: 'Inès',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  louis = await ctx.verifiedMember(LOUIS)
  sam = await ctx.verifiedMember({
    name: 'Sam',
    email: 'sam@example.com',
    password: 'sam-long-password',
  })
  karimId = (await act.me(karim)).id
  inesId = (await act.me(ines)).id
  malikId = (await act.me(malik)).id
  louisId = (await act.me(louis)).id
  samId = (await act.me(sam)).id
  await act.makeAdmin(louisId)
  await act.makeAdmin(samId)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)
const iso = (ms: number) => new Date(ms).toISOString()

/**
 * Une requête SQL brute, pour lire ce qui reste dans la base. Le résultat n'est pas typé : on
 * précise sa forme nous-mêmes (voir comments.test.ts).
 */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/**
 * Suspend Karim (par défaut 7 jours, par Louis), une seconde après ce qui précède. Une suspension
 * sans fin redemande le mot de passe de l'administrateur (décision S11) : on le donne d'office.
 */
const suspendRaw = (body: Partial<SuspendInput> = {}, cookie: string = louis) => {
  later()
  const input: SuspendInput = {
    action: 'suspend',
    memberId: karimId,
    duration: '7d',
    ground: 'rules',
    explanation: EXPLANATION,
    ...body,
  }
  if (input.duration === 'indefinite' && input.password === undefined) {
    input.password = LOUIS.password
  }
  return act.send('POST', DECISIONS, cookie, input)
}

/** Comme `suspendRaw`, mais vérifie que la décision est créée (201) et rend son heure. */
const suspend = async (body: Partial<SuspendInput> = {}, cookie: string = louis) => {
  const res = await suspendRaw(body, cookie)
  expect(res.status).toBe(201)
  const decision = ModerationDecision.parse(await res.json())
  expect(decision.action).toBe('suspend')
  return { decision, at: Date.now() }
}

const liftRaw = (body: Partial<LiftInput> = {}, cookie: string = louis) => {
  later()
  const input: LiftInput = {
    action: 'lift',
    memberId: karimId,
    cause: 'early',
    explanation: 'Karim s’est excusé auprès des membres concernés.',
    ...body,
  }
  return act.send('POST', DECISIONS, cookie, input)
}

const lift = async (body: Partial<LiftInput> = {}, cookie: string = louis) => {
  const res = await liftRaw(body, cookie)
  expect(res.status).toBe(201)
  return ModerationDecision.parse(await res.json())
}

/** Publier : le geste d'écriture le plus simple, refusé à un compte suspendu. */
const tryPublish = (cookie: string) => {
  later()
  return act.send('POST', '/v1/projects', cookie, {
    title: 'Un nouveau projet',
    pitch: 'Pour voir si je peux encore publier.',
  })
}

/** La page d'un membre, telle que la lit `cookie`. */
const readMember = async (id: string, cookie: string) => {
  const res = await act.send('GET', `/v1/members/${encodeURIComponent(id)}`, cookie)
  expect(res.status).toBe(200)
  return Member.parse(await res.json())
}

const suspensionRows = () =>
  rows<{ user_id: string | null; ended: number | null; lift_decision_id: string | null }>(
    sql`select user_id, (extract(epoch from lifted_at) * 1000)::float8 as ended, lift_decision_id
        from account_suspension`,
  )
const decisionActions = async () =>
  (
    await ctx.db
      .select({ action: schema.moderationDecision.action })
      .from(schema.moderationDecision)
      .orderBy(schema.moderationDecision.createdAt)
  ).map((d) => d.action)

describe('suspending an account', () => {
  it('suspends for 7 days, ending at the second of the decision plus 7 days', async () => {
    const { at } = await suspend({ duration: '7d' })

    expect((await act.me(karim)).suspension).toEqual({
      since: iso(at),
      endsAt: iso(at + 7 * DAY),
      ground: 'rules',
      explanation: EXPLANATION,
      afterReport: false,
    })
  })

  it('suspends for 30 days', async () => {
    const { at } = await suspend({ duration: '30d', ground: 'illegal' })

    expect((await act.me(karim)).suspension).toMatchObject({
      since: iso(at),
      endsAt: iso(at + 30 * DAY),
      ground: 'illegal',
    })
  })

  it('suspends with no end, until an administrator lifts it', async () => {
    const { at } = await suspend({ duration: 'indefinite' })

    expect((await act.me(karim)).suspension).toMatchObject({ since: iso(at), endsAt: null })
  })

  it('keeps the decision: who, when, which member, which ground, which explanation', async () => {
    const { decision, at } = await suspend()

    const [stored] = await ctx.db
      .select()
      .from(schema.moderationDecision)
      .where(eq(schema.moderationDecision.id, decision.id))
    expect(stored).toMatchObject({
      action: 'suspend',
      targetKind: 'member',
      targetId: karimId,
      ground: 'rules',
      explanation: EXPLANATION,
      adminId: louisId,
    })
    expect(stored?.createdAt.toISOString()).toBe(iso(at))
    expect(decision.createdAt).toBe(iso(at))
  })

  it('gives null to a member who is not suspended (witness)', async () => {
    expect((await act.me(karim)).suspension).toBeNull()
    expect((await act.me(ines)).suspension).toBeNull()
  })

  it('closes no open report: each one gets its own decision', async () => {
    const project = await act.publish(karim, 'Insultes')
    later()
    await act.report(malik, { kind: 'project', id: project.id }, 'harassment')
    later()
    await act.report(malik, { kind: 'member', id: karimId }, 'harassment')

    await suspend()

    const reports = await ctx.db.select().from(schema.contentReport)
    expect(reports.map((r) => r.status)).toEqual(['open', 'open'])
  })

  it('suspends only the member it names', async () => {
    await suspend()

    expect((await act.me(ines)).suspension).toBeNull()
    expect((await tryPublish(ines)).status).toBe(201)
  })
})

// J2 : la suspension dit si elle a suivi un signalement (jamais de qui). L'API vérifie que le
// signalement cité est ouvert et vise bien ce membre.
describe('a suspension that follows a report (fromReport)', () => {
  it('says « after a report » when an open report of that target names the member', async () => {
    const project = await act.publish(karim, 'Insultes')
    later()
    await act.report(malik, { kind: 'project', id: project.id }, 'harassment')

    await suspend({ fromReport: { kind: 'project', id: project.id } })

    expect((await act.me(karim)).suspension?.afterReport).toBe(true)
  })

  it('accepts a report of the profile of the member', async () => {
    later()
    await act.report(malik, { kind: 'member', id: karimId }, 'harassment')

    await suspend({ fromReport: { kind: 'member', id: karimId } })

    expect((await act.me(karim)).suspension?.afterReport).toBe(true)
  })

  it('refuses a report that targets another member', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.report(malik, { kind: 'project', id: meteo.id })

    await expectError(
      await suspendRaw({ fromReport: { kind: 'project', id: meteo.id } }),
      422,
      'validation',
    )
    expect((await act.me(karim)).suspension).toBeNull()
  })

  it('refuses a target that nobody reported, or whose reports are closed', async () => {
    const project = await act.publish(karim, 'Insultes')
    const target: ReportTarget = { kind: 'project', id: project.id }
    await expectError(await suspendRaw({ fromReport: target }), 422, 'validation')

    later()
    await act.report(malik, target)
    later()
    await act.decide(louis, { action: 'dismiss', target })

    await expectError(await suspendRaw({ fromReport: target }), 422, 'validation')
    // Témoin : sans `fromReport`, la même suspension passe, « à l'initiative de la modération ».
    await suspend()
    expect((await act.me(karim)).suspension?.afterReport).toBe(false)
  })
})

describe('who may suspend', () => {
  it('answers a member who is not an administrator like an unknown address (404)', async () => {
    await expectError(await suspendRaw({}, ines), 404, 'not_found')
    await expectError(await liftRaw({}, ines), 404, 'not_found')
    // Témoin : l'administrateur, lui, suspend.
    await suspend()
  })

  it('refuses to suspend oneself', async () => {
    await expectError(await suspendRaw({ memberId: louisId }), 422, 'own_content')
    // Témoin : Louis suspend bien un autre membre.
    await suspend()
  })

  it('refuses to suspend an administrator in office, but not once the role is taken back', async () => {
    await expectError(await suspendRaw({ memberId: samId }), 422, 'cannot_suspend_admin')

    await act.revokeAdmin(samId)

    await suspend({ memberId: samId })
    expect((await act.me(sam)).suspension).not.toBeNull()
  })

  it('refuses a member already suspended', async () => {
    await suspend()

    await expectError(await suspendRaw({ duration: '30d' }), 409, 'already_decided')
    await expectError(await suspendRaw({ duration: '30d' }, sam), 409, 'already_decided')
  })

  it('refuses an unknown member', async () => {
    await expectError(await suspendRaw({ memberId: UNKNOWN_MEMBER }), 404, 'not_found')
    // Témoin : la même demande, pour un membre qui existe, aboutit (sinon ce 404 ne prouverait
    // rien : la route répond 404 à tout tant qu'elle ne connaît pas la suspension).
    await suspend()
  })

  // S4 et J13 : un administrateur qui a bloqué le membre ne décide pas de lui, ni pour suspendre,
  // ni pour lever ; un autre administrateur le peut.
  it('refuses an administrator who blocked the member, to suspend or to lift', async () => {
    await act.block(karimId, louis)

    await expectError(await suspendRaw(), 422, 'own_content')

    // Témoin : Sam, qui ne l'a pas bloqué, suspend ; Louis ne peut pas lever, Sam si.
    await suspend({}, sam)
    await expectError(await liftRaw(), 422, 'own_content')
    await lift({}, sam)
  })
})

describe('a suspended account', () => {
  let karimProject: { id: string }
  let inesProject: { id: string }
  let karimComment: { id: string }
  let inesComment: { id: string }
  let karimNoteId: string

  // Avant la suspension, Karim a publié, commenté, réagi, suivi et écrit une note ; Inès a
  // commenté son projet. Ce sont les contenus qu'il garde le droit de supprimer.
  beforeEach(async () => {
    karimProject = await act.publish(karim, 'Le projet de Karim')
    later()
    inesProject = await act.publish(ines, 'Météo')
    later()
    karimComment = await act.comment(inesProject.id, karim, 'Très bien fait.')
    later()
    inesComment = await act.comment(karimProject.id, ines, 'Bravo Karim.')
    later()
    await act.react(inesProject.id, 'bravo', karim)
    later()
    await act.followMember(inesId, karim)
    later()
    const note = await act.send('POST', `/v1/projects/${karimProject.id}/notes`, karim, {
      body: 'Une note de suivi.',
    })
    expect(note.status).toBe(201)
    karimNoteId = ((await note.json()) as { id: string }).id
    await suspend()
  })

  /**
   * Les écritures refusées : publier, modifier, commenter, répondre, réagir, suivre, ajouter une
   * photo. Le corps est vide exprès : la garde répond avant la validation (S2).
   */
  const writes = (): [string, string][] => [
    ['POST', '/v1/projects'],
    ['PATCH', `/v1/projects/${karimProject.id}`],
    ['POST', `/v1/projects/${inesProject.id}/comments`],
    ['PATCH', `/v1/projects/${inesProject.id}/comments/${karimComment.id}`],
    ['PUT', `/v1/projects/${inesProject.id}/reactions/amazing`],
    ['POST', `/v1/members/${inesId}/follow`],
    ['POST', `/v1/projects/${inesProject.id}/follow`],
    ['POST', `/v1/projects/${karimProject.id}/notes`],
    ['POST', `/v1/projects/${karimProject.id}/visuals`],
    ['POST', '/v1/me/avatar'],
  ]

  it('refuses every write with 403 « suspended », before reading the body', async () => {
    for (const [method, path] of writes()) {
      const res = await act.send(method, path, karim, {})
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(ErrorResponse.parse(await res.json()).error.code, `${method} ${path}`).toBe(
        'suspended',
      )
    }
  })

  it('refuses nothing of this to a member who is not suspended (witness)', async () => {
    for (const [method, path] of writes()) {
      // Le corps brut : une erreur de validation n'a pas toujours la forme d'ErrorResponse.
      const res = await act.send(method, path, ines, {})
      expect(await res.text(), `${method} ${path}`).not.toContain('"suspended"')
    }
  })

  it('refuses a valid publication too, with a message that says so', async () => {
    const res = await act.send('POST', '/v1/projects', karim, {
      title: 'Un nouveau projet',
      pitch: 'Pour voir si je peux encore publier.',
    })
    expect(res.status).toBe(403)
    const body = ErrorResponse.parse(await res.json())
    expect(body.error.code).toBe('suspended')
    expect(body.error.message).not.toBe('')
  })

  it('still reads everything it read before', async () => {
    for (const path of [
      '/v1/me',
      `/v1/projects/${inesProject.id}`,
      `/v1/projects/${inesProject.id}/comments`,
      `/v1/members/${inesId}`,
      '/v1/feed/discover',
      '/v1/feed/following',
      '/v1/notifications',
      '/v1/me/blocks',
      '/v1/me/email-preferences',
    ]) {
      expect((await act.send('GET', path, karim)).status, path).toBe(200)
    }
  })

  it('still deletes its comments, reactions, follows, notes and projects', async () => {
    const gestures: [string, string][] = [
      ['DELETE', `/v1/projects/${inesProject.id}/comments/${karimComment.id}`],
      ['DELETE', `/v1/projects/${inesProject.id}/reactions/bravo`],
      ['DELETE', `/v1/members/${inesId}/follow`],
      ['DELETE', `/v1/projects/${karimProject.id}/notes/${karimNoteId}`],
      ['DELETE', `/v1/projects/${karimProject.id}`],
    ]
    for (const [method, path] of gestures) {
      later()
      expect((await act.send(method, path, karim)).status, `${method} ${path}`).toBe(204)
    }
  })

  it('still hides and shows again a comment on its own project', async () => {
    const path = `/v1/projects/${karimProject.id}/comments/${inesComment.id}/hide`
    expect((await act.send('PUT', path, karim)).status).toBe(204)
    later()
    expect((await act.send('DELETE', path, karim)).status).toBe(204)
  })

  it('still reports, blocks and unblocks', async () => {
    later()
    await act.report(karim, { kind: 'project', id: inesProject.id }, 'scam_spam')
    later()
    await act.block(malikId, karim)
    later()
    await act.unblock(malikId, karim)
  })

  it('still marks its notifications seen, sets its e-mails and exports its data', async () => {
    await act.openNotifications(karim)
    expect(await act.setPreferences(karim, { weeklyRecap: false })).toMatchObject({
      weeklyRecap: false,
    })
    expect((await act.send('GET', '/v1/me/export', karim)).status).toBe(200)
  })

  // S9 : PATCH /v1/me entre, mais n'accepte que la langue ; toute autre clé, même inchangée, est
  // refusée avant la lecture du pseudo.
  it('changes its language, and nothing else of its profile', async () => {
    const before = await act.me(karim)

    expect((await act.send('PATCH', '/v1/me', karim, { language: 'fr' })).status).toBe(200)
    expect((await act.me(karim)).language).toBe('fr')

    await expectError(
      await act.send('PATCH', '/v1/me', karim, { name: before.name }),
      403,
      'suspended',
    )
    await expectError(await act.send('PATCH', '/v1/me', karim, { bio: null }), 403, 'suspended')
    await expectError(
      await act.send('PATCH', '/v1/me', karim, { language: 'en', name: 'Karim B.' }),
      403,
      'suspended',
    )
    expect((await act.me(karim)).name).toBe(before.name)
    expect((await act.me(karim)).language).toBe('fr')
  })

  // Les routes de Better Auth ne sont pas sous /v1 : changer d'adresse reste possible.
  it('still asks to change its address', async () => {
    const res = await ctx.request('/api/auth/change-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: karim },
      body: JSON.stringify({ newEmail: 'karim.b@example.com', password: KARIM.password }),
    })
    expect(res.status).toBe(200)
  })

  // S14 : la désinscription par le lien d'un e-mail marche, même ouverte dans le navigateur où le
  // membre suspendu est connecté (le cookie part avec la demande).
  it('still unsubscribes from a link of an e-mail, signed in or not', async () => {
    const token = createUnsubscribeToken(TEST_AUTH_SECRET, karimId, 'recap')
    const res = await ctx.request(`/v1/email/unsubscribe?${new URLSearchParams({ token })}`, {
      method: 'POST',
      headers: { cookie: karim },
    })
    expect(res.status).toBe(204)
    expect(await act.preferences(karim)).toMatchObject({ weeklyRecap: false })
  })

  // S14 : sans session, la garde laisse passer, et le refus reste celui de toujours.
  it('changes nothing for a visitor without a session: 401, as before', async () => {
    await expectError(await act.send('POST', '/v1/projects', null, {}), 401, 'unauthorized')
    // Témoin : Karim, connecté et suspendu, reçoit bien le refus de la suspension.
    await expectError(await act.send('POST', '/v1/projects', karim, {}), 403, 'suspended')
  })

  it('lets the other members act on its contents as before', async () => {
    later()
    await act.comment(karimProject.id, ines, 'Toujours là.')
    later()
    await act.react(karimProject.id, 'useful', ines)
  })
})

// S10 et J6 : la fin se lit à la requête, à la milliseconde, par une seule fonction.
describe('the end of a suspension', () => {
  it('ends at its date, to the millisecond, with no scheduled task', async () => {
    const { at } = await suspend({ duration: '7d' })
    const end = at + 7 * DAY

    vi.setSystemTime(end - 1)
    karim = await act.signInAgain(KARIM)
    expect((await act.me(karim)).suspension).not.toBeNull()
    await expectError(
      await act.send('POST', '/v1/projects', karim, { title: 'Avant', pitch: 'Encore suspendu.' }),
      403,
      'suspended',
    )

    vi.setSystemTime(end)
    expect((await act.me(karim)).suspension).toBeNull()
    const res = await act.send('POST', '/v1/projects', karim, {
      title: 'Après',
      pitch: 'La suspension est finie.',
    })
    expect(res.status).toBe(201)
  })

  it('is lifted by an administrator, who must explain why', async () => {
    await suspend({ duration: 'indefinite' })

    const decision = await lift({ cause: 'early', explanation: 'Excuses présentées.' })

    expect(decision.action).toBe('lift')
    expect((await act.me(karim)).suspension).toBeNull()
    expect((await tryPublish(karim)).status).toBe(201)
    const [stored] = await ctx.db
      .select()
      .from(schema.moderationDecision)
      .where(eq(schema.moderationDecision.id, decision.id))
    expect(stored).toMatchObject({
      action: 'lift',
      targetKind: 'member',
      targetId: karimId,
      explanation: 'Excuses présentées.',
      adminId: louisId,
    })
  })

  it('tells a lift from an end at the date (J6)', async () => {
    const { at } = await suspend({ duration: '7d' })
    const liftDecision = await lift()
    const liftedAt = Date.now()

    vi.setSystemTime(at + 30 * DAY)
    louis = await act.signInAgain(LOUIS)
    karim = await act.signInAgain(KARIM)
    const second = await suspend({ duration: '7d' })
    vi.setSystemTime(second.at + 7 * DAY + SECOND)
    // La suspension échue se clôt à sa date en relisant ; elle reste sans décision de levée.
    louis = await act.signInAgain(LOUIS)
    await suspend({ duration: '7d' })

    expect(
      (await suspensionRows()).sort((a, b) => (a.ended ?? Infinity) - (b.ended ?? Infinity)),
    ).toEqual([
      { user_id: karimId, ended: liftedAt, lift_decision_id: liftDecision.id },
      { user_id: karimId, ended: second.at + 7 * DAY, lift_decision_id: null },
      { user_id: karimId, ended: null, lift_decision_id: null },
    ])
  })

  it('refuses to lift what is not active: never suspended, already lifted, or ended', async () => {
    await expectError(await liftRaw(), 409, 'already_decided')

    const { at } = await suspend({ duration: '7d' })
    await lift()
    await expectError(await liftRaw(), 409, 'already_decided')

    later()
    const again = await suspend({ duration: '7d' })
    expect(again.at).toBeGreaterThan(at)
    vi.setSystemTime(again.at + 7 * DAY)
    louis = await act.signInAgain(LOUIS)
    await expectError(await liftRaw(), 409, 'already_decided')
  })

  it('allows a new suspension once the previous one has ended at its date', async () => {
    const { at } = await suspend({ duration: '7d' })
    vi.setSystemTime(at + 7 * DAY)
    louis = await act.signInAgain(LOUIS)

    await suspend({ duration: '30d' })

    karim = await act.signInAgain(KARIM)
    expect((await act.me(karim)).suspension?.endsAt).toBe(iso(Date.now() + 30 * DAY))
  })
})

// S15 : rien ne montre aux autres qu'un membre est suspendu ; seul un administrateur le lit.
describe('what the others see', () => {
  it('shows a third member exactly the same pages before and after the suspension', async () => {
    const project = await act.publish(karim, 'Le projet de Karim')
    later()
    const paths = [`/v1/members/${karimId}`, `/v1/projects/${project.id}`, '/v1/feed/discover']
    const read = async () =>
      Promise.all(paths.map(async (path) => (await act.send('GET', path, ines)).text()))
    const before = await read()

    const { at } = await suspend()

    expect(await read()).toEqual(before)
    expect((await readMember(karimId, ines)).moderation).toBeNull()
    // Témoin : l'administrateur, lui, lit la suspension sur la même page. L'objet entier : avec
    // `?.suspension`, un `moderation: null` donnait `undefined`, qui n'est pas null, et passait.
    expect((await readMember(karimId, louis)).moderation).toMatchObject({
      isAdmin: false,
      suspension: {
        since: iso(at),
        endsAt: iso(at + 7 * DAY),
        ground: 'rules',
        explanation: EXPLANATION,
        afterReport: false,
      },
      canSuspend: false,
    })
  })

  it('gives an administrator the moderation of a member: suspension, decisions, canSuspend', async () => {
    const project = await act.publish(karim, 'Insultes')
    later()
    await act.report(malik, { kind: 'project', id: project.id })
    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'project', id: project.id } })

    expect((await readMember(karimId, louis)).moderation).toEqual({
      isAdmin: false,
      suspension: null,
      decisions: 1,
      canSuspend: true,
    })

    const { at } = await suspend()

    expect((await readMember(karimId, louis)).moderation).toEqual({
      isAdmin: false,
      suspension: {
        since: iso(at),
        endsAt: iso(at + 7 * DAY),
        ground: 'rules',
        explanation: EXPLANATION,
        afterReport: false,
      },
      decisions: 2,
      canSuspend: false,
    })
  })

  it('says to an administrator that he cannot suspend himself nor another administrator', async () => {
    expect((await readMember(samId, louis)).moderation).toMatchObject({
      isAdmin: true,
      canSuspend: false,
    })
    expect((await readMember(louisId, louis)).moderation).toMatchObject({ canSuspend: false })
  })

  it('gives null to every member who is not an administrator, the suspended one included', async () => {
    await suspend()

    expect((await readMember(karimId, karim)).moderation).toBeNull()
    expect((await readMember(karimId, malik)).moderation).toBeNull()
    expect((await readMember(louisId, karim)).moderation).toBeNull()
  })
})

describe('the e-mail of a suspension', () => {
  const sentTo = (email: string, from: number) =>
    ctx.mailer.sent.slice(from).filter((sent) => sent.to === email)
  const en = resources.en.translation.email.suspension

  it('is sent once to the member, in his language, with the explanation and the contact', async () => {
    const from = ctx.mailer.sent.length

    await suspend()

    const sent = sentTo(KARIM.email, from)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe(fill(en.subject))
    expect(sent[0]?.text).toContain(EXPLANATION)
    expect(sent[0]?.text).toContain(contactEmail)
    // Jamais l'administrateur qui a décidé.
    expect(sent[0]?.text).not.toContain('Louis')
    // Personne d'autre n'en reçoit.
    expect(ctx.mailer.sent.slice(from)).toHaveLength(1)
  })

  it('sends nothing at the lift: a notification is enough', async () => {
    await suspend()
    const from = ctx.mailer.sent.length

    await lift()

    expect(ctx.mailer.sent.slice(from)).toEqual([])
  })

  // S18 : au plus un e-mail de suspension par membre et par 24 heures.
  it('sends at most one e-mail a day to the same member', async () => {
    const from = ctx.mailer.sent.length
    const { at } = await suspend()
    await lift()
    await suspend()
    expect(sentTo(KARIM.email, from)).toHaveLength(1)

    // Témoin : un jour plus tard, une nouvelle suspension prévient de nouveau.
    await lift()
    vi.setSystemTime(at + DAY + SECOND)
    await suspend()
    expect(sentTo(KARIM.email, from)).toHaveLength(2)
  })
})

// S19 : un membre suspendu qu'on nomme administrateur n'a pas accès à la modération.
describe('a suspended administrator', () => {
  it('reads the moderation like a member, until the suspension ends', async () => {
    await suspend({ duration: 'indefinite' })
    await act.makeAdmin(karimId)

    await expectError(await act.send('GET', '/v1/moderation/reports', karim), 404, 'not_found')

    // Témoin : levée, la même route lui répond.
    await lift()
    expect((await act.send('GET', '/v1/moderation/reports', karim)).status).toBe(200)
  })
})

// Relecture de sécurité de la branche (7c) : la route vérifie le rôle avant la transaction, mais il
// peut être retiré entre-temps (grant-admin.sh --revoke). decide() le relit donc sous les verrous,
// à l'heure de la décision. Ces tests appellent decide() directement : c'est le seul moyen de
// placer la révocation entre la garde de la route et la décision.
describe('an administrator whose role changes during the decision', () => {
  const suspendInput: SuspendInput = {
    action: 'suspend',
    memberId: '',
    duration: '7d',
    ground: 'rules',
    explanation: EXPLANATION,
  }

  it('decides nothing once his role is taken back, on a content or on an account', async () => {
    const project = await act.publish(karim, 'Insultes')
    later()
    await act.report(malik, { kind: 'project', id: project.id })
    await act.revokeAdmin(louisId)
    later()
    const options = { passwordConfirmed: false }
    const dismiss: ModerationDecisionInput = {
      action: 'dismiss',
      target: { kind: 'project', id: project.id },
    }

    expect(await decide(ctx.db, louisId, dismiss, new Date(), options)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(
      await decide(ctx.db, louisId, { ...suspendInput, memberId: karimId }, new Date(), options),
    ).toEqual({ ok: false, error: 'not_found' })
    expect(await decisionActions()).toEqual([])
    expect(await suspensionRows()).toEqual([])

    // Témoin : Sam, toujours administrateur, prend les deux décisions.
    expect(await decide(ctx.db, samId, dismiss, new Date(), options)).toMatchObject({ ok: true })
    expect(
      await decide(ctx.db, samId, { ...suspendInput, memberId: karimId }, new Date(), options),
    ).toMatchObject({ ok: true })
  })

  it('tells whether the member is an administrator in office at the hour of the decision', async () => {
    const { at } = await suspend()
    await act.makeAdmin(karimId)
    const input = { ...suspendInput, memberId: karimId }
    const options = { passwordConfirmed: false }

    // À l'heure de la fin de sa suspension, Karim est administrateur en fonction : on ne le
    // suspend pas, même si l'horloge de l'appel est encore pendant sa suspension.
    expect(await decide(ctx.db, samId, input, new Date(at + 7 * DAY), options)).toEqual({
      ok: false,
      error: 'cannot_suspend_admin',
    })
    // Témoin : une milliseconde avant, il est encore suspendu (donc pas administrateur).
    expect(await decide(ctx.db, samId, input, new Date(at + 7 * DAY - 1), options)).toEqual({
      ok: false,
      error: 'already_decided',
    })
  })
})

// J1 et J7 : partir pendant une suspension est permis, et n'efface pas la preuve. La suspension est
// close à la date du départ, sans décision de levée, et gardée 365 jours après sa fin avec ses
// décisions.
describe('leaving during a suspension', () => {
  it('is allowed, and closes the suspension at the date of departure, without a lift', async () => {
    const { decision } = await suspend({ duration: 'indefinite' })
    later()
    const leftAt = Date.now()

    await act.deleteAccount(karim, KARIM.password)

    expect(await suspensionRows()).toEqual([
      { user_id: null, ended: leftAt, lift_decision_id: null },
    ])
    const [stored] = await ctx.db
      .select()
      .from(schema.moderationDecision)
      .where(eq(schema.moderationDecision.id, decision.id))
    expect(stored).toMatchObject({ action: 'suspend', adminId: louisId })
  })

  // Relecture de sécurité de la branche (7c) : la clôture au départ (auth.ts, afterDelete) peut
  // échouer après la suppression du compte. La purge de nuit la rattrape, à son heure : sans elle,
  // une suspension sans fin d'un compte parti resterait ouverte, donc gardée pour toujours. L'échec
  // se pose en base (la ligne rouverte), aucune route ne permettant de le provoquer.
  it('is closed by the nightly purge when the closure at departure failed', async () => {
    await suspend({ duration: 'indefinite' })
    await act.deleteAccount(karim, KARIM.password)
    await ctx.db.update(schema.accountSuspension).set({ liftedAt: null })
    const purgedAt = Date.now() + HOUR
    // La purge note ses nombres dans les journaux : on les tait le temps du test.
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await nightlyPurge(ctx.db, new Date(purgedAt))

      expect(await suspensionRows()).toEqual([
        { user_id: null, ended: purgedAt, lift_decision_id: null },
      ])
      await nightlyPurge(ctx.db, new Date(purgedAt + 366 * DAY))
      expect(await suspensionRows()).toEqual([])
    } finally {
      log.mockRestore()
    }
  })

  it('keeps an endless suspension forever, then 365 days after the departure', async () => {
    const { at } = await suspend({ duration: 'indefinite' })

    // 400 jours plus tard, toujours en cours : rien n'est effacé.
    await purgeModeration(ctx.db, new Date(at + 400 * DAY))
    expect(await decisionActions()).toEqual(['suspend'])
    expect(await suspensionRows()).toHaveLength(1)

    vi.setSystemTime(at + 400 * DAY)
    karim = await act.signInAgain(KARIM)
    await act.deleteAccount(karim, KARIM.password)
    const leftAt = Date.now()

    await purgeModeration(ctx.db, new Date(leftAt + 364 * DAY))
    expect(await decisionActions()).toEqual(['suspend'])
    expect(await suspensionRows()).toHaveLength(1)

    await purgeModeration(ctx.db, new Date(leftAt + 366 * DAY))
    expect(await decisionActions()).toEqual([])
    expect(await suspensionRows()).toEqual([])
  })
})

describe('keeping the decisions of a suspension', () => {
  it('keeps a suspension ended at its date 365 days after its end, not after its start', async () => {
    const { at } = await suspend({ duration: '7d' })
    const end = at + 7 * DAY

    await purgeModeration(ctx.db, new Date(end + 364 * DAY))
    expect(await decisionActions()).toEqual(['suspend'])

    await purgeModeration(ctx.db, new Date(end + 366 * DAY))
    expect(await decisionActions()).toEqual([])
  })

  // Relecture juridique de la branche (7c) : une décision de suspension ou de levée n'est gardée
  // que par sa ligne account_suspension, jamais par « une décision plus récente sur la même
  // cible » (le membre). Sinon une seconde suspension, ou un profil classé, garderait sans fin la
  // première. Et l'inverse : une suspension récente ne garde pas une vieille décision du profil.
  const MALIK = { email: 'malik@example.com', password: 'malik-long-password' }

  /** Suspend Karim (A), puis lève sa suspension un jour plus tard ; rend l'heure de la levée. */
  const suspendThenLift = async () => {
    await suspend({ duration: '7d' })
    vi.setSystemTime(Date.now() + DAY)
    await lift()
    return Date.now()
  }

  /** Signale le profil de Karim (Malik), puis le classe (Louis). */
  const dismissProfileOfKarim = async () => {
    await act.report(malik, { kind: 'member', id: karimId })
    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'member', id: karimId } })
  }

  /** Avance l'horloge et reconnecte Louis et Malik (une session dure 7 jours). */
  const jumpTo = async (ms: number) => {
    vi.setSystemTime(ms)
    louis = await act.signInAgain(LOUIS)
    malik = await act.signInAgain(MALIK)
  }

  it('purges an ended suspension and its two decisions, even when a newer suspension is kept', async () => {
    const endA = await suspendThenLift()
    await jumpTo(endA + 370 * DAY)
    await suspend({ duration: '30d' })

    await purgeModeration(ctx.db, new Date(endA + 400 * DAY))

    expect(await decisionActions()).toEqual(['suspend'])
    expect(await suspensionRows()).toHaveLength(1)
  })

  it('purges an ended suspension and its two decisions, even when the profile was dismissed lately', async () => {
    const endA = await suspendThenLift()
    await jumpTo(endA + 370 * DAY)
    await dismissProfileOfKarim()

    await purgeModeration(ctx.db, new Date(endA + 400 * DAY))

    expect(await decisionActions()).toEqual(['dismiss'])
    expect(await suspensionRows()).toEqual([])
  })

  it('purges an old decision on the profile, even when a newer suspension is kept', async () => {
    await dismissProfileOfKarim()
    const dismissedAt = Date.now()
    await jumpTo(dismissedAt + 370 * DAY)
    await suspend({ duration: '30d' })

    await purgeModeration(ctx.db, new Date(dismissedAt + 400 * DAY))

    expect(await decisionActions()).toEqual(['suspend'])
  })

  it('keeps the decision of the suspension and that of its lift together', async () => {
    await suspend({ duration: '30d' })
    vi.setSystemTime(Date.now() + 2 * DAY)
    louis = await act.signInAgain(LOUIS)
    await lift({ cause: 'error' })
    const liftedAt = Date.now()

    await purgeModeration(ctx.db, new Date(liftedAt + 364 * DAY))
    expect(await decisionActions()).toEqual(['suspend', 'lift'])
    expect(await suspensionRows()).toHaveLength(1)

    await purgeModeration(ctx.db, new Date(liftedAt + 366 * DAY))
    expect(await decisionActions()).toEqual([])
    expect(await suspensionRows()).toEqual([])
  })
})
