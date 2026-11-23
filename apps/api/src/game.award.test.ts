// Tests de l'attribution du pollen elle-même (R19, plan, choix 2, 6 et 9), sans passer par les
// routes de geste : `award` appelé dans une transaction, comme le fera chaque route. Ils gardent les
// règles d'`award` (plafonds du jour et des réceptions, clé unique, comptes d'exemple et suspendus,
// miel de la semaine butinée), la révocation par la modération (`revokeFor`, `restoreFor`), la
// purge de l'autre membre (`clearCounterparts`, relecture J3), les semaines butinées
// (`loadForagedWeeks`) et l'accord des listes fermées de la base avec celles du contrat.
// Les mêmes règles vues depuis les routes : game.gestures, game.caps et game.moderation.test.ts.
import {
  FAMILIES,
  GESTURES,
  HIVE_CHALLENGES,
  HoneyReason,
  LedgerGesture,
  PERSONAL_CHALLENGES,
  PollenSourceKind,
} from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type AwardInput, award, clearCounterparts, restoreFor, revokeFor } from './game/award'
import { loadForagedWeeks, weekShift } from './game/weeks'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { signedUpMember, type TestMember } from './testing/hive-gestures'
import { gesturesOf, ledgerOf, markExample, suspend } from './testing/pollen-ledger'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: TestMember
let max: TestMember
let louis: TestMember

// Un lundi, 9 h à Paris.
const START = Date.parse('2026-11-23T08:00:00.000Z')
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const PROJECT = '3f1d7a52-7d0e-4a8f-9c41-0f4a8d1e2b6c'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.41')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.42')
  louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.43')
  await act.makeAdmin(louis.id)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Max réagit (sorte `kind`) au projet de Léa, comme le fera la route : lui, puis elle qui reçoit. */
const react = (kind: string) =>
  ctx.db.transaction(async (tx) => {
    vi.setSystemTime(Date.now() + MINUTE)
    const now = new Date()
    const source = { sourceKind: 'reaction', sourceId: PROJECT, projectId: PROJECT, now } as const
    const mine = await award(tx, {
      ...source,
      memberId: max.id,
      gesture: 'reaction',
      sourceKey: `${PROJECT}:${kind}`,
      counterpartId: lea.id,
    })
    const hers = await award(tx, {
      ...source,
      memberId: lea.id,
      gesture: 'receive_reaction',
      sourceKey: `${PROJECT}:${kind}:${max.id}`,
      counterpartId: max.id,
    })
    return [mine, hers]
  })

/**
 * `AwardInput` sans `now`, branche par branche : `Omit` sur une union (geste ou défi) la réduirait
 * à ses champs communs et perdrait `family`. `T extends unknown ? … : never` l'applique à chaque
 * membre de l'union séparément (un type « distributif »).
 */
type WithoutNow<T> = T extends unknown ? Omit<T, 'now'> : never

/** Un seul `award`, dans sa transaction, à l'heure de la fausse horloge. */
const once = (input: WithoutNow<AwardInput>) =>
  ctx.db.transaction((tx) => award(tx, { ...input, now: new Date() }))

const honeyOf = async (memberId: string) => {
  const result = (await ctx.db.execute(
    sql`select coalesce(sum(amount), 0)::int as honey from honey_entry where member_id = ${memberId}`,
  )) as unknown as { rows: { honey: number }[] }
  return result.rows[0]?.honey
}

