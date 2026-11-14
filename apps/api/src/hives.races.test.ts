// Tests d'intégration de R10 : deux écritures sur une même ruche en même temps. Deux invitations pour
// la dernière place, deux acceptations ou deux créations au-delà des limites d'un membre, un départ
// pendant une publication réservée, l'animateur et son successeur qui partent ensemble. Relecture du
// plan, point 5 : la ruche se verrouille (`for update`) avant de compter ses 50 places ; un verrou
// par membre pour ses limites (20 ruches, 10 créées) ; sortie, retrait, animation et suppression
// verrouillent la ruche d'abord ; publier « réservé » prend `hive_member` en partage avant le
// projet ; une ruche disparue entre-temps (clé étrangère, erreur 23503) répond 404.
//
// Ce que ces tests prouvent, et ce qu'ils ne prouvent pas. PGlite n'a qu'une connexion : deux
// demandes lancées par `Promise.all` s'y suivent, elles ne se croisent jamais vraiment. Un test de
// `Promise.all` vérifie donc l'état final (une seule place prise, jamais un animateur parti), avant
// comme après un verrou : il ne prouve pas le verrou. Seuls les tests « inside the transaction »
// prouvent une relecture : un espion change la base juste avant la transaction de la route, comme
// le ferait une demande qui passe entre la vérification et l'écriture (voir code-api.md, « Course
// garde / écriture sous PGlite »). L'attente elle-même (le verrou) reste au raisonnement.
//
// Les ruches sont préparées en base (testing/hive-seeds.ts), remplies au besoin de comptes sans
// session. Membres : Papi Jean (animateur de Famille), Léa et Tante Odile (membres), Max et Nora.
import { ErrorResponse } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import {
  addMembers,
  hiveRow,
  isMemberOf,
  memberIdsOf,
  seedBareMembers,
  seedHive,
  seedInvitation,
} from './testing/hive-seeds'

let ctx: TestContext
let act: ReturnType<typeof activity>
let jean: string // cookies de session
let lea: string
let odile: string
let max: string
let jeanId: string
let leaId: string
let odileId: string
let maxId: string
let noraId: string

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
  const nora = await member('Nora Benali', 'nora@example.com')
  jeanId = (await act.me(jean)).id
  leaId = (await act.me(lea)).id
  odileId = (await act.me(odile)).id
  maxId = (await act.me(max)).id
  noraId = (await act.me(nora)).id
  later()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await ctx.close()
  vi.useRealTimers()
})

const codeOf = async (res: Response) => ErrorResponse.parse(await res.json()).error.code

const invitationsOf = (hiveId: string) =>
  ctx.db.select().from(schema.hiveInvitation).where(eq(schema.hiveInvitation.hiveId, hiveId))

/** Les projets réservés à cette ruche, en base. */
const reservedTo = (hiveId: string) =>
  ctx.db
    .select({ id: schema.project.id, authorId: schema.project.authorId })
    .from(schema.project)
    .where(and(eq(schema.project.visibility, 'hive'), eq(schema.project.hiveId, hiveId)))

/** Réserve en base un projet déjà publié à une ruche (l'état qu'aurait laissé la publication). */
const reserve = (projectId: string, hiveId: string) =>
  ctx.db
    .update(schema.project)
    .set({ visibility: 'hive', hiveId })
    .where(eq(schema.project.id, projectId))

const publishReserved = (cookie: string, hiveId: string, title: string) =>
  act.send('POST', '/v1/projects', cookie, {
    title,
    pitch: 'Un petit projet pour essayer.',
    primaryCategory: 'other',
    visibility: 'hive',
    hiveId,
  })

/** Les ruches dont ce membre fait partie, en base. */
const hivesOfMember = async (userId: string) =>
  (
    await ctx.db
      .select({ hiveId: schema.hiveMember.hiveId })
      .from(schema.hiveMember)
      .where(eq(schema.hiveMember.userId, userId))
  ).length

/**
 * L'espion de la transaction : juste avant la prochaine transaction de la route, `meanwhile` change
 * la base, comme une demande qui passerait entre la vérification de la route et son écriture.
 */
