// Les catégories d'un projet (R6a) : l'icône de chacune, et la liste des choix qu'affichent la
// feuille de publication et les cartes. Les noms viennent des traductions (`project.category.*`),
// les codes du contrat (`PROJECT_CATEGORIES`), dans l'ordre de la feuille.
import { PROJECT_CATEGORIES, type ProjectCategory, type ProjectDifficulty } from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'
import type { IconName } from '../ui/Icon'

// La fonction `t` de react-i18next, pour traduire hors d'un composant.
type T = ReturnType<typeof useTranslation>['t']

/**
 * L'icône de chaque catégorie (Phosphor, ajoutées à `scripts/icons.mts`). `Record<A, B>` : un objet
 * qui a exactement une valeur B pour chaque A ; si le contrat gagne une catégorie, le typage
 * refuse ce fichier tant qu'elle n'a pas son icône.
 */
export const CATEGORY_ICONS: Record<ProjectCategory, IconName> = {
  'home-garden': 'plant',
  cooking: 'cooking-pot',
  family: 'users-three',
  learning: 'graduation-cap',
  games: 'game-controller',
  art: 'paint-brush',
  music: 'music-notes',
  'photo-video': 'film-strip',
  'health-sport': 'heartbeat',
  travel: 'airplane-tilt',
  money: 'piggy-bank',
  work: 'briefcase',
  code: 'code',
  animals: 'paw-print',
  science: 'planet',
  other: 'shapes',
}

/** Une catégorie telle qu'on l'affiche : son code, son nom traduit, son icône. */
export type CategoryOption = { value: ProjectCategory; label: string; icon: IconName }

/** Le nom traduit et l'icône d'une catégorie (l'étiquette d'une carte, la page d'un projet). */
export const categoryOption = (t: T, value: ProjectCategory): CategoryOption => ({
  value,
  label: t(($) => $.project.category[value]),
  icon: CATEGORY_ICONS[value],
})

/**
 * La pastille de couleur de chaque réponse à « Facile à refaire ? » (vert, jaune, rouge), passée à
 * `Choices` (`dot`). Des noms de couleur du design, jamais seuls porteurs du sens : le texte dit
 * tout. `as const` garde les noms exacts ; `satisfies` vérifie qu'aucune réponse n'est oubliée.
 */
export const DIFFICULTY_DOTS = {
  easy: 'success',
  medium: 'amber',
  hard: 'danger',
} as const satisfies Record<ProjectDifficulty, string>

/** Les seize catégories, dans l'ordre de la feuille de publication. */
export const categoryOptions = (t: T): CategoryOption[] =>
  PROJECT_CATEGORIES.map((value) => categoryOption(t, value))
