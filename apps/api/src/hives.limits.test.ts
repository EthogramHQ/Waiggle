// Tests d'intégration de R10 « Ruches », les limites (choix 1 du scénario) : 10 ruches créées et 20
// ruches par membre ; 50 membres par ruche, invitations en attente comprises, refusées comprises
// jusqu'à leurs 30 jours (choix de Louis du 14/11/2026, Q1) ; 20 invitations envoyées par jour ; et
// le compteur des écritures de ruche, qui compte aussi les demandes mal formées (relecture de
// sécurité du plan, point 7). Scénario : docs/scenarios/refonte.md, « R10 », « Créer une ruche » et
// « Les limites » ; contrat : HIVE_LIMITS (packages/contracts/src/hives.ts).
//
// Remplir une ruche de 48 membres, ou donner 20 ruches à un membre, passe par la base (`fill`, et
// des lignes `hive` écrites ici) : ces membres-là ne servent qu'à compter.
//
// Statuts choisis ici, que le plan ne fixait pas : 409 pour les trois limites de taille (`hive_full`,
// `hives_created_limit`, `hives_joined_limit`), comme les autres conflits d'état ; 429
// `rate_limited` pour le compteur des écritures, comme tout quota. Les invitations du jour ont leur
// code, `hive_invitations_limited` (relecture du design de R10 : « Réessaie dans quelques minutes »
// était faux pour un quota de 24 h).
import { randomUUID } from 'node:crypto'
import { ErrorResponse, HIVE_LIMITS } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let ines: TestMember
let lea: TestMember
let yves: TestMember
let zoe: TestMember
let nora: TestMember

const SECOND = 1000
const DAY = 24 * 60 * 60 * SECOND
const EXPIRY = HIVE_LIMITS.invitationDays * DAY + SECOND

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès Haddad', '198.51.100.1')
  lea = await signedUpMember(ctx, act, 'Léa', '198.51.100.2')
  yves = await signedUpMember(ctx, act, 'Yves', '198.51.100.3')
  zoe = await signedUpMember(ctx, act, 'Zoé', '198.51.100.4')
  nora = await signedUpMember(ctx, act, 'Nora', '198.51.100.5')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const inviteRaw = (hiveId: string, cookie: string, userId: string) =>
  act.send('POST', `/v1/hives/${hiveId}/invitations`, cookie, { userId })

const createRaw = (cookie: string, name = 'Encore une') =>
  act.send('POST', '/v1/hives', cookie, { name, icon: 'leaf' })

/** Des ruches créées par Nora, écrites en base, dont `member` est aussi membre. */
const hivesWith = async (member: TestMember, count: number) => {
  const now = new Date()
  const rows = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    name: `Ruche ${index + 1}`,
    icon: 'heart',
    animatorId: nora.id,
    createdBy: nora.id,
    nameSetBy: nora.id,
    createdAt: now,
    updatedAt: now,
  }))
  await ctx.db.insert(schema.hive).values(rows)
  await ctx.db.insert(schema.hiveMember).values(
    rows.flatMap((row) => [
      { hiveId: row.id, userId: nora.id, joinedAt: now },
      { hiveId: row.id, userId: member.id, joinedAt: now },
    ]),
  )
}

// ─── Créées et rejointes ──────────────────────────────────────────────────────────────────────────

describe('how many hives', () => {
  it('refuses an 11th created hive, and counts only the hives that still exist', async () => {
    const created: string[] = []
    for (let index = 0; index < HIVE_LIMITS.created; index += 1) {
      later()
      created.push((await hives.create(ines.cookie, `Ruche ${index + 1}`)).id)
    }
    expect((await hives.mine(ines.cookie)).createdCount).toBe(10)

    later()
    await expectError(await createRaw(ines.cookie), 409, 'hives_created_limit')
    expect((await hives.mine(ines.cookie)).hives).toHaveLength(10)

    // Une ruche supprimée libère sa place.
    later()
    expect((await act.send('DELETE', `/v1/hives/${created[0]}`, ines.cookie)).status).toBe(204)
    expect((await hives.mine(ines.cookie)).createdCount).toBe(9)
    later()
    expect((await createRaw(ines.cookie)).status).toBe(201)
  })

  it('refuses a 21st hive, created or joined', async () => {
    await hivesWith(lea, HIVE_LIMITS.joined)
    later()
    const famille = await hives.create(ines.cookie)
    later()
    await hives.invite(famille.id, ines.cookie, lea.id)
    const invitation = await hives.invitationTo(famille.id, lea.cookie)

    await expectError(await createRaw(lea.cookie), 409, 'hives_joined_limit')
    await expectError(
      await act.send('POST', `/v1/hive-invitations/${invitation.id}/accept`, lea.cookie),
      409,
      'hives_joined_limit',
    )
    expect((await hives.mine(lea.cookie)).hives).toHaveLength(20)
    // Témoin : avec une ruche de moins, Léa rejoint Famille.
    const [first] = (await hives.mine(lea.cookie)).hives
    later()
    await hives.removeMember(first?.id ?? '', lea.cookie, lea.id)
    later()
    expect((await hives.accept(invitation.id, lea.cookie)).id).toBe(famille.id)
  })
})

