// Tests d'intégration de R10 : les blocages dans les ruches. Deux membres d'une même ruche qui se
// bloquent restent membres tous les deux, mais ne voient plus rien l'un de l'autre (membres, pile de
// photos, « animée par », épingle) ; on n'invite pas un membre qu'on a bloqué ou qui nous a bloqué
// (le même 404 que pour un membre qui n'existe pas), et bloquer efface les invitations en attente
// entre les deux, dans les deux sens. Sauf pour l'animateur : un membre qui l'a bloqué reste dans sa
// liste, réduit à son nom (ni photo, ni pseudo, ni lien), et l'animateur peut le retirer : un blocage
// ne lui retire jamais le pouvoir de modérer sa ruche. Scénario : docs/scenarios/refonte.md, « R10 »,
// « Les blocages », « Les limites » ; choix de Louis du 14/11/2026 (Q3) ; relecture du plan, point 8.
//
// Les ruches et les invitations sont préparées en base (testing/hive-seeds.ts) ; les blocages
// passent par l'API (PUT /v1/members/{id}/block), comme dans l'appli.
//
// Cinq membres : Papi Jean (animateur de Famille), Léa, Tante Odile (photo et pseudo) et Max, membres
// de Famille, et Nora, hors de la ruche.
import { ErrorResponse, HiveMembers, HivePage, MyHives } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRow, invitationRow, isMemberOf, seedHive, seedInvitation } from './testing/hive-seeds'
import { avatarForm, jpegImage } from './testing/images'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let lea: string
let odile: string
let max: string
let nora: string
let jeanId: string
let leaId: string
let odileId: string
let maxId: string
let noraId: string
let familleId: string

/** Avance la fausse horloge d'une seconde. */
const later = () => vi.setSystemTime(Date.now() + 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  const member = (name: string, email: string) =>
    ctx.verifiedMember({ name, email, password: `${email}-long-password` })
  jean = await member('Papi Jean', 'jean@example.com')
  lea = await member('Léa', 'lea@example.com')
  odile = await member('Tante Odile', 'odile@example.com')
  max = await member('Max', 'max@example.com')
  nora = await member('Nora Benali', 'nora@example.com')
  jeanId = (await act.me(jean)).id
  leaId = (await act.me(lea)).id
  odileId = (await act.me(odile)).id
  maxId = (await act.me(max)).id
  noraId = (await act.me(nora)).id
  later()
  // Tante Odile a une photo et un pseudo : la forme réduite doit les taire.
  const photo = await ctx.request('/v1/me/avatar', {
    method: 'POST',
    headers: { cookie: odile },
    body: avatarForm(await jpegImage(600, 600)),
  })
  expect(photo.status).toBe(200)
  await act.updateProfile(odile, { handle: 'tante_odile' })
  later()
  familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId, maxId] })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const membersAs = async (cookie: string) => {
  const res = await act.send('GET', `/v1/hives/${familleId}/members`, cookie)
  expect(res.status).toBe(200)
  return HiveMembers.parse(await res.json()).members
}

const pageAs = async (cookie: string) => {
  const res = await act.send('GET', `/v1/hives/${familleId}`, cookie)
  expect(res.status).toBe(200)
  return HivePage.parse(await res.json())
}

const myHivesAs = async (cookie: string) => {
  const res = await act.send('GET', '/v1/hives', cookie)
  expect(res.status).toBe(200)
  return MyHives.parse(await res.json())
}

