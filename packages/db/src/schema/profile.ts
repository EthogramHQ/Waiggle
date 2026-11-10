// Le profil public d'un membre : bio, outils favoris, avatar.
// Table séparée de `user` (gérée par Better Auth) : chacun ses colonnes, pas de mélange.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const profile = pgTable('profile', {
  // Un profil par membre : la clé primaire est l'identifiant du membre lui-même.
  // onDelete: 'cascade' → le profil disparaît avec le compte.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  bio: text('bio').default('').notNull(),
  // Les outils favoris ne sont plus ici : ils vivent dans profile_tool (R6b), et la colonne
  // favorite_tools est effacée par la migration 0018 (R7a).
  // Nom du fichier de l'avatar dans le stockage (par ex. "3f2a….webp"), null s'il n'y en a pas.
  avatarKey: text('avatar_key'),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})
