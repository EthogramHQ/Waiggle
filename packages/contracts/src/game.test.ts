// Tests des règles chiffrées du jeu (R19, docs/scenarios/refonte.md, « R19 — La gamification ») :
// le niveau et le rayon, les familles, la semaine de Paris, le tirage des défis, le prix d'une
// décoration, les sceaux, et ce que les routes acceptent. Ce sont des fonctions pures du contrat :
// elles passent dès l'écriture, et gardent les règles contre un changement qui les affaiblirait.
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_SEAL_TARGET,
  challengeFor,
  DECORATIONS,
  DecorationChoice,
  dayOf,
  decorationPrice,
  FAMILIES,
  familyOf,
  GAME_HIVES_MAX,
  GameSettingsUpdate,
  GESTURES,
  HIVE_CHALLENGES,
  HONEY,
  HoneyShortError,
  levelFor,
  levelProgress,
  levelStart,
  MILESTONE_SEALS,
  PERSONAL_CHALLENGES,
  PersonalChallengeState,
  POLLEN_GESTURES,
  RankingQuery,
  RECEIVE_DAILY_CAP,
  SEALS,
  SealCode,
  sealCategory,
  weekOf,
} from './game'
import { HIVE_LIMITS } from './hives'
import { PROJECT_CATEGORIES } from './projects'

describe('levelFor', () => {
  it('starts level n at 50 × n × (n − 1) pollen', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(99)).toBe(1)
    expect(levelFor(100)).toBe(2)
    expect(levelFor(299)).toBe(2)
    expect(levelFor(300)).toBe(3)
    expect(levelFor(600)).toBe(4)
    expect(levelFor(1000)).toBe(5)
    expect(levelFor(4500)).toBe(10)
    expect(levelFor(4499)).toBe(9)
  })

  it('has no ceiling and stays exact on every threshold', () => {
    for (let level = 1; level <= 300; level += 1) {
      expect(levelFor(levelStart(level))).toBe(level)
      expect(levelFor(levelStart(level) - 1)).toBe(Math.max(1, level - 1))
    }
  })

  it('keeps level 1 for a negative or absurd total', () => {
    expect(levelFor(-50)).toBe(1)
    expect(levelFor(Number.NaN)).toBe(1)
  })
})

describe('levelProgress', () => {
  it('reads « 120 pollen avant le niveau 5 » at 880 pollen, 7 cells filled', () => {
    expect(levelProgress(880)).toEqual({ level: 4, cells: 7, toNext: 120 })
  })

  it('starts a level with no cell filled and never fills the tenth', () => {
    expect(levelProgress(0)).toEqual({ level: 1, cells: 0, toNext: 100 })
    expect(levelProgress(300)).toEqual({ level: 3, cells: 0, toNext: 300 })
    expect(levelProgress(599)).toEqual({ level: 3, cells: 9, toNext: 1 })
  })
})

describe('the gestures', () => {
  it('gives each gesture of the scenario its amount and daily cap', () => {
    expect(POLLEN_GESTURES.feedback).toMatchObject({ amount: 25, dailyCap: 4 })
    expect(POLLEN_GESTURES.feedback_settled).toMatchObject({ amount: 25, dailyCap: null })
    expect(POLLEN_GESTURES.tester).toMatchObject({ amount: 10, dailyCap: 5 })
    expect(POLLEN_GESTURES.comment).toMatchObject({ amount: 10, dailyCap: 10 })
    expect(POLLEN_GESTURES.publish).toMatchObject({ amount: 50, dailyCap: 2 })
    expect(POLLEN_GESTURES.update).toMatchObject({ amount: 20, dailyCap: 3 })
    expect(POLLEN_GESTURES.reaction).toMatchObject({ amount: 2, dailyCap: 25 })
    expect(POLLEN_GESTURES.follow).toMatchObject({ amount: 3, dailyCap: 10 })
    expect(POLLEN_GESTURES.hive_created).toMatchObject({ amount: 15, dailyCap: 1 })
    expect(POLLEN_GESTURES.invitation_accepted).toMatchObject({ amount: 20, dailyCap: 5 })
    expect(POLLEN_GESTURES.invitation_joined).toMatchObject({ amount: 15 })
    for (const part of ['profile_photo', 'profile_bio', 'profile_tool'] as const) {
      expect(POLLEN_GESTURES[part]).toMatchObject({ amount: 10, dailyCap: null })
    }
  })

  it('caps what is received at 50 a day, all receptions together', () => {
    expect(RECEIVE_DAILY_CAP).toBe(50)
    const received = GESTURES.filter((gesture) => POLLEN_GESTURES[gesture].receive)
    expect(received.map((gesture) => POLLEN_GESTURES[gesture].amount)).toEqual([5, 5, 3, 1])
  })

  it('puts each gesture in its family', () => {
    expect(familyOf('reaction')).toBe('forager')
    expect(familyOf('comment')).toBe('forager')
    expect(familyOf('follow')).toBe('forager')
    expect(familyOf('publish')).toBe('builder')
    expect(familyOf('profile_bio')).toBe('builder')
    expect(familyOf('receive_reaction')).toBe('builder')
    expect(familyOf('tester')).toBe('keeper')
    expect(familyOf('feedback_settled')).toBe('keeper')
    expect(familyOf('hive_created')).toBe('dancer')
    expect(familyOf('invitation_joined')).toBe('dancer')
    expect(FAMILIES).toEqual(['forager', 'builder', 'keeper', 'dancer'])
  })
})

