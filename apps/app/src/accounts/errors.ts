// Traduit une erreur renvoyée par Better Auth en clé de message de l'appli (auth.errors.*).
// Les codes techniques (INVALID_EMAIL_OR_PASSWORD…) ne sont jamais montrés tels quels au membre.

export type AuthErrorKey =
  | 'invalidCredentials'
  | 'emailNotVerified'
  | 'tooManyAttempts'
  | 'passwordTooShort'
  | 'passwordTooLong'
  | 'invalidEmail'
  | 'inviteInvalid'
  | 'generic'

// Correspondance code Better Auth → clé de message. Record<string, …> : un dictionnaire.
const byCode: Record<string, AuthErrorKey> = {
  INVALID_EMAIL_OR_PASSWORD: 'invalidCredentials',
  EMAIL_NOT_VERIFIED: 'emailNotVerified',
  PASSWORD_TOO_SHORT: 'passwordTooShort',
  PASSWORD_TOO_LONG: 'passwordTooLong',
  INVALID_EMAIL: 'invalidEmail',
  // Code d'invitation faux ou absent (apps/api/src/auth/auth.ts).
  INVITE_CODE_INVALID: 'inviteInvalid',
}

export const authErrorKey = ({
  status,
  code,
}: {
  status: number
  code?: string | undefined
}): AuthErrorKey => {
  // 429 = « Too Many Requests » : la limitation de débit de l'API s'est déclenchée.
  if (status === 429) return 'tooManyAttempts'
  return (code && byCode[code]) || 'generic'
}
