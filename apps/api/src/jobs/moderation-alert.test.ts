// Tests de l'e-mail d'alerte aux administrateurs (tranche 7a). Plan 7a, « Tâche et e-mail », et
// règle 15 de la relecture du plan (22/10/2026).
//
// La tâche, moderationAlert({ db, mailer, appUrl, apiUrl, secret }, now), passe toutes les
// 10 minutes. S'il y a des signalements ouverts créés après le dernier e-mail, et que celui-ci date
// d'au moins une heure, chaque administrateur en fonction reçoit un e-mail : le nombre de
// signalements en attente et un lien vers « Modération », rien de plus (précision 5 : aucun
// extrait ne part chez l'envoyeur d'e-mails). La date d'envoi est notée avant l'envoi, comme dans
// mention-emails.ts : deux passages n'envoient qu'un e-mail.
//
// Les signalements sont écrits directement en base : ces tests ne vérifient que la tâche (la route
// POST /v1/reports est testée dans reports.test.ts). Les administrateurs aussi, comme le fait le
// script infra/grant-admin.sh. Les dates viennent du paramètre `now`, jamais de now() en SQL : la
// fausse horloge part d'une date loin d'aujourd'hui.
import { randomUUID } from 'node:crypto'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mailer } from '../email/mailer'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { moderationAlert } from './moderation-alert'

let ctx: TestContext
let act: ReturnType<typeof activity>
let louisId: string // l'administrateur, en français
let annId: string // une administratrice, en anglais
let maxId: string // un membre, qui signale

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')

const louisAccount = { name: 'Louis', email: 'louis@example.com', password: 'louis-long-password' }
const annAccount = {
  name: 'Ann',
  email: 'ann@example.com',
  password: 'ann-long-password',
  language: 'en',
}
const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email
const subjects = [fill(fr.moderationAlert.subject), fill(en.moderationAlert.subject)]
const MODERATION_URL = new URL('/moderation', TEST_APP_URL).toString()

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  louisId = (await act.me(await ctx.verifiedMember(louisAccount))).id
  annId = (await act.me(await ctx.verifiedMember(annAccount))).id
  maxId = (await act.me(await ctx.verifiedMember(maxAccount))).id
  await act.makeAdmin(louisId)
  await act.makeAdmin(annId)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const at = (offset: number) => new Date(START.getTime() + offset)

const depsWith = (mailer: Mailer = ctx.mailer) => ({
  db: ctx.db,
  mailer,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})

/** Lance la tâche à l'heure donnée (comme pg-boss, toutes les 10 minutes). */
const runAt = (now: Date, mailer?: Mailer) => moderationAlert(depsWith(mailer), now)

/** Un signalement de Max, créé à `createdAt`, dans l'état voulu. */
const insertReport = (createdAt: Date, status = 'open', snapshot = 'Un texte très secret') =>
  ctx.db.insert(schema.contentReport).values({
    id: randomUUID(),
    reporterId: maxId,
    targetKind: 'project',
    targetId: randomUUID(),
    projectId: null,
    targetAuthorId: null,
    reason: 'harassment',
    details: 'Une précision de Max',
    snapshot,
    status,
    createdAt,
  })

/** Les e-mails d'alerte reçus par une adresse, dans l'ordre d'envoi. */
const alertsTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && subjects.includes(email.subject))

