// Les accords des membres aux règles de Waiggle (tranche R11, « La conformité ») : une ligne par
// version des règles acceptée, à l'inscription ou sur l'écran « Accepter ». Une table plutôt que des
// colonnes sur `user` (choix 1 du plan R11) : l'historique entier est la preuve de chaque accord,
// et l'export du membre le montre tel quel.
import { sql } from 'drizzle-orm'
import { boolean, check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const rulesAcceptance = pgTable(
  'rules_acceptance',
  {
    // onDelete: 'cascade' : la suppression du compte emporte ses accords (ils ne prouvent plus
    // rien quand il n'y a plus de compte).
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // La version acceptée, une date `AAAA-MM-JJ` (RULES_VERSION du contrat), jamais un texte libre :
    // l'API n'écrit que la version en vigueur.
    version: text('version').notNull(),
    // Le moment de l'accord. L'API l'écrit elle-même (`new Date()`) ; le défaut ne sert qu'aux
    // lignes posées à la main (un test, une reprise), en heure UTC sans fuseau comme `user`.
    acceptedAt: timestamp('accepted_at').default(sql`(now() at time zone 'utc')`).notNull(),
    // « J'ai 15 ans ou plus », déclaré avec l'accord. Toujours vrai : la base refuse une ligne qui
    // dirait le contraire (check plus bas), et l'inscription refuse le compte sans cette case.
    ageDeclared: boolean('age_declared').notNull(),
  },
  (t) => [
    // Clé primaire composée : un membre accepte une version une seule fois (un second accord de la
    // même version ne crée pas de ligne). Elle sert aussi aux deux lectures de l'API : « a-t-il
    // accepté la version en vigueur ? » (les deux colonnes) et « tous ses accords » (l'export, par
    // sa première colonne).
    primaryKey({ columns: [t.userId, t.version] }),
    check('rules_acceptance_age_declared_check', sql`${t.ageDeclared}`),
  ],
)
