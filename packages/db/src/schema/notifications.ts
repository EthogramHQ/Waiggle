// Les notifications (tranche 6b). Elles ne sont pas recopiées : l'API les calcule à la lecture à
// partir des réactions, abonnements et commentaires. Il ne reste à garder que qui un commentaire
// mentionne, jusqu'où chaque membre a regardé ses notifications, et (R8) les gestes du catalogue.
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { category } from './categories'
import { projectComment } from './comments'
import { project } from './projects'
import { tool } from './tools'

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
    // Le pseudo tel qu'il était écrit dans le texte (minuscules, sans « @ ») : l'appli en fait un
    // lien vers ce membre, même s'il a changé de pseudo depuis ou si un autre a repris l'ancien.
    handle: text('handle').notNull(),
    // La date de la mention : celle du commentaire, ou celle de la modification qui l'a ajoutée.
    // C'est la date de la notification. Écrite par l'API (horloge que les tests remplacent).
    createdAt: timestamp('created_at').notNull(),
    // Tranche 7b (« une fois mentionné, lisible tant que le commentaire existe », décision du
    // 25/10/2026) : la date où l'auteur a retiré « @pseudo » en modifiant son texte. La ligne
    // reste, pour que le membre mentionné garde la lecture du commentaire malgré un blocage (règle 2
    // de la relecture du plan) et puisse le signaler ; mais une mention retirée n'est plus un lien,
    // ni une notification, ni un e-mail. null : la mention est dans le texte. Remise à null si
    // l'auteur écrit de nouveau ce pseudo.
    withdrawnAt: timestamp('withdrawn_at'),
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
  // Le moment où le membre a choisi lui-même un pseudo (PATCH /v1/me), ou celui où le rattrapage a
  // vu qu'il en avait déjà changé. null : il garde le pseudo reçu. Dès qu'elle est remplie, la
  // notification « Ton pseudo est @… » n'est plus montrée : elle parlait du pseudo reçu, elle ne
  // serait plus vraie.
  handleChosenAt: timestamp('handle_chosen_at'),
})

/**
 * R8 : les notifications du catalogue, les seules qui s'écrivent (les autres se calculent) : un
 * administrateur range un projet dans une catégorie (`project_category`), ou fait entrer au
 * catalogue un outil qu'un membre avait écrit en « Autre » (`tool_added`, ou `tool_merged` quand il
 * le rattache à un outil existant). Rien d'autre ne garde la trace de ces gestes pour l'auteur : le
 * journal `catalogue_change` est celui de l'administration, sans destinataire. Une ligne par membre
 * et par outil (pas par projet). Écrite dans la même transaction que le geste ; jamais pour
 * l'administrateur lui-même. Effacée avec le compte, le projet ou l'outil, et après 90 jours.
 */
export const catalogueNotice = pgTable(
  'catalogue_notice',
  {
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    // Le projet rangé ; null pour un outil.
    projectId: uuid('project_id').references(() => project.id, { onDelete: 'cascade' }),
    // L'outil du catalogue (pour `tool_merged`, l'outil cible du rattachement) ; null pour un projet.
    toolId: uuid('tool_id').references(() => tool.id, { onDelete: 'cascade' }),
    // Le nom tel que le membre l'avait tapé dans « Autre » (40 caractères au plus) ; null pour un projet.
    typedName: text('typed_name'),
    // La catégorie où le projet a été rangé ; null pour un outil.
    categoryCode: text('category_code').references(() => category.code),
    // Écrite par l'API (horloge que les tests remplacent), comme les autres dates.
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Les notifications d'un membre cherchent « ses notices, les plus récentes d'abord ».
    index('catalogue_notice_member_idx').on(t.memberId, t.createdAt.desc()),
    check(
      'catalogue_notice_kind_check',
      sql`(${t.kind} = 'project_category' and ${t.projectId} is not null and ${t.categoryCode} is not null and ${t.toolId} is null)
        or (${t.kind} in ('tool_added', 'tool_merged') and ${t.toolId} is not null and ${t.typedName} is not null and ${t.projectId} is null)`,
    ),
  ],
)
