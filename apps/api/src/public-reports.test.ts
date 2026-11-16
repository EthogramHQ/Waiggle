// Tests d'intégration de R12 : le signalement par un visiteur sans compte (POST /v1/public/reports)
// et ce que sa feuille lit de la cible (GET /v1/public/reports/target). Un visiteur signale un
// projet public, une de ses mises à jour, ou une page publique ; rien d'autre. Son adresse e-mail est
// facultative : elle sert à l'accusé de réception (un par adresse et par jour, relecture I2) puis à
// la décision, deux e-mails sans aucun texte d'un membre, et elle est effacée à toute clôture
// (décision 17). Un doublon ou un « déjà examiné » reçoit la réponse d'un premier signalement
// (relecture B2 et juridique 1 : sinon la réponse dirait qui a signalé). Au plus 5 par jour et par
// réseau (/64), mal formés compris ; une origine étrangère est refusée avant d'être comptée (I3).
// La modération ne voit jamais l'adresse, ni même s'il y en avait une.
//
// Scénario : docs/scenarios/refonte.md, R12, « Le signalement par un visiteur ». Trois membres :
// Inès (l'autrice d'un projet public), Max (un membre), Louis (l'administrateur).
import { contactEmail } from '@ruche/brand'
import {
  ErrorResponse,
  ModerationQueuePage,
  PublicReportTarget,
  VISITOR_REPORTS_PER_DAY,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { asc } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, TEST_VISITOR_IP, type TestContext } from './testing/context'
import { answerOf, later, UNKNOWN_ID, visitorGestures } from './testing/visitor-world'

const DAY = 24 * 60 * 60 * 1000
const t = resources.fr.translation.email.visitorReport

// Des mots qu'on ne trouve que dans les contenus d'Inès et dans la précision du visiteur : un
// e-mail qui en contient un a recopié un texte d'un membre ou d'un visiteur.
const TITLE = 'Zébulon jardinier'
const PITCH = 'Un robot qui arrose les tomates quand il pleut pas.'
const DEMO = 'https://zebulon-demo.example.net/'
const DETAILS = 'Ce projet copie le mien, mot pour mot, jusque dans les xylophones.'
const MEMBER_WORDS = [TITLE, 'Zébulon', 'tomates', 'zebulon-demo', 'Inès', 'Morel', 'xylophones']

