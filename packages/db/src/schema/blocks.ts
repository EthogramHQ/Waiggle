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
    // La liste « Membres bloqués » (GET /v1/me/blocks) : les blocages d'un membre, du plus récent
    // au plus ancien, 50 par page. Cet index les range déjà dans cet ordre (date puis identifiant,
    // décroissants) : PostgreSQL part du curseur et s'arrête au 51e, sans rien trier en mémoire,
    // même pour un membre qui a bloqué beaucoup de monde. « nulls first » : l'ordre que PostgreSQL
    // donne à « order by … desc » ; sans lui, l'index ne servirait pas ce tri (aucune valeur n'est
    // nulle ici, mais PostgreSQL compare l'ordre écrit, pas les données).
    index('member_block_blocker_created_idx').on(
      t.blockerId,
      t.createdAt.desc().nullsFirst(),
      t.blockedId.desc().nullsFirst(),
    ),
    check('member_block_not_self', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
)