describe('award', () => {
  it('pays who acts and who receives, once per thing', async () => {
    expect(await react('bravo')).toEqual([2, 1])
    expect(await react('bravo')).toEqual([0, 0])
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({
        gesture: 'reaction',
        family: 'forager',
        amount: 2,
        day: '2026-11-23',
      }),
    ])
    expect(await gesturesOf(ctx, lea.id)).toEqual([['receive_reaction', 1]])
  })

  it('stops at the daily cap of the gesture, and starts again at midnight in Paris', async () => {
    // Le plafond de la réaction est 25 : chaque sorte compte comme une chose différente.
    for (let index = 0; index < 25; index += 1) {
      const [mine] = await react(`kind-${index}`)
      expect(mine).toBe(2)
    }
    expect((await react('kind-25'))[0]).toBe(0)
    // 23 h 05 en temps universel : déjà 0 h 05 le lendemain à Paris.
    vi.setSystemTime(Date.parse('2026-11-23T23:04:00.000Z'))
    expect((await react('kind-26'))[0]).toBe(2)
  })

  it('caps what a member receives at 50 a day, exactly', async () => {
    // Des commentaires reçus (3 chacun) de 16 projets : 48, puis 51 refusé ; 1 de plus (réaction) : 49, 50.
    const receive = (index: number, gesture: 'receive_comment' | 'receive_reaction') =>
      once({
        memberId: lea.id,
        gesture,
        sourceKind: 'comment',
        sourceId: `c-${index}`,
        sourceKey: `c-${index}`,
        counterpartId: max.id,
      })
    for (let index = 0; index < 16; index += 1)
      expect(await receive(index, 'receive_comment')).toBe(3)
    expect(await receive(16, 'receive_comment')).toBe(0)
    expect(await receive(17, 'receive_reaction')).toBe(1)
    expect(await receive(18, 'receive_reaction')).toBe(1)
    expect(await receive(19, 'receive_reaction')).toBe(0)
  })

  it('pays nothing to a suspended member, nor anyone with an example account', async () => {
    await suspend(act, louis.cookie, lea.id)
    // Léa suspendue ne reçoit rien ; Max, qui agit, gagne quand même (relecture S2).
    expect(await react('bravo')).toEqual([2, 0])

    await markExample(ctx, lea.id)
    expect(await react('useful')).toEqual([0, 0])
  })

  it('credits the honey of a foraged week once, at its first helping gesture', async () => {
    const comment = (index: number) =>
      once({
        memberId: max.id,
        gesture: 'comment',
        sourceKind: 'comment',
        sourceId: `c-${index}`,
        sourceKey: `c-${index}`,
        counterpartId: lea.id,
        projectId: PROJECT,
      })
    await react('bravo') // réagir ne butine pas
    expect(await honeyOf(max.id)).toBe(0)
    expect(await comment(1)).toBe(10)
    expect(await comment(2)).toBe(10)
    expect(await honeyOf(max.id)).toBe(5)
    expect(await loadForagedWeeks(ctx.db, max.id, new Date())).toEqual({
      count: 1,
      hibernating: false,
      currentForaged: true,
    })

    // Deux semaines plus tard, sans geste qui aide : il hiverne.
    vi.setSystemTime(START + 14 * DAY)
    expect(await loadForagedWeeks(ctx.db, max.id, new Date())).toEqual({
      count: 1,
      hibernating: true,
      currentForaged: false,
    })
    expect(await loadForagedWeeks(ctx.db, lea.id, new Date())).toEqual({
      count: 0,
      hibernating: false,
      currentForaged: false,
    })
  })

  it('pays the pollen of a challenge outside the caps, in the family of its gesture', async () => {
    const challenge = await once({
      memberId: max.id,
      gesture: 'challenge',
      family: 'keeper',
      sourceKind: 'personal_challenge',
      sourceId: max.id,
      sourceKey: 'challenge:2026-11-23',
    })
    expect(challenge).toBe(20)
    expect(await ledgerOf(ctx, max.id)).toEqual([
      expect.objectContaining({ gesture: 'challenge', family: 'keeper', amount: 20 }),
    ])
  })
})

