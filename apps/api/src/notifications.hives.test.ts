// Tests d'intégration des lignes d'Activité des ruches (R10) et de leur purge de nuit. Scénario :
// docs/scenarios/refonte.md, « R10 », « Recevoir une invitation » et « Les notifications et le
// récap » ; plan R10, « Ce qui change au plan », point 4 (un ancien membre ne lit jamais le nom
// actuel ; « a rejoint » caché à un inviteur parti).
//
// Cinq lignes neuves, calculées par l'API :
// - `hive_invited` : une invitation reçue, depuis `hive_invitation` (ni refusée, ni acceptée, moins
//   de 30 jours) ;
// - `hive_joined` : « Max a rejoint Famille », à qui l'a invité seulement, depuis `hive_member`
//   (`invited_by`), caché à un inviteur parti et entre deux membres bloqués ;
// - `hive_removed`, `hive_animator`, `hive_deleted` : les traces gardées (`hive_notice`), avec la
//   copie du nom écrite au moment du geste.
// Une publication dans une ruche ne fait pas de ligne.
//
// Les routes qui créent les ruches et les invitations ne sont pas l'objet de ce fichier : la scène
// est écrite directement dans les tables (testing/hive-records.ts). Quatre membres : Inès (qui anime
// « Famille » et invite), Max (l'invité), Zoé (une autre personne de la ruche), Malik (hors de la
// ruche).
import {
  type HiveInvitedNotification,
  type HiveJoinedNotification,
  type Notification,
  NotificationPage,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { nightlyPurge } from './jobs/nightly-purge'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-records'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let max: string
let zoe: string
let malik: string
let inesId: string
let maxId: string
let zoeId: string
let malikId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès Haddad',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  inesId = (await act.me(ines)).id
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  malikId = (await act.me(malik)).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (une seconde par défaut : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Les notifications d'un membre, telles que l'écran Activité les lit. */
const notificationsOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  const text = await res.text()
  return { items: NotificationPage.parse(JSON.parse(text)).items, raw: text }
}

const hiveKinds = ['hive_invited', 'hive_joined', 'hive_removed', 'hive_animator', 'hive_deleted']
/** Ses seules lignes de ruches. */
const hiveLinesOf = async (cookie: string) =>
  (await notificationsOf(cookie)).items.filter((item) => hiveKinds.includes(item.kind))

const invitedOf = (items: Notification[]) =>
  items.filter(
    (item): item is z.infer<typeof HiveInvitedNotification> => item.kind === 'hive_invited',
  )
const joinedOf = (items: Notification[]) =>
  items.filter(
    (item): item is z.infer<typeof HiveJoinedNotification> => item.kind === 'hive_joined',
  )

/** « Famille », animée par Inès, avec Zoé ; rend son identifiant. */
const famille = () =>
  hives.create({
    name: 'Famille',
    icon: 'house-line',
    animatorId: inesId,
    members: [{ id: zoeId }],
  })

describe('an invitation in the Activity', () => {
  it('shows the invitee who invites them and into which hive', async () => {
    const hiveId = await famille()
    const invitationId = await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId })

    const lines = invitedOf(await hiveLinesOf(max))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      kind: 'hive_invited',
      at: START.toISOString().replace('08:00:00', '08:00:01'),
      invitation: { id: invitationId },
      hive: { id: hiveId, name: 'Famille', icon: 'house-line' },
      inviter: { id: inesId, name: 'Inès Haddad' },
    })
  })

  it('shows the invitation to the invitee only: never to the inviter, a member or a stranger', async () => {
    const hiveId = await famille()
    await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId })

    for (const cookie of [ines, zoe, malik]) {
      expect(invitedOf(await hiveLinesOf(cookie))).toEqual([])
    }
    // Témoin : Max, lui, la voit.
    expect(invitedOf(await hiveLinesOf(max))).toHaveLength(1)
  })

  it('hides an invitation once refused, accepted or older than 30 days', async () => {
    const hiveId = await famille()
    // Max a refusé (la ligne reste en base jusqu'à ses 30 jours, choix Q1) ; Malik a accepté (il est
    // entré, l'invitation est effacée) ; Zoé reçoit une invitation dans « Atelier », qui vieillit.
    await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId, refusedAt: new Date() })
    await hives.join(hiveId, { id: malikId, invitedBy: inesId })
    const otherHive = await hives.create({ name: 'Atelier', animatorId: malikId, members: [] })
    await hives.invite({ hiveId: otherHive, inviteeId: zoeId, inviterId: malikId })

    expect(invitedOf(await hiveLinesOf(max))).toEqual([])
    expect(invitedOf(await hiveLinesOf(malik))).toEqual([])
    // Témoin : l'invitation de Zoé, encore valable.
    expect(invitedOf(await hiveLinesOf(zoe))).toHaveLength(1)

    later(30 * DAY + MINUTE)
    const zoeAgain = await act.signInAgain({
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    expect(invitedOf(await hiveLinesOf(zoeAgain))).toEqual([])
  })
})