const beforeNextTransaction = (meanwhile: () => Promise<unknown>) => {
  const original = ctx.db.transaction.bind(ctx.db)
  return vi.spyOn(ctx.db, 'transaction').mockImplementationOnce(async (...args) => {
    await meanwhile()
    return original(...args)
  })
}

describe('the 50 places of a hive', () => {
  it('lets only one of two simultaneous invitations take the last place', async () => {
    // Famille : Papi Jean, Léa et 47 autres membres, soit 49 ; une seule place reste.
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId] })
    await addMembers(ctx.db, familleId, await seedBareMembers(ctx.db, 47))
    later()

    const [byJean, byLea] = await Promise.all([
      act.send('POST', `/v1/hives/${familleId}/invitations`, jean, { userId: maxId }),
      act.send('POST', `/v1/hives/${familleId}/invitations`, lea, { userId: noraId }),
    ])

    expect([byJean.status, byLea.status].sort()).toEqual([201, 409])
    const refused = byJean.status === 409 ? byJean : byLea
    expect(await codeOf(refused)).toBe('hive_full')
    expect(await invitationsOf(familleId)).toHaveLength(1)
  })

  it('counts the place taken by an invitation sent just before inside the transaction', async () => {
    // 49 membres ; pendant que Léa invite Nora, Papi Jean a invité Max juste avant la transaction.
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId] })
    await addMembers(ctx.db, familleId, await seedBareMembers(ctx.db, 47))
    later()
    const spy = beforeNextTransaction(() =>
      seedInvitation(ctx.db, { hiveId: familleId, inviteeId: maxId, inviterId: jeanId }),
    )

    const res = await act.send('POST', `/v1/hives/${familleId}/invitations`, lea, {
      userId: noraId,
    })

    expect(spy).toHaveBeenCalled()
    expect(res.status).toBe(409)
    expect(await codeOf(res)).toBe('hive_full')
    expect((await invitationsOf(familleId)).map((one) => one.inviteeId)).toEqual([maxId])
  })
})

describe('the limits of a member', () => {
  it('lets a member in 19 hives join only one of two hives accepted at the same time', async () => {
    // Tante Odile est membre de 19 ruches animées par d'autres.
    for (const animatorId of await seedBareMembers(ctx.db, 19, 'animator')) {
      await seedHive(ctx.db, { name: 'Voisins', animatorId, members: [odileId] })
    }
    const familleId = await seedHive(ctx.db, { animatorId: jeanId })
    const atelierId = await seedHive(ctx.db, { name: 'Atelier IA', animatorId: maxId })
    const fromJean = await seedInvitation(ctx.db, {
      hiveId: familleId,
      inviteeId: odileId,
      inviterId: jeanId,
    })
    const fromMax = await seedInvitation(ctx.db, {
      hiveId: atelierId,
      inviteeId: odileId,
      inviterId: maxId,
    })
    later()

    const answers = await Promise.all([
      act.send('POST', `/v1/hive-invitations/${fromJean}/accept`, odile),
      act.send('POST', `/v1/hive-invitations/${fromMax}/accept`, odile),
    ])

    expect(answers.map((res) => res.status).sort()).toEqual([200, 409])
    const refused = answers.find((res) => res.status === 409)
    expect(refused && (await codeOf(refused))).toBe('hives_joined_limit')
    expect(await hivesOfMember(odileId)).toBe(20)
  })

  it('lets a member with 9 created hives create only one of two at the same time', async () => {
    for (let i = 0; i < 9; i++) await seedHive(ctx.db, { name: `Ruche ${i}`, animatorId: odileId })
    later()

    const answers = await Promise.all([
      act.send('POST', '/v1/hives', odile, { name: 'Cousins', icon: 'heart' }),
      act.send('POST', '/v1/hives', odile, { name: 'Voisins', icon: 'leaf' }),
    ])

    expect(answers.map((res) => res.status).sort()).toEqual([201, 409])
    const refused = answers.find((res) => res.status === 409)
    expect(refused && (await codeOf(refused))).toBe('hives_created_limit')
    const created = await ctx.db
      .select()
      .from(schema.hive)
      .where(eq(schema.hive.createdBy, odileId))
    expect(created).toHaveLength(10)
  })

  it('accepts the same invitation only once when it is sent twice at the same time', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId })
    const invitationId = await seedInvitation(ctx.db, {
      hiveId: familleId,
      inviteeId: maxId,
      inviterId: jeanId,
    })
    later()

    const answers = await Promise.all([
      act.send('POST', `/v1/hive-invitations/${invitationId}/accept`, max),
      act.send('POST', `/v1/hive-invitations/${invitationId}/accept`, max),
    ])

    // Une seule réussit ; l'autre ne trouve plus l'invitation, et jamais une erreur du serveur.
    expect(answers.filter((res) => res.status === 200)).toHaveLength(1)
    expect(answers.every((res) => res.status < 500)).toBe(true)
    expect(await memberIdsOf(ctx.db, familleId)).toEqual([jeanId, maxId].sort())
  })

  it('answers 404, never a server error, when the hive is deleted just before an acceptance', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId })
    const invitationId = await seedInvitation(ctx.db, {
      hiveId: familleId,
      inviteeId: maxId,
      inviterId: jeanId,
    })
    later()
    const spy = beforeNextTransaction(() =>
      ctx.db.delete(schema.hive).where(eq(schema.hive.id, familleId)),
    )

    const res = await act.send('POST', `/v1/hive-invitations/${invitationId}/accept`, max)

    expect(spy).toHaveBeenCalled()
    // L'invitation est partie avec la ruche : 404 (une ruche disparue, 23503 → 404), ou 410 si
    // l'API sait encore qu'elle venait d'une ruche supprimée ; jamais 500.
    expect([404, 410]).toContain(res.status)
    expect(await hivesOfMember(maxId)).toBe(0)
  })
})

