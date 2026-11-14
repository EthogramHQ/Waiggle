// Tests d'intégration de R10 « Ruches », les invitations : inviter, rejoindre, refuser sans prévenir
// personne, l'invitation refusée qui reste « Invitation envoyée » jusqu'à ses 30 jours (choix de
// Louis du 14/11/2026, Q1), l'invitation expirée (410), et la recherche de la feuille « Inviter »
// (sous 3 caractères, les membres suivis et ceux de ses ruches ; dès 3, tout le réseau ; jamais un
// membre bloqué). Scénario : docs/scenarios/refonte.md, « R10 », « Inviter » et « Les invitations
// reçues » ; contrat : packages/contracts/src/hives.ts.
//
// Les membres : Inès Haddad (qui crée « Famille » et l'anime), Léa (membre de Famille), Yves (qu'Inès
// invite), Nora et Zoé (d'autres membres de Waiggle). Aucun nom ne commence par « ma » : la recherche
// « Inviter » en a besoin pour ses propres membres (Malik, Mathis, Manon…).
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
let nora: TestMember
let zoe: TestMember
/** Les adresses IP des inscriptions faites dans un test (au-delà de celles du beforeEach). */
let nextIp = 20

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
/** Une invitation vaut 30 jours : juste après, elle ne vaut plus. */
const EXPIRY = HIVE_LIMITS.invitationDays * DAY + SECOND

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Passe les 30 jours d'une invitation, et reconnecte ceux qui lisent ensuite (sessions de 7 jours). */
const expire = async (...members: TestMember[]) => {
  later(EXPIRY)
  await hives.signInAgain(...members)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  ines = await signedUpMember(ctx, act, 'Inès Haddad', '198.51.100.1')
  lea = await signedUpMember(ctx, act, 'Léa', '198.51.100.2')
  yves = await signedUpMember(ctx, act, 'Yves', '198.51.100.3')
  nora = await signedUpMember(ctx, act, 'Nora', '198.51.100.4')
  zoe = await signedUpMember(ctx, act, 'Zoé', '198.51.100.5')
  nextIp = 20
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Un membre de plus, inscrit depuis sa propre adresse IP. */
const another = (name: string) => {
  nextIp += 1
  return signedUpMember(ctx, act, name, `198.51.100.${nextIp}`)
}

const answer = async (method: string, path: string, cookie: string | null, body?: unknown) => {
  const res = await act.send(method, path, cookie, body)
  return `${res.status} ${await res.text()}`
}

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const inviteRaw = (hiveId: string, cookie: string, userId: string) =>
  act.send('POST', `/v1/hives/${hiveId}/invitations`, cookie, { userId })

/** « Famille », animée par Inès, avec Léa. */
const family = async () => {
  later()
  const famille = await hives.create(ines.cookie)
  later()
  await hives.join(famille.id, ines.cookie, lea)
  return famille
}

/** L'état d'un membre dans la recherche « Inviter » (undefined : il n'y paraît pas). */
const stateOf = async (hiveId: string, viewer: TestMember, q: string, memberId: string) =>
  (await hives.invitable(hiveId, viewer.cookie, q)).find((one) => one.face.id === memberId)?.state

const ids = (members: { face: { id: string } }[]) => members.map((one) => one.face.id).sort()

// ─── Inviter, rejoindre, refuser ──────────────────────────────────────────────────────────────────

describe('an invitation', () => {
  it('reaches the invitee with what the hive shows before joining, and nothing more', async () => {
    const famille = await family()
    later()
    const res = await inviteRaw(famille.id, ines.cookie, yves.id)
    expect(res.status).toBe(201)

    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    expect(invitation).toEqual(
      expect.objectContaining({
        hive: {
          id: famille.id,
          name: 'Famille',
          icon: 'house-line',
          memberCount: 2,
          animatorName: 'Inès Haddad',
        },
        inviter: expect.objectContaining({ id: ines.id, name: 'Inès Haddad' }),
        createdAt: new Date(Date.now()).toISOString(),
      }),
    )
    expect((await hives.mine(yves.cookie)).hives).toEqual([])
    // Ni la page, ni l'actualité, ni les membres avant d'avoir accepté.
    for (const path of ['', '/activity', '/members']) {
      expect((await act.send('GET', `/v1/hives/${famille.id}${path}`, yves.cookie)).status).toBe(
        404,
      )
    }
    // La ruche compte l'invitation en attente, et la recherche le dit.
    expect((await hives.page(famille.id, lea.cookie)).pendingInvitations).toBe(1)
    expect(await stateOf(famille.id, lea, 'yves', yves.id)).toBe('invited')
  })

  it('lets the invitee join: the hive takes its place and the invitation goes', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, lea.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)

    later()
    const joined = await hives.accept(invitation.id, yves.cookie)
    expect(joined).toEqual(
      expect.objectContaining({ id: famille.id, memberCount: 3, role: 'member' }),
    )
    const mine = await hives.mine(yves.cookie)
    expect(mine.hives.map((one) => one.id)).toEqual([famille.id])
    expect(mine.invitations).toEqual([])
    expect((await hives.members(famille.id, yves.cookie)).map((one) => one.face.id)).toContain(
      yves.id,
    )
    expect((await hives.page(famille.id, ines.cookie)).pendingInvitations).toBe(0)
    expect(await stateOf(famille.id, ines, 'yves', yves.id)).toBe('member')
    // Une invitation acceptée ne s'accepte pas deux fois.
    expect(
      (await act.send('POST', `/v1/hive-invitations/${invitation.id}/accept`, yves.cookie)).status,
    ).toBe(404)
  })

  it('lets the invitee refuse: the invitation leaves their tab, and nobody is told', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    later()
    const before = await answer('GET', '/v1/notifications', ines.cookie)

    await hives.refuse(invitation.id, yves.cookie)

    expect((await hives.mine(yves.cookie)).invitations).toEqual([])
    expect(await answer('GET', '/v1/notifications', ines.cookie)).toBe(before)
    expect(
      (await act.send('POST', `/v1/hive-invitations/${invitation.id}/accept`, yves.cookie)).status,
    ).toBe(404)
  })

  it('refuses an invitation from a member when the animator keeps that right, with 403', async () => {
    const famille = await family()
    later()
    expect(
      (
        await act.send('PATCH', `/v1/hives/${famille.id}`, ines.cookie, {
          invitePolicy: 'animator',
        })
      ).status,
    ).toBe(200)

    await expectError(await inviteRaw(famille.id, lea.cookie, yves.id), 403, 'forbidden')
    // Témoin : l'animatrice, elle, invite.
    expect((await inviteRaw(famille.id, ines.cookie, yves.id)).status).toBe(201)
  })

  it('answers 409 already hive member when inviting a member', async () => {
    const famille = await family()

    await expectError(await inviteRaw(famille.id, ines.cookie, lea.id), 409, 'already_hive_member')
  })
})

