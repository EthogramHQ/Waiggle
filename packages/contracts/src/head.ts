// Les langues des pages publiques et la demande de leurs métadonnées (tranche R12, « Les projets
// publics »). Le serveur web (Caddy) demande à l'API, pour chaque page publique, le morceau de
// `<head>` à y glisser : titre, description, adresse canonique, langues, aperçu de partage, consigne
// aux moteurs de recherche. Fichier sans autre import que Zod : projects.ts et members.ts le lisent.
import { z } from 'zod'

/**
 * Les langues d'une adresse publique (`/fr/projects/<id>`, `/en/members/<id>`), dans l'ordre : la
 * première est celle d'une adresse sans langue reconnue. `as const` garde les deux valeurs exactes
 * dans le type, au lieu de `string`.
 */
export const PUBLIC_LANGUAGES = ['fr', 'en'] as const
/** Une langue d'adresse publique, comme schéma (pour lire un paramètre) et comme type. */
export const PublicLanguage = z.enum(PUBLIC_LANGUAGES)
export type PublicLanguage = z.infer<typeof PublicLanguage>

/** La plus longue adresse lue : bien au-delà d'une vraie page publique (60 caractères environ). */
export const HEAD_PATH_MAX = 512

/**
 * Le chemin d'une page, tel que Caddy le transmet (`/fr/projects/<id>`) : il commence par « / » et
 * ne contient que des caractères ASCII visibles (un caractère accentué arrive encodé, `%C3%A9`).
 * Ni espace, ni retour à la ligne, ni caractère de contrôle : rien qui puisse sortir d'un attribut
 * HTML ou couper une ligne. L'API ne le recopie jamais tel quel dans la réponse : elle en tire une
 * sorte de page et un identifiant, puis fabrique elle-même les adresses.
 */
export const HeadPath = z
  .string()
  .max(HEAD_PATH_MAX)
  .regex(/^\/[\x21-\x7e]*$/)

/**
 * Les paramètres de GET /v1/public/head?path=…&lang=… (décision 1 de la relecture du plan : la
 * tête répond **toujours** 200). `.catch` remplace une valeur refusée au lieu de rejeter toute la
 * demande : un chemin illisible devient `null` (la tête neutre, « {{appName}} » et `noindex`), une
 * langue inconnue devient le français. Ainsi, une adresse fabriquée ne fait jamais échouer le rendu
 * de la page par Caddy, et la réponse ne dit rien de plus qu'une page inconnue.
 */
export const HeadQuery = z.object({
  path: HeadPath.nullable().catch(null),
  lang: PublicLanguage.catch('fr'),
})
export type HeadQuery = z.infer<typeof HeadQuery>