describe('leaving while a project is reserved to the hive', () => {
  it('refuses to reserve a project to a hive its author is no longer in', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId] })
    later()
    const draft = await act.publish(lea, 'Biscotte au parc', { visibility: 'private' })
    later()
    expect((await act.send('DELETE', `/v1/hives/${familleId}/members/${leaId}`, lea)).status).toBe(
      204,
    )
    later()
    // La réponse d'une ruche qui n'existe pas : un ancien membre n'apprend rien de plus.
    const unknown = await publishReserved(lea, '00000000-0000-4000-8000-000000000000', 'Essai')
    expect(unknown.status).toBe(404)
    const unknownBody = await unknown.json()

    const published = await publishReserved(lea, familleId, 'Le plan de table')
    const moved = await act.send('PATCH', `/v1/projects/${draft.id}`, lea, {
      visibility: 'hive',
      hiveId: familleId,
    })

    for (const [what, res] of [
      ['publish', published],
      ['move', moved],
    ] as const) {
      expect(res.status, what).toBe(404)
      expect(await res.json(), what).toEqual(unknownBody)
    }
    expect(await reservedTo(familleId)).toEqual([])
    // Témoin : Tante Odile, toujours membre, réserve son projet à Famille.
    expect((await publishReserved(odile, familleId, 'Recettes de famille')).status).toBe(201)
  })

  it('never leaves a project reserved to a hive its author left at the same time', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId] })
    later()

    const [left, published] = await Promise.all([
      act.send('DELETE', `/v1/hives/${familleId}/members/${leaId}`, lea),
      publishReserved(lea, familleId, 'Le plan de table'),
    ])

    expect(left.status).toBe(204)
    // Selon l'ordre : publié puis rendu privé par le départ, ou refusé (404) parce que Léa est déjà
    // partie. Jamais un projet réservé à Famille dont l'autrice n'est plus membre.
    expect([201, 404]).toContain(published.status)
    expect(await isMemberOf(ctx.db, familleId, leaId)).toBe(false)
    expect((await reservedTo(familleId)).filter((p) => p.authorId === leaId)).toEqual([])
  })

  it('refuses a reserved publication when its author leaves just before the transaction', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId] })
    later()
    const spy = beforeNextTransaction(() =>
      ctx.db
        .delete(schema.hiveMember)
        .where(and(eq(schema.hiveMember.hiveId, familleId), eq(schema.hiveMember.userId, leaId))),
    )

    const res = await publishReserved(lea, familleId, 'Le plan de table')

    expect(spy).toHaveBeenCalled()
    expect(res.status).toBe(404)
    expect(await codeOf(res)).toBe('not_found')
    expect(await reservedTo(familleId)).toEqual([])
  })

  it('answers 404, never a server error, when the hive is deleted just before a reserved publication', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId] })
    later()
    const spy = beforeNextTransaction(() =>
      ctx.db.delete(schema.hive).where(eq(schema.hive.id, familleId)),
    )

    const res = await publishReserved(lea, familleId, 'Le plan de table')

    expect(spy).toHaveBeenCalled()
    expect(res.status).toBe(404)
    expect(await codeOf(res)).toBe('not_found')
    const left = await ctx.db
      .select()
      .from(schema.project)
      .where(eq(schema.project.authorId, leaId))
    expect(left).toEqual([])
  })
})

