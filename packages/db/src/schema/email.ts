// Les réglages d'e-mail des membres (tranche 6c, R8) : le récap de la semaine (activé par défaut),
// un choix par type d'e-mail (« tout de suite », « dans le récap », « jamais » ; R8), et la date du
// dernier envoi de chacun. Une ligne par membre, créée à la première écriture : sans ligne, ce sont
// les valeurs par défaut. Il n'y a pas d'historique des envois : chaque date est remplacée au suivant.
import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

// Un choix par type : du texte contrôlé par la base (`check`) plutôt qu'un type énuméré de
// PostgreSQL, plus simple à faire évoluer. « digest » (dans le récap) par défaut pour tous : aucun
// e-mail immédiat sans l'avoir demandé (décision de Louis du 12/11/2026).
const choice = (name: string) => text(name).notNull().default('digest')

export const emailPreference = pgTable(
  'email_preference',
  {
    // La clé primaire est aussi la clé étrangère : un membre a au plus une ligne. onDelete:
    // 'cascade' : la suppression du compte emporte ses réglages et ses dates d'envoi.
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    weeklyRecap: boolean('weekly_recap').notNull().default(true),
    // L'interrupteur de 6c (« un e-mail quand on me mentionne ou me répond »). R8 ne le lit plus,
    // mais l'écrit encore en copie (`email_replies = 'now'`), pour qu'un retour à la version d'avant
    // R8 respecte les choix pris entre-temps (relecture du plan sec-A1, jur-2a). Effacé en R9.
    mentionEmails: boolean('mention_emails').notNull().default(false),
    // R8 : les six types. Réactions, abonnés et mises à jour n'ont pas « now » (check plus bas).
    emailReactions: choice('email_reactions'),
    emailComments: choice('email_comments'),
    emailReplies: choice('email_replies'),
    emailFollows: choice('email_follows'),
    emailUpdates: choice('email_updates'),
    emailTesters: choice('email_testers'),
    // Le dernier récap envoyé (heure UTC, sans fuseau, comme les autres tables) ; null : jamais.
    recapSentAt: timestamp('recap_sent_at'),
    // Le nombre de récaps envoyés de suite sans visite du membre (0 à 3) : à 3, plus de récap
    // jusqu'à sa prochaine visite.
    recapUnvisited: integer('recap_unvisited').notNull().default(0),
    // R8 : le premier récap habillé reçu. null alors que `recap_sent_at` ne l'est pas : il recevait
    // le récap avant R8, et le prochain lui dit, une seule fois, ce qui change.
    recapV2At: timestamp('recap_v2_at'),
    // Le dernier e-mail de mentions envoyé ; null : jamais. Gardé en copie de `instant_sent_at`
    // jusqu'à R9, pour la même raison que `mention_emails`.
    mentionSentAt: timestamp('mention_sent_at'),
    // R8 : le dernier e-mail « tout de suite » envoyé (recopié de `mention_sent_at` par la migration).
    instantSentAt: timestamp('instant_sent_at'),
    // La dernière modification des réglages par le membre (Réglages, ou un lien de désinscription) ;
    // null s'il n'y a jamais touché. Les tâches qui notent une date d'envoi ne la changent pas :
    // l'export dit ainsi vraiment quand le membre a choisi.
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    // L'e-mail « tout de suite » passe toutes les 5 minutes et ne regarde que les membres qui ont au
    // moins un type à « now » : un index « partiel » (seulement les lignes où la condition est
    // vraie) les trouve sans lire les autres, qui sont la majorité. Celui de 6c reste pour la
    // version d'avant R8, jusqu'à R9.
    index('email_preference_mentions_idx').on(t.userId).where(sql`${t.mentionEmails}`),
    index('email_preference_instant_idx')
      .on(t.userId)
      .where(
        sql`${t.emailComments} = 'now' or ${t.emailReplies} = 'now' or ${t.emailTesters} = 'now'`,
      ),
    check(
      'email_preference_choices_check',
      sql`${t.emailComments} in ('now', 'digest', 'never')
        and ${t.emailReplies} in ('now', 'digest', 'never')
        and ${t.emailTesters} in ('now', 'digest', 'never')
        and ${t.emailReactions} in ('digest', 'never')
        and ${t.emailFollows} in ('digest', 'never')
        and ${t.emailUpdates} in ('digest', 'never')`,
    ),
  ],
)