describe('revocation by moderation', () => {
  it('revokes the entries of a content and gives them back on restore', async () => {
    await once({
      memberId: max.id,
      gesture: 'comment',
      sourceKind: 'comment',
      sourceId: 'c-1',
      sourceKey: 'c-1',
      counterpartId: lea.id,
      projectId: PROJECT,
    })
    await once({
      memberId: lea.id,
      gesture: 'receive_comment',
      sourceKind: 'comment',
      sourceId: 'c-1',
      sourceKey: 'c-1',
      counterpartId: max.id,
      projectId: PROJECT,
    })
    await react('bravo')

    expect(
      await ctx.db.transaction((tx) => revokeFor(tx, { kind: 'comment', id: 'c-1' }, new Date())),
    ).toBe(2)
    const revoked = async (memberId: string) =>
      (await ledgerOf(ctx, memberId)).map((row) => [row.gesture, row.revoked])
    expect(await revoked(max.id)).toEqual([
      ['comment', true],
      ['reaction', false],
    ])
    await ctx.db.transaction((tx) => restoreFor(tx, { kind: 'comment', id: 'c-1' }))
    expect(await revoked(lea.id)).toEqual([
      ['receive_comment', false],
      ['receive_reaction', false],
    ])
  })

  it('revokes the publication and the receipts of a removed project, nothing of the others', async () => {
    await once({
      memberId: lea.id,
      gesture: 'publish',
      sourceKind: 'project',
      sourceId: PROJECT,
      sourceKey: PROJECT,
      projectId: PROJECT,
    })
    await once({
      memberId: max.id,
      gesture: 'follow',
      sourceKind: 'project',
      sourceId: PROJECT,
      sourceKey: `project:${PROJECT}`,
      counterpartId: lea.id,
    })
    await react('bravo')

    await ctx.db.transaction((tx) => revokeFor(tx, { kind: 'project', id: PROJECT }, new Date()))
    expect((await ledgerOf(ctx, lea.id)).map((row) => [row.gesture, row.revoked])).toEqual([
      ['publish', true],
      ['receive_reaction', true],
    ])
    expect((await ledgerOf(ctx, max.id)).every((row) => !row.revoked)).toBe(true)
  })

  it('revokes one part of a profile only', async () => {
    for (const [gesture, key] of [
      ['profile_photo', 'photo'],
      ['profile_bio', 'bio'],
    ] as const) {
      await once({
        memberId: max.id,
        gesture,
        sourceKind: 'profile',
        sourceId: max.id,
        sourceKey: key,
      })
    }
    await ctx.db.transaction((tx) =>
      revokeFor(tx, { kind: 'profile', memberId: max.id, part: 'avatar' }, new Date()),
    )
    expect((await ledgerOf(ctx, max.id)).map((row) => [row.gesture, row.revoked])).toEqual([
      ['profile_photo', true],
      ['profile_bio', false],
    ])
  })
})

describe('the nightly purge of the other member', () => {
  it('clears the counterpart once the following week is over', async () => {
    await react('bravo')
    const counterparts = async () => (await ledgerOf(ctx, max.id)).map((row) => row.counterpartId)

    vi.setSystemTime(START + 13 * DAY) // le dimanche de la semaine suivante
    expect(await clearCounterparts(ctx.db, new Date())).toBe(0)
    expect(await counterparts()).toEqual([lea.id])

    vi.setSystemTime(START + 14 * DAY) // le lundi d'après
    expect(await clearCounterparts(ctx.db, new Date())).toBe(2)
    expect(await counterparts()).toEqual([null])
  })

  it('shifts a week by whole weeks, across a change of time in Paris', () => {
    expect(weekShift('2026-10-19', 1)).toBe('2026-10-26')
    expect(weekShift('2026-11-23', -1)).toBe('2026-11-16')
  })
})

describe('the closed lists of the database', () => {
  /** Le texte de la contrainte `name` (pg_get_constraintdef : la contrainte telle que la base la garde). */
  const constraint = async (name: string) => {
    const result = (await ctx.db.execute(
      sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = ${name}`,
    )) as unknown as { rows: { def: string }[] }
    return result.rows[0]?.def ?? ''
  }
  const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`)

  it('allows every value of the contract, and only those', async () => {
    const lists: [string, readonly string[]][] = [
      ['pollen_entry_gesture_check', LedgerGesture.options],
      ['pollen_entry_family_check', FAMILIES],
      ['pollen_entry_source_kind_check', PollenSourceKind.options],
      ['honey_entry_reason_check', HoneyReason.options],
      ['personal_challenge_offered_check', PERSONAL_CHALLENGES.map(({ code }) => code)],
      ['hive_challenge_code_check', HIVE_CHALLENGES.map(({ code }) => code)],
    ]
    for (const [name, values] of lists) {
      const def = await constraint(name)
      const listed = def.match(/'[a-z0-9_]+'/g) ?? []
      expect(new Set(listed), name).toEqual(new Set(quoted(values)))
    }
    expect(GESTURES.length + 1).toBe(LedgerGesture.options.length)
  })
})
