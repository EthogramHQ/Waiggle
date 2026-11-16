// La vitrine de l'accueil (tranche R12) : les projets publics choisis par la modération, et les
// traces gardées pour l'Activité de leurs auteurs (« Météo est sur l'accueil »).
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { project } from './projects'

/**
 * Les projets de la vitrine, quatre au plus, rangés par `position` (1 à 4). Une ligne par projet :
 * la clé primaire est le projet lui-même, qui ne peut donc pas y être deux fois. `on delete
 * cascade` : un projet supprimé quitte la vitrine avec lui. Un projet qui cesse d'être `web`, ou qui
 * est retiré, en sort dans la même transaction (l'API), et la lecture ne montre de toute façon que
 * des projets visibles d'un visiteur.
 */
export const showcase = pgTable(
  'showcase',
  {
    projectId: uuid('project_id')
      .primaryKey()
      .references(() => project.id, { onDelete: 'cascade' }),
    // smallint : un entier sur deux octets, assez pour 1 à 4.
    position: smallint('position').notNull(),
    // Écrite par l'API (horloge que les tests remplacent), comme les autres dates.
    addedAt: timestamp('added_at').notNull(),
    // L'administrateur qui l'a choisi ; jamais montré à l'auteur ni exporté. `set null` : la ligne
    // reste si son compte disparaît.
    addedBy: text('added_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [
    check('showcase_position_check', sql`${t.position} between 1 and 4`),
    // Unique : deux projets ne peuvent pas occuper la même place, même si deux administrateurs
    // rangent la vitrine en même temps. La lecture « dans l'ordre » suit aussi cet index.
    // Pas `deferrable` : l'API réécrit la vitrine entière (effacer, puis insérer) dans une
    // transaction, sans jamais échanger deux places ligne à ligne.
    uniqueIndex('showcase_position_idx').on(t.position),
  ],
)

/**
 * Les traces gardées pour l'Activité de l'auteur, une par mise en avant (`showcase_added`) : rien
 * d'autre ne garde ce geste une fois le projet sorti de la vitrine. Écrite dans la même transaction
 * que l'ajout ; jamais pour un administrateur qui met en avant son propre projet. Effacée avec le
 * compte ou le projet, et après 90 jours (purge de nuit), à l'image de `catalogue_notice`.
 */
export const showcaseNotice = pgTable(
  'showcase_notice',
  {
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Les notifications d'un membre cherchent « ses traces, les plus récentes d'abord » ; nullsFirst :
    // l'ordre exact de « order by … desc », sinon PostgreSQL n'utilise pas l'index.
    index('showcase_notice_member_idx').on(t.memberId, t.createdAt.desc().nullsFirst()),
    // La cascade depuis `project` cherche les traces d'un projet.
    index('showcase_notice_project_idx').on(t.projectId),
    // La purge de nuit efface ce qui a plus de 90 jours.
    index('showcase_notice_created_idx').on(t.createdAt),
  ],
)