// ─── L'invitation refusée (Q1) et l'invitation expirée ────────────────────────────────────────────

describe('a refused or expired invitation', () => {
  /** Inès invite Yves dans Famille, et Yves refuse. */
  const refused = async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    later()
    await hives.refuse(invitation.id, yves.cookie)
    return famille
  }

  it('keeps showing a refused invitation as sent to the hive until it expires', async () => {
    const famille = await refused()

    // Léa, membre qui n'a pas invité Yves, voit l'invitation comme si elle attendait toujours.
    expect(await stateOf(famille.id, lea, 'yves', yves.id)).toBe('invited')
    expect((await hives.page(famille.id, lea.cookie)).pendingInvitations).toBe(1)

    await expire(lea)
    expect(await stateOf(famille.id, lea, 'yves', yves.id)).toBe('none')
    expect((await hives.page(famille.id, lea.cookie)).pendingInvitations).toBe(0)
  })

  it('keeps showing a refused invitation as sent to the inviter until it expires', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    later()
    const notices = await answer('GET', '/v1/notifications', ines.cookie)
    await hives.refuse(invitation.id, yves.cookie)

    // Inès, qui l'a invité, n'apprend rien : « Invitation envoyée », et aucune notification.
    expect(await stateOf(famille.id, ines, 'yves', yves.id)).toBe('invited')
    expect((await hives.page(famille.id, ines.cookie)).pendingInvitations).toBe(1)
    expect(await answer('GET', '/v1/notifications', ines.cookie)).toBe(notices)

    await expire(ines)
    expect(await stateOf(famille.id, ines, 'yves', yves.id)).toBe('none')
  })

  it('answers 409 already invited when re-inviting a member who refused', async () => {
    const famille = await refused()

    later()
    await expectError(await inviteRaw(famille.id, ines.cookie, yves.id), 409, 'already_invited')
    await expectError(await inviteRaw(famille.id, lea.cookie, yves.id), 409, 'already_invited')
    // Rien n'est revenu chez Yves.
    expect((await hives.mine(yves.cookie)).invitations).toEqual([])
  })

  it('answers 409 already invited to a second invitation still waiting', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)

    await expectError(await inviteRaw(famille.id, lea.cookie, yves.id), 409, 'already_invited')
  })

  it('re-invites a member whose invitation expired but is not yet purged', async () => {
    const famille = await refused()
    await expire(lea, yves)

    expect((await inviteRaw(famille.id, lea.cookie, yves.id)).status).toBe(201)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    expect(invitation.createdAt).toBe(new Date(Date.now()).toISOString())
    expect(invitation.inviter?.id).toBe(lea.id)
    expect((await hives.mine(yves.cookie)).invitations).toHaveLength(1)
    // La nouvelle invitation vaut, elle : Yves peut rejoindre.
    later()
    expect((await hives.accept(invitation.id, yves.cookie)).role).toBe('member')
  })

  it('answers 410 invitation expired to the invitee after 30 days, and drops it from their tab', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)

    await expire(yves)
    expect((await hives.mine(yves.cookie)).invitations).toEqual([])
    await expectError(
      await act.send('POST', `/v1/hive-invitations/${invitation.id}/accept`, yves.cookie),
      410,
      'invitation_expired',
    )
    expect((await hives.mine(yves.cookie)).hives).toEqual([])
  })

  it('answers 404, never expired, to a member who is not the invitee', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, yves.id)
    const invitation = await hives.invitationTo(famille.id, yves.cookie)
    const UNKNOWN = '00000000-0000-4000-8000-000000000000'
    const tries = (id: string): [string, string][] => [
      ['POST', `/v1/hive-invitations/${id}/accept`],
      ['DELETE', `/v1/hive-invitations/${id}`],
    ]
    const asUnknown = async (who: TestMember) => {
      const wrong: string[] = []
      for (const [index, [method, path]] of tries(invitation.id).entries()) {
        const got = await answer(method, path, who.cookie)
        const unknown = await answer(method, tries(UNKNOWN)[index]?.[1] ?? '', who.cookie)
        if (!got.startsWith('404 ') || got !== unknown) wrong.push(`${method} ${path}: ${got}`)
      }
      return wrong
    }

    // Léa (membre de la ruche), Nora (une inconnue) et Inès (qui a invité) : la même réponse qu'une
    // invitation qui n'existe pas, avant comme après les 30 jours.
    for (const who of [lea, nora, ines]) expect(await asUnknown(who)).toEqual([])
    await expire(lea, nora, ines, yves)
    for (const who of [lea, nora, ines]) expect(await asUnknown(who)).toEqual([])
    // Témoin : Yves, lui, apprend qu'elle a expiré.
    await expectError(
      await act.send('POST', `/v1/hive-invitations/${invitation.id}/accept`, yves.cookie),
      410,
      'invitation_expired',
    )
  })
})

