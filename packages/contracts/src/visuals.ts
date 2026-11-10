// Une photo telle que l'API la renvoie, et sa description (R6a). Fichier à part depuis R7a : la
// galerie d'un projet (projects.ts) et les photos d'une mise à jour (updates.ts) s'en servent, et
// projects.ts lit updates.ts ; les laisser dans projects.ts ferait une boucle d'imports.
import { z } from 'zod'
import { FreeText } from './text'

/**
 * Le ThumbHash d'une image : un résumé flou de quelques dizaines d'octets, calculé par le serveur,
 * qui colore la lumière d'ambiance et s'affiche le temps que la vraie image arrive.
 * Il vient de l'API ; l'appli le vérifie quand même (ADR 0002) : du base64, court. Un vrai ThumbHash
 * fait au plus 25 octets (36 caractères) ; 64 laisse de la marge sans rien laisser passer de long.
 */
export const Thumbhash = z.base64().min(1).max(64)

/**
 * Un visuel d'un projet ou d'une mise à jour, tel que l'API le renvoie. `kind` n'a qu'une valeur
 * pour l'instant : la vidéo viendra dans sa propre tranche, et s'ajoutera ici.
 * L'adresse ne s'ouvre que pour un membre connecté qui voit le projet.
 */
export const ProjectVisual = z
  .object({
    id: z.uuid(),
    kind: z.enum(['image']),
    url: z.url(),
    width: z.int().positive(),
    height: z.int().positive(),
    thumbhash: Thumbhash,
    /**
     * La description de la photo écrite par l'auteur (R6a), lue par les lecteurs d'écran à la place
     * de « Photo 1 sur 3 ». Du texte brut, jamais du Markdown ; null : pas de description.
     */
    description: z.string().nullable(),
  })
  .meta({ id: 'ProjectVisual' })
export type ProjectVisual = z.infer<typeof ProjectVisual>

/** La description d'une photo : 250 caractères au plus (R6a). */
export const PHOTO_DESCRIPTION_MAX = 250

/**
 * Ce qu'un membre écrit pour décrire une photo. Une case vide (ou faite d'espaces) devient null :
 * effacer la description, c'est vider le champ.
 */
export const VisualDescription = FreeText(PHOTO_DESCRIPTION_MAX)
  .nullable()
  .transform((text) => (text ? text : null))
