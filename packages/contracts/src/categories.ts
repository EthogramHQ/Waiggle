// Les catégories des projets (R6a, en base depuis R6b) : leur code, leur nom dans la langue du
// visiteur, leur icône et leur nombre de projets (GET /v1/categories). Un administrateur peut en
// créer une (docs/scenarios/refonte.md, « R6b », « Les catégories ») : nom en français et en
// anglais, icône choisie dans une liste fixe. On ne renomme ni ne supprime une catégorie en R6b.
import { z } from 'zod'
import { ShortLabel } from './text'

/** Le code d'une catégorie (« cooking », « jardinage ») : minuscules, chiffres et tirets. */
export const CategoryCode = z.string().regex(/^[a-z0-9-]{1,40}$/)
export type CategoryCode = z.infer<typeof CategoryCode>

/** La catégorie « Autre » : toujours la dernière, réservée (on n'en crée pas une autre de ce code). */
export const OTHER_CATEGORY = 'other'

/** Le nom d'une catégorie : 30 caractères au plus, en français comme en anglais. */
export const CATEGORY_NAME_MAX = 30

/**
 * Les icônes qu'on peut donner à une catégorie (Phosphor, générées par `scripts/icons.mts` de
 * l'appli) : les seize des catégories de départ, puis seize de plus pour celles qu'un
 * administrateur créera. L'appli les nomme par leur sens (« Fleur »), jamais par ce code.
 */
export const CATEGORY_ICON_CHOICES = [
  'plant',
  'cooking-pot',
  'users-three',
  'graduation-cap',
  'game-controller',
  'paint-brush',
  'music-notes',
  'film-strip',
  'heartbeat',
  'airplane-tilt',
  'piggy-bank',
  'briefcase',
  'code',
  'paw-print',
  'planet',
  'shapes',
  'flower',
  'tree',
  'bicycle',
  'car',
  'house',
  'book-open',
  'chat-circle',
  'camera',
  'microphone',
  't-shirt',
  'baby',
  'globe',
  'lightbulb',
  'robot',
  'sparkle',
  'heart',
] as const
export const CategoryIcon = z.enum(CATEGORY_ICON_CHOICES)
export type CategoryIcon = z.infer<typeof CategoryIcon>

/** Une catégorie telle que l'appli l'affiche : nom dans la langue du visiteur, icône, nombre. */
export const Category = z
  .object({
    code: CategoryCode,
    name: z.string(),
    icon: CategoryIcon,
    /** Le nombre de projets que ce membre peut voir, en principale ou en seconde. */
    projectCount: z.int().nonnegative(),
  })
  .meta({ id: 'Category' })
export type Category = z.infer<typeof Category>

/** La réponse de GET /v1/categories : toutes, dans l'ordre de la feuille, « Autre » en dernier. */
export const CategoryList = z.object({ categories: z.array(Category) }).meta({ id: 'CategoryList' })
export type CategoryList = z.infer<typeof CategoryList>

/** Un nom de catégorie : une ligne, 30 caractères au plus, sans caractère invisible. */
export const CategoryName = ShortLabel(CATEGORY_NAME_MAX)