// ─── Qui peut être invité ─────────────────────────────────────────────────────────────────────────

describe('who may be invited', () => {
  it('answers the same 404 for an unknown, unverified or blocked invitee, before any 409', async () => {
    const famille = await family()
    // Paul s'inscrit sans ouvrir son lien de vérification.
    await ctx.signUp(
      { name: 'Paul', email: 'paul@example.com', password: 'paul-long-password' },
      { 'x-real-ip': '198.51.100.90' },
    )
    const [paul] = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'paul@example.com'))
    // Zoé est invitée, puis bloque Inès ; Léa, membre, bloque Inès ; Inès bloque Nora. Sans le
    // blocage, Zoé et Léa répondraient 409 (déjà invitée, déjà membre) : le blocage passe avant.
    later()
    await hives.invite(famille.id, ines.cookie, zoe.id)
    later()
    await act.block(ines.id, zoe.cookie)
    later()
    await act.block(ines.id, lea.cookie)
    later()
    await act.block(nora.id, ines.cookie)

    const unknown = await answer('POST', `/v1/hives/${famille.id}/invitations`, ines.cookie, {
      userId: 'nobody',
    })
    expect(unknown).toMatch(/^404 /)
    for (const userId of [paul?.id ?? 'missing', zoe.id, lea.id, nora.id]) {
      expect(
        await answer('POST', `/v1/hives/${famille.id}/invitations`, ines.cookie, { userId }),
        userId,
      ).toBe(unknown)
    }
    // Témoin : Yves, ni bloqué ni bloquant, est invité.
    expect((await inviteRaw(famille.id, ines.cookie, yves.id)).status).toBe(201)
  })
})

// ─── La recherche « Inviter » ─────────────────────────────────────────────────────────────────────

