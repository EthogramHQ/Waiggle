// Tests du contrat des réactions (tranche 5).
import { describe, expect, it } from 'vitest'
import { NO_REACTIONS, REACTION_KINDS, ReactionKind, ReactionState } from './reactions'

describe('ReactionKind', () => {
  it('accepts the five kinds, in display order', () => {
    expect(REACTION_KINDS).toEqual(['amazing', 'inspiring', 'useful', 'funny', 'bravo'])
    for (const kind of REACTION_KINDS) expect(ReactionKind.parse(kind)).toBe(kind)
  })

  it('refuses anything else, including a different case', () => {
    for (const kind of ['like', 'Bravo', '', 'bravo ']) {
      expect(ReactionKind.safeParse(kind).success).toBe(false)
    }
  })
})

describe('ReactionState', () => {
  it('accepts a project without any reaction', () => {
    expect(ReactionState.parse(NO_REACTIONS)).toEqual(NO_REACTIONS)
  })

  it('accepts counts with the member’s own kinds', () => {
    const state = {
      counts: { amazing: 2, inspiring: 0, useful: 1, funny: 0, bravo: 5 },
      mine: ['bravo', 'useful'],
    }
    expect(ReactionState.parse(state)).toEqual(state)
  })

  it('requires every kind in the counts, as a whole number that is not negative', () => {
    const { bravo: _bravo, ...missing } = NO_REACTIONS.counts
    expect(ReactionState.safeParse({ counts: missing, mine: [] }).success).toBe(false)
    expect(
      ReactionState.safeParse({ counts: { ...NO_REACTIONS.counts, bravo: -1 }, mine: [] }).success,
    ).toBe(false)
    expect(
      ReactionState.safeParse({ counts: { ...NO_REACTIONS.counts, bravo: 1.5 }, mine: [] }).success,
    ).toBe(false)
  })

  it('refuses the same kind twice in mine, or an unknown kind', () => {
    expect(ReactionState.safeParse({ ...NO_REACTIONS, mine: ['bravo', 'bravo'] }).success).toBe(
      false,
    )
    expect(ReactionState.safeParse({ ...NO_REACTIONS, mine: ['like'] }).success).toBe(false)
  })
})
