// Formes des données liées aux comptes : inscription, profil, export.
// L'appli s'en sert pour valider les formulaires avant envoi ; l'API, pour valider ses réponses.
import { supportedLanguages } from '@ruche/i18n'
import { z } from 'zod'
import { Suspension } from './suspension'
import { DisplayName } from './text'

export const LanguageSchema = z.enum(supportedLanguages)

// Règles des mots de passe : 12 caractères minimum (recommandation de l'ANSSI pour un mot de passe
// seul), 128 maximum pour éviter qu'un texte géant ralentisse volontairement le serveur.
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export const Password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH)

// Le code d'invitation demandé à l'inscription (voir docs/scenarios/phase-1.md, « Inscription sur
// invitation »). Celui que règle le serveur fait au moins 12 caractères, pour qu'on ne puisse pas
// le deviner ; dans le formulaire, on vérifie seulement qu'un code a été tapé : c'est le serveur
// qui dit s'il est bon.
export const INVITE_CODE_MIN_LENGTH = 12
export const INVITE_CODE_MAX_LENGTH = 100
export const InviteCode = z.string().trim().min(1).max(INVITE_CODE_MAX_LENGTH)

/**
 * La forme « comparable » d'un code : sans espaces autour et en minuscules. Ainsi
 * « Miel-2026-Noel » et « miel-2026-noel » sont le même code.
 * normalize('NFKC') : un « ë » peut s'écrire d'un seul caractère ou de deux (« e » suivi du
 * tréma), selon le clavier. Les deux écritures deviennent identiques.
 */
export const normalizeInviteCode = (code: string) => code.normalize('NFKC').trim().toLowerCase()

export const SignUpRequest = z.object({
  name: DisplayName, // 1 à 80 caractères, sans caractère invisible (voir text.ts)
  email: z.email(),
  password: Password,
  inviteCode: InviteCode,
  language: LanguageSchema.optional(),
})
export type SignUpRequest = z.infer<typeof SignUpRequest>

export const SignInRequest = z.object({
  email: z.email(),
  password: z.string().min(1),
})
export type SignInRequest = z.infer<typeof SignInRequest>

/**
 * Demande de changement d'adresse (tranche « adresse », POST /api/auth/change-email). Le mot de
 * passe est exigé, comme pour supprimer le compte : une session ouverte ne suffit pas, sinon
 * quelqu'un qui trouve un téléphone allumé pourrait détourner le compte vers sa propre adresse.
 * Refus possibles, par leur code : INVALID_PASSWORD (mot de passe faux) et SAME_EMAIL (c'est déjà
 * l'adresse du compte). Une adresse prise par un autre compte reçoit la même réponse qu'une
 * adresse libre : on ne révèle pas qui a un compte.
 */
export const ChangeEmailRequest = z.object({
  newEmail: z.email(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})
export type ChangeEmailRequest = z.infer<typeof ChangeEmailRequest>

/**
 * Mot de passe oublié (tranche R2, POST /api/auth/request-password-reset). La réponse est la même
 * qu'un compte existe ou non, et l'e-mail ne part que s'il existe : on ne révèle pas qui a un
 * compte. Le lien reçu ouvre la page /reset-password de l'appli, valable une heure, une fois.
 */
export const ForgotPasswordRequest = z.object({
  email: z.email(),
})
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequest>

/**
 * Choisir un nouveau mot de passe depuis le lien reçu (POST /api/auth/reset-password). Un jeton
 * expiré, déjà utilisé ou abîmé reçoit le code INVALID_TOKEN, et l'écran dit la même chose dans
 * tous ces cas. Après le changement, tous les appareils du membre sont déconnectés.
 */
export const ResetPasswordRequest = z.object({
  token: z.string().min(1).max(256),
  newPassword: Password,
})
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>

/**
 * Changer son mot de passe depuis les réglages (POST /api/auth/change-password). L'actuel est
 * exigé ; les autres appareils sont déconnectés et celui-ci reste connecté (l'API l'impose, quoi
 * que dise la requête). Refus : INVALID_PASSWORD (mot de passe actuel faux), 429 (quota).
 */
export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: Password,
})
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>

/**
 * Renvoyer le lien de vérification (POST /api/auth/send-verification-email), depuis « Vérifie ta
 * boîte mail ». Même réponse que l'adresse ait un compte ou non ; au-delà du quota de l'adresse,
 * 429 avec l'en-tête Retry-After (l'appli dit alors à quelle heure réessayer).
 */
export const ResendVerificationRequest = z.object({
  email: z.email(),
})
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequest>

/**
 * Corriger son adresse avant de l'avoir vérifiée (POST /v1/account/unverified-email), sans
 * session : l'adresse actuelle et le mot de passe prouvent qu'on est bien le nouveau membre.
 * Refus : 401 `unauthorized` (adresse ou mot de passe incorrect, même réponse pour les deux),
 * 409 `already_verified` (le compte est déjà vérifié : il suffit de se connecter), 429 (quota).
 * Une nouvelle adresse déjà utilisée reçoit la même réponse qu'une adresse libre : l'écran dit
 * « Si cette adresse n'est pas déjà utilisée, un lien vient d'y partir. »
 */
export const ChangeUnverifiedEmailRequest = z
  .object({
    email: z.email(),
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newEmail: z.email(),
  })
  .meta({ id: 'ChangeUnverifiedEmailRequest' })
export type ChangeUnverifiedEmailRequest = z.infer<typeof ChangeUnverifiedEmailRequest>

/** La réponse : la nouvelle adresse, à laquelle le lien est parti si elle était libre. */
export const ChangeUnverifiedEmailResponse = z
  .object({
    sentTo: z.email(),
  })
  .meta({ id: 'ChangeUnverifiedEmailResponse' })
export type ChangeUnverifiedEmailResponse = z.infer<typeof ChangeUnverifiedEmailResponse>

/** Le profil du membre connecté, tel que renvoyé par GET /v1/me. */
export const Me = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Son pseudo, sans le « @ » (tranche 6a) : unique, modifiable dans « Mon profil ». */
    handle: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    language: LanguageSchema,
    createdAt: z.iso.datetime(), // date au format ISO, par exemple "2026-10-12T08:30:00.000Z"
    // Profil public (tranche 2)
    bio: z.string(),
    favoriteTools: z.array(z.string()),
    avatarUrl: z.url().nullable(), // null : pas encore d'avatar
    /**
     * Vrai si le membre est administrateur (tranche 7a) : l'appli montre alors « Modération ».
     * L'API refait la vérification à chaque route d'administration : ce champ ne donne aucun droit.
     */
    isAdmin: z.boolean(),
    /**
     * La suspension en cours (tranche 7c) ; null si le compte n'est pas suspendu. L'appli montre
     * alors le bandeau et retire les actions refusées ; l'API refuse ces actions de toute façon.
     */
    suspension: Suspension.nullable(),
  })
  .meta({ id: 'Me' })
export type Me = z.infer<typeof Me>
