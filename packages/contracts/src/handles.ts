// Le pseudo d'un membre (« @ines_morel ») : sa forme, ses limites et les mots qu'on ne peut pas
// prendre. Partagé par l'API (qui le vérifie et le garde unique) et l'appli (qui prévient avant
// d'envoyer). Un pseudo sert à mentionner quelqu'un (tranche 6b) ; le nom, lui, reste libre et
// peut être porté par plusieurs membres.
import { textVariables } from '@ruche/i18n'
import { z } from 'zod'

export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 20
/** Combien de jours l'ancien pseudo reste réservé à son propriétaire après un changement. */
export const HANDLE_RESERVATION_DAYS = 30
/** Combien de fois par jour un membre peut changer de pseudo (anti-abus). */
export const HANDLE_CHANGES_PER_DAY = 5

/**
 * Les mots qu'aucun pseudo ne peut contenir, même au milieu (« waiggle_team », « admin_ruche ») :
 * le nom de l'appli et son nom de code feraient croire à un compte officiel.
 */
export const HANDLE_FORBIDDEN_PARTS: readonly string[] = [
  textVariables.appName.toLowerCase(),
  'ruche',
]

/**
 * Les pseudos que personne ne peut prendre : ils feraient croire à un message officiel, ou
 * désigneraient tout le monde dans une mention. Le nom de l'appli vient de `textVariables` : il
 * n'est écrit qu'à un seul endroit du projet.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  textVariables.appName.toLowerCase(),
  'ruche',
  'admin',
  'administrateur',
  'administrator',
  'moderateur',
  'moderator',
  'modo',
  'support',
  'aide',
  'help',
  'contact',
  'equipe',
  'team',
  'staff',
  'officiel',
  'official',
  'system',
  'systeme',
  'root',
  'security',
  'securite',
  'api',
  'www',
  'mail',
  'email',
  'noreply',
  'notifications',
  'everyone',
  'tous',
  'all',
  'here',
  'moi',
  'null',
  'undefined',
  'anonyme',
  'anonymous',
  'abuse',
  'postmaster',
  'webmaster',
  'privacy',
  'legal',
  'moderation',
  'bot',
])

// Une lettre sans accent, puis des lettres ou des chiffres, chacun précédé ou non d'un seul « _ ».
// Donc ni « __ », ni « _ » à la fin : « ines__morel » ou « ines_morel_ » imiteraient « ines_morel ».
// Seuls des caractères ASCII : aucun sosie venu d'un autre alphabet (un « і » cyrillique ressemble
// à un « i » mais n'est pas le même).
const HANDLE_PATTERN = /^[a-z](?:_?[a-z0-9])*$/

/**
 * Un pseudo tel qu'un membre le tape, puis tel qu'on le garde. Avant de vérifier, on retire les
 * espaces autour et un « @ » au début, et on passe en minuscules : « @Ines » devient « ines ».
 *
 * `.pipe` enchaîne deux schémas : le premier nettoie, le second vérifie le résultat. L'appli lit
 * `issue.code` pour choisir son message : `too_small` (trop court), `too_big` (trop long),
 * `invalid_format` (caractère refusé, « __ », « _ » final, ou ne commence pas par une lettre), `custom` (mot
 * réservé, ou qui contient le nom de l'appli).
 */
export const Handle = z
  .string()
  .transform((text) => text.trim().replace(/^@/, '').toLowerCase())
  .pipe(
    z
      .string()
      .min(HANDLE_MIN_LENGTH)
      .max(HANDLE_MAX_LENGTH)
      .regex(HANDLE_PATTERN)
      .refine(
        (handle) =>
          !RESERVED_HANDLES.has(handle) &&
          !HANDLE_FORBIDDEN_PARTS.some((part) => handle.includes(part)),
        { message: 'reserved handle' },
      ),
  )
export type Handle = z.infer<typeof Handle>
