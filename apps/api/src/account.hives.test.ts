// Tests d'intégration des ruches dans l'export des données et dans la suppression du compte (R10).
// Scénario : docs/scenarios/refonte.md, « R10 », « Mes données et la suppression du compte » ; plan
// R10, « API » (BE-F1), « Ce qui change au plan », points 8 (`inviter_id` et `pinned_by` deviennent
// nuls) et 10 (`seen_at` par ruche dans l'export).
//
// L'export (GET /v1/me/export, `hives`) : ses ruches (nom, rôle, entrée, dernière visite), les
// invitations reçues (refusées comprises) et envoyées (le pseudo actuel de l'invité, jamais son nom) ;
// « Ne pas me proposer aux autres » dans `user.hideFromSuggestions`.
//
// Supprimer son compte le retire de ses ruches ; s'il animait, l'animation passe au membre le plus
// ancien ; s'il était le dernier, la ruche est supprimée (ses projets réservés partent avec le
// compte). Ce qu'il laisse chez les autres reste lisible : une invitation sans inviteur, une épingle
// sans « épinglé par ».
//
// Les ruches sont écrites en base (testing/hive-records.ts). Membres : Inès (qui anime et invite), Zoé
// et Malik (dans ses ruches), Max Lebrun (l'invité), Sam (qui anime une ruche où Inès n'est pas).
import { AccountExport, HivePage, MyHives, NotificationPage } from '@ruche/contracts'
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
let malik: string
let max: string
let sam: string
let inesId: string
let zoeId: string
let malikId: string
let maxId: string
let maxHandle: string
let samId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')
const inesAccount = {
  name: 'Inès Haddad',
  email: 'ines@example.com',
  password: 'ines-long-password',
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé Pivert',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  max = await ctx.verifiedMember({
    name: 'Max Lebrun',
    email: 'max@example.com',
    password: 'max-long-password',
  })
  sam = await ctx.verifiedMember({
    name: 'Sam',
    email: 'sam@example.com',
    password: 'sam-long-password',
  })
  inesId = (await act.me(ines)).id
  zoeId = (await act.me(zoe)).id
  malikId = (await act.me(malik)).id
  const maxMe = await act.me(max)
  maxId = maxMe.id
  maxHandle = maxMe.handle
  samId = (await act.me(sam)).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)
const at = (ms: number) => new Date(START.getTime() + ms)

const exportOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/me/export', cookie)
  expect(res.status).toBe(200)
  const raw = await res.text()
  return { data: AccountExport.parse(JSON.parse(raw)), raw }
}

const deleteInes = () => act.deleteAccount(ines, inesAccount.password)