let ctx: TestContext
let act: ReturnType<typeof activity>
let world: ReturnType<typeof visitorGestures>
let ines: string // cookies de session
let max: string
let louis: string
let inesId: string
let project: string // le projet public d'Inès

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  world = visitorGestures(ctx, act)
  ines = await ctx.verifiedMember({
    name: 'Inès Morel',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Maxence',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
  project = await ctx.webProject(ines, {
    title: TITLE,
    pitch: PITCH,
    status: 'testable',
    demoUrl: DEMO,
  })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

type Body = Record<string, unknown>

const projectTarget = (id = project) => ({ kind: 'project', id })

/** Un visiteur signale ; `ip` simule un autre visiteur ou un autre réseau. */
const report = (body: Body, ip?: string) => {
  later()
  return ctx.visitorPostJson('/v1/public/reports', body, ip)
}

/** Un signalement simple d'un projet, avec ou sans adresse. */
const reportProject = (id: string, email?: string, ip?: string) =>
  report({ target: projectTarget(id), reason: 'other', ...(email !== undefined && { email }) }, ip)

/** Les signalements gardés en base, dans l'ordre d'arrivée. */
const storedReports = () =>
  ctx.db
    .select({
      id: schema.contentReport.id,
      reporterId: schema.contentReport.reporterId,
      reporterEmail: schema.contentReport.reporterEmail,
      targetKind: schema.contentReport.targetKind,
      targetId: schema.contentReport.targetId,
      reason: schema.contentReport.reason,
      details: schema.contentReport.details,
      partField: schema.contentReport.partField,
      status: schema.contentReport.status,
    })
    .from(schema.contentReport)
    .orderBy(asc(schema.contentReport.createdAt))

const openReports = async () => (await storedReports()).filter((row) => row.status === 'open')

/** Les e-mails reçus par une adresse depuis l'indice `from`, par objet. */
const mailsTo = (address: string, subject: string, from = 0) =>
  ctx.mailer.sent
    .slice(from)
    .filter((mail) => mail.to.toLowerCase() === address.toLowerCase() && mail.subject === subject)

const acknowledgements = (address: string, from = 0) =>
  mailsTo(address, fill(t.received.subject), from)
const decisions = (address: string, from = 0) => mailsTo(address, fill(t.decided.subject), from)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Un nouveau projet public d'Inès, pour une nouvelle cible. */
const anotherProject = async (title: string) => {
  later()
  return ctx.webProject(ines, { title })
}

/** La file de modération, lue par l'administrateur. */
const queue = async () => {
  const res = await act.send('GET', '/v1/moderation/reports', louis)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { raw, page: ModerationQueuePage.parse(JSON.parse(raw)) }
}

const targetPath = (kind: string, id: string) =>
  `/v1/public/reports/target?${new URLSearchParams({ kind, id })}`

/** Ce que la feuille d'un visiteur lit de la cible. */
const readTarget = async (kind: string, id: string, ip?: string) => {
  const res = await ctx.visitor(targetPath(kind, id), {}, ip)
  expect(res.status, `${kind} ${id}`).toBe(200)
  return PublicReportTarget.parse(await res.json())
}

const EXPLANATION = 'Ce contenu ne respecte pas les règles de la communauté.'

describe('a visitor reports a public content', () => {
  it('records the report of a public project, a public update and a public page, with no member', async () => {
    const update = await world.publishUpdate(ines, project)
    later()
    await ctx.openPublicPage(ines)

    for (const target of [
      projectTarget(),
      { kind: 'update', id: update.id },
      { kind: 'member', id: inesId },
    ]) {
      const res = await report({ target, reason: 'scam_spam' })
      expect(res.status, target.kind).toBe(204)
      expect(await res.text(), target.kind).toBe('')
    }

    const rows = await storedReports()
    expect(rows.map((row) => [row.targetKind, row.targetId, row.reason])).toEqual([
      ['project', project, 'scam_spam'],
      ['update', update.id, 'scam_spam'],
      ['member', inesId, 'scam_spam'],
    ])
    for (const row of rows) {
      expect(row.reporterId).toBeNull()
      expect(row.reporterEmail).toBeNull()
      expect(row.status).toBe('open')
    }
    // Sans adresse, aucun e-mail ne part.
    expect(ctx.mailer.sent.filter((mail) => mail.subject === fill(t.received.subject))).toEqual([])
  })

  it('keeps the address given, without the spaces around it, and counts an empty one as none', async () => {
    const other = await anotherProject('Le second')
    expect((await reportProject(project, '  Voisine@Example.org  ')).status).toBe(204)
    expect((await reportProject(other, '   ')).status).toBe(204)

    const rows = await storedReports()
    expect(rows[0]?.reporterEmail?.toLowerCase()).toBe('voisine@example.org')
    expect(rows[1]?.reporterEmail).toBeNull()
    await expectError(await reportProject(project, 'pas-une-adresse'), 400, 'validation')
  })

  it('reports a part of a public project, and refuses an illegal content without an explanation', async () => {
    const part = await report({
      target: projectTarget(),
      part: { field: 'description' },
      reason: 'other',
      details: DETAILS,
    })
    expect(part.status).toBe(204)
    expect((await storedReports())[0]).toMatchObject({
      partField: 'description',
      details: DETAILS,
    })

    await expectError(
      await report({ target: projectTarget(), reason: 'illegal' }),
      400,
      'validation',
    )
    expect(await storedReports()).toHaveLength(1)
  })

  it('refuses a target a visitor cannot report: a comment, a hive, a call, a note', async () => {
    const comment = await act.comment(project, max, 'Bravo !')
    for (const target of [
      { kind: 'comment', id: comment.id },
      { kind: 'hive', id: UNKNOWN_ID },
      { kind: 'call', id: UNKNOWN_ID },
      { kind: 'note', id: UNKNOWN_ID },
    ]) {
      await expectError(await report({ target, reason: 'other' }), 400, 'validation')
    }
    expect(await storedReports()).toEqual([])
  })

  it('answers the same 404 as an unknown target for a closed page, a project for members and its update', async () => {
    later()
    const members = (await act.publish(ines, 'Entre membres', { visibility: 'public' })).id
    const membersUpdate = await world.publishUpdate(ines, members)
    const expected = await answerOf(await reportProject(UNKNOWN_ID))
    expect(expected.status).toBe(404)

    const cases: Body[] = [
      // Inès n'a pas ouvert sa page, même avec un projet public.
      { kind: 'member', id: inesId },
      { kind: 'project', id: members },
      { kind: 'update', id: membersUpdate.id },
      { kind: 'update', id: UNKNOWN_ID },
      { kind: 'member', id: 'inconnu' },
    ]
    for (const target of cases) {
      const got = await answerOf(await report({ target, reason: 'other' }))
      expect(got, JSON.stringify(target)).toEqual(expected)
    }
    expect(await storedReports()).toEqual([])
    // Témoin : le projet public, lui, se signale (sans lui, ce test passerait sans la route).
    expect((await reportProject(project)).status).toBe(204)
  })

  it('never ties a visitor report to the session sent with it', async () => {
    later()
    const res = await ctx.request('/v1/public/reports', {
      method: 'POST',
      headers: {
        cookie: max,
        'content-type': 'application/json',
        'x-real-ip': TEST_VISITOR_IP,
      },
      body: JSON.stringify({ target: projectTarget(), reason: 'other' }),
    })
    expect(res.status).toBe(204)
    expect((await storedReports()).map((row) => row.reporterId)).toEqual([null])
  })

  it('lists a visitor report in the same queue as the reports of members', async () => {
    later()
    await act.report(max, { kind: 'project', id: project }, 'scam_spam')
    expect((await reportProject(project, 'voisine@example.org')).status).toBe(204)

    const { page } = await queue()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ target: { kind: 'project', id: project }, count: 2 })
  })
})