describe('the invite search', () => {
  it('offers only followed members and hive co-members below three characters', async () => {
    const famille = await family()
    const malik = await another('Malik')
    const mathis = await another('Mathis')
    const manon = await another('Manon')
    later()
    await act.followMember(malik.id, ines.cookie)
    // Mathis est avec Inès dans une autre ruche.
    later()
    const amis = await hives.create(ines.cookie, 'Amis du jeudi', 'coffee')
    later()
    await hives.join(amis.id, ines.cookie, mathis)

    expect(ids(await hives.invitable(famille.id, ines.cookie, 'ma'))).toEqual(
      [malik.id, mathis.id].sort(),
    )
    // Témoin : dès 3 caractères, Manon, que rien ne relie à Inès, paraît aussi.
    expect(ids(await hives.invitable(famille.id, ines.cookie, 'man'))).toEqual([manon.id])
  })

  it('finds only followed members in the invite search under three characters', async () => {
    const famille = await family()
    const malik = await another('Malik')
    const manon = await another('Manon')
    later()
    await act.followMember(malik.id, ines.cookie)

    expect(ids(await hives.invitable(famille.id, ines.cookie, 'ma'))).toEqual([malik.id])
    // Suivre Manon la fait paraître sous 3 caractères.
    later()
    await act.followMember(manon.id, ines.cookie)
    expect(ids(await hives.invitable(famille.id, ines.cookie, 'ma'))).toEqual(
      [malik.id, manon.id].sort(),
    )
  })

  it('finds any member from three characters in the invite search, never one blocked either way', async () => {
    const famille = await family()
    const manon = await another('Manon')
    const manuel = await another('Manuel')
    const mandy = await another('Mandy')
    // Témoin : sans blocage, les trois paraissent dès 3 caractères, sans lien avec Inès.
    expect(ids(await hives.invitable(famille.id, ines.cookie, 'man'))).toEqual(
      [manon.id, manuel.id, mandy.id].sort(),
    )

    later()
    await act.block(manuel.id, ines.cookie)
    later()
    await act.block(ines.id, mandy.cookie)
    expect(ids(await hives.invitable(famille.id, ines.cookie, 'man'))).toEqual([manon.id])
    // Témoin : débloquer Manuel le fait revenir.
    later()
    await act.unblock(manuel.id, ines.cookie)
    expect(ids(await hives.invitable(famille.id, ines.cookie, 'man'))).toEqual(
      [manon.id, manuel.id].sort(),
    )
  })

  it('says who is already a member or invited, ignores accents, and never offers the searcher', async () => {
    const famille = await family()
    later()
    await hives.invite(famille.id, ines.cookie, zoe.id)

    expect(await stateOf(famille.id, ines, 'lea', lea.id)).toBe('member')
    expect(await stateOf(famille.id, ines, 'zoe', zoe.id)).toBe('invited')
    expect(await stateOf(famille.id, ines, 'nora', nora.id)).toBe('none')
    expect(await stateOf(famille.id, ines, 'haddad', ines.id)).toBeUndefined()
    // Témoin : Léa, elle, trouve Inès, membre.
    expect(await stateOf(famille.id, lea, 'haddad', ines.id)).toBe('member')
  })

  it('refuses a search of a single character', async () => {
    const famille = await family()

    await expectError(
      await act.send('GET', `/v1/hives/${famille.id}/invitable?q=y`, ines.cookie),
      400,
      'validation',
    )
  })

  it('counts invitable searches in the same hourly and daily quota as the search', async () => {
    const famille = await family()
    const keys = memberCounterKeys(ines.id)
    const invitable = () => act.send('GET', `/v1/hives/${famille.id}/invitable?q=yves`, ines.cookie)
    const search = () => act.send('GET', '/v1/search?q=yves', ines.cookie)
    const setCounter = async (key: string, count: number) => {
      await ctx.db.delete(schema.apiRateLimit).where(eq(schema.apiRateLimit.key, key))
      await ctx.db.insert(schema.apiRateLimit).values({ key, count, windowStart: Date.now() })
    }

    // Une recherche « Inviter » compte dans les deux compteurs de la recherche.
    expect((await invitable()).status).toBe(200)
    const counted = await ctx.db
      .select({ key: schema.apiRateLimit.key, count: schema.apiRateLimit.count })
      .from(schema.apiRateLimit)
    expect(counted).toEqual(
      expect.arrayContaining([
        { key: keys.searchHour, count: 1 },
        { key: keys.searchDay, count: 1 },
      ]),
    )

    // L'heure : la 600e passe, la suivante attend, et la recherche par mots aussi.
    await setCounter(keys.searchHour, 599)
    expect((await invitable()).status).toBe(200)
    await expectError(await invitable(), 429, 'rate_limited')
    await expectError(await search(), 429, 'rate_limited')

    // Le jour : une heure plus tard, la 2 000e passe, la suivante attend.
    later(HOUR + SECOND)
    await setCounter(keys.searchDay, 1999)
    expect((await invitable()).status).toBe(200)
    await expectError(await invitable(), 429, 'rate_limited')
    await expectError(await search(), 429, 'rate_limited')
  })
})