describe('the hives in my data export', () => {
  it('exports my hives with my role and my entry date', async () => {
    const famille = await hives.create({
      name: 'Famille',
      animatorId: inesId,
      members: [{ id: inesId, joinedAt: at(SECOND) }, { id: zoeId }],
    })
    const atelier = await hives.create({
      name: 'Atelier',
      animatorId: samId,
      members: [{ id: inesId, invitedBy: samId, joinedAt: at(DAY), seenAt: at(2 * DAY) }],
    })
    // Une ruche où Inès n'est pas : rien d'elle dans son export.
    await hives.create({ name: 'Secret Pivert', animatorId: zoeId, members: [] })

    const { data, raw } = await exportOf(ines)

    const byId = (id: string) => data.hives.hives.find((hive) => hive.id === id)
    expect(data.hives.hives).toHaveLength(2)
    expect(byId(famille)).toEqual({
      id: famille,
      name: 'Famille',
      role: 'animator',
      joinedAt: at(SECOND).toISOString(),
      seenAt: null,
    })
    expect(byId(atelier)).toEqual({
      id: atelier,
      name: 'Atelier',
      role: 'member',
      joinedAt: at(DAY).toISOString(),
      seenAt: at(2 * DAY).toISOString(),
    })
    expect(raw).not.toContain('Secret Pivert')
    // Les autres membres de ses ruches ne sont pas ses données.
    expect(raw).not.toContain('Zoé Pivert')
  })

  it('exports when the member last opened each hive', async () => {
    const famille = await hives.create({ name: 'Famille', animatorId: inesId, members: [] })
    later(DAY)
    const openedAt = new Date()
    // Ouvrir la page de la ruche note sa dernière visite (choix 4 du scénario).
    expect((await act.send('GET', `/v1/hives/${famille}`, ines)).status).toBe(200)

    const { data } = await exportOf(ines)

    expect(data.hives.hives).toEqual([
      expect.objectContaining({ id: famille, seenAt: openedAt.toISOString() }),
    ])
  })

  it('exports the invitations I received, refused ones included, and those I sent, with the invitee handle only', async () => {
    const famille = await hives.create({ name: 'Famille', animatorId: inesId, members: [] })
    const sent = at(2 * SECOND)
    later()
    await hives.invite({ hiveId: famille, inviteeId: maxId, inviterId: inesId, createdAt: sent })
    const atelier = await hives.create({ name: 'Atelier', animatorId: samId, members: [] })
    const cousins = await hives.create({ name: 'Cousins', animatorId: malikId, members: [] })
    const received = at(3 * SECOND)
    const refusedAt = at(4 * SECOND)
    await hives.invite({
      hiveId: atelier,
      inviteeId: inesId,
      inviterId: samId,
      createdAt: received,
    })
    await hives.invite({
      hiveId: cousins,
      inviteeId: inesId,
      inviterId: malikId,
      createdAt: received,
      refusedAt,
    })

    const { data, raw } = await exportOf(ines)

    expect(data.hives.invitationsSent).toEqual([
      { hiveId: famille, inviteeHandle: maxHandle, at: sent.toISOString() },
    ])
    expect(
      [...data.hives.invitationsReceived].sort(
        (a, b) => a.hiveName?.localeCompare(b.hiveName ?? '') ?? 0,
      ),
    ).toEqual([
      { hiveId: atelier, hiveName: 'Atelier', at: received.toISOString(), refusedAt: null },
      {
        hiveId: cousins,
        hiveName: 'Cousins',
        at: received.toISOString(),
        refusedAt: refusedAt.toISOString(),
      },
    ])
    // Le pseudo de l'invité, jamais son nom.
    expect(raw).not.toContain('Max Lebrun')
    // Témoin : l'invitation reçue par Max est dans son export à lui, pas dans celui de Zoé.
    expect((await exportOf(max)).data.hives.invitationsReceived).toHaveLength(1)
    expect((await exportOf(zoe)).data.hives).toEqual({
      hives: [],
      invitationsReceived: [],
      invitationsSent: [],
    })
  })

  it('exports my choice not to be suggested', async () => {
    expect((await exportOf(ines)).data.user.hideFromSuggestions).toBe(false)

    const res = await act.send('PATCH', '/v1/me', ines, { hideFromSuggestions: true })
    expect(res.status).toBe(200)

    expect((await exportOf(ines)).data.user.hideFromSuggestions).toBe(true)
    // Le réglage d'Inès n'est pas celui de Zoé.
    expect((await exportOf(zoe)).data.user.hideFromSuggestions).toBe(false)
  })
})