describe('a repeated report (security B2, legal 1)', () => {
  it('answers a repeated visitor report with the same e-mail exactly like a first one, and sends no second e-mail', async () => {
    const address = 'voisine@example.org'
    const first = await answerOf(await reportProject(project, address))
    expect(first.status).toBe(204)

    // Le même signalement, la même adresse en majuscules, depuis un autre réseau.
    const again = await answerOf(await reportProject(project, 'VOISINE@example.org', '192.0.2.44'))
    expect(again).toEqual(first)
    expect(await openReports()).toHaveLength(1)
    expect(acknowledgements(address)).toHaveLength(1)

    // Avec l'adresse d'un membre : la même chose.
    const member = await answerOf(await reportProject(project, 'max@example.com'))
    const memberAgain = await answerOf(await reportProject(project, 'max@example.com'))
    expect(member).toEqual(first)
    expect(memberAgain).toEqual(first)
    expect(await openReports()).toHaveLength(2)
    expect(acknowledgements('max@example.com')).toHaveLength(1)
  })

  it('answers a visitor report on an already examined target like a new one', async () => {
    const address = 'voisine@example.org'
    const first = await answerOf(await reportProject(project, address))
    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'project', id: project } })

    // Le contenu n'a pas changé depuis l'examen : un membre recevrait 409 `already_examined`.
    const again = await answerOf(await reportProject(project, address))
    const fresh = await answerOf(await reportProject(await anotherProject('Tout neuf'), address))
    expect(again).toEqual(first)
    expect(again).toEqual(fresh)
  })

  it('answers the same whether the address belongs to a member, to nobody, or is absent', async () => {
    const second = await anotherProject('Le deuxième')
    const third = await anotherProject('Le troisième')
    const answers = [
      await answerOf(await reportProject(project, 'max@example.com')),
      await answerOf(await reportProject(second, 'personne@example.org')),
      await answerOf(await reportProject(third)),
    ]
    expect(answers[0]?.status).toBe(204)
    expect(answers[1]).toEqual(answers[0])
    expect(answers[2]).toEqual(answers[0])
  })
})