describe('the animator and a member who blocked them', () => {
  it('lists a member who blocked the animator to the animator, without photo or handle', async () => {
    await act.block(jeanId, odile)

    const odileRow = (await membersAs(jean)).find((member) => member.face.id === odileId)

    expect(odileRow).toEqual({
      face: { id: odileId, name: 'Tante Odile', avatarUrl: null },
      handle: null,
      role: 'member',
      isMe: false,
      reduced: true,
    })
    // Témoin : chez Léa, que personne n'a bloquée, Tante Odile a sa photo et son pseudo.
    const seenByLea = (await membersAs(lea)).find((member) => member.face.id === odileId)
    expect(seenByLea).toMatchObject({ handle: 'tante_odile', reduced: false })
    expect(seenByLea?.face.avatarUrl).not.toBeNull()
    // Et la réponse brute de l'animateur ne contient ni la photo ni le pseudo.
    const raw = await (await act.send('GET', `/v1/hives/${familleId}/members`, jean)).text()
    expect(raw).not.toContain('tante_odile')
    expect(raw).not.toContain(String(seenByLea?.face.avatarUrl))
  })

  it('lets the animator remove a member who has blocked them', async () => {
    await act.block(jeanId, odile)

    const res = await act.send('DELETE', `/v1/hives/${familleId}/members/${odileId}`, jean)

    expect(res.status).toBe(204)
    expect(await isMemberOf(ctx.db, familleId, odileId)).toBe(false)
    expect(await isMemberOf(ctx.db, familleId, jeanId)).toBe(true)
  })

  it('lets the animator remove a member they have blocked', async () => {
    await act.block(odileId, jean)

    const res = await act.send('DELETE', `/v1/hives/${familleId}/members/${odileId}`, jean)

    expect(res.status).toBe(204)
    expect(await isMemberOf(ctx.db, familleId, odileId)).toBe(false)
  })

  it('never lists the animator to a member who blocked them, nor that member to the others as reduced', async () => {
    await act.block(jeanId, odile)

    const seenByOdile = await membersAs(odile)
    expect(seenByOdile.map((member) => member.face.id)).not.toContain(jeanId)
    // Léa et Max voient les deux, en entier.
    for (const cookie of [lea, max]) {
      const members = await membersAs(cookie)
      expect(members.map((member) => member.face.id)).toEqual(
        expect.arrayContaining([jeanId, odileId]),
      )
      expect(members.every((member) => !member.reduced)).toBe(true)
    }
  })
})

describe('two members of a hive who blocked each other', () => {
  it('keeps both in the hive, each missing from the other member list', async () => {
    await act.block(maxId, lea)

    expect(await isMemberOf(ctx.db, familleId, leaId)).toBe(true)
    expect(await isMemberOf(ctx.db, familleId, maxId)).toBe(true)
    expect((await membersAs(lea)).map((member) => member.face.id)).not.toContain(maxId)
    expect((await membersAs(max)).map((member) => member.face.id)).not.toContain(leaId)
    // Témoin : Tante Odile voit les deux.
    expect((await membersAs(odile)).map((member) => member.face.id)).toEqual(
      expect.arrayContaining([leaId, maxId]),
    )
  })

  it('hides the pin, the faces and the animator name of a member blocked either way', async () => {
    // Papi Jean a épinglé son projet « Membres » (visible de toute la ruche).
    later()
    const album = await act.publish(jean, 'Album photos')
    await ctx.db
      .update(schema.hive)
      .set({ pinnedProjectId: album.id, pinnedBy: jeanId, pinnedAt: new Date() })
      .where(eq(schema.hive.id, familleId))
    // Léa a bloqué Papi Jean ; Papi Jean a bloqué Tante Odile.
    await act.block(jeanId, lea)
    await act.block(odileId, jean)
    later()

    for (const [who, cookie] of [
      ['Léa', lea],
      ['Tante Odile', odile],
    ] as const) {
      const page = await pageAs(cookie)
      expect(page.summary.animator, who).toBeNull()
      expect(
        page.summary.faces.map((face) => face.id),
        who,
      ).not.toContain(jeanId)
      expect(page.pinned, who).toBeNull()
      const line = (await myHivesAs(cookie)).hives.find((hive) => hive.id === familleId)
      expect(line?.animator, who).toBeNull()
      expect(
        line?.faces.map((face) => face.id),
        who,
      ).not.toContain(jeanId)
    }
    // Témoin : Max, que rien ne sépare de Papi Jean, lit « animée par Papi Jean », sa photo dans la
    // pile, et l'épingle.
    const page = await pageAs(max)
    expect(page.summary.animator).toEqual({ id: jeanId, name: 'Papi Jean' })
    expect(page.summary.faces.map((face) => face.id)).toContain(jeanId)
    expect(page.pinned).toMatchObject({ id: album.id, pinnedBy: { id: jeanId, name: 'Papi Jean' } })
  })

  it('never names the animator to an invitee blocked either way', async () => {
    const forNora = await seedInvitation(ctx.db, {
      hiveId: familleId,
      inviteeId: noraId,
      inviterId: leaId,
    })
    await act.block(jeanId, nora)

    const invitation = (await myHivesAs(nora)).invitations.find((one) => one.id === forNora)
    expect(invitation?.hive.animatorName).toBeNull()
    // L'invitation de Léa reste (le blocage ne la vise pas : elle est entre Nora et Léa).
    expect(invitation?.inviter?.id).toBe(leaId)
  })
})

