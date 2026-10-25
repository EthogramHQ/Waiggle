// Formes des données liées aux comptes : inscription, profil, export.
// L'appli s'en sert pour valider les formulaires avant envoi ; l'API, pour valider ses réponses.
import { supportedLanguages } from '@ruche/i18n'
import { z } from 'zod'
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
  })
  .meta({ id: 'Me' })
export type Me = z.infer<typeof Me>
