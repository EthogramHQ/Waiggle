// Les mises à jour d'un projet (R7a), qui remplacent les notes du Journal. Une mise à jour a un
// titre et une version facultatifs, « Ce qui a changé » en 1 à 5 lignes rangées dans trois familles,
// et jusqu'à 4 photos, dont les deux premières peuvent former un avant / après. Elle fait remonter
// la carte du projet dans « Abonnements » et prévient ses abonnés et ses testeurs. On ne la modifie
// pas : on la supprime, puis on la republie.
import { z } from 'zod'
import { Removal } from './removal'
import { ShortLabel } from './text'
import { ProjectVisual, VisualDescription } from './visuals'

/** Le titre d'une mise à jour : 60 caractères au plus. */
export const UPDATE_TITLE_MAX = 60
/** Une ligne de « Ce qui a changé » : 120 caractères au plus. */
export const UPDATE_LINE_MAX = 120
/** Le numéro de version (« v1.3 ») : 20 caractères au plus. */
export const UPDATE_VERSION_MAX = 20
/** « Ce qui a changé » : 5 lignes au plus. */
export const UPDATE_LINES_MAX = 5
/** Les photos d'une mise à jour : 4 au plus. */
export const UPDATE_PHOTOS_MAX = 4
/** La frise se lit par pages de 20 mises à jour. */
export const UPDATES_PAGE_SIZE = 20
/** Au plus 10 mises à jour par membre et par 24 heures, tous projets confondus. */
export const UPDATES_PER_DAY = 10
/**
 * Au plus 100 photos de mises à jour par projet, en attente comprises (décision de Louis du
 * 10/11/2026, relecture de sécurité A10) : au-delà, 409 `update_photos_full`.
 */
export const UPDATE_PHOTOS_PER_PROJECT_MAX = 100
/**
 * Une photo envoyée pour une mise à jour pas encore publiée reste « en attente » 24 heures au plus,
 * puis la purge de nuit l'efface. 4 au plus en attente par projet : une cinquième remplace la plus
 * ancienne (relecture de sécurité A11).
 */
export const PENDING_PHOTO_HOURS = 24
/** Un projet compte 200 testeurs au plus ; au-delà, 409 `testers_full`. */
export const TESTERS_MAX = 200
/**
 * Hors d'« Abonnements » (Découvrir, recherche, page d'un outil ou d'un membre), la carte porte le
 * repère « Mis à jour » tant que la dernière mise à jour a moins de 30 jours.
 */
export const UPDATED_BADGE_DAYS = 30

/** L'identifiant d'une mise à jour, dans une adresse. */
export const UpdateId = z.uuid()

/**
 * Les trois familles d'une ligne : du nouveau (étincelle, ambre), une réparation (clé, vert), une
 * retouche (palette, encre discrète). Des codes stables ; les noms affichés sont dans les traductions.
 */
export const UpdateFamily = z.enum(['new', 'fixed', 'polish'])
export type UpdateFamily = z.infer<typeof UpdateFamily>

/**
 * Une ligne écrite par l'auteur : sa famille et son texte, sur une seule ligne, jamais vide ni fait
 * seulement de caractères invisibles.
 */
export const UpdateLine = z
  .strictObject({ family: UpdateFamily, text: ShortLabel(UPDATE_LINE_MAX) })
  .meta({ id: 'UpdateLine' })
export type UpdateLine = z.infer<typeof UpdateLine>

/**
 * Une ligne telle que l'API la relit (relecture de sécurité A7) : le texte n'est plus revérifié.
 * Les lignes sont gardées en JSON dans la base ; une ligne abîmée y est écartée par l'API au lieu
 * de casser le fil de tout le monde.
 */
export const UpdateLineOut = z.object({ family: UpdateFamily, text: z.string() })
export type UpdateLineOut = z.infer<typeof UpdateLineOut>