describe('the limit of reports from one network', () => {
  it('answers 5 visitor reports a day from one network, then visitor_report_quota', async () => {
    expect(VISITOR_REPORTS_PER_DAY).toBe(5)
    // Cinq adresses du même réseau /64 : un seul compteur.
    for (let i = 1; i <= VISITOR_REPORTS_PER_DAY; i++) {
      const res = await reportProject(project, undefined, `2001:db8:5:6::${i}`)
      expect(res.status, String(i)).toBe(204)
    }
    await expectError(
      await reportProject(project, undefined, '2001:db8:5:6::99'),
      429,
      'visitor_report_quota',
    )
    expect(await storedReports()).toHaveLength(VISITOR_REPORTS_PER_DAY)

    // Un autre réseau a son compteur ; un membre derrière la même adresse, le sien (20 par jour).
    expect((await reportProject(project, undefined, '2001:db8:5:7::1')).status).toBe(204)
    later()
    const member = await ctx.request('/v1/reports', {
      method: 'POST',
      headers: {
        cookie: max,
        'content-type': 'application/json',
        'x-real-ip': '2001:db8:5:6::1',
      },
      body: JSON.stringify({ target: projectTarget(), reason: 'other' }),
    })
    expect(member.status).toBe(201)

    // Un jour plus tard, le réseau signale de nouveau.
    vi.setSystemTime(Date.now() + DAY + 1000)
    expect((await reportProject(project, undefined, '2001:db8:5:6::1')).status).toBe(204)
  })

  it('counts even malformed requests', async () => {
    for (let i = 1; i < VISITOR_REPORTS_PER_DAY; i++) {
      expect((await reportProject(project)).status, String(i)).toBe(204)
    }
    // Le 5e, mal formé, compte aussi : le compteur passe avant la validation.
    await expectError(
      await report({ target: projectTarget('x'), reason: 'other' }),
      400,
      'validation',
    )

    await expectError(await reportProject(project), 429, 'visitor_report_quota')
    // Au-delà du plafond, même un corps illisible reçoit 429 : le corps n'est pas lu.
    later()
    const garbage = await ctx.visitor('/v1/public/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ pas du JSON',
    })
    await expectError(garbage, 429, 'visitor_report_quota')
    expect(await storedReports()).toHaveLength(VISITOR_REPORTS_PER_DAY - 1)
  })

  it('refuses a visitor report from another site before counting it', async () => {
    const forged = (contentType: string) => {
      later()
      return ctx.visitor('/v1/public/reports', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': contentType },
        body: JSON.stringify({ target: projectTarget(), reason: 'other' }),
      })
    }
    // Un formulaire d'un autre site (`text/plain` : pas de pré-vol du navigateur) et un envoi JSON.
    for (let i = 0; i < VISITOR_REPORTS_PER_DAY; i++) {
      await expectError(await forged('text/plain'), 403, 'forbidden')
      await expectError(await forged('application/json'), 403, 'forbidden')
    }
    expect(await storedReports()).toEqual([])

    // Aucun n'a compté : les 5 du jour restent à cette adresse.
    for (let i = 1; i <= VISITOR_REPORTS_PER_DAY; i++) {
      expect((await reportProject(project)).status, String(i)).toBe(204)
    }
  })

  it('tells the sheet how many reports are left today, without counting the read', async () => {
    for (let i = 0; i < 8; i++) {
      expect((await readTarget('project', project)).remainingToday).toBe(VISITOR_REPORTS_PER_DAY)
    }
    expect((await reportProject(project)).status).toBe(204)
    expect((await reportProject(project)).status).toBe(204)
    expect((await readTarget('project', project)).remainingToday).toBe(3)
    for (let i = 0; i < 3; i++) expect((await reportProject(project)).status).toBe(204)
    expect((await readTarget('project', project)).remainingToday).toBe(0)
    // Un autre réseau a encore les siens.
    expect((await readTarget('project', project, '192.0.2.80')).remainingToday).toBe(5)
  })
})