describe('"joined", to the inviter only', () => {
  it('tells the inviter that the member they invited joined the hive, and no one else', async () => {
    const hiveId = await famille()
    later()
    await hives.join(hiveId, { id: maxId, invitedBy: inesId })

    const lines = joinedOf(await hiveLinesOf(ines))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      kind: 'hive_joined',
      hive: { id: hiveId, name: 'Famille', icon: 'house-line' },
      member: { id: maxId, name: 'Max' },
    })
    // Ni Zoé (une autre personne de la ruche), ni Max lui-même, ni Malik (hors de la ruche).
    for (const cookie of [zoe, max, malik]) {
      expect(joinedOf(await hiveLinesOf(cookie))).toEqual([])
    }
  })

  it('hides "joined" from an inviter who is no longer in the hive', async () => {
    const hiveId = await famille()
    await hives.join(hiveId, { id: malikId })
    later()
    await hives.join(hiveId, { id: maxId, invitedBy: zoeId })
    // Témoin : Zoé, qui a invité Max, lit « Max a rejoint Famille » tant qu'elle est dans la ruche.
    expect(joinedOf(await hiveLinesOf(zoe))).toHaveLength(1)

    // Zoé quitte la ruche (en base : la route du départ est testée ailleurs).
    await ctx.db.delete(schema.hiveMember).where(eq(schema.hiveMember.userId, zoeId))
    await ctx.db
      .update(schema.hive)
      .set({ name: 'Cousins Zébulon' })
      .where(eq(schema.hive.id, hiveId))

    const { items, raw } = await notificationsOf(zoe)
    expect(joinedOf(items)).toEqual([])
    // Un ancien membre ne lit jamais le nom actuel de la ruche.
    expect(raw).not.toContain('Zébulon')
  })

  it('hides "joined" when the inviter and the member blocked each other, either way', async () => {
    const hiveId = await famille()
    later()
    await hives.join(hiveId, { id: maxId, invitedBy: inesId })
    expect(joinedOf(await hiveLinesOf(ines))).toHaveLength(1) // témoin

    await act.block(maxId, ines)
    expect(joinedOf(await hiveLinesOf(ines))).toEqual([])
    await act.unblock(maxId, ines)
    expect(joinedOf(await hiveLinesOf(ines))).toHaveLength(1)
    await act.block(inesId, max)
    expect(joinedOf(await hiveLinesOf(ines))).toEqual([])
  })
})