/** Une photo citée par une mise à jour : une photo déjà envoyée « en attente », et sa description. */
const UpdatePhotoInput = z.strictObject({ id: z.uuid(), description: VisualDescription })

/**
 * Ce que POST /v1/projects/{id}/updates accepte. Titre et version : null quand l'auteur les laisse
 * vides. Les photos sont envoyées avant (POST …/visuals avec `slot=update`) et citées ici par leur
 * identifiant, chacune une fois ; leur ordre est celui de la mise à jour (« Avant » puis « Après »).
 * `beforeAfter` demande au moins deux photos.
 */
export const NewProjectUpdate = z
  .strictObject({
    title: ShortLabel(UPDATE_TITLE_MAX).nullable(),
    version: ShortLabel(UPDATE_VERSION_MAX).nullable(),
    lines: z.array(UpdateLine).min(1).max(UPDATE_LINES_MAX),
    photos: z
      .array(UpdatePhotoInput)
      .max(UPDATE_PHOTOS_MAX)
      .refine((photos) => new Set(photos.map((photo) => photo.id)).size === photos.length, {
        message: 'each photo once',
      }),
    beforeAfter: z.boolean(),
  })
  .refine((update) => !update.beforeAfter || update.photos.length >= 2, {
    message: 'a before / after needs two photos',
    path: ['beforeAfter'],
  })
  .meta({ id: 'NewProjectUpdate' })
export type NewProjectUpdate = z.infer<typeof NewProjectUpdate>

/**
 * Une mise à jour publiée. Une mise à jour retirée par la modération ne paraît plus que pour
 * l'auteur du projet, avec `removal` ; null pour les autres.
 */
export const ProjectUpdate = z
  .object({
    id: UpdateId,
    title: z.string().nullable(),
    version: z.string().nullable(),
    lines: z.array(UpdateLineOut).min(1),
    /** Dans l'ordre de la mise à jour ; avec `beforeAfter`, la première est « Avant », la seconde « Après ». */
    photos: z.array(ProjectVisual).max(UPDATE_PHOTOS_MAX),
    beforeAfter: z.boolean(),
    createdAt: z.iso.datetime(),
    removal: Removal.nullable(),
  })
  .meta({ id: 'ProjectUpdate' })
export type ProjectUpdate = z.infer<typeof ProjectUpdate>

/**
 * Une mise à jour en version courte, pour les cartes (fil, Découvrir, recherche) : sa date, sa
 * version, sa première ligne et le nombre de lignes (« et 2 autres changements »). Jamais une mise
 * à jour retirée, pas même pour l'auteur (relecture de sécurité B4).
 */
export const UpdateSummary = z
  .object({
    id: UpdateId,
    at: z.iso.datetime(),
    version: z.string().nullable(),
    firstLine: UpdateLineOut,
    lineCount: z.int().min(1),
  })
  .meta({ id: 'UpdateSummary' })
export type UpdateSummary = z.infer<typeof UpdateSummary>

/**
 * Le marque-page de la frise : la même forme que celui du fil (`FeedCursor`), recopiée ici parce
 * que feed.ts lit projects.ts, qui lit ce fichier (sinon les trois s'attendraient au chargement).
 */
export const UpdatesCursor = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)

/** Les paramètres d'adresse de GET /v1/projects/{id}/updates : sans curseur, la première page. */
export const UpdatesQuery = z.object({ cursor: UpdatesCursor.optional() })
export type UpdatesQuery = z.infer<typeof UpdatesQuery>

/**
 * Une page de la frise, de la plus récente à la plus ancienne. `nextCursor` vaut null tout au
 * bout : l'appli écrit alors « Première version ».
 */
export const ProjectUpdatePage = z
  .object({
    items: z.array(ProjectUpdate).max(UPDATES_PAGE_SIZE),
    nextCursor: UpdatesCursor.nullable(),
  })
  .meta({ id: 'ProjectUpdatePage' })
export type ProjectUpdatePage = z.infer<typeof ProjectUpdatePage>
