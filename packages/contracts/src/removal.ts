// Le retrait d'un contenu par la modération (tranche 7a), tel que son auteur le lit. Fichier à
// part, sans autre import que zod : les projets, les notes et les commentaires s'en servent, et
// reports.ts lit les projets ; le mettre dans reports.ts ferait une boucle d'imports.
import { z } from 'zod'

/** Le fondement d'un retrait : la loi, ou les règles de l'appli. */
export const RemovalGround = z.enum(['illegal', 'rules'])
export type RemovalGround = z.infer<typeof RemovalGround>

/** L'explication d'un retrait, montrée à l'auteur du contenu : 500 caractères au plus. */
export const REMOVAL_EXPLANATION_MAX = 500

/**
 * Ce que l'auteur d'un contenu retiré lit (article 17 du règlement européen sur les services
 * numériques) : le fondement, l'explication, la date, et si le retrait a suivi un signalement
 * (jamais de qui). Aucun identifiant d'administrateur. Null partout pour les autres membres, qui ne
 * voient de toute façon plus le contenu.
 */
export const Removal = z
  .object({
    ground: RemovalGround,
    explanation: z.string(),
    at: z.iso.datetime(),
    /** Vrai si un membre autre que l'administrateur avait signalé le contenu. */
    afterReport: z.boolean(),
  })
  .meta({ id: 'Removal' })
export type Removal = z.infer<typeof Removal>

/**
 * R9 (7d) : les parties d'un contenu qu'on peut signaler, et que la modération peut parfois retirer
 * seules (le reste du contenu reste affiché). Les noms suivent le registre des entrées
 * (apps/api/src/moderation/inputs.ts). `text` : « Ce qui a changé » d'une mise à jour. `prompt` : les
 * prompts de départ d'un projet, ensemble. `cover` : la couverture, c'est-à-dire la 1re photo visible
 * de la galerie, ou la couverture verticale. Ici plutôt que dans reports.ts : les projets, les
 * membres, les mises à jour et le coin s'en servent, et reports.ts les lit (boucle d'imports).
 */
export const ReportPartField = z.enum([
  'title',
  'pitch',
  'description',
  'category',
  'tools',
  'demoUrl',
  'cover',
  'photo',
  'photoDescription',
  'prompt',
  'text',
  'name',
  'handle',
  'bio',
  'favoriteTools',
  'avatar',
])
export type ReportPartField = z.infer<typeof ReportPartField>

/** Les parties qui désignent une photo précise : elles portent l'identifiant de cette photo. */
export const MEDIA_PART_FIELDS = [
  'cover',
  'photo',
  'photoDescription',
] as const satisfies readonly ReportPartField[]

/** Vrai si la partie vise une photo précise (et doit donc porter son `mediaId`). */
export const isMediaPart = (field: ReportPartField): boolean =>
  (MEDIA_PART_FIELDS as readonly ReportPartField[]).includes(field)

/**
 * Une partie visée, telle que l'appli l'envoie : le champ, et l'identifiant de la photo pour une
 * photo, une couverture ou la description d'une photo (jamais pour les autres). `refine` relie les
 * deux champs ; l'API vérifie en plus que la photo appartient bien au contenu (404 sinon).
 */
export const ReportPart = z
  .strictObject({ field: ReportPartField, mediaId: z.uuid().optional() })
  .refine((part) => isMediaPart(part.field) === (part.mediaId !== undefined), {
    path: ['mediaId'],
    message: 'a photo part needs its photo, and only a photo part',
  })
  .meta({ id: 'ReportPart' })
export type ReportPart = z.infer<typeof ReportPart>

/**
 * Une partie relue par l'API (file, retirés, historique, notifications) : le champ, la photo
 * (null hors photo) et son rang dans sa galerie ou sa mise à jour, à partir de 1 (« La 2e photo »),
 * lu au moment de la réponse ; null hors photo, ou si la photo n'est plus là.
 */
export const PartOut = z
  .object({
    field: ReportPartField,
    mediaId: z.uuid().nullable(),
    position: z.int().positive().nullable(),
  })
  .strict()
  .meta({ id: 'PartOut' })
export type PartOut = z.infer<typeof PartOut>

/**
 * Une partie retirée seule, telle que son auteur la lit (et lui seul : vide pour tout autre
 * membre). Le reste du contenu reste affiché. La valeur retirée sort de sa colonne (relecture de
 * sécurité P1) : l'auteur la relit ici, pour savoir ce qui a été retiré et la remplacer. `value` :
 * un texte (description, lien de la démo, bio, description d'une photo), une liste (outils, outils
 * favoris, prompts), ou null pour une photo (elle reste dans la galerie de l'auteur, désignée par
 * `mediaId`). `imageUrl` : la photo de profil retirée, servie à son auteur seul ; null sinon.
 * `removal` : le fondement, l'explication, la date, et si un signalement l'a précédée (jamais de
 * qui), comme pour un contenu entier.
 */
export const RemovedPart = z
  .object({
    field: ReportPartField,
    mediaId: z.uuid().nullable(),
    value: z.union([z.string(), z.array(z.string())]).nullable(),
    imageUrl: z.url().nullable(),
    removal: Removal,
  })
  .strict()
  .meta({ id: 'RemovedPart' })
export type RemovedPart = z.infer<typeof RemovedPart>
