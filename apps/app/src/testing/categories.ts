// Les catégories des tests de l'appli (tranche R6b) : depuis R6b, leurs noms et leurs icônes
// viennent de l'API (GET /v1/categories), plus des traductions. Les kits de test simulent cette
// réponse avec ces seize catégories de départ, en français et en anglais, dans l'ordre de la feuille
// de publication (« Autre » en dernier).
import type { Category, CategoryList } from '@ruche/contracts'

type Seed = { code: string; fr: string; en: string; icon: Category['icon'] }

const SEEDS: Seed[] = [
  { code: 'home-garden', fr: 'Maison et jardin', en: 'Home and garden', icon: 'plant' },
  { code: 'cooking', fr: 'Cuisine', en: 'Cooking', icon: 'cooking-pot' },
  { code: 'family', fr: 'Famille et enfants', en: 'Family and kids', icon: 'users-three' },
  { code: 'learning', fr: 'Apprendre', en: 'Learning', icon: 'graduation-cap' },
  { code: 'games', fr: 'Jeux', en: 'Games', icon: 'game-controller' },
  { code: 'art', fr: 'Art et dessin', en: 'Art and drawing', icon: 'paint-brush' },
  { code: 'music', fr: 'Musique', en: 'Music', icon: 'music-notes' },
  { code: 'photo-video', fr: 'Photo et vidéo', en: 'Photo and video', icon: 'film-strip' },
  { code: 'health-sport', fr: 'Santé et sport', en: 'Health and sport', icon: 'heartbeat' },
  { code: 'travel', fr: 'Voyages', en: 'Travel', icon: 'airplane-tilt' },
  { code: 'money', fr: 'Argent et budget', en: 'Money and budget', icon: 'piggy-bank' },
  { code: 'work', fr: 'Travail', en: 'Work', icon: 'briefcase' },
  { code: 'code', fr: 'Code et outils', en: 'Code and tools', icon: 'code' },
  { code: 'animals', fr: 'Animaux', en: 'Animals', icon: 'paw-print' },
  { code: 'science', fr: 'Sciences et espace', en: 'Science and space', icon: 'planet' },
  { code: 'other', fr: 'Autre', en: 'Other', icon: 'shapes' },
]

/**
 * La réponse simulée de GET /v1/categories, dans une langue ; `counts` donne le nombre de projets
 * de certaines catégories (0 pour les autres).
 */
export const categoryList = (
  language: 'fr' | 'en' = 'fr',
  counts: Record<string, number> = {},
): CategoryList => ({
  categories: SEEDS.map((seed) => ({
    code: seed.code,
    name: seed[language],
    icon: seed.icon,
    projectCount: counts[seed.code] ?? 0,
  })),
})

/** Le nom d'une catégorie de départ, pour les attentes des tests (« Sciences et espace »). */
export const categoryName = (code: string, language: 'fr' | 'en' = 'fr'): string => {
  const seed = SEEDS.find((one) => one.code === code)
  if (!seed) throw new Error(`catégorie de test inconnue : ${code}`)
  return seed[language]
}
