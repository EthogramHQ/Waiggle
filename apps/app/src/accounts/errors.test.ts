import { authErrorKey } from './errors'

// Better Auth renvoie un code d'erreur technique (en anglais) ; l'appli le traduit en message clair.
describe('authErrorKey', () => {
  it('recognises a wrong email or password', () => {
    expect(authErrorKey({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      'invalidCredentials',
    )
  })

  it('recognises an address that is not verified yet', () => {
    expect(authErrorKey({ status: 403, code: 'EMAIL_NOT_VERIFIED' })).toBe('emailNotVerified')
  })

  it('recognises too many attempts from the status alone', () => {
    expect(authErrorKey({ status: 429 })).toBe('tooManyAttempts')
  })

  it('recognises password length problems', () => {
    expect(authErrorKey({ status: 400, code: 'PASSWORD_TOO_SHORT' })).toBe('passwordTooShort')
    expect(authErrorKey({ status: 400, code: 'PASSWORD_TOO_LONG' })).toBe('passwordTooLong')
  })

  it('recognises a refused invite code', () => {
    expect(authErrorKey({ status: 403, code: 'INVITE_CODE_INVALID' })).toBe('inviteInvalid')
  })

  it('falls back to a generic message for anything unexpected', () => {
    expect(authErrorKey({ status: 500, code: 'SOMETHING_ELSE' })).toBe('generic')
    expect(authErrorKey({ status: 0 })).toBe('generic')
  })
})