describe('the moderation alert', () => {
  it('sends nothing when no report is open', async () => {
    await insertReport(at(MINUTE), 'dismissed')

    await runAt(at(10 * MINUTE))

    expect(alertsTo(louisAccount.email)).toEqual([])
    expect(alertsTo(annAccount.email)).toEqual([])
    // Témoin : un signalement ouvert, au passage suivant, fait partir l'alerte.
    await insertReport(at(15 * MINUTE))
    await runAt(at(20 * MINUTE))
    expect(alertsTo(louisAccount.email)).toHaveLength(1)
  })

  it('emails each administrator, in her language, the number pending and a link, nothing more', async () => {
    await insertReport(at(MINUTE))
    await insertReport(at(2 * MINUTE))
    await insertReport(at(3 * MINUTE), 'dismissed')

    const result = await runAt(at(10 * MINUTE))

    expect(result).toMatchObject({ sent: 2, failed: 0 })
    const [french] = alertsTo(louisAccount.email)
    expect(alertsTo(louisAccount.email)).toHaveLength(1)
    expect(french?.subject).toBe(fill(fr.moderationAlert.subject))
    expect(french?.text).toContain(fill(fr.moderationAlert.body_other, { count: '2' }))
    expect(french?.text).toContain(MODERATION_URL)
    const [english] = alertsTo(annAccount.email)
    expect(english?.subject).toBe(fill(en.moderationAlert.subject))
    expect(english?.text).toContain(fill(en.moderationAlert.body_other, { count: '2' }))
    // Aucun extrait, aucune précision, personne de nommé.
    for (const email of [french, english]) {
      for (const leak of ['Un texte très secret', 'Une précision de Max', 'Max', maxId]) {
        expect(`${email?.subject}${email?.text}${email?.html}`, leak).not.toContain(leak)
      }
    }
    // Un membre qui n'est pas administrateur ne reçoit rien.
    expect(alertsTo(maxAccount.email)).toEqual([])
  })

  it('sends at most one e-mail an hour', async () => {
    await insertReport(at(MINUTE))
    await runAt(at(10 * MINUTE))
    await insertReport(at(15 * MINUTE))

    await runAt(at(20 * MINUTE))
    await runAt(at(10 * MINUTE + HOUR - MINUTE))
    expect(alertsTo(louisAccount.email)).toHaveLength(1)

    await runAt(at(10 * MINUTE + HOUR))
    const sent = alertsTo(louisAccount.email)
    expect(sent).toHaveLength(2)
    expect(sent[1]?.text).toContain(fill(fr.moderationAlert.body_other, { count: '2' }))
  })

  it('sends nothing when no report arrived since the last e-mail', async () => {
    await insertReport(at(MINUTE))
    await runAt(at(10 * MINUTE))

    await runAt(at(3 * HOUR))
    await runAt(at(30 * HOUR))

    expect(alertsTo(louisAccount.email)).toHaveLength(1)
  })

  it('leaves a report dated after `now` for the next pass', async () => {
    await insertReport(at(11 * MINUTE))

    await runAt(at(10 * MINUTE))
    expect(alertsTo(louisAccount.email)).toEqual([])

    await runAt(at(20 * MINUTE))
    expect(alertsTo(louisAccount.email)).toHaveLength(1)
  })

  it('counts the hour the same way, whatever the time zone of the database', async () => {
    await ctx.db.execute(sql`set time zone 'Europe/Paris'`)
    await insertReport(at(MINUTE))
    await runAt(at(10 * MINUTE))
    await insertReport(at(20 * MINUTE))

    await runAt(at(30 * MINUTE))
    expect(alertsTo(louisAccount.email)).toHaveLength(1)
    await runAt(at(10 * MINUTE + HOUR))
    expect(alertsTo(louisAccount.email)).toHaveLength(2)
  })

  it('sends nothing to a revoked administrator, nor to an unverified address', async () => {
    await act.revokeAdmin(annId)
    await ctx.db
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.id, louisId))
    await insertReport(at(MINUTE))

    // Témoin : Max, administrateur en fonction à l'adresse vérifiée, la reçoit.
    await act.makeAdmin(maxId)

    await runAt(at(10 * MINUTE))

    expect(alertsTo(annAccount.email)).toEqual([])
    expect(alertsTo(louisAccount.email)).toEqual([])
    expect(alertsTo(maxAccount.email)).toHaveLength(1)
  })

  it('notes the date before sending: a failed sending is not retried at the next pass', async () => {
    const refused: string[] = []
    const failing: Mailer = {
      send: async (email) => {
        refused.push(email.to)
        throw new Error('refused')
      },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await insertReport(at(MINUTE))

    const result = await runAt(at(10 * MINUTE), failing)
    await runAt(at(20 * MINUTE), failing)

    expect(result).toMatchObject({ sent: 0, failed: 2 })
    expect(refused.sort()).toEqual([annAccount.email, louisAccount.email])
    const [row] = await ctx.db
      .select({ alertedAt: schema.adminMember.alertedAt })
      .from(schema.adminMember)
      .where(eq(schema.adminMember.userId, louisId))
    expect(row?.alertedAt).toEqual(at(10 * MINUTE))
  })

  // PGlite n'a qu'une connexion : les deux passages s'y suivent. Ce test vérifie que le second
  // relit la date notée par le premier, pas la course elle-même.
  it('sends one e-mail for two passes at the same time', async () => {
    await insertReport(at(MINUTE))

    await Promise.all([runAt(at(10 * MINUTE)), runAt(at(10 * MINUTE))])

    expect(alertsTo(louisAccount.email)).toHaveLength(1)
    expect(alertsTo(annAccount.email)).toHaveLength(1)
  })
})