describe('inviting and blocking', () => {
  it('answers the same 404 as for an unknown member when inviting a member blocked either way', async () => {
    const unknown = await act.send('POST', `/v1/hives/${familleId}/invitations`, lea, {
      userId: 'no-such-member',
    })
    expect(unknown.status).toBe(404)
    const unknownBody = ErrorResponse.parse(await unknown.json())
    // Nora a bloqué Léa ; Léa a bloqué un second membre, Noé.
    const noe = await ctx.verifiedMember({
      name: 'Noé',
      email: 'noe@example.com',
      password: 'noe-long-password',
    })
    const noeId = (await act.me(noe)).id
    await act.block(leaId, nora)
    await act.block(noeId, lea)

    for (const [who, userId] of [
      ['blocked Léa', noraId],
      ['blocked by Léa', noeId],
    ] as const) {
      const res = await act.send('POST', `/v1/hives/${familleId}/invitations`, lea, { userId })
      expect(res.status, who).toBe(404)
      expect(ErrorResponse.parse(await res.json()), who).toEqual(unknownBody)
    }
    expect(
      await ctx.db
        .select()
        .from(schema.hiveInvitation)
        .where(eq(schema.hiveInvitation.hiveId, familleId)),
    ).toEqual([])
    // Témoin : Max, qui invite Nora (rien ne les sépare), reçoit 201 ; sans lui, ce test passerait
    // tant que la route n'existe pas (une route absente répond déjà 404).
    const witness = await act.send('POST', `/v1/hives/${familleId}/invitations`, max, {
      userId: noraId,
    })
    expect(witness.status).toBe(201)
  })

  it('deletes pending invitations between two members when one blocks the other', async () => {
    // Papi Jean a invité Nora dans Famille ; Nora a invité Papi Jean dans son Atelier IA.
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: noraId })
    const jeanToNora = await seedInvitation(ctx.db, {
      hiveId: familleId,
      inviteeId: noraId,
      inviterId: jeanId,
    })
    const noraToJean = await seedInvitation(ctx.db, {
      hiveId: atelierId,
      inviteeId: jeanId,
      inviterId: noraId,
    })
    // Témoin : une invitation entre deux autres membres (Nora invite Léa) reste.
    const noraToLea = await seedInvitation(ctx.db, {
      hiveId: atelierId,
      inviteeId: leaId,
      inviterId: noraId,
    })
    expect(await invitationRow(ctx.db, jeanToNora)).not.toBeNull()

    await act.block(noraId, jean)

    expect(await invitationRow(ctx.db, jeanToNora)).toBeNull()
    expect(await invitationRow(ctx.db, noraToJean)).toBeNull()
    expect(await invitationRow(ctx.db, noraToLea)).not.toBeNull()
    expect((await myHivesAs(nora)).invitations).toEqual([])
    expect((await myHivesAs(jean)).invitations).toEqual([])
    // Et la place est rendue à la ruche : plus d'invitation en attente vers Nora.
    expect((await pageAs(jean)).pendingInvitations).toBe(0)
    expect(await hiveRow(ctx.db, familleId)).not.toBeNull()
  })

  it('deletes the pending invitations both ways when the invitee is the one who blocks', async () => {
    const jeanToNora = await seedInvitation(ctx.db, {
      hiveId: familleId,
      inviteeId: noraId,
      inviterId: jeanId,
    })

    await act.block(jeanId, nora)

    expect(await invitationRow(ctx.db, jeanToNora)).toBeNull()
    expect((await myHivesAs(nora)).invitations).toEqual([])
  })
})