// ─── Les 50 places ────────────────────────────────────────────────────────────────────────────────

describe('the 50 places of a hive', () => {
  it('refuses an invitation past 50 places, pending invitations included', async () => {
    later()
    const famille = await hives.create(ines.cookie)
    // Inès et 48 membres : 49. L'invitation de Yves fait la 50e place.
    await hives.fill(famille.id, HIVE_LIMITS.members - 2)
    later()
    expect((await inviteRaw(famille.id, ines.cookie, yves.id)).status).toBe(201)

    expect((await hives.page(famille.id, ines.cookie)).invite).toBe('full')
    await expectError(await inviteRaw(famille.id, ines.cookie, zoe.id), 409, 'hive_full')
    // Yves, lui, a sa place : il rejoint, et la ruche compte 50 membres.
    later()
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    expect((await hives.accept(invitation.id, yves.cookie)).memberCount).toBe(50)
    await expectError(await inviteRaw(famille.id, ines.cookie, zoe.id), 409, 'hive_full')
  })

  it('counts a refused invitation in the 50 places until it expires', async () => {
    later()
    const famille = await hives.create(ines.cookie)
    await hives.fill(famille.id, HIVE_LIMITS.members - 2)
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    later()
    await hives.refuse(invitation.id, yves.cookie)

    expect((await hives.page(famille.id, ines.cookie)).invite).toBe('full')
    await expectError(await inviteRaw(famille.id, ines.cookie, zoe.id), 409, 'hive_full')

    later(EXPIRY)
    await hives.signInAgain(ines)
    expect((await hives.page(famille.id, ines.cookie)).invite).toBe('allowed')
    expect((await inviteRaw(famille.id, ines.cookie, zoe.id)).status).toBe(201)
  })
})

// ─── Les quotas ───────────────────────────────────────────────────────────────────────────────────

describe('the quotas', () => {
  it('answers 429 to the 21st invitation of the day, and lets the member invite again the next day', async () => {
    later()
    const famille = await hives.create(ines.cookie)
    // Le quota est celui d'Inès, pas de la ruche : Léa, membre, invitera encore. Elle entre la veille,
    // car la faire entrer passe par une invitation d'Inès, qui compte dans son quota du jour.
    later()
    await hives.join(famille.id, ines.cookie, lea)
    later(DAY)
    const invitees: TestMember[] = []
    for (let index = 0; index < HIVE_LIMITS.invitationsPerDay + 2; index += 1) {
      invitees.push(
        await signedUpMember(ctx, act, `Invité ${index + 1}`, `198.51.100.${30 + index}`),
      )
    }
    for (const invitee of invitees.slice(0, HIVE_LIMITS.invitationsPerDay)) {
      later()
      await hives.invite(famille.id, ines.cookie, invitee.id)
    }

    later()
    await expectError(
      await inviteRaw(famille.id, ines.cookie, invitees[20]?.id ?? ''),
      429,
      'hive_invitations_limited',
    )
    // Le quota est celui d'Inès, pas de la ruche : Léa, membre, invite encore.
    later()
    expect((await inviteRaw(famille.id, lea.cookie, invitees[20]?.id ?? '')).status).toBe(201)
    // Le lendemain, Inès aussi.
    later(DAY)
    expect((await inviteRaw(famille.id, ines.cookie, invitees[21]?.id ?? '')).status).toBe(201)
  })

  it('counts hive writes even malformed requests', async () => {
    later()
    const famille = await hives.create(ines.cookie)
    const key = memberCounterKeys(ines.id).hiveWrite
    const counted = async () =>
      (
        await ctx.db
          .select({ count: schema.apiRateLimit.count })
          .from(schema.apiRateLimit)
          .where(eq(schema.apiRateLimit.key, key))
      )[0]?.count ?? 0

    // Une demande mal formée (une chaîne au lieu d'un objet) est refusée, mais comptée.
    const before = await counted()
    await expectError(await act.send('POST', '/v1/hives', ines.cookie, 'x'), 400, 'validation')
    await expectError(
      await act.send('PATCH', `/v1/hives/${famille.id}`, ines.cookie, { icon: 'skull' }),
      400,
      'validation',
    )
    expect(await counted()).toBe(before + 2)

    // Au plafond, la même demande mal formée répond 429 : le compteur passe avant la validation.
    await ctx.db
      .update(schema.apiRateLimit)
      .set({ count: 1_000_000, windowStart: Date.now() })
      .where(eq(schema.apiRateLimit.key, key))
    await expectError(await act.send('POST', '/v1/hives', ines.cookie, 'x'), 429, 'rate_limited')
    await expectError(
      await act.send('PATCH', `/v1/hives/${famille.id}`, ines.cookie, { icon: 'skull' }),
      429,
      'rate_limited',
    )
    await expectError(await createRaw(ines.cookie), 429, 'rate_limited')
    // Témoin : Léa a son propre compteur ; sa demande mal formée reçoit l'erreur de validation.
    await expectError(await act.send('POST', '/v1/hives', lea.cookie, 'x'), 400, 'validation')
  })
})
