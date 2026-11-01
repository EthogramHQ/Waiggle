// Le fil « Abonnements » (tranche R4) : jusqu'où chaque membre l'a lu. Le fil lui-même n'est rangé
// nulle part (l'API le calcule à la lecture) ; il ne reste à garder que cette date, qui sert à
// poser « Tu es à jour » avant le premier élément déjà vu.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * Une ligne par membre, née à sa première lecture du fil (PUT /v1/feed/read). C'est une trace
 * d'activité (relecture juridique jur-J3) : seul apps/api/src/feed/state.ts la lit ou l'écrit, et
 * elle n'est montrée qu'à son membre (le fil, l'export).
 */
export const feedState = pgTable('feed_state', {
  // La clé primaire est le membre lui-même : une seule date par membre, que l'API met à jour en
  // place (« upsert »). onDelete: 'cascade' : la date part avec le compte supprimé.
  memberId: text('member_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // La date (`at`) du plus récent élément que l'appli a affiché : ce qui est daté jusque-là est
  // « déjà vu ». Elle ne recule jamais (l'API garde la plus grande des deux dates), et vient
  // toujours de l'appli, bornée par l'API (jamais avant le 1/1/2026, jamais après l'heure du
  // serveur).
  readAt: timestamp('read_at').notNull(),
})
