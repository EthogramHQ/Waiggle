import { describe, expect, it } from 'vitest'
import { normalizeInviteCode, SignUpRequest } from './accounts'

const valid = {
  name: 'Léa',
  email: 'lea@example.com',
  password: 'correct-horse-battery',
  inviteCode: 'miel-2026-noel',
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