describe('deleting my account and my hives', () => {
  it('passes the animation to the oldest member when the animator deletes their account', async () => {
    const famille = await hives.create({
      name: 'Famille',
      animatorId: inesId,
      members: [
        { id: inesId, joinedAt: at(0) },
        { id: malikId, joinedAt: at(2 * DAY) },
        { id: zoeId, joinedAt: at(DAY) },
      ],
    })
    later(3 * DAY)

    await deleteInes()

    const row = await hives.row(famille)
    expect(row?.animatorId).toBe(zoeId)
    expect((await hives.members(famille)).map((m) => m.userId).sort()).toEqual(
      [zoeId, malikId].sort(),
    )
  })

  it('deletes a hive whose last member deletes their account, with its invitations', async () => {
    const famille = await hives.create({ name: 'Famille', animatorId: inesId, members: [] })
    await hives.invite({ hiveId: famille, inviteeId: maxId, inviterId: inesId })
    // Son projet réservé à la ruche part avec son compte, avant la ruche.
    const carnet = await act.publish(ines, 'Carnet')
    await hives.reserve(carnet.id, famille)

    await deleteInes()

    expect(await hives.row(famille)).toBeNull()
    expect(
      await ctx.db
        .select()
        .from(schema.hiveInvitation)
        .where(eq(schema.hiveInvitation.hiveId, famille)),
    ).toEqual([])
    expect(
      await ctx.db.select().from(schema.project).where(eq(schema.project.id, carnet.id)),
    ).toEqual([])
  })

  it('leaves a hive the member was in without animating it, its animator unchanged', async () => {
    const atelier = await hives.create({
      name: 'Atelier',
      animatorId: samId,
      members: [{ id: inesId }, { id: zoeId }],
    })
    expect(await hives.members(atelier)).toHaveLength(3) // témoin : Inès en est

    await deleteInes()

    expect((await hives.row(atelier))?.animatorId).toBe(samId)
    expect((await hives.members(atelier)).map((m) => m.userId).sort()).toEqual(
      [samId, zoeId].sort(),
    )
  })

  it('keeps the invitee hives tab readable after the inviter deletes their account', async () => {
    const famille = await hives.create({
      name: 'Famille',
      animatorId: inesId,
      members: [
        { id: inesId, joinedAt: at(0) },
        { id: zoeId, joinedAt: at(SECOND) },
      ],
    })
    const invitationId = await hives.invite({
      hiveId: famille,
      inviteeId: maxId,
      inviterId: inesId,
    })
    later()

    await deleteInes()

    const res = await act.send('GET', '/v1/hives', max)
    expect(res.status).toBe(200)
    const mine = MyHives.parse(await res.json())
    expect(mine.invitations).toEqual([
      expect.objectContaining({
        id: invitationId,
        inviter: null,
        hive: expect.objectContaining({
          id: famille,
          name: 'Famille',
          memberCount: 1,
          animatorName: 'Zoé Pivert',
        }),
      }),
    ])
    // Sa ligne d'Activité reste aussi, sans inviteur.
    const page = await act.send('GET', '/v1/notifications', max)
    expect(page.status).toBe(200)
    const lines = NotificationPage.parse(await page.json()).items
    expect(lines.filter((line) => line.kind === 'hive_invited')).toEqual([
      expect.objectContaining({ inviter: null, hive: expect.objectContaining({ id: famille }) }),
    ])
  })

  it('keeps the hive page readable after the member who pinned deletes their account', async () => {
    const famille = await hives.create({
      name: 'Famille',
      animatorId: inesId,
      members: [
        { id: inesId, joinedAt: at(0) },
        { id: zoeId, joinedAt: at(SECOND) },
      ],
    })
    // Le projet « Membres » de Zoé, épinglé par Inès.
    const potager = await act.publish(zoe, 'Potager')
    await hives.pin(famille, potager.id, inesId)
    later()

    await deleteInes()

    const res = await act.send('GET', `/v1/hives/${famille}`, zoe)
    expect(res.status).toBe(200)
    const page = HivePage.parse(await res.json())
    expect(page.pinned).toMatchObject({ id: potager.id, title: 'Potager', pinnedBy: null })
    expect(page.summary).toMatchObject({ memberCount: 1, role: 'animator' })
  })

  it('forgets who pinned a project when that member deletes their account', async () => {
    const famille = await hives.create({
      name: 'Famille',
      animatorId: inesId,
      members: [
        { id: inesId, joinedAt: at(0) },
        { id: zoeId, joinedAt: at(SECOND) },
      ],
    })
    const potager = await act.publish(zoe, 'Potager')
    await hives.pin(famille, potager.id, inesId)
    later()

    await deleteInes()

    const row = await hives.row(famille)
    expect(row?.pinnedBy).toBeNull()
    // L'épingle reste : seul son auteur est oublié.
    expect(row?.pinnedProjectId).toBe(potager.id)
    const res = await act.send('GET', `/v1/hives/${famille}`, zoe)
    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(raw).not.toContain(inesId)
    expect(raw).not.toContain('Inès Haddad')
  })
})