describe('the e-mails of a visitor', () => {
  /** Aucun texte d'un membre ni du visiteur, aucun domaine venu d'un membre. */
  const expectNoMemberText = (mail: { text: string; html: string; subject: string }) => {
    for (const words of MEMBER_WORDS) {
      expect(mail.text, words).not.toContain(words)
      expect(mail.html, words).not.toContain(words)
      expect(mail.subject, words).not.toContain(words)
    }
  }

  it('sends an acknowledgement to the address given, with no text of a member', async () => {
    const address = 'voisine@example.org'
    const before = ctx.mailer.sent.length
    const res = await report({
      target: projectTarget(),
      reason: 'illegal',
      details: DETAILS,
      email: address,
    })
    expect(res.status).toBe(204)

    const [ack, ...others] = acknowledgements(address)
    expect(others).toEqual([])
    expect(ack).toBeDefined()
    if (!ack) return
    expect(ack.text).toContain(fill(t.reasonWhy))
    expect(ack.text).toContain(fill(t.ignore))
    expectNoMemberText(ack)
    // Rien d'autre n'est parti : l'autrice n'est pas prévenue d'un signalement (comme en R9).
    expect(ctx.mailer.sent.slice(before).map((mail) => mail.to)).toEqual([address])
  })

  it('sends at most one acknowledgement a day to the same address, whatever the network', async () => {
    const address = 'victime@example.org'
    const targets = [
      project,
      await anotherProject('Le deuxième'),
      await anotherProject('Le troisième'),
    ]
    const networks = ['2001:db8:a:1::1', '2001:db8:b:1::1', '192.0.2.10']
    for (const [index, id] of targets.entries()) {
      expect((await reportProject(id, address, networks[index])).status).toBe(204)
    }
    // Trois signalements entrent, un seul accusé part.
    expect(await openReports()).toHaveLength(3)
    expect(acknowledgements(address)).toHaveLength(1)

    // Le lendemain, un nouvel accusé.
    vi.setSystemTime(Date.now() + DAY + 1000)
    const before = ctx.mailer.sent.length
    expect((await reportProject(await anotherProject('Le quatrième'), address)).status).toBe(204)
    expect(acknowledgements(address, before)).toHaveLength(1)
  })

  it('sends the decision once the moderation decides, with the contact address and no text of a member', async () => {
    const removedBy = 'retrait@example.org'
    const dismissedBy = 'classement@example.org'
    const other = await anotherProject('Un autre')
    expect(
      (
        await report({
          target: projectTarget(),
          reason: 'other',
          details: DETAILS,
          email: removedBy,
        })
      ).status,
    ).toBe(204)
    expect((await reportProject(other, dismissedBy)).status).toBe(204)
    // Aucune décision tant que rien n'est décidé.
    expect(decisions(removedBy)).toEqual([])

    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: project },
      ground: 'rules',
      explanation: EXPLANATION,
    })
    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'project', id: other } })

    const [removed, ...moreRemoved] = decisions(removedBy)
    const [dismissed, ...moreDismissed] = decisions(dismissedBy)
    expect([...moreRemoved, ...moreDismissed]).toEqual([])
    expect(removed?.text).toContain(fill(t.decided.outcome.project.removed))
    expect(dismissed?.text).toContain(fill(t.decided.outcome.project.dismissed))
    for (const mail of [removed, dismissed]) {
      expect(mail).toBeDefined()
      if (!mail) continue
      // Les recours (DSA, art. 16.5) : l'adresse de contact, puis la justice.
      expect(mail.text).toContain(contactEmail)
      expect(mail.text).toContain(fill(t.decided.contest))
      expectNoMemberText(mail)
      // L'explication de la modération est pour l'auteur, jamais pour le visiteur.
      expect(mail.text).not.toContain(EXPLANATION)
    }
    // Deux e-mails au plus par signalement : l'accusé et la décision.
    expect(ctx.mailer.sent.filter((mail) => mail.to === removedBy)).toHaveLength(2)
  })

  it('erases the address at every closing: removal, dismissal, or a target gone', async () => {
    const removedTarget = project
    const dismissedTarget = await anotherProject('Classé')
    const goneTarget = await anotherProject('Supprimé')
    expect((await reportProject(removedTarget, 'a@example.org')).status).toBe(204)
    expect((await reportProject(dismissedTarget, 'b@example.org')).status).toBe(204)
    expect((await reportProject(goneTarget, 'c@example.org')).status).toBe(204)
    expect((await storedReports()).map((row) => row.reporterEmail?.toLowerCase())).toEqual([
      'a@example.org',
      'b@example.org',
      'c@example.org',
    ])

    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: removedTarget },
      ground: 'rules',
      explanation: EXPLANATION,
    })
    later()
    await act.decide(louis, { action: 'dismiss', target: { kind: 'project', id: dismissedTarget } })
    // Inès supprime son projet : le signalement devient « sans objet » à la lecture de la file.
    later()
    expect((await act.send('DELETE', `/v1/projects/${goneTarget}`, ines)).status).toBe(204)
    await queue()

    const rows = await storedReports()
    expect(rows.map((row) => row.status)).toEqual(['removed', 'dismissed', 'void'])
    expect(rows.map((row) => row.reporterEmail)).toEqual([null, null, null])
  })

  it('erases the address even when the decision e-mail fails', async () => {
    expect((await reportProject(project, 'a@example.org')).status).toBe(204)
    const send = vi.spyOn(ctx.mailer, 'send').mockRejectedValue(new Error('Brevo is down'))
    try {
      later()
      const res = await act.send('POST', '/v1/moderation/decisions', louis, {
        action: 'dismiss',
        target: { kind: 'project', id: project },
      })
      expect(res.status).toBe(201)
    } finally {
      send.mockRestore()
    }
    expect((await storedReports()).map((row) => [row.status, row.reporterEmail])).toEqual([
      ['dismissed', null],
    ])
  })

  it('never names a visitor to the author whose content is removed', async () => {
    const before = ctx.mailer.sent.length
    expect((await reportProject(project, 'voisine@example.org')).status).toBe(204)
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: project },
      ground: 'rules',
      explanation: EXPLANATION,
    })

    const notifications = await (await act.send('GET', '/v1/notifications', ines)).text()
    const mails = ctx.mailer.sent.slice(before).filter((mail) => mail.to === 'ines@example.com')
    for (const text of [notifications, ...mails.map((mail) => `${mail.subject}\n${mail.text}`)]) {
      expect(text).not.toMatch(/visiteu|visitor|sans compte|without an account/i)
      expect(text).not.toContain('voisine@example.org')
    }
  })
})

