// Tests du contrat des règles (tranche R11) : la forme de la version, l'accord envoyé depuis
// l'écran « Accepter », l'accord tel que l'export le montre, et les quatre pages publiques.
import { describe, expect, it } from 'vitest'
import {
  AcceptRules,
  LEGAL_PAGES,
  LegalPage,
  RULES_CHANGES,
  RULES_VERSION,
  RulesAcceptance,
  RulesVersion,
} from './rules'

const accept = { version: RULES_VERSION, acceptRules: true, ageDeclared: true }

describe('RULES_VERSION', () => {
  it('is a calendar date written YYYY-MM-DD', () => {
    expect(RULES_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(RulesVersion.safeParse(RULES_VERSION).success).toBe(true)
  })

  it('refuses a day that does not exist, or another way of writing a date', () => {
    expect(RulesVersion.safeParse('2026-11-31').success).toBe(false)
    expect(RulesVersion.safeParse('16/11/2026').success).toBe(false)
    expect(RulesVersion.safeParse('2026-11-16T00:00:00Z').success).toBe(false)
  })

  it('has no change to show for the first version', () => {
    expect(RULES_CHANGES).toEqual([])
  })
})

describe('AcceptRules', () => {
  it('accepts the current version with both boxes ticked', () => {
    expect(AcceptRules.parse(accept)).toEqual(accept)
  })

  it('refuses any other version than the current one', () => {
    expect(AcceptRules.safeParse({ ...accept, version: '2020-01-01' }).success).toBe(false)
    expect(AcceptRules.safeParse({ ...accept, version: undefined }).success).toBe(false)
  })

  it('only takes the boolean true for each box, never "true" or 1', () => {
    for (const field of ['acceptRules', 'ageDeclared'] as const) {
      for (const value of ['true', 1, false, null, undefined]) {
        expect(AcceptRules.safeParse({ ...accept, [field]: value }).success).toBe(false)
      }
    }
  })
})

describe('RulesAcceptance', () => {
  it('shows a version, its date and the age declaration', () => {
    const row = {
      version: RULES_VERSION,
      acceptedAt: '2026-11-16T08:30:00.000Z',
      ageDeclared: true,
    }
    expect(RulesAcceptance.parse(row)).toEqual(row)
  })

  it('never keeps an acceptance without the age declaration', () => {
    const row = {
      version: RULES_VERSION,
      acceptedAt: '2026-11-16T08:30:00.000Z',
      ageDeclared: false,
    }
    expect(RulesAcceptance.safeParse(row).success).toBe(false)
  })
})

describe('LEGAL_PAGES', () => {
  it('names the four public pages, which are also their addresses', () => {
    expect(LEGAL_PAGES).toEqual(['rules', 'privacy', 'legal', 'accessibility'])
    expect(LegalPage.safeParse('privacy').success).toBe(true)
    expect(LegalPage.safeParse('terms').success).toBe(false)
  })
})
