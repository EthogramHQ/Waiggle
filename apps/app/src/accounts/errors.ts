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
  // Tranche « adresse » : le mot de passe demandé pour changer d'adresse (ou supprimer le compte)
  // est faux ; la nouvelle adresse est déjà celle du compte.
  | 'wrongPassword'
  | 'sameEmail'
  // Un refus 401 sans code connu : la session a expiré en cours de route.
  | 'sessionExpired'
  // Tranche R2 : le lien « nouveau mot de passe » est refusé (expiré, déjà servi ou abîmé : un seul
  // message pour toutes les causes, jur-16) ; le compte est déjà vérifié (corriger son adresse
  // avant vérification n'a plus de sens : il suffit de se connecter).
  | 'invalidToken'
  | 'alreadyVerified'
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
  // Changer d'adresse (POST /api/auth/change-email, contrat ChangeEmailRequest).
  INVALID_PASSWORD: 'wrongPassword',
  SAME_EMAIL: 'sameEmail',
  // Nouveau mot de passe depuis le lien reçu (POST /api/auth/reset-password, contrat
  // ResetPasswordRequest) : Better Auth dit INVALID_TOKEN quelle que soit la cause.
  INVALID_TOKEN: 'invalidToken',
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
  // Un code connu passe d'abord : un mot de passe faux à la connexion répond aussi 401
  // (INVALID_EMAIL_OR_PASSWORD), et ce n'est pas une session expirée.
  const known = code ? byCode[code] : undefined
  if (known) return known
  // 401 = « Unauthorized » : plus de session valide (expirée, ou fermée depuis un autre appareil)
  // quand le membre envoie le formulaire (changer d'adresse, supprimer le compte).
  if (status === 401) return 'sessionExpired'
  return 'generic'
}
