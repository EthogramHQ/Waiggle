// Le profil du membre tel que l'appli le voit (contrat `Me`), lu dans la base.
// Il rassemble trois tables : `user` (géré par Better Auth), `profile` (bio, outils, avatar) et
// `member_handle` (le pseudo, tranche 6a).
import type { Me } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { defaultLanguage, type Language, supportedLanguages } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)

/** Adresse publique d'un fichier stocké, servie par la route /media/… de l'API. */
export const mediaUrl = (publicApiUrl: string, key: string) => `${publicApiUrl}/media/${key}`

/**
 * Lit le membre, son profil et son pseudo actuel en une requête. `leftJoin` = « avec son profil
 * s'il en a un » : un membre tout juste inscrit n'a pas encore de ligne dans `profile`. Le pseudo
 * suit l'index partiel member_handle_current_idx (voir handles/load.ts).
 *
 * Un membre vérifié qui n'a pas encore de pseudo (un compte d'avant la tranche 6a, que le
 * rattrapage du démarrage n'aurait pas vu) en reçoit un ici, en filet. Un compte jamais vérifié
 * n'a pas de profil : null, comme un membre inconnu.
 */
export const loadMe = async (
  db: Database,
  userId: string,
  publicApiUrl: string,
): Promise<Me | null> => {
  const [row] = await db
    .select({ user: schema.user, profile: schema.profile, handle: schema.memberHandle.handle })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
    .where(eq(schema.user.id, userId))
  if (!row) return null

  const { user, profile } = row
  const handle = row.handle ?? (user.emailVerified ? await ensureHandle(db, user.id) : null)
  if (handle === null) return null
  return {
    id: user.id,
    name: user.name,
    handle,
    email: user.email,
    emailVerified: user.emailVerified,
    language: isLanguage(user.language) ? user.language : defaultLanguage,
    createdAt: user.createdAt.toISOString(), // le JSON ne connaît pas les dates : on les écrit en texte
    bio: profile?.bio ?? '',
    favoriteTools: profile?.favoriteTools ?? [],
    avatarUrl: profile?.avatarKey ? mediaUrl(publicApiUrl, profile.avatarKey) : null,
    // Tranche 6d : la lecture de admin_member reste à brancher (backend-dev).
    isAdmin: false,
  }
}