describe('the moderation queue', () => {
  it('never shows a visitor reporter e-mail, nor whether there was one, in the moderation queue', async () => {
    // Deux projets pareils, publiés à la même heure : l'un signalé avec une adresse, l'autre sans.
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
    const withAddress = await ctx.webProject(ines, { title: 'Jumeau', pitch: 'Le même.' })
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
    const without = await ctx.webProject(ines, { title: 'Jumeau', pitch: 'Le même.' })
    vi.setSystemTime(new Date('2026-11-18T08:00:00.000Z'))
    expect((await reportProject(withAddress, 'secrete@example.org')).status).toBe(204)
    vi.setSystemTime(new Date('2026-11-18T08:00:00.000Z'))
    expect((await reportProject(without)).status).toBe(204)

    const { raw, page } = await queue()
    expect(raw).not.toContain('secrete')
    expect(raw).not.toMatch(/e-?mail/i)
    const byTarget = (id: string) => page.items.find((item) => item.target.id === id)
    const normalize = (id: string) =>
      JSON.stringify(byTarget(id))
        .replaceAll(id, '<project>')
        .replaceAll(/"[0-9a-f-]{36}"/g, '"<id>"')
    expect(byTarget(withAddress)).toBeDefined()
    expect(normalize(withAddress)).toBe(normalize(without))

    // Ni dans l'historique des décisions, ni dans les contenus retirés.
    later()
    await act.decide(louis, {
      action: 'remove',
      target: { kind: 'project', id: withAddress },
      ground: 'rules',
      explanation: EXPLANATION,
    })
    for (const path of ['/v1/moderation/decisions', '/v1/moderation/removed']) {
      const text = await (await act.send('GET', path, louis)).text()
      expect(text, path).not.toContain('secrete')
    }
  })
})

