// Tests d'intégration de la modération d'une ruche (R10) : la signaler, retirer son nom, le
// rétablir. Scénario : docs/scenarios/refonte.md, « R10 », « La modération » ; plan R10, « API »
// (BE-F2), « Ce qui change au plan », point 4 (au retrait, les copies `hive_notice.hive_name` de
// cette ruche sont vidées ; la décision vise celui qui a écrit le nom, `hive.name_set_by`, jur-C4).
//
// Une ruche se signale par un de ses membres ou par un invité (depuis sa page ou l'invitation) :
// pour tout autre, la même réponse 404 qu'une ruche inconnue. La modération voit son nom, son icône,
// son animateur et son nombre de membres, jamais son actualité ni ses projets réservés. Elle ne
// retire que le nom (REMOVABLE_PARTS.hive) : la ruche devient « Ruche sans nom » partout, lignes
// d'Activité d'avant comprises, et l'animateur est prévenu.
//
// Les ruches sont écrites en base (testing/hive-records.ts). Membres : Inès (anime « Famille Pivert »),
// Zoé (membre, qui a écrit le nom actuel), Max (invité), Malik (hors de la ruche, ancien membre selon
// le test), Louis (l'administrateur).
import { randomUUID } from 'node:crypto'
import {
  ErrorResponse,
  type ModerationQueueItem,
  ModerationQueuePage,
  MyHives,
  NotificationPage,
  type ReportTarget,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-records'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let zoe: string
let max: string
let malik: string
let louis: string
let inesId: string
let zoeId: string
let maxId: string
let malikId: string
let hiveId: string
let invitationId: string

const SECOND = 1000
const NAME = 'Famille Pivert'
const EXPLANATION = 'Ce nom vise une personne.'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès Haddad',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
  maxId = (await act.me(max)).id
  malikId = (await act.me(malik)).id
  await act.makeAdmin((await act.me(louis)).id)
  // Inès anime la ruche ; Zoé l'a renommée (c'est elle qui a écrit le nom actuel) ; Max est invité.
  hiveId = await hives.create({
    name: NAME,
    icon: 'leaf',
    animatorId: inesId,
    members: [{ id: zoeId }],
    nameSetBy: zoeId,
  })
  invitationId = await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const target = (): ReportTarget => ({ kind: 'hive', id: hiveId })
const reportBy = (cookie: string | null, body: object = {}) =>
  act.send('POST', '/v1/reports', cookie, { target: target(), reason: 'other', ...body })

/** Zoé signale le nom, puis Louis le retire. */
const removeName = async () => {
  later()
  expect((await reportBy(zoe, { part: { field: 'name' } })).status).toBe(201)
  later()
  return act.decide(louis, {
    action: 'remove',
    target: target(),
    part: { field: 'name' },
    ground: 'rules',
    explanation: EXPLANATION,
  })
}

const notificationsOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { items: NotificationPage.parse(JSON.parse(raw)).items, raw }
}
const myHives = async (cookie: string) => {
  const res = await act.send('GET', '/v1/hives', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { data: MyHives.parse(JSON.parse(raw)), raw }
}

describe('reporting a hive', () => {
  it('lets a member report the hive, whole or its name', async () => {
    expect((await reportBy(zoe)).status).toBe(201)
    later()
    expect((await reportBy(zoe, { part: { field: 'name' } })).status).toBe(201)
  })

  it('lets an invitee report the hive from the invitation', async () => {
    expect((await reportBy(max)).status).toBe(201)
  })

  it('answers the same 404 to a stranger, a former member and an invitee who refused, as for an unknown hive', async () => {
    const unknown = await act.send('POST', '/v1/reports', malik, {
      target: { kind: 'hive', id: randomUUID() },
      reason: 'other',
    })
    expect(unknown.status).toBe(404)
    const expected = await unknown.text()

    // Malik, hors de la ruche ; Max, après avoir refusé ; Zoé, après être partie.
    const stranger = await reportBy(malik)
    await ctx.db
      .update(schema.hiveInvitation)
      .set({ refusedAt: new Date() })
      .where(eq(schema.hiveInvitation.id, invitationId))
    const invitee = await reportBy(max)
    await ctx.db.delete(schema.hiveMember).where(eq(schema.hiveMember.userId, zoeId))
    const former = await reportBy(zoe)
    for (const res of [stranger, invitee, former]) {
      expect(res.status).toBe(404)
      expect(await res.text()).toBe(expected)
    }
    expect(ErrorResponse.parse(JSON.parse(expected)).error.code).toBe('not_found')
    // Sans session : 401 ; témoin, Inès, l'animatrice, le peut.
    expect((await reportBy(null)).status).toBe(401)
    expect((await reportBy(ines)).status).toBe(201)
  })

  it('shows the moderation the name, the icon, the animator and the number of members, never its projects', async () => {
    const carnet = await act.publish(zoe, 'Carnet secret de Zoé')
    await hives.reserve(carnet.id, hiveId)
    expect((await reportBy(zoe)).status).toBe(201)

    const res = await act.send('GET', '/v1/moderation/reports', louis)
    expect(res.status).toBe(200)
    const raw = await res.text()
    const items = ModerationQueuePage.parse(JSON.parse(raw)).items
    const item = items.find(
      (entry: ModerationQueueItem) => entry.target.kind === 'hive' && entry.target.id === hiveId,
    )
    expect(item).toBeDefined()
    expect(item?.hive).toEqual({
      icon: 'leaf',
      animatorName: 'Inès Haddad',
      memberCount: 2,
    })
    expect(item?.snapshot).toContainEqual({ field: 'name', value: NAME })
    expect(raw).not.toContain('Carnet secret')
    expect(raw).not.toContain(carnet.id)
  })
})

describe('removing the name of a hive', () => {
  it('records a hive name removal against the member who wrote that name', async () => {
    const decision = await removeName()

    const [row] = await ctx.db
      .select()
      .from(schema.moderationDecision)
      .where(eq(schema.moderationDecision.id, decision.id))
    // Zoé a écrit le nom, Inès anime : la décision vise Zoé, et garde l'ancien nom pour un
    // rétablissement.
    expect(row).toMatchObject({
      targetKind: 'hive',
      targetId: hiveId,
      action: 'remove',
      partField: 'name',
      targetMemberId: zoeId,
      previousValue: NAME,
    })
    const [report] = await ctx.db.select().from(schema.contentReport)
    expect(report?.targetAuthorId).toBe(zoeId)
  })

  it('calls the hive « sans nom » for its members and its invitees', async () => {
    await removeName()

    const hive = await hives.row(hiveId)
    expect(hive?.name).toBe('')
    expect(hive?.nameRemovalId).not.toBeNull()
    const zoeHives = await myHives(zoe)
    expect(zoeHives.data.hives).toEqual([expect.objectContaining({ id: hiveId, name: null })])
    const maxHives = await myHives(max)
    expect(maxHives.data.invitations).toEqual([
      expect.objectContaining({ hive: expect.objectContaining({ id: hiveId, name: null }) }),
    ])
    for (const raw of [zoeHives.raw, maxHives.raw]) expect(raw).not.toContain('Pivert')
  })

  it('tells the animator, with the ground and the explanation', async () => {
    await removeName()

    const { items } = await notificationsOf(ines)
    expect(items.filter((item) => item.kind === 'removed')).toEqual([
      expect.objectContaining({
        targetKind: 'hive',
        project: null,
        hive: expect.objectContaining({ id: hiveId, name: null }),
        part: { field: 'name', position: null },
        ground: 'rules',
        explanation: EXPLANATION,
        afterReport: true,
      }),
    ])
  })

  it('blanks the hive name in earlier notices when the moderation removes it', async () => {
    // Malik, retiré de la ruche avant le retrait du nom ; une trace d'une autre ruche, témoin.
    const before = await hives.notice({
      recipientId: malikId,
      kind: 'removed',
      hiveId,
      hiveName: NAME,
    })
    const otherHive = await hives.create({ name: 'Atelier', animatorId: malikId, members: [] })
    const other = await hives.notice({
      recipientId: zoeId,
      kind: 'animator',
      hiveId: otherHive,
      hiveName: 'Atelier',
    })

    await removeName()

    const notices = await ctx.db.select().from(schema.hiveNotice)
    expect(notices.find((n) => n.id === before)?.hiveName).toBe('')
    expect(notices.find((n) => n.id === other)?.hiveName).toBe('Atelier')
  })

  it('shows a removed hive name in no hive notice, past ones included', async () => {
    await hives.notice({ recipientId: malikId, kind: 'removed', hiveId, hiveName: NAME })
    await hives.join(hiveId, { id: (await act.me(louis)).id, invitedBy: inesId })

    await removeName()

    // L'ancien membre (sa trace d'avant), l'invité (son invitation), l'inviteur (« a rejoint »).
    const malikLines = await notificationsOf(malik)
    expect(malikLines.items.filter((i) => i.kind === 'hive_removed')).toEqual([
      expect.objectContaining({ hive: expect.objectContaining({ name: null }) }),
    ])
    const maxLines = await notificationsOf(max)
    expect(maxLines.items.filter((i) => i.kind === 'hive_invited')).toEqual([
      expect.objectContaining({ hive: expect.objectContaining({ id: hiveId, name: null }) }),
    ])
    const inesLines = await notificationsOf(ines)
    expect(inesLines.items.filter((i) => i.kind === 'hive_joined')).toEqual([
      expect.objectContaining({ hive: expect.objectContaining({ id: hiveId, name: null }) }),
    ])
    for (const { raw } of [malikLines, maxLines, inesLines]) expect(raw).not.toContain('Pivert')
  })
})

describe('restoring the name of a hive', () => {
  it('gives the hive its name back, and the animator learns it', async () => {
    await hives.notice({ recipientId: malikId, kind: 'removed', hiveId, hiveName: NAME })
    await removeName()
    later()

    await act.decide(louis, { action: 'restore', target: target(), part: { field: 'name' } })

    const hive = await hives.row(hiveId)
    expect(hive?.name).toBe(NAME)
    expect(hive?.nameRemovalId).toBeNull()
    expect((await myHives(zoe)).data.hives).toEqual([
      expect.objectContaining({ id: hiveId, name: NAME }),
    ])
    const { items } = await notificationsOf(ines)
    expect(items.filter((item) => item.kind === 'removed')).toEqual([])
    expect(items.filter((item) => item.kind === 'restored')).toEqual([
      expect.objectContaining({
        targetKind: 'hive',
        project: null,
        hive: expect.objectContaining({ id: hiveId, name: NAME }),
        part: { field: 'name', position: null },
        valueBack: true,
      }),
    ])
  })
})

// R10, relecture juridique (C2) : la décision vise celui qui a écrit le nom (`name_set_by`) ; sa
// motivation lui est due (article 17 du DSA), comme à l'animateur actuel, seul à pouvoir renommer.
// La ligne de l'animateur garde l'identifiant de la ruche (elle mène à ses réglages) ; celle de qui
// a écrit le nom sans animer n'en a pas (rien à y faire). Le nom retiré n'y revient jamais ; le nom
// actuel, seulement à un membre et une fois la ruche renommée.
describe('who learns that a hive name was removed', () => {
  const removedLines = async (cookie: string) => {
    const { items, raw } = await notificationsOf(cookie)
    return { lines: items.filter((item) => item.kind === 'removed'), raw }
  }

  it('tells the member who wrote a removed hive name why it was removed', async () => {
    await removeName()

    const zoeLines = await removedLines(zoe)
    expect(zoeLines.lines).toEqual([
      expect.objectContaining({
        targetKind: 'hive',
        project: null,
        hive: { id: null, name: null, icon: 'leaf' },
        part: { field: 'name', position: null },
        ground: 'rules',
        explanation: EXPLANATION,
        afterReport: true,
      }),
    ])
    expect(zoeLines.raw).not.toContain('Pivert')

    // Inès renomme la ruche : Zoé, membre, lit le nom actuel ; jamais celui qui a été retiré.
    later()
    const renamed = await act.send('PATCH', `/v1/hives/${hiveId}`, ines, { name: 'Les Mésanges' })
    expect(renamed.status).toBe(200)
    const afterRename = await removedLines(zoe)
    expect(afterRename.lines).toEqual([
      expect.objectContaining({ hive: { id: null, name: 'Les Mésanges', icon: 'leaf' } }),
    ])
    expect(afterRename.raw).not.toContain('Pivert')

    // Partie de la ruche, elle garde la motivation, sans le nom actuel.
    await ctx.db.delete(schema.hiveMember).where(eq(schema.hiveMember.userId, zoeId))
    const gone = await removedLines(zoe)
    expect(gone.lines).toEqual([
      expect.objectContaining({ hive: { id: null, name: null, icon: 'leaf' } }),
    ])
    expect(gone.raw).not.toContain('Mésanges')
    // Témoin : Max, invité, n'a rien écrit et ne reçoit rien.
    expect((await removedLines(max)).lines).toEqual([])
  })

  it('tells the current animator too, with a way to rename the hive', async () => {
    await removeName()
    // L'animation passe à Malik après la décision : c'est lui qui peut renommer.
    await hives.join(hiveId, { id: malikId })
    await ctx.db.update(schema.hive).set({ animatorId: malikId }).where(eq(schema.hive.id, hiveId))

    const expected = {
      targetKind: 'hive',
      hive: { id: hiveId, name: null, icon: 'leaf' },
      ground: 'rules',
      explanation: EXPLANATION,
    }
    expect((await removedLines(malik)).lines).toEqual([expect.objectContaining(expected)])
    // Inès n'anime plus ; Zoé garde sa ligne à elle, une seule.
    expect((await removedLines(ines)).lines).toEqual([])
    expect((await removedLines(zoe)).lines).toEqual([
      expect.objectContaining({ hive: { id: null, name: null, icon: 'leaf' } }),
    ])

    // Zoé anime à son tour : une seule ligne, celle qui permet de renommer.
    await ctx.db.update(schema.hive).set({ animatorId: zoeId }).where(eq(schema.hive.id, hiveId))
    expect((await removedLines(zoe)).lines).toEqual([expect.objectContaining(expected)])
  })

  it('tells the member who wrote the name that it is restored, and the animator, once each', async () => {
    await removeName()
    later()
    await act.decide(louis, { action: 'restore', target: target(), part: { field: 'name' } })

    for (const cookie of [zoe, ines]) {
      const { items } = await notificationsOf(cookie)
      expect(items.filter((item) => item.kind === 'removed')).toEqual([])
      expect(items.filter((item) => item.kind === 'restored')).toEqual([
        expect.objectContaining({
          targetKind: 'hive',
          hive: expect.objectContaining({ name: NAME, icon: 'leaf' }),
          valueBack: true,
        }),
      ])
    }
    // Témoin : Max, invité, ne reçoit rien.
    const maxItems = (await notificationsOf(max)).items
    expect(maxItems.filter((item) => item.kind === 'restored')).toEqual([])
  })
})