describe('the three kept notices', () => {
  it('shows a removal, an animation handed over and a deleted hive, with the copy of the name', async () => {
    const hiveId = await famille()
    await hives.notice({ recipientId: maxId, kind: 'removed', hiveId, hiveName: 'Famille' })
    later()
    await hives.notice({ recipientId: maxId, kind: 'animator', hiveId, hiveName: 'Famille' })
    later()
    // Une ruche supprimée : sa trace n'a plus de ruche (`on delete set null`).
    await hives.notice({ recipientId: maxId, kind: 'deleted', hiveId: null, hiveName: 'Atelier' })

    const lines = await hiveLinesOf(max)

    expect(lines.map((line) => line.kind)).toEqual([
      'hive_deleted',
      'hive_animator',
      'hive_removed',
    ])
    expect(lines[0]).toMatchObject({ hive: { id: null, name: 'Atelier', icon: null } })
    expect(lines[1]).toMatchObject({ hive: { id: hiveId, name: 'Famille', icon: 'house-line' } })
    expect(lines[2]).toMatchObject({ hive: { id: hiveId, name: 'Famille', icon: 'house-line' } })
  })

  it('never shows a former member the current name of the hive, only the copy kept with the line', async () => {
    const hiveId = await famille()
    await hives.notice({ recipientId: maxId, kind: 'removed', hiveId, hiveName: 'Famille' })
    later()
    await ctx.db
      .update(schema.hive)
      .set({ name: 'Cousins Zébulon' })
      .where(eq(schema.hive.id, hiveId))

    const { items, raw } = await notificationsOf(max)

    expect(items.filter((item) => item.kind === 'hive_removed')).toEqual([
      expect.objectContaining({ hive: expect.objectContaining({ name: 'Famille' }) }),
    ])
    expect(raw).not.toContain('Zébulon')
  })

  it('shows the notices of a member to that member only', async () => {
    const hiveId = await famille()
    await hives.notice({ recipientId: maxId, kind: 'removed', hiveId, hiveName: 'Famille' })
    await hives.notice({ recipientId: maxId, kind: 'deleted', hiveId: null, hiveName: 'Atelier' })

    for (const cookie of [ines, zoe, malik]) {
      expect(await hiveLinesOf(cookie)).toEqual([])
    }
    expect(await hiveLinesOf(max)).toHaveLength(2) // témoin
  })

  it('makes no line for a project published in a hive', async () => {
    const hiveId = await famille()
    const carnet = await act.publish(zoe, 'Carnet de Mamie')
    await hives.reserve(carnet.id, hiveId)
    // Témoin : une invitation d'Inès dans une autre ruche, elle, fait une ligne.
    const atelier = await hives.create({ name: 'Atelier', animatorId: malikId, members: [] })
    await hives.invite({ hiveId: atelier, inviteeId: inesId, inviterId: malikId })

    const { items, raw } = await notificationsOf(ines)

    expect(items.filter((item) => hiveKinds.includes(item.kind)).map((item) => item.kind)).toEqual([
      'hive_invited',
    ])
    expect(raw).not.toContain(carnet.id)
  })
})

describe('the nightly purge', () => {
  it('erases hive invitations older than 30 days at the nightly purge', async () => {
    const hiveId = await famille()
    const old = await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId })
    const refused = await hives.invite({
      hiveId,
      inviteeId: malikId,
      inviterId: inesId,
      refusedAt: new Date(),
    })
    later(10 * DAY)
    const recent = await hives.invite({
      hiveId: await famille(),
      inviteeId: maxId,
      inviterId: zoeId,
    })
    const ids = async () =>
      (await ctx.db.select({ id: schema.hiveInvitation.id }).from(schema.hiveInvitation))
        .map((row) => row.id)
        .sort()

    // Une minute avant leurs 30 jours, les deux premières restent.
    await nightlyPurge(ctx.db, new Date(START.getTime() + 30 * DAY - MINUTE), ctx.storage)
    expect(await ids()).toEqual([old, refused, recent].sort())

    // Une minute après, elles partent, la refusée comprise ; la récente reste.
    await nightlyPurge(ctx.db, new Date(START.getTime() + 30 * DAY + 2 * MINUTE), ctx.storage)
    expect(await ids()).toEqual([recent])
  })

  it('erases hive notices older than 90 days at the nightly purge', async () => {
    const hiveId = await famille()
    const old = await hives.notice({
      recipientId: maxId,
      kind: 'removed',
      hiveId,
      hiveName: 'Famille',
    })
    later(DAY)
    const recent = await hives.notice({
      recipientId: zoeId,
      kind: 'animator',
      hiveId,
      hiveName: 'Famille',
    })
    const ids = async () =>
      (await ctx.db.select({ id: schema.hiveNotice.id }).from(schema.hiveNotice))
        .map((row) => row.id)
        .sort()

    await nightlyPurge(ctx.db, new Date(START.getTime() + 90 * DAY - MINUTE), ctx.storage)
    expect(await ids()).toEqual([old, recent].sort())

    await nightlyPurge(ctx.db, new Date(START.getTime() + 90 * DAY + 2 * MINUTE), ctx.storage)
    expect(await ids()).toEqual([recent])
  })
})
