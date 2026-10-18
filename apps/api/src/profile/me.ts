// Le profil du membre tel que l'appli le voit (contrat `Me`), lu dans la base.
// Il rassemble deux tables : `user` (géré par Better Auth) et `profile` (bio, outils, avatar).
import type { Me } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { defaultLanguage, type Language, supportedLanguages } from '@ruche/i18n'
import { eq } from 'drizzle-orm'

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)

/** Adresse publique d'un fichier stocké, servie par la route /media/… de l'API. */
export const mediaUrl = (publicApiUrl: string, key: string) => `${publicApiUrl}/media/${key}`

/**
 * Lit le membre et son profil en une requête. `leftJoin` = « avec son profil s'il en a un » :
 * un membre tout juste inscrit n'a pas encore de ligne dans `profile`.
 */
export const loadMe = async (
  db: Database,
  userId: string,
  publicApiUrl: string,
): Promise<Me | null> => {
  const [row] = await db
    .select({ user: schema.user, profile: schema.profile })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(eq(schema.user.id, userId))
  if (!row) return null

  const { user, profile } = row
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    language: isLanguage(user.language) ? user.language : defaultLanguage,
    createdAt: user.createdAt.toISOString(), // le JSON ne connaît pas les dates : on les écrit en texte
    bio: profile?.bio ?? '',
    favoriteTools: profile?.favoriteTools ?? [],
    avatarUrl: profile?.avatarKey ? mediaUrl(publicApiUrl, profile.avatarKey) : null,
  }
}
