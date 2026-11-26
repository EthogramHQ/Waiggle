import { describe, expect, it } from 'vitest'
import { Me, normalizeInviteCode, SignUpRefusalCode, SignUpRequest } from './accounts'

const valid = {
  name: 'Léa',
  email: 'lea@example.com',
  password: 'correct-horse-battery',
  inviteCode: 'miel-2026-noel',
  // R11 : les deux cases de l'inscription, cochées.
  acceptRules: true,
  ageDeclared: true,
}

describe('SignUpRequest', () => {
  it('accepts a name, an email, a password of at least 12 characters and an invite code', () => {
    expect(SignUpRequest.safeParse(valid).success).toBe(true)
  })

  it('refuses a password shorter than 12 characters', () => {
    expect(SignUpRequest.safeParse({ ...valid, password: 'short-pass1' }).success).toBe(false)
  })

  it('refuses an invalid email address', () => {
    expect(SignUpRequest.safeParse({ ...valid, email: 'lea.example.com' }).success).toBe(false)
  })

  it('refuses a name made only of spaces', () => {
    expect(SignUpRequest.safeParse({ ...valid, name: '   ' }).success).toBe(false)
  })

  it('only accepts supported languages', () => {
    expect(SignUpRequest.safeParse({ ...valid, language: 'en' }).success).toBe(true)
    expect(SignUpRequest.safeParse({ ...valid, language: 'de' }).success).toBe(false)
  })

  it('requires an invite code, spaces alone do not count', () => {
    const { inviteCode: _, ...withoutCode } = valid
    expect(SignUpRequest.safeParse(withoutCode).success).toBe(false)
    expect(SignUpRequest.safeParse({ ...valid, inviteCode: '   ' }).success).toBe(false)
  })

  it('refuses an invite code longer than 100 characters', () => {
    expect(SignUpRequest.safeParse({ ...valid, inviteCode: 'a'.repeat(101) }).success).toBe(false)
  })

  it('requires both boxes: the rules and the age, each on its own', () => {
    const { acceptRules: _rules, ...withoutRules } = valid
    const { ageDeclared: _age, ...withoutAge } = valid
    expect(SignUpRequest.safeParse(withoutRules).success).toBe(false)
    expect(SignUpRequest.safeParse(withoutAge).success).toBe(false)
    expect(SignUpRequest.safeParse({ ...valid, acceptRules: false }).success).toBe(false)
    expect(SignUpRequest.safeParse({ ...valid, ageDeclared: false }).success).toBe(false)
  })

  it('only takes the boolean true for a box, never "true" or 1', () => {
    for (const value of ['true', 1, 'on']) {
      expect(SignUpRequest.safeParse({ ...valid, acceptRules: value }).success).toBe(false)
      expect(SignUpRequest.safeParse({ ...valid, ageDeclared: value }).success).toBe(false)
    }
  })
})

describe('SignUpRefusalCode', () => {
  it('names the refusals the app recognizes', () => {
    expect(SignUpRefusalCode.options).toEqual([
      'INVITE_CODE_INVALID',
      'RULES_NOT_ACCEPTED',
      'AGE_NOT_DECLARED',
      'SCOUT_FULL',
      'SCOUT_CLOSED',
    ])
  })
})

describe('Me', () => {
  const me = {
    id: 'lea-id',
    name: 'Léa',
    handle: 'lea',
    email: 'lea@example.com',
    emailVerified: true,
    language: 'fr',
    createdAt: '2026-10-12T08:30:00.000Z',
    bio: '',
    favoriteTools: [],
    avatarUrl: null,
    isAdmin: false,
    suspension: null,
    provisional: { name: false, handle: false },
    hideFromSuggestions: false,
    rulesAccepted: true,
    rulesChanges: [],
    // R20 : jamais Éclaireuse.
    scout: null,
  }

  it('says whether the current rules are accepted, and what changed', () => {
    expect(Me.parse(me)).toEqual(me)
    const later = { ...me, rulesAccepted: false, rulesChanges: ['rules.changes.example'] }
    expect(Me.parse(later)).toEqual(later)
    const { rulesAccepted: _, ...without } = me
    expect(Me.safeParse(without).success).toBe(false)
  })
})

describe('normalizeInviteCode', () => {
  it('ignores capital letters and the spaces around the code', () => {
    expect(normalizeInviteCode('  Miel-2026-NOEL ')).toBe(normalizeInviteCode('miel-2026-noel'))
  })

  it('treats the two ways of typing an accented letter as the same code', () => {
    // « ë » en un seul caractère, ou « e » suivi du tréma (U+0308).
    expect(normalizeInviteCode('no\u00EBl-en-famille')).toBe(
      normalizeInviteCode('noe\u0308l-en-famille'),
    )
  })

  it('keeps the spaces inside the code', () => {
    expect(normalizeInviteCode('miel 2026')).not.toBe(normalizeInviteCode('miel2026'))
  })
})
