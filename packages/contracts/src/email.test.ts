// Tests du contrat des e-mails, pour ce qu'y ajoute la tranche R11 : le réglage « Découvertes »
// du récap, sa désinscription, et les durées des comptes inactifs.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EMAIL_PREFERENCES,
  EmailPreferences,
  EmailPreferencesExport,
  EmailPreferencesPatch,
  INACTIVE_ACCOUNT_YEARS,
  INACTIVE_NOTICE_DAYS,
  UnsubscribeQuery,
} from './email'

const token = `v1.bGVh.recap.${'a'.repeat(43)}`

describe('discoveries', () => {
  it('is in the recap by default, for every member', () => {
    expect(DEFAULT_EMAIL_PREFERENCES.discoveries).toBe('digest')
    expect(EmailPreferences.parse(DEFAULT_EMAIL_PREFERENCES)).toEqual(DEFAULT_EMAIL_PREFERENCES)
  })

  it('is in the recap or never, never an e-mail of its own', () => {
    expect(EmailPreferencesPatch.safeParse({ discoveries: 'never' }).success).toBe(true)
    expect(EmailPreferencesPatch.safeParse({ discoveries: 'digest' }).success).toBe(true)
    expect(EmailPreferencesPatch.safeParse({ discoveries: 'now' }).success).toBe(false)
    expect(
      EmailPreferences.safeParse({ ...DEFAULT_EMAIL_PREFERENCES, discoveries: 'now' }).success,
    ).toBe(false)
  })

  it('changes alone, like every other setting', () => {
    expect(EmailPreferencesPatch.safeParse({ discoveries: 'never', hives: 'never' }).success).toBe(
      false,
    )
  })

  it('is in the export of the e-mail settings', () => {
    const exported = {
      ...DEFAULT_EMAIL_PREFERENCES,
      recapSentAt: null,
      recapUnvisited: 0,
      instantSentAt: null,
      recapV2At: null,
      updatedAt: null,
    }
    expect(EmailPreferencesExport.parse(exported).discoveries).toBe('digest')
    const { discoveries: _, ...without } = exported
    expect(EmailPreferencesExport.safeParse(without).success).toBe(false)
  })

  it('can be turned off from an unsubscribe link', () => {
    expect(UnsubscribeQuery.safeParse({ token, scope: 'discoveries' }).success).toBe(true)
    expect(UnsubscribeQuery.safeParse({ token, scope: 'all' }).success).toBe(true)
    expect(UnsubscribeQuery.safeParse({ token, scope: 'friends' }).success).toBe(false)
  })
})

describe('inactive accounts', () => {
  it('are deleted after 3 years, with a warning 30 days before', () => {
    expect(INACTIVE_ACCOUNT_YEARS).toBe(3)
    expect(INACTIVE_NOTICE_DAYS).toBe(30)
  })
})
