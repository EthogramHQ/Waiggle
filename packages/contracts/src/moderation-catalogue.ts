// L'administration du catalogue (tranche R6b, docs/scenarios/refonte.md, « Ranger les « Autre » ») :
// les pages « Outils » et « Catégories » de la Modération, réservées aux administrateurs. Pour tout
// autre visiteur, leurs adresses répondent comme une adresse qui n'existe pas (comme le reste de la
// Modération). Les projets qu'elles montrent sont ceux que les membres peuvent voir (publics, pas
// retirés, d'un auteur vérifié), sans filtre de blocage : jamais un projet privé ou retiré
// (relectures sec-A1 et jur-T2).
import { z } from 'zod'
import { CategoryCode, CategoryIcon, CategoryName } from './categories'
import { FeedCursor } from './feed'
import { ProjectId } from './projects'
import { ShortLabel, VisibleFreeText } from './text'
import { TOOL_DESCRIPTION_MAX, TOOL_NAME_MAX, ToolFamily, ToolSiteUrl, ToolSlug } from './tools'

/** Une page des listes d'administration : 20 lignes, puis la suivante par son curseur. */
export const CATALOGUE_PAGE_SIZE = 20
/** Une carte d'« Autre » montre 5 de ses projets au plus, puis leur nombre. */
export const PENDING_TOOL_PROJECTS_SHOWN = 5
/** « Changements récents » se gardent un an (relecture juridique jur-T6). */
export const CATALOGUE_CHANGE_RETENTION_DAYS = 365

const Page = { nextCursor: FeedCursor.nullable() }

/** Un membre nommé dans ces pages : son nom et son pseudo (jamais son adresse). */
const NamedMember = z.object({ name: z.string(), handle: z.string().nullable() }).strict()

/** Un projet listé sur une carte : de quoi le reconnaître et l'ouvrir. */
const ListedProject = z.object({ id: ProjectId, title: z.string(), author: NamedMember }).strict()

/**
 * Un « Autre » à vérifier (onglet « À vérifier ») : son nom partagé, sa date, ses projets visibles
 * des membres (5 au plus) et leur nombre. Un « Autre » cité seulement par des projets privés ou
 * retirés n'apparaît pas.
 */
export const PendingTool = z
  .object({
    slug: ToolSlug,
    name: z.string(),
    createdAt: z.iso.datetime(),
    projectCount: z.int().positive(),
    projects: z.array(ListedProject).max(PENDING_TOOL_PROJECTS_SHOWN),
  })
  .meta({ id: 'PendingTool' })
export type PendingTool = z.infer<typeof PendingTool>

export const PendingToolsPage = z
  .object({ items: z.array(PendingTool).max(CATALOGUE_PAGE_SIZE), ...Page })
  .meta({ id: 'PendingToolsPage' })
export type PendingToolsPage = z.infer<typeof PendingToolsPage>

/** Les paramètres d'une liste d'administration : la page suivante. */
export const CataloguePageQuery = z.object({ cursor: FeedCursor.optional() })

/** La recherche dans le catalogue (onglet « Catalogue ») : 2 à 80 caractères (sec-B7). */
export const CatalogueToolsQuery = z.object({
  q: z.string().trim().min(2).max(80).optional(),
  cursor: FeedCursor.optional(),
})
export type CatalogueToolsQuery = z.infer<typeof CatalogueToolsQuery>

/** Un outil du catalogue tel que l'administrateur le modifie : tous ses champs, deux langues. */
export const AdminCatalogueTool = z
  .object({
    slug: ToolSlug,
    name: z.string(),
    family: ToolFamily,
    descriptionFr: z.string().nullable(),
    descriptionEn: z.string().nullable(),
    siteUrl: z.string().nullable(),
    aliases: z.array(z.string()),
    projectCount: z.int().nonnegative(),
  })
  .meta({ id: 'AdminCatalogueTool' })
export type AdminCatalogueTool = z.infer<typeof AdminCatalogueTool>

export const AdminCatalogueToolsPage = z
  .object({ items: z.array(AdminCatalogueTool).max(CATALOGUE_PAGE_SIZE), ...Page })
  .meta({ id: 'AdminCatalogueToolsPage' })
export type AdminCatalogueToolsPage = z.infer<typeof AdminCatalogueToolsPage>

const ToolDescription = VisibleFreeText(TOOL_DESCRIPTION_MAX)

/**
 * Ajouter un outil au catalogue (un « Autre » admis, ou un outil nouveau) : son nom (corrigé s'il
 * le faut), sa famille, une phrase neutre en français et en anglais, son site (facultatif). Un nom
 * déjà pris par un outil ou un alias : 409 `tool_name_taken` (sec-A3).
 */
