// Les notifications (tranche 6b). Elles ne sont pas recopiées : l'API les calcule à la lecture à
// partir des réactions, abonnements et commentaires. Il ne reste à garder que deux choses : qui un
// commentaire mentionne, et jusqu'où chaque membre a regardé ses notifications.
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { projectComment } from './comments'

/**
 * Les membres mentionnés dans un commentaire (« @ines_morel »). La mention est gardée par
 * l'identifiant du membre, trouvé au moment de l'écriture, et jamais par le pseudo : un pseudo se
 * change et se libère, il pourrait un jour désigner quelqu'un d'autre.
 */
export const commentMention = pgTable(
  'comment_mention',
  {
    // onDelete: 'cascade' des deux côtés : un commentaire effacé emporte ses mentions, et un compte
    // supprimé n'est plus mentionné nulle part (son pseudo redevient du texte simple).
    commentId: uuid('comment_id')
      .notNull()
      .references(() => projectComment.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // La date de la mention : celle du commentaire, ou celle de la modification qui l'a ajoutée.
    // C'est la date de la notification. Écrite par l'API (horloge que les tests remplacent).
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Une clé faite de deux colonnes : un membre n'est mentionné qu'une fois par commentaire.
    primaryKey({ columns: [t.commentId, t.memberId] }),
    // Les notifications d'un membre cherchent « les mentions de ce membre ».
    index('comment_mention_member_idx').on(t.memberId),
  ],
)

/** Pour chaque membre : jusqu'où il a vu ses notifications, et depuis quand il a son pseudo. */
export const notificationState = pgTable('notification_state', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // La dernière ouverture de l'écran des notifications : ce qui est arrivé avant est « vu ».
  // null : jamais ouvert, tout est nouveau.
  seenAt: timestamp('seen_at'),
  // Le moment où la ligne est née, en même temps que son pseudo : c'est la date de sa première
  // notification (« Ton pseudo est @… »), qui disparaît, comme les autres, après 90 jours.
  createdAt: timestamp('created_at').notNull(),
})
