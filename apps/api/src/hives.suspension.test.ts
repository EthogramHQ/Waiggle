// Tests d'intégration de R10 : un membre suspendu et ses ruches. Il lit, mais rien de neuf ne lui
// est permis (créer, renommer, épingler, inviter, retirer, confier, supprimer), sauf quitter une
// ruche, et accepter ou refuser une invitation. Un animateur suspendu garde son rôle ; la ruche
// continue. Scénario : docs/scenarios/refonte.md, « R10 », « Créer une ruche » (« un membre suspendu
// ne voit pas Créer une ruche »), « Qui peut inviter », « Un animateur suspendu ». Relecture du
// plan, point 2 : la garde laisse passer tout DELETE ; retirer un membre et supprimer la ruche se
// refusent donc dans la route elle-même (403 `suspended`) ; accepter une invitation entre dans la
// liste des écritures permises.
//
// Les ruches sont préparées en base (testing/hive-seeds.ts) : chaque test échoue sur la route qu'il
// essaie. Plusieurs refus passent déjà avant R10 (la garde refuse toute écriture inconnue) : chacun a
// son témoin, le même geste réussi par un membre qui n'est pas suspendu.
//
// Cinq membres : Papi Jean (animateur, suspendu), Léa et Tante Odile (membres), Max (invité), Louis
// (l'administrateur qui suspend).
import { ErrorResponse, HivePage, HiveSummary } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import {
  hiveRow,
  invitationRow,
  isMemberOf,
  memberIdsOf,
  seedHive,
  seedInvitation,
} from './testing/hive-seeds'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let lea: string
let odile: string
let max: string
let louis: string
let jeanId: string
let leaId: string
let odileId: string
let maxId: string
let familleId: string // Papi Jean anime ; Léa, puis Tante Odile, membres

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
  louis = await member('Louis', 'louis@example.com')
  jeanId = (await act.me(jean)).id
  leaId = (await act.me(lea)).id
  odileId = (await act.me(odile)).id
  maxId = (await act.me(max)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
  familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId] })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Louis suspend un membre pour 7 jours. */
const suspend = async (memberId: string) => {
  later()
  const res = await act.send('POST', '/v1/moderation/decisions', louis, {
    action: 'suspend',
    memberId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages insultants, plusieurs fois.',
  })
  expect(res.status).toBe(201)
  later()
}

/** 403 `suspended`, la réponse de la garde et des routes « en partie » permises. */
const expectSuspended = async (res: Response, what: string) => {
  expect(res.status, what).toBe(403)
  expect(ErrorResponse.parse(await res.json()).error.code, what).toBe('suspended')
}

describe('a suspended animator', () => {
  it('refuses a suspended animator removing a member, with 403 suspended', async () => {
    await suspend(jeanId)

    await expectSuspended(
      await act.send('DELETE', `/v1/hives/${familleId}/members/${odileId}`, jean),
      'remove Odile',
    )
    // Rien n'a changé : Tante Odile est toujours membre, Papi Jean toujours animateur.
    expect(await isMemberOf(ctx.db, familleId, odileId)).toBe(true)
    expect((await hiveRow(ctx.db, familleId))?.animatorId).toBe(jeanId)
    // La garde laisse passer tout DELETE : c'est la route qui refuse. Témoin : la même route, pour
    // un animateur qui n'est pas suspendu (Léa, dans sa propre ruche), retire bien un membre.
    const atelierId = await seedHive(ctx.db, {
      name: 'Atelier IA',
      animatorId: leaId,
      members: [maxId],
    })
    const witness = await act.send('DELETE', `/v1/hives/${atelierId}/members/${maxId}`, lea)
    expect(witness.status).toBe(204)
    expect(await isMemberOf(ctx.db, atelierId, maxId)).toBe(false)
  })

  it('refuses a suspended animator deleting the hive, with 403 suspended', async () => {
    await suspend(jeanId)

    await expectSuspended(await act.send('DELETE', `/v1/hives/${familleId}`, jean), 'delete')
    expect(await hiveRow(ctx.db, familleId)).not.toBeNull()
    expect(await memberIdsOf(ctx.db, familleId)).toEqual([jeanId, leaId, odileId].sort())
    // Témoin : un animateur qui n'est pas suspendu supprime sa ruche.
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: leaId })
    expect((await act.send('DELETE', `/v1/hives/${atelierId}`, lea)).status).toBe(204)
    expect(await hiveRow(ctx.db, atelierId)).toBeNull()
  })

  it('refuses a suspended animator renaming, changing the icon, the invite policy or the pin', async () => {
    later()
    const project = await act.publish(lea, 'Le plan de table')
    await suspend(jeanId)

    for (const body of [
      { name: 'Grande famille' },
      { icon: 'heart' },
      { invitePolicy: 'animator' },
      { pinnedProjectId: project.id },
    ]) {
      await expectSuspended(
        await act.send('PATCH', `/v1/hives/${familleId}`, jean, body),
        JSON.stringify(body),
      )
    }
    const row = await hiveRow(ctx.db, familleId)
    expect(row).toMatchObject({
      name: 'Famille',
      icon: 'house-line',
      invitePolicy: 'members',
      pinnedProjectId: null,
    })
    // Témoin : la garde refusait déjà toute écriture inconnue ; un animateur qui n'est pas suspendu
    // renomme sa ruche (200, la page).
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: leaId })
    const witness = await act.send('PATCH', `/v1/hives/${atelierId}`, lea, { name: 'Atelier' })
    expect(witness.status).toBe(200)
    expect(HivePage.parse(await witness.json()).summary.name).toBe('Atelier')
  })

  it('refuses a suspended animator handing the animation over, with 403 suspended', async () => {
    await suspend(jeanId)

    await expectSuspended(
      await act.send('POST', `/v1/hives/${familleId}/animator`, jean, { userId: leaId }),
      'hand over',
    )
    expect((await hiveRow(ctx.db, familleId))?.animatorId).toBe(jeanId)
    // Témoin : un animateur qui n'est pas suspendu confie l'animation (204).
    const atelierId = await seedHive(ctx.db, {
      name: 'Atelier IA',
      animatorId: leaId,
      members: [maxId],
    })
    expect(
      (await act.send('POST', `/v1/hives/${atelierId}/animator`, lea, { userId: maxId })).status,
    ).toBe(204)
    expect((await hiveRow(ctx.db, atelierId))?.animatorId).toBe(maxId)
  })

  it('keeps the suspended animator in his role, and the hive readable to him and its members', async () => {
    await suspend(jeanId)

    const own = await act.send('GET', `/v1/hives/${familleId}`, jean)
    expect(own.status).toBe(200)
    expect(HivePage.parse(await own.json()).summary.role).toBe('animator')
    const res = await act.send('GET', `/v1/hives/${familleId}`, lea)
    expect(res.status).toBe(200)
    expect(HivePage.parse(await res.json()).summary.animator).toEqual({
      id: jeanId,
      name: 'Papi Jean',
    })
  })

  it('lets a suspended animator leave, the animation going to the oldest member', async () => {
    await suspend(jeanId)

    const res = await act.send('DELETE', `/v1/hives/${familleId}/members/${jeanId}`, jean)

    expect(res.status).toBe(204)
    expect(await memberIdsOf(ctx.db, familleId)).toEqual([leaId, odileId].sort())
    // Léa est entrée avant Tante Odile : c'est elle qui anime.
    expect((await hiveRow(ctx.db, familleId))?.animatorId).toBe(leaId)
  })
})