describe('the animator and the next in line leaving', () => {
  it('deletes the hive when its last two members leave one after the other', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId] })
    later()
    const project = await act.publish(lea, 'Le plan de table')
    await reserve(project.id, familleId)
    later()

    expect(
      (await act.send('DELETE', `/v1/hives/${familleId}/members/${jeanId}`, jean)).status,
    ).toBe(204)
    expect((await hiveRow(ctx.db, familleId))?.animatorId).toBe(leaId)
    later()
    expect((await act.send('DELETE', `/v1/hives/${familleId}/members/${leaId}`, lea)).status).toBe(
      204,
    )

    expect(await hiveRow(ctx.db, familleId)).toBeNull()
    expect(await memberIdsOf(ctx.db, familleId)).toEqual([])
    // Son projet réservé redevient privé, pour elle.
    const [row] = await ctx.db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, project.id))
    expect(row).toMatchObject({ visibility: 'private', hiveId: null })
  })

  it('deletes the hive when its last two members leave at the same time', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId] })
    later()

    const answers = await Promise.all([
      act.send('DELETE', `/v1/hives/${familleId}/members/${jeanId}`, jean),
      act.send('DELETE', `/v1/hives/${familleId}/members/${leaId}`, lea),
    ])

    expect(answers.map((res) => res.status)).toEqual([204, 204])
    expect(await hiveRow(ctx.db, familleId)).toBeNull()
  })

  it('gives the animation to a remaining member when the animator and the next in line leave at once', async () => {
    // Léa est entrée avant Tante Odile : c'est elle qui reprendrait l'animation.
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId] })
    later()

    const answers = await Promise.all([
      act.send('DELETE', `/v1/hives/${familleId}/members/${jeanId}`, jean),
      act.send('DELETE', `/v1/hives/${familleId}/members/${leaId}`, lea),
    ])

    expect(answers.map((res) => res.status)).toEqual([204, 204])
    expect(await memberIdsOf(ctx.db, familleId)).toEqual([odileId])
    expect((await hiveRow(ctx.db, familleId))?.animatorId).toBe(odileId)
  })

  it('never gives the animation to a member who leaves at the same time', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId] })
    later()

    const [handed, left] = await Promise.all([
      act.send('POST', `/v1/hives/${familleId}/animator`, jean, { userId: leaId }),
      act.send('DELETE', `/v1/hives/${familleId}/members/${leaId}`, lea),
    ])

    expect(left.status).toBe(204)
    expect(handed.status).toBeLessThan(500)
    // Quel que soit l'ordre, l'animateur est un membre de la ruche.
    const animatorId = (await hiveRow(ctx.db, familleId))?.animatorId
    expect(animatorId).not.toBeNull()
    expect(await memberIdsOf(ctx.db, familleId)).toContain(animatorId)
    expect(await isMemberOf(ctx.db, familleId, leaId)).toBe(false)
  })

  it('refuses to hand the animation to a member who left just before the transaction', async () => {
    const familleId = await seedHive(ctx.db, { animatorId: jeanId, members: [leaId, odileId] })
    later()
    const spy = beforeNextTransaction(() =>
      ctx.db
        .delete(schema.hiveMember)
        .where(and(eq(schema.hiveMember.hiveId, familleId), eq(schema.hiveMember.userId, leaId))),
    )

    const res = await act.send('POST', `/v1/hives/${familleId}/animator`, jean, { userId: leaId })

    expect(spy).toHaveBeenCalled()
    expect(res.status).toBe(404)
    expect((await hiveRow(ctx.db, familleId))?.animatorId).toBe(jeanId)
  })
})
