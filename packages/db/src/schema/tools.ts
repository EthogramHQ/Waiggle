// Le catalogue des outils (tranche R6b) : les outils connus (« Claude Code »), les « Autre » (des
// noms tapés par des membres, en attente d'un administrateur), leurs alias, leurs anciennes
// adresses, le lien avec les projets et les profils, et le journal des changements du catalogue.
// La migration 0016 sème le catalogue (packages/db/catalogue/tools.json) et rattache les anciennes
// étiquettes libres. Les règles (qui voit quoi, quotas) sont dans l'API, pas ici.
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { category } from './categories'
import { project } from './projects'

/**
 * Un outil. `status` : `catalogue` (a une page et une famille), `other` (un nom tapé, en attente)
 * ou `dismissed` (un « Autre » laissé hors du catalogue par un administrateur).
 */
export const tool = pgTable(
  'tool',
  {
    // Un identifiant tiré au hasard par le serveur, comme les projets.
    id: uuid('id').primaryKey(),
    // L'adresse de la page (/tags/claude-code), `toolSlug(name)` avec un suffixe « -2 » en cas de
    // collision. `unique` : deux outils n'ont jamais la même adresse.
    slug: text('slug').notNull().unique(),
    // Le nom affiché (40 caractères au plus, règle du contrat). Pour un « Autre » : le nom du plus
    // ancien projet listé qui le cite ; chaque projet garde le sien dans `project_tool.label`.
    name: text('name').notNull(),
    // Le nom replié (`foldTool`) : sans accents, majuscules, espaces ni ponctuation, il reconnaît
    // « Chat GPT » et « chatgpt » comme un même outil. `unique` : un seul outil par nom replié.
    folded: text('folded').notNull().unique(),
    status: text('status').notNull(),
    // Une des familles du contrat (`TOOL_FAMILIES`) ; null pour un « Autre ».
    family: text('family'),
    // Une phrase neutre par langue (160 caractères au plus), écrite par nous ; null pour un « Autre ».
    descriptionFr: text('description_fr'),
    descriptionEn: text('description_en'),
    siteUrl: text('site_url'),
    // Quand l'outil est apparu (pour un « Autre » de la bascule : la date du projet qui le cite,
    // pour qu'il compte « en attente depuis plus d'une semaine »).
    createdAt: timestamp('created_at').notNull(),
    // Toujours null pour un « Autre » (relecture sec-A5) ; l'administrateur qui a créé un outil du
    // catalogue sinon. `set null` : le compte supprimé ne supprime pas l'outil.
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    // L'entrée au catalogue ; null pour un « Autre ».
    admittedAt: timestamp('admitted_at'),
  },
  (t) => [
    // Une contrainte « check » : une règle que la base vérifie à chaque écriture.
    check('tool_status_valid', sql`${t.status} in ('catalogue', 'other', 'dismissed')`),
    // « Les outils d'un statut, du plus ancien au plus récent » : « À vérifier » (les « Autre » en
    // attente) et la liste du catalogue lisent cet index sans trier.
    index('tool_status_created_idx').on(t.status, t.createdAt),
  ],
)

/**
 * Un autre nom d'un outil du catalogue (« Chat GPT » pour ChatGPT). `folded` est la clé primaire :
 * un alias n'est jamais à deux outils. Qu'il ne se confonde ni avec un outil ni avec un autre alias
 * est vérifié par l'API dans la transaction d'écriture (une clé primaire ne voit qu'une table).
 */
export const toolAlias = pgTable(
  'tool_alias',
  {
    folded: text('folded').primaryKey(),
    // `cascade` : l'alias disparaît avec son outil. L'index sert à lister les alias d'un outil.
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tool.id, { onDelete: 'cascade' }),
  },
  (t) => [index('tool_alias_tool_idx').on(t.toolId)],
)

/**
 * Une ancienne adresse qui mène à la page d'un outil : un outil rattaché à un autre, ou une
 * étiquette de R6a (« chat-gpt ») devenue un alias. Une table à part des alias (relecture sec-A2) :
 * `GET /v1/tags/{slug}` lit d'abord `tool.slug`, puis cette table, jamais l'inverse.
 */
export const toolSlugRedirect = pgTable(
  'tool_slug_redirect',
  {
    slug: text('slug').primaryKey(),
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tool.id, { onDelete: 'cascade' }),
  },
  (t) => [index('tool_slug_redirect_tool_idx').on(t.toolId)],
)

/**
 * Les outils d'un projet, dans l'ordre où l'auteur les a donnés. `label` : le nom tel que CET auteur
 * l'a tapé pour un « Autre » (relecture sec-B8), null pour un outil du catalogue.
 */
export const projectTool = pgTable(
  'project_tool',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // `restrict` : on n'efface pas un outil encore cité (l'API retire d'abord les lignes).
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tool.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    label: text('label'),
  },
  (t) => [
    // Clé primaire composée : un outil n'est cité qu'une fois par projet ; elle sert aussi à lire
    // « les outils de ce projet ».
    primaryKey({ columns: [t.projectId, t.toolId] }),
    // L'autre sens : « les projets de cet outil » (sa page, ses nombres).
    index('project_tool_tool_idx').on(t.toolId),
  ],
)

/** Les outils favoris d'un profil, même forme que `project_tool`. */
export const profileTool = pgTable(
  'profile_tool',
  {
    // Le membre (`user`), pas la ligne `profile` : le profil n'est créé qu'à sa première
    // modification, et un membre sans profil peut quand même avoir des outils favoris.
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tool.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    label: text('label'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.toolId] }),
    index('profile_tool_tool_idx').on(t.toolId),
  ],
)

/**
 * Le journal « Changements récents » de l'administration : qui a admis, créé, modifié ou fusionné
 * un outil, créé une catégorie, rangé un projet. Effacé après un an par la purge de nuit.
 */
export const catalogueChange = pgTable(
  'catalogue_change',
  {
    id: uuid('id').primaryKey(),
    // tool_admit | tool_create | tool_edit | tool_merge | tool_dismiss | category_create |
    // project_recategorize : la liste permise est dans @ruche/contracts.
    action: text('action').notNull(),
    // Les clés étrangères en `set null` : le journal survit à la disparition de ce qu'il cite.
    adminId: text('admin_id').references(() => user.id, { onDelete: 'set null' }),
    toolId: uuid('tool_id').references(() => tool.id, { onDelete: 'set null' }),
    // Le nom de l'« Autre » fusionné (son outil est effacé, il ne reste que ce texte).
    mergedName: text('merged_name'),
    categoryCode: text('category_code').references(() => category.code, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    projectId: uuid('project_id').references(() => project.id, { onDelete: 'set null' }),
    // La catégorie d'avant, pour `project_recategorize`.
    fromCategory: text('from_category'),
    createdAt: timestamp('created_at').notNull(),
  },
  // Les plus récents d'abord ; nullsFirst : l'ordre que PostgreSQL donne à « order by … desc ».
  (t) => [index('catalogue_change_created_idx').on(t.createdAt.desc().nullsFirst())],
)
