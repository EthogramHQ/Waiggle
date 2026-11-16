// Les comptes d'exemples (tranche R12b, « Les exemples ») : un compte de l'équipe qui publie des
// projets fictifs pour remplir la vitrine de l'accueil. L'appli les montre avec une pastille
// « Exemple » ; ce que ce marquage change (pastille, suggestions, récap, moteurs de recherche) est
// décidé par l'API (apps/api/src/accounts/example.ts), la base garde seulement le fait.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * Les comptes d'exemples, une ligne par compte. Une table à part plutôt qu'une colonne de `user`,
 * comme `admin_member` : la table `user` appartient à Better Auth, dont certaines routes écrivent
 * dedans, et aucune ne connaît celle-ci. Le marquage se pose et se retire par un script du dépôt
 * (infra/mark-example.sh), jamais par une route de l'API ; le retrait efface la ligne (aucun
 * historique à garder : ce n'est pas un droit, seulement une étiquette).
 *
 * Pas d'index de plus : chaque lecture cherche « ce compte est-il d'exemples ? » par la clé primaire
 * (`user_id`), et la table n'a que quelques lignes.
 */
export const exampleAccount = pgTable('example_account', {
  // La clé primaire est aussi la clé étrangère : un compte est d'exemples une fois au plus.
  // onDelete: 'cascade' : la suppression du compte emporte son marquage.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Le jour du marquage, écrit par le script (heure UTC, comme toutes les dates de la base).
  markedAt: timestamp('marked_at').notNull(),
})
