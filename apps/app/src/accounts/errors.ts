// Traduit une erreur renvoyée par Better Auth en clé de message de l'appli (auth.errors.*, et
// errors.* pour les deux accords de l'inscription, R11).
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

/**
 * Tranche R11 : les deux refus de l'inscription propres aux accords (400, contrat
 * `SignUpRefusalCode`). Leurs messages sont avec les autres erreurs de l'API (`errors.*` de
 * packages/i18n), pas dans `auth.errors.*` : on les garde donc hors d'`AuthErrorKey`, que tous
 * les écrans du compte lisent dans `auth.errors`.
 */
export type AccordErrorKey = 'rulesNotAccepted' | 'ageNotDeclared'

/** Ce que peut répondre une inscription : un refus du compte, ou l'un des deux accords. */
export type SignUpErrorKey = AuthErrorKey | AccordErrorKey

const byAccordCode: Record<string, AccordErrorKey> = {
  // La case « J'accepte les règles » n'est pas cochée (l'API le dit aussi s'il manque les deux).
  RULES_NOT_ACCEPTED: 'rulesNotAccepted',
  // La case « J'ai 15 ans ou plus » n'est pas cochée.
  AGE_NOT_DECLARED: 'ageNotDeclared',
}

/** La clé de message d'un refus de l'inscription : un accord d'abord, puis les refus du compte. */
export const signUpErrorKey = (error: {
  status: number
  code?: string | undefined
}): SignUpErrorKey => {
  // Un 429 reste « Trop d'essais », quel que soit son code.
  const accord = error.status === 429 || !error.code ? undefined : byAccordCode[error.code]
  return accord ?? authErrorKey(error)
}

/**
 * Vrai pour un refus d'accord. Un « prédicat de type » (`key is AccordErrorKey`) : après ce test,
 * TypeScript sait dans quelle section lire le message (`errors` ou `auth.errors`).
 */
export const isAccordError = (key: SignUpErrorKey): key is AccordErrorKey =>
  key === 'rulesNotAccepted' || key === 'ageNotDeclared'
