// Les blocages (tranche 7b) : qui a bloqué qui. Une ligne par blocage ; débloquer efface la ligne,
// sans historique (un blocage ne sert qu'à cacher : ni compteur, ni signal de modération). Le
// blocage joue dans les deux sens ; c'est l'API qui le lit ainsi (apps/api/src/blocks/visibility.ts).
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

/** « blocker_id a bloqué blocked_id ». */
export const memberBlock = pgTable(
  'member_block',
  {
    // Les deux en onDelete: 'cascade' : supprimer un compte efface les blocages qu'il a posés et
    // ceux qui le visaient.
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    // Bloquer deux fois la même personne est impossible ; la clé sert aussi « qui ai-je bloqué ? ».
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    // L'autre sens, « qui m'a bloqué ? », lu à chaque lecture d'un contenu : son propre index.
    index('member_block_blocked_idx').on(t.blockedId),
    check('member_block_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
)
