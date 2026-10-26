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

  // Tranche « adresse » : changer son adresse demande le mot de passe, et une adresse neuve.
  it('recognises a wrong password', () => {
    expect(authErrorKey({ status: 400, code: 'INVALID_PASSWORD' })).toBe('wrongPassword')
  })

  it('recognises a new address that is already the current one', () => {
    expect(authErrorKey({ status: 400, code: 'SAME_EMAIL' })).toBe('sameEmail')
  })

  it('falls back to a generic message for anything unexpected', () => {
    expect(authErrorKey({ status: 500, code: 'SOMETHING_ELSE' })).toBe('generic')
  })

  it('says the session has expired on a refusal without a known code, never for a wrong password', () => {
    // Tranche « adresse » (des-4) : changer d'adresse ou supprimer son compte après l'expiration.
    expect(authErrorKey({ status: 401 })).toBe('sessionExpired')
    expect(authErrorKey({ status: 401, code: 'UNAUTHORIZED' })).toBe('sessionExpired')
    // Témoin : un mot de passe faux à la connexion répond aussi 401, avec son code.
    expect(authErrorKey({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      'invalidCredentials',
    )
    expect(authErrorKey({ status: 0 })).toBe('generic')
  })
})
