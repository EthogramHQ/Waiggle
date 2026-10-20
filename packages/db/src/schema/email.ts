// Les réglages d'e-mail des membres (tranche 6c) : le récap de la semaine (activé par défaut) et
// l'e-mail de mentions et de réponses (désactivé par défaut), avec la date du dernier envoi de
// chacun. Une ligne par membre, créée à la première écriture : sans ligne, ce sont les valeurs par
// défaut. Il n'y a pas d'historique des envois : chaque date est remplacée au suivant.
import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const emailPreference = pgTable(
  'email_preference',
  {
    // La clé primaire est aussi la clé étrangère : un membre a au plus une ligne. onDelete:
    // 'cascade' : la suppression du compte emporte ses réglages et ses dates d'envoi.
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    weeklyRecap: boolean('weekly_recap').notNull().default(true),
    mentionEmails: boolean('mention_emails').notNull().default(false),
    // Le dernier récap envoyé (heure UTC, sans fuseau, comme les autres tables) ; null : jamais.
    recapSentAt: timestamp('recap_sent_at'),
    // Le nombre de récaps envoyés de suite sans visite du membre (0 à 3) : à 3, plus de récap
    // jusqu'à sa prochaine visite.
    recapUnvisited: integer('recap_unvisited').notNull().default(0),
    // Le dernier e-mail de mentions envoyé ; null : jamais.
    mentionSentAt: timestamp('mention_sent_at'),
    // La dernière modification des réglages par le membre (Mon profil, ou un lien de
    // désinscription) ; null s'il n'y a jamais touché. Les tâches qui notent une date d'envoi ne la
    // changent pas : l'export dit ainsi vraiment quand le membre a choisi.
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    // L'e-mail de mentions passe toutes les 5 minutes et ne regarde que les membres qui l'ont
    // activé : un index « partiel » (seulement les lignes où la condition est vraie) les trouve sans
    // lire les autres, qui sont la majorité.
    index('email_preference_mentions_idx').on(t.userId).where(sql`${t.mentionEmails}`),
  ],
)