describe('the weeks of Paris', () => {
  it('gives the Monday of the Paris week, as YYYY-MM-DD', () => {
    // Le lundi 23 novembre 2026 à midi, et le dimanche 29 au soir : la même semaine.
    expect(weekOf(new Date('2026-11-23T11:00:00Z'))).toBe('2026-11-23')
    expect(weekOf(new Date('2026-11-29T21:00:00Z'))).toBe('2026-11-23')
  })

  it('turns the week at midnight in Paris, not at midnight UTC', () => {
    // Dimanche 29 novembre, 23 h 30 UTC = lundi 30, 0 h 30 à Paris (heure d'hiver, UTC+1).
    expect(weekOf(new Date('2026-11-29T23:30:00Z'))).toBe('2026-11-30')
    expect(dayOf(new Date('2026-11-29T23:30:00Z'))).toBe('2026-11-30')
    // Dimanche 28 juin, 22 h 30 UTC = lundi 29, 0 h 30 à Paris (heure d'été, UTC+2).
    expect(weekOf(new Date('2026-06-28T22:30:00Z'))).toBe('2026-06-29')
    expect(weekOf(new Date('2026-06-28T21:30:00Z'))).toBe('2026-06-22')
  })

  it('crosses a month and a year', () => {
    expect(weekOf(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28')
  })
})

describe('challengeFor', () => {
  it('draws the same order for the same seed and week', () => {
    const first = challengeFor('member-1', '2026-11-23', PERSONAL_CHALLENGES)
    expect(challengeFor('member-1', '2026-11-23', PERSONAL_CHALLENGES)).toEqual(first)
  })

  it('keeps every challenge once, and leaves the list untouched', () => {
    const codes = PERSONAL_CHALLENGES.map((challenge) => challenge.code)
    const drawn = challengeFor('member-1', '2026-11-23', PERSONAL_CHALLENGES)
    expect(drawn.map((challenge) => challenge.code).sort()).toEqual([...codes].sort())
    expect(PERSONAL_CHALLENGES.map((challenge) => challenge.code)).toEqual(codes)
  })

  it('changes from one member or week to another', () => {
    const orders = new Set<string>()
    for (let i = 0; i < 20; i += 1) {
      orders.add(
        challengeFor(`member-${i}`, '2026-11-23', HIVE_CHALLENGES)
          .map((challenge) => challenge.code)
          .join(),
      )
    }
    expect(orders.size).toBeGreaterThan(3)
  })
})

describe('the challenges', () => {
  it('lists five personal and five hive challenges with their targets', () => {
    expect(PERSONAL_CHALLENGES.map((c) => [c.gesture, c.target])).toEqual([
      ['feedback', 1],
      ['update', 1],
      ['tester', 1],
      ['comment', 3],
      ['reaction', 5],
    ])
    expect(HIVE_CHALLENGES.map((c) => [c.gesture, c.target])).toEqual([
      ['feedback', 5],
      ['update', 3],
      ['tester', 3],
      ['reaction', 10],
      ['comment', 5],
    ])
  })

  it('offers the same three again after « Pas cette semaine »', () => {
    const offered = ['feedback', 'update', 'comment_3']
    expect(PersonalChallengeState.safeParse({ state: 'none', offered }).success).toBe(true)
    expect(PersonalChallengeState.safeParse({ state: 'none' }).success).toBe(false)
    expect(
      PersonalChallengeState.safeParse({ state: 'choose', offered: offered.slice(0, 2) }).success,
    ).toBe(false)
  })
})

describe('the honey', () => {
  it('earns 5 a foraged week, 10 a challenge, 10 a hive challenge, and gives 5', () => {
    expect(HONEY).toEqual({ week: 5, challenge: 10, hiveChallenge: 10, gift: 5 })
  })

  it('prices only what is not bought yet', () => {
    const free = { tints: ['honey' as const], patterns: ['smooth' as const] }
    expect(decorationPrice({ tint: 'amber', pattern: 'waffle' }, free)).toBe(25)
    expect(decorationPrice({ tint: 'amber', pattern: 'smooth' }, free)).toBe(10)
    expect(
      decorationPrice(
        { tint: 'amber', pattern: 'waffle' },
        { tints: ['honey', 'amber'], patterns: ['smooth', 'waffle'] },
      ),
    ).toBe(0)
    expect(DECORATIONS.tint.honey + DECORATIONS.pattern.smooth).toBe(0)
  })

  it('accepts a tint and a pattern of the list, nothing else', () => {
    expect(DecorationChoice.safeParse({ tint: 'pollen', pattern: 'dotted' }).success).toBe(true)
    expect(DecorationChoice.safeParse({ tint: 'cream', pattern: 'dotted' }).success).toBe(false)
    expect(
      DecorationChoice.safeParse({ tint: 'pollen', pattern: 'dotted', price: 0 }).success,
    ).toBe(false)
  })

  it('tells the price and the balance in a honey_short error', () => {
    const body = {
      error: { code: 'honey_short', message: 'Pas assez de miel.', needed: 5, balance: 2 },
    }
    expect(HoneyShortError.parse(body)).toEqual(body)
  })
})

describe('the seals', () => {
  it('has eleven milestones and one seal per category, « other » left out', () => {
    expect(MILESTONE_SEALS).toHaveLength(11)
    const categories = PROJECT_CATEGORIES.filter((category) => category !== 'other')
    expect(SEALS).toHaveLength(11 + categories.length)
    for (const category of categories) {
      const seal = SEALS.find((s) => s.code === category)
      expect(seal?.rule).toEqual({ kind: 'category', category, target: CATEGORY_SEAL_TARGET })
      expect(seal?.matter).toBe('cream')
    }
    expect(SealCode.safeParse('other').success).toBe(false)
  })

  it('gives each seal a single code', () => {
    expect(new Set(SEALS.map((seal) => seal.code)).size).toBe(SEALS.length)
  })

  it('accepts a category created later as a seal, and tells milestones from categories', () => {
    expect(SealCode.safeParse('gardening-tools').success).toBe(true)
    expect(SealCode.safeParse('first_settled').success).toBe(true)
    expect(SealCode.safeParse('first_fix').success).toBe(false)
    expect(sealCategory('cooking')).toBe('cooking')
    expect(sealCategory('hive_5')).toBeNull()
    // Un code de palier a toujours un « _ », qu'un code de catégorie n'a jamais.
    for (const seal of MILESTONE_SEALS) expect(seal.code).toContain('_')
  })
})

describe('GameSettingsUpdate', () => {
  it('accepts one setting or the challenge choice', () => {
    for (const body of [
      { titleForm: 'm' },
      { pinnedFamily: null },
      { pinnedFamily: 'keeper' },
      { inRankings: false },
      { harvestNotices: false },
      { levelSeen: 4 },
      { personalChallenge: 'comment_3' },
      { personalChallenge: 'none' },
    ]) {
      expect(GameSettingsUpdate.safeParse(body).success, JSON.stringify(body)).toBe(true)
    }
  })

  it('refuses an empty body, an unknown field, a family or challenge out of the list', () => {
    for (const body of [
      {},
      { honey: 100 },
      { pinnedFamily: 'scout' },
      { personalChallenge: 'feedback_5' },
      { levelSeen: 0 },
      { titleForm: 'x' },
    ]) {
      expect(GameSettingsUpdate.safeParse(body).success, JSON.stringify(body)).toBe(false)
    }
  })
})

describe('RankingQuery', () => {
  const hive = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'

  it('wants a hive with the scope « hive », and only with it', () => {
    expect(RankingQuery.safeParse({ scope: 'close' }).success).toBe(true)
    expect(RankingQuery.safeParse({ scope: 'hive', hive }).success).toBe(true)
    expect(RankingQuery.safeParse({ scope: 'hive' }).success).toBe(false)
    expect(RankingQuery.safeParse({ scope: 'close', hive }).success).toBe(false)
    expect(RankingQuery.safeParse({ scope: 'hive', hive: 'not-a-uuid' }).success).toBe(false)
  })
})

it('allows one hive challenge per hive one can join', () => {
  expect(GAME_HIVES_MAX).toBe(HIVE_LIMITS.joined)
})
