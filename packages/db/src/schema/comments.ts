// Les commentaires des projets (tranche 5). Un commentaire « racine » ouvre un fil ; ses réponses
// pointent vers lui (root_id), sur un seul niveau. Qui voit quoi (masqué, supprimé, projet privé)
// est décidé par l'API (apps/api/src/comments/load.ts) : la base garde les faits.
import { sql } from 'drizzle-orm'
import { type AnyPgColumn, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { moderationDecision } from './moderation'
import { project } from './projects'

export const projectComment = pgTable(
  'project_comment',
  {
    // Tiré au hasard par le serveur : il apparaît dans les adresses (/comments/{commentId}).
    id: uuid('id').primaryKey(),
    // Un projet supprimé emporte tous ses commentaires (et le projet disparaît lui-même avec le
    // compte de son auteur).
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // L'auteur, ou null pour un « Commentaire supprimé » : une racine que son auteur a supprimée
    // alors que d'autres y avaient répondu. Elle reste, vide, pour garder les réponses à leur place.
    // onDelete: 'set null' : si un compte disparaît sans passer par l'API, ses commentaires perdent
    // leur auteur au lieu d'emporter les réponses des autres. En temps normal, l'API a déjà fait le
    // ménage juste avant (auth/auth.ts, beforeDelete).
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    // La racine du fil, pour une réponse ; null pour une racine. Une table qui pointe vers
    // elle-même : `AnyPgColumn` dit à TypeScript le type de la colonne visée, qu'il ne peut pas
    // deviner tant que la table n'est pas finie de déclarer. onDelete: 'cascade' : effacer une
    // racine efface ses réponses.
    rootId: uuid('root_id').references((): AnyPgColumn => projectComment.id, {
      onDelete: 'cascade',
    }),
    // Le texte tel que tapé (bords retirés), du texte brut ; vidé ('') quand le commentaire est
    // supprimé : le texte est effacé pour de bon, pas seulement caché.
    body: text('body').notNull(),
    // Toutes les dates viennent de l'horloge de JavaScript (pas de valeur par défaut), comme pour
    // les notes : elles rangent les fils, et les tests peuvent les maîtriser.
    createdAt: timestamp('created_at').notNull(),
    // La dernière modification par son auteur (« modifié ») ; null s'il n'y en a pas eu.
    editedAt: timestamp('edited_at'),
    // Masqué par l'auteur du projet (null : pas masqué). Démasquer remet null.
    hiddenAt: timestamp('hidden_at'),
    // Supprimé par son auteur alors qu'il avait des réponses (null : pas supprimé). Sans réponse,
    // un commentaire supprimé n'est pas gardé : sa ligne est effacée.
    deletedAt: timestamp('deleted_at'),
    // Retiré par la modération (tranche 7a) : le commentaire n'est plus visible que de son auteur, avec
    // l'explication de la décision. Null : pas retiré. Rétablir remet null. Indépendant de la
    // visibilité choisie par l'auteur : il ne peut pas « dé-retirer » en changeant un réglage.
    removedAt: timestamp('removed_at'),
    // La décision de retrait, pour retrouver son fondement et son explication. onDelete:
    // 'set null' : l'API ne purge pas une décision tant que son contenu reste retiré.
    removalId: uuid('removal_id').references(() => moderationDecision.id, { onDelete: 'set null' }),
    // R10 (relecture de sécurité, décision du 15/11/2026) : la ruche à laquelle le projet était
    // réservé quand ce commentaire a été écrit ; null s'il a été écrit sur un projet public (ou
    // privé, par son auteur). Un commentaire écrit pour les membres d'une ruche le reste : il n'est
    // lu, et compté, que par son auteur, l'auteur du projet et les membres actuels de cette ruche,
    // même si le projet est ensuite ouvert à tous ou à une autre ruche (règle `sees`,
    // apps/api/src/comments/load.ts). Volontairement SANS clé étrangère vers hive : une clé
    // « on delete set null » rouvrirait ces commentaires à tous quand la ruche est supprimée, et une
    // clé « restrict » empêcherait de la supprimer. Ruche supprimée, l'identifiant reste, mais plus
    // personne n'en est membre : seuls l'auteur du commentaire et l'auteur du projet le lisent.
    // Pas d'index : aucune lecture ne cherche par cette colonne ; elle se lit sur des commentaires
    // déjà trouvés par leur projet, leur fil ou leur auteur.
    hiveId: uuid('hive_id'),
  },
  (t) => [
    // Les pages de commentaires : les racines d'un projet, de la plus récente à la plus ancienne,
    // puis par identifiant (pour départager deux commentaires du même instant). Un index
    // « partiel » (where root_id is null) : il ne range que les racines, déjà dans l'ordre de la
    // page. PostgreSQL y lit directement les 21 racines qui suivent le curseur, sans trier.
    // nullsFirst : l'ordre exact de « order by … desc » (voir l'index du fil dans projects.ts).
    index('project_comment_project_roots_idx')
      .on(t.projectId, t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst())
      .where(sql`${t.rootId} is null`),
    // Les réponses d'une racine, de la plus ancienne à la plus récente : la sous-requête
    // « lateral » de la page y lit les 50 premières de chaque fil, et s'arrête là.
    index('project_comment_root_created_idx').on(t.rootId, t.createdAt, t.id),
    // Tous les commentaires d'un projet, racines et réponses : pour compter ceux que tout le monde
    // voit (la page du projet), et pour que la suppression d'un projet retrouve tous ses
    // commentaires sans lire toute la table.
    index('project_comment_project_idx').on(t.projectId),
    // Les commentaires d'un membre : pour l'export de ses données et la suppression de son compte.
    index('project_comment_author_idx').on(t.authorId),
  ],
)
