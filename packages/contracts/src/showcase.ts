// La vitrine de l'accueil (tranche R12, « Les projets publics ») : au plus quatre projets publics
// (`web`), choisis par la modération, montrés à tout le monde sur l'accueil, et aux membres dans
// « À la une », en tête d'Explorer. L'auteur est prévenu dans Activité (`showcase_added`) et peut
// quitter la vitrine (« Retirer de l'accueil ») : une nouvelle mise en avant de ce projet est alors
// refusée (409 `author_declined`, relecture juridique du plan, décision 18).
import { z } from 'zod'
import { ExampleFlag } from './example'
import { ProjectId, ProjectStatus, PublicVisual } from './projects'

/** Au plus quatre projets dans la vitrine : trois se montrent sur téléphone, quatre sur ordinateur. */
export const SHOWCASE_MAX = 4

/**
 * Une carte de la vitrine : de quoi la montrer et ouvrir le projet, rien de plus. La même pour un
 * visiteur (GET /v1/public/showcase) et pour un membre (GET /v1/showcase, « À la une »). Liste
 * blanche (`strictObject`) : un visiteur la lit. L'auteur n'y a ni identifiant ni pseudo.
 */
export const ShowcaseItem = z
  .strictObject({
    id: ProjectId,
    title: z.string(),
    pitch: z.string(),
    status: ProjectStatus,
    /** La première photo de la galerie ; null : pas de photo, l'appli montre sa tuile. */
    cover: PublicVisual.nullable(),
    /** `example` (R12b) : `true` pour un compte d'exemples, absent sinon. */
    author: z.strictObject({
      name: z.string(),
      avatarUrl: z.url().nullable(),
      example: ExampleFlag,
    }),
  })
  .meta({ id: 'ShowcaseItem' })
export type ShowcaseItem = z.infer<typeof ShowcaseItem>

/**
 * La vitrine, dans l'ordre choisi par la modération. Seuls y sont les projets encore visibles d'un
 * visiteur (`web`, non retirés, auteur présent) ; pour un membre, aussi ceux que les blocages ne
 * cachent pas, comme dans Explorer. Vide : l'accueil reste celui de R11, et « À la une » disparaît.
 */
export const ShowcasePage = z
  .strictObject({ items: z.array(ShowcaseItem).max(SHOWCASE_MAX) })
  .meta({ id: 'ShowcasePage' })
export type ShowcasePage = z.infer<typeof ShowcasePage>

/** Un projet tel que la modération le voit dans l'onglet « Vitrine de l'accueil ». */
const ModerationShowcaseProject = z.strictObject({
  id: ProjectId,
  title: z.string(),
  status: ProjectStatus,
  cover: PublicVisual.nullable(),
  author: z.strictObject({ id: z.string(), name: z.string() }),
})

/**
 * Un projet de la vitrine, côté modération : sa place (1 à 4), sa date d'entrée, et
 * `editedSinceAdded` (« Modifié depuis la mise en avant », décision 18) : vrai si le projet a été
 * modifié après son entrée dans la vitrine.
 */
export const ModerationShowcaseItem = z
  .strictObject({
    project: ModerationShowcaseProject,
    position: z.int().min(1).max(SHOWCASE_MAX),
    addedAt: z.iso.datetime(),
    editedSinceAdded: z.boolean(),
  })
  .meta({ id: 'ModerationShowcaseItem' })
export type ModerationShowcaseItem = z.infer<typeof ModerationShowcaseItem>

/** Les projets publics proposés à la modération pour la vitrine : les 20 plus récents. */
export const SHOWCASE_CANDIDATES_MAX = 20

/**
 * Un projet public qu'on pourrait mettre en avant. `showcaseDeclinedAt` : le moment où son auteur
 * l'a retiré de l'accueil ; non nul, l'ajout répond 409 `author_declined`, et l'onglet le dit.
 */
export const ShowcaseCandidate = z
  .strictObject({
    project: ModerationShowcaseProject,
    publishedAt: z.iso.datetime(),
    showcaseDeclinedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'ShowcaseCandidate' })
export type ShowcaseCandidate = z.infer<typeof ShowcaseCandidate>

/**
 * L'onglet « Vitrine de l'accueil » (GET /v1/moderation/showcase, administrateurs seulement) : la
 * vitrine dans l'ordre, puis les projets publics qui n'y sont pas.
 */
export const ModerationShowcase = z
  .strictObject({
    items: z.array(ModerationShowcaseItem).max(SHOWCASE_MAX),
    candidates: z.array(ShowcaseCandidate).max(SHOWCASE_CANDIDATES_MAX),
  })
  .meta({ id: 'ModerationShowcase' })
export type ModerationShowcase = z.infer<typeof ModerationShowcase>

/**
 * Ce que PUT /v1/moderation/showcase accepte : la vitrine entière, dans l'ordre (la première place
 * d'abord), chaque projet une fois, quatre au plus ; vide, la vitrine se vide. Un projet qui n'y
 * était pas y entre (et son auteur est prévenu) ; un projet absent de la liste en sort. Chaque
 * projet doit être public et visible d'un visiteur (sinon 404, comme un projet inconnu) ; un projet
 * dont l'auteur a quitté la vitrine : 409 `author_declined`, et rien ne change.
 */
export const ShowcaseOrder = z
  .strictObject({
    projectIds: z
      .array(ProjectId)
      .max(SHOWCASE_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'each project once' }),
  })
  .meta({ id: 'ShowcaseOrder' })
export type ShowcaseOrder = z.infer<typeof ShowcaseOrder>

/**
 * Dans l'export de son auteur (droit d'accès) : chacun de ses projets qui est, ou a été, concerné
 * par la vitrine. `addedAt` : son entrée dans la vitrine, null s'il n'y est plus ; `declinedAt` :
 * le moment où l'auteur l'a retiré de l'accueil, null sinon. Jamais l'administrateur qui l'a choisi.
 */
export const ShowcaseExport = z
  .strictObject({
    projectId: ProjectId,
    addedAt: z.iso.datetime().nullable(),
    declinedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'ShowcaseExport' })
export type ShowcaseExport = z.infer<typeof ShowcaseExport>
