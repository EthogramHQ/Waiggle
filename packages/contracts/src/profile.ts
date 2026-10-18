// Formes des données du profil : ce qu'un membre peut modifier, et les règles des avatars.
import { z } from 'zod'
import { LanguageSchema } from './accounts'
import { DisplayName, FreeText, ShortLabel, uniqueIgnoringCase } from './text'

export const BIO_MAX_LENGTH = 280
export const FAVORITE_TOOLS_MAX = 10
export const TOOL_MAX_LENGTH = 40

// Avatars : formats acceptés et taille maximale du fichier envoyé (5 Mo).
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * Ce que PATCH /v1/me accepte. Tous les champs sont facultatifs : on n'envoie que ce qui change.
 * strictObject refuse tout champ inconnu : impossible de glisser par exemple "email" ou "emailVerified"
 * dans la requête pour modifier ce qui ne doit pas l'être.
 */
export const ProfileUpdate = z
  .strictObject({
    // Les règles de texte (longueur, caractères interdits) sont dans text.ts.
    name: DisplayName.optional(),
    bio: FreeText(BIO_MAX_LENGTH).optional(),
    favoriteTools: z
      .array(ShortLabel(TOOL_MAX_LENGTH))
      .max(FAVORITE_TOOLS_MAX)
      .transform(uniqueIgnoringCase) // transform : Zod modifie la valeur après l'avoir validée
      .optional(),
    language: LanguageSchema.optional(),
  })
  .meta({ id: 'ProfileUpdate' })
export type ProfileUpdate = z.infer<typeof ProfileUpdate>
