// Les pseudos des membres (tranche 6a) : « @ines_morel ». Une ligne par pseudo, actuel ou ancien.
// Le pseudo actuel d'un membre est sa ligne sans date de fin (released_at null) ; son ancien pseudo,
// réservé 30 jours après un changement, est sa ligne avec une date de fin.
import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const memberHandle = pgTable(
  'member_handle',
  {
    // La clé primaire est le pseudo lui-même, déjà nettoyé (minuscules, sans « @ ») : deux lignes
    // ne peuvent pas porter le même pseudo. Comme les pseudos actuels et les anciens réservés sont
    // dans la même table, la base garantit à elle seule qu'un pseudo réservé n'est donné à
    // personne d'autre, même si deux demandes arrivent au même instant.
    handle: text('handle').primaryKey(),
    // onDelete: 'cascade' : supprimer le compte efface ses pseudos, actuel et ancien ; ils sont
    // aussitôt libres (scénario : « Suppression du compte »).
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Pas de valeur par défaut (ni now(), ni defaultNow()) : l'API écrit les dates avec l'horloge
    // de JavaScript, que les tests remplacent par une fausse (voir created_at de project_note).
    claimedAt: timestamp('claimed_at').notNull(),
    // null : le pseudo actuel. Une date : le moment du changement ; il reste réservé à son ancien
    // propriétaire jusqu'à cette date + 30 jours, puis il est libre.
    releasedAt: timestamp('released_at'),
  },
  (t) => [
    // Un index « unique partiel » : il ne range que les lignes qui vérifient la condition (ici, les
    // pseudos actuels), et y interdit les doublons. Résultat : un membre a au plus un pseudo
    // actuel, quelle que soit la manière dont les lignes sont écrites. Il sert aussi aux lectures
    // du pseudo actuel (« Mon profil », la page d'un membre), qui demandent
    // « user_id = … and released_at is null » : la même condition que l'index.
    uniqueIndex('member_handle_current_idx').on(t.userId).where(sql`${t.releasedAt} is null`),
    // Un index ordinaire sur user_id, pour le reste : l'ancien pseudo d'un membre (l'export, un
    // changement de pseudo) et la suppression en cascade du compte, qui cherche toutes ses lignes.
    // L'index partiel ne peut pas y servir : il ne contient pas les anciens pseudos.
    index('member_handle_user_idx').on(t.userId),
  ],
)