describe('the target of a visitor report (GET /v1/public/reports/target)', () => {
  it('shows a visitor the target of a report, without handle, author to block or « already reported »', async () => {
    const handle = (await act.me(ines)).handle
    const preview = await readTarget('project', project)

    expect(Object.keys(preview).sort()).toEqual(Object.keys(PublicReportTarget.shape).sort())
    expect(preview.target).toEqual({ kind: 'project', id: project })
    expect(preview.projectId).toBe(project)
    expect(preview.text).toContain(TITLE)
    expect(preview.head.authorName).toBe('Inès Morel')
    const raw = JSON.stringify(preview)
    expect(raw).not.toContain(handle)
    expect(raw).not.toContain(inesId)
    // Un membre connecté reçoit la même vue de visiteur : la session n'est pas lue.
    const signedIn = await ctx.request(targetPath('project', project), {
      headers: { cookie: max, 'x-real-ip': TEST_VISITOR_IP },
    })
    expect(signedIn.status).toBe(200)
    expect(PublicReportTarget.parse(await signedIn.json())).toEqual(preview)
  })

  it('lists the parts of a public project, a public update and a public page', async () => {
    const photo = await world.uploadVisual(ines, project)
    const pending = await world.uploadVisual(ines, project, 'update')
    const update = await world.publishUpdate(ines, project, [pending.id])
    later()
    await ctx.openPublicPage(ines)

    const ofProject = await readTarget('project', project)
    expect(ofProject.parts.map((part) => part.field)).toContain('photo')
    expect(ofProject.parts.find((part) => part.field === 'photo')?.mediaId).toBe(photo.id)

    const ofUpdate = await readTarget('update', update.id)
    expect(ofUpdate.projectId).toBe(project)
    expect(ofUpdate.parts.some((part) => part.mediaId === pending.id)).toBe(true)

    const ofMember = await readTarget('member', inesId)
    expect(ofMember.projectId).toBeNull()
    expect(ofMember.text).toContain('Inès Morel')
    expect(ofMember.parts.map((part) => part.field)).not.toContain('handle')
  })

  it('answers the same 404 as an unknown target for a closed page, a project for members and its update', async () => {
    later()
    const members = (await act.publish(ines, 'Entre membres', { visibility: 'public' })).id
    const membersUpdate = await world.publishUpdate(ines, members)
    const expected = await world.asVisitor(targetPath('project', UNKNOWN_ID))
    expect(expected.status).toBe(404)

    for (const [kind, id] of [
      ['member', inesId],
      ['project', members],
      ['update', membersUpdate.id],
      ['update', UNKNOWN_ID],
    ] as const) {
      expect(await world.asVisitor(targetPath(kind, id)), `${kind} ${id}`).toEqual(expected)
    }
    // Témoin : la page ouverte, elle se lit.
    later()
    await ctx.openPublicPage(ines)
    expect((await world.asVisitor(targetPath('member', inesId))).status).toBe(200)
  })
})