export const ToolAdmit = z
  .strictObject({
    name: ShortLabel(TOOL_NAME_MAX),
    family: ToolFamily,
    descriptionFr: ToolDescription,
    descriptionEn: ToolDescription,
    siteUrl: ToolSiteUrl.nullable(),
  })
  .meta({ id: 'ToolAdmit' })
export type ToolAdmit = z.infer<typeof ToolAdmit>

/** Modifier un outil du catalogue : n'importe quelle partie des mêmes champs. */
export const ToolEdit = ToolAdmit.partial().meta({ id: 'ToolEdit' })
export type ToolEdit = z.infer<typeof ToolEdit>

/** Rattacher un « Autre » à un outil du catalogue (jamais l'inverse, jamais vers un « Autre »). */
export const ToolMerge = z.strictObject({ into: ToolSlug }).meta({ id: 'ToolMerge' })
export type ToolMerge = z.infer<typeof ToolMerge>

/**
 * Ce que changera un rattachement, pour la fenêtre de confirmation (jur-T5) : le nombre de projets
 * (privés compris) et de profils qui citent cet « Autre ». Des nombres, jamais leurs titres.
 */
export const ToolImpact = z
  .object({ projects: z.int().nonnegative(), profiles: z.int().nonnegative() })
  .meta({ id: 'ToolImpact' })
export type ToolImpact = z.infer<typeof ToolImpact>

/**
 * Un projet classé « Autre » à ranger (onglet « À ranger ») : visible des membres, et que son auteur
 * n'a pas remis en « Autre » après un rangement (jur-T4 : son choix l'emporte).
 */
export const UncategorizedProject = z
  .object({
    id: ProjectId,
    title: z.string(),
    pitch: z.string(),
    author: NamedMember,
    primaryCategory: CategoryCode.nullable(),
    secondaryCategory: CategoryCode.nullable(),
    publishedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'UncategorizedProject' })
export type UncategorizedProject = z.infer<typeof UncategorizedProject>

export const UncategorizedPage = z
  .object({ items: z.array(UncategorizedProject).max(CATALOGUE_PAGE_SIZE), ...Page })
  .meta({ id: 'UncategorizedPage' })
export type UncategorizedPage = z.infer<typeof UncategorizedPage>

/**
 * Ranger un projet : « Autre » est remplacée par cette catégorie à sa place (principale ou
 * seconde) ; si l'autre place la porte déjà, « Autre » est simplement retirée. Jamais « Autre »
 * elle-même ; jamais sur son propre projet (403 `own_project`).
 */
export const Recategorize = z.strictObject({ category: CategoryCode }).meta({ id: 'Recategorize' })
export type Recategorize = z.infer<typeof Recategorize>

/** Créer une catégorie : son nom en français et en anglais, et son icône. Noms uniques (409). */
export const CategoryCreate = z
  .strictObject({ nameFr: CategoryName, nameEn: CategoryName, icon: CategoryIcon })
  .meta({ id: 'CategoryCreate' })
export type CategoryCreate = z.infer<typeof CategoryCreate>

/** Ce qu'un administrateur a fait au catalogue (« Changements récents »). */
export const CatalogueChangeAction = z.enum([
  'tool_admit',
  'tool_create',
  'tool_edit',
  'tool_merge',
  'tool_dismiss',
  'category_create',
  'project_recategorize',
])
export type CatalogueChangeAction = z.infer<typeof CatalogueChangeAction>

/**
 * Une ligne de « Changements récents » : qui, quand, quoi. `project` vaut null dès que le projet
 * n'est plus visible des membres (privé, retiré, supprimé) : son titre ne se lit plus ici (sec-A1).
 */
export const CatalogueChange = z
  .object({
    id: z.uuid(),
    action: CatalogueChangeAction,
    at: z.iso.datetime(),
    /** L'administrateur ; null si son compte a été supprimé. */
    admin: NamedMember.nullable(),
    tool: z.object({ slug: ToolSlug, name: z.string() }).nullable(),
    /** Le nom de l'« Autre » rattaché (tool_merge) ; null sinon. */
    mergedName: z.string().nullable(),
    category: z.object({ code: CategoryCode, name: z.string() }).nullable(),
    project: z.object({ id: ProjectId, title: z.string() }).nullable(),
    /** La catégorie remplacée par un rangement ; null sinon. */
    fromCategory: CategoryCode.nullable(),
  })
  .meta({ id: 'CatalogueChange' })
export type CatalogueChange = z.infer<typeof CatalogueChange>

export const CatalogueChangesPage = z
  .object({ items: z.array(CatalogueChange).max(CATALOGUE_PAGE_SIZE), ...Page })
  .meta({ id: 'CatalogueChangesPage' })
export type CatalogueChangesPage = z.infer<typeof CatalogueChangesPage>