describe('a suspended member', () => {
  it('lets a suspended member leave a hive and accept an invitation', async () => {
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: maxId })
    const invitationId = await seedInvitation(ctx.db, {
      hiveId: atelierId,
      inviteeId: odileId,
      inviterId: maxId,
    })
    await suspend(odileId)

    // Quitter Famille.
    const left = await act.send('DELETE', `/v1/hives/${familleId}/members/${odileId}`, odile)
    expect(left.status).toBe(204)
    expect(await isMemberOf(ctx.db, familleId, odileId)).toBe(false)
    // Accepter l'invitation de Max : elle entre dans l'Atelier IA (200, la ligne de la ruche).
    const accepted = await act.send('POST', `/v1/hive-invitations/${invitationId}/accept`, odile)
    expect(accepted.status).toBe(200)
    const summary = HiveSummary.parse(await accepted.json())
    expect(summary).toMatchObject({ id: atelierId, role: 'member', memberCount: 2 })
    expect(await isMemberOf(ctx.db, atelierId, odileId)).toBe(true)
    expect(await invitationRow(ctx.db, invitationId)).toBeNull()
  })

  it('lets a suspended member refuse an invitation', async () => {
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: maxId })
    const invitationId = await seedInvitation(ctx.db, {
      hiveId: atelierId,
      inviteeId: odileId,
      inviterId: maxId,
    })
    await suspend(odileId)

    const res = await act.send('DELETE', `/v1/hive-invitations/${invitationId}`, odile)

    expect(res.status).toBe(204)
    // Le refus garde la ligne, datée (Q1) : la ruche la compte jusqu'à ses 30 jours.
    expect((await invitationRow(ctx.db, invitationId))?.refusedAt).toEqual(new Date())
    expect(await isMemberOf(ctx.db, atelierId, odileId)).toBe(false)
  })

  it('refuses a suspended member creating a hive, with 403 suspended', async () => {
    await suspend(odileId)

    await expectSuspended(
      await act.send('POST', '/v1/hives', odile, { name: 'Cousins', icon: 'heart' }),
      'create',
    )
    const created = await ctx.db
      .select()
      .from(schema.hive)
      .where(eq(schema.hive.createdBy, odileId))
    expect(created).toEqual([])
    // Témoin : la garde refusait déjà toute écriture inconnue ; un membre qui n'est pas suspendu crée
    // sa ruche (201).
    const witness = await act.send('POST', '/v1/hives', lea, { name: 'Cousins', icon: 'heart' })
    expect(witness.status).toBe(201)
  })

  it('refuses a suspended member inviting, with 403 suspended, even where every member invites', async () => {
    await suspend(odileId)

    await expectSuspended(
      await act.send('POST', `/v1/hives/${familleId}/invitations`, odile, { userId: maxId }),
      'invite Max',
    )
    expect(
      await ctx.db
        .select()
        .from(schema.hiveInvitation)
        .where(eq(schema.hiveInvitation.hiveId, familleId)),
    ).toEqual([])
    // Témoin : Léa, membre de la même ruche, invite Max (201).
    const witness = await act.send('POST', `/v1/hives/${familleId}/invitations`, lea, {
      userId: maxId,
    })
    expect(witness.status).toBe(201)
  })

  it('refuses a suspended member reserving a project to their hive', async () => {
    await suspend(odileId)

    await expectSuspended(
      await act.send('POST', '/v1/projects', odile, {
        title: 'Biscotte au parc',
        pitch: 'Un petit projet pour essayer.',
        primaryCategory: 'other',
        visibility: 'hive',
        hiveId: familleId,
      }),
      'publish',
    )
    // Témoin : Léa, membre, réserve son projet à Famille (201, la ruche dans la réponse).
    const witness = await act.publish(lea, 'Le plan de table', {
      visibility: 'hive',
      hiveId: familleId,
    })
    expect(witness.hive).toEqual({ id: familleId, name: 'Famille' })
  })
})
