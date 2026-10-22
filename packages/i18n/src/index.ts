// Point d'entrée du paquet @ruche/i18n, partagé par l'API et l'appli.
// Il contient les textes dans chaque langue et la logique pour choisir la bonne langue.
import { appName, contactEmail } from '@ruche/brand'
import { en } from './locales/en'
import { fr } from './locales/fr'

// `export type` ré-exporte uniquement un type : il disparaît à la compilation, aucun code n'est généré.
export type { Translation } from './types'

// `as const` fige le tableau : TypeScript sait qu'il contient exactement 'fr' puis 'en',
// et pas « n'importe quelle chaîne de caractères ».
export const supportedLanguages = ['fr', 'en'] as const

// Type dérivé du tableau ci-dessus : Language vaut 'fr' | 'en'.
// Ajouter une langue au tableau mettra automatiquement ce type à jour.
export type Language = (typeof supportedLanguages)[number]

export const defaultLanguage: Language = 'fr'

/**
 * Les paramètres présents dans tous les textes et remplis automatiquement, sans qu'on ait à les
 * passer : {{appName}} devient le nom de l'appli, {{contactEmail}} l'adresse de contact
 * (tranche 6d). L'appli les donne à i18next, l'API à `fill`.
 */
export const textVariables = { appName, contactEmail } as const

/**
 * Remplace les {{paramètres}} d'un texte par leur valeur, pour l'API (l'appli utilise i18next) :
 * fill('Bonjour {{name}}', { name: 'Léa' }) → 'Bonjour Léa'. Les paramètres communs sont toujours
 * fournis ; un paramètre inconnu devient une chaîne vide.
 */
export const fill = (template: string, params: Readonly<Record<string, string>> = {}): string => {
  const values: Record<string, string> = { ...textVariables, ...params }
  // Object.hasOwn : seules les valeurs données comptent, jamais celles héritées de tout objet
  // JavaScript ({{constructor}} ou {{toString}} donnent donc une chaîne vide).
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? '') : '',
  )
}

/**
 * Le nom d'un membre précédé de ce qui le relie au texte, pour {{nameOf}} (tranche 6c) :
 * - en français, « de » s'élide devant une voyelle (accents compris, œ et æ aussi) ou un h :
 *   « d’Inès », « d’Hugo », mais « de Léa » ; un nom vide donne « de » suivi de rien ;
 * - le y compte comme une voyelle quand il se prononce « i », devant une consonne (« d’Yves »),
 *   mais comme une consonne devant une voyelle (« de Yasmine », « de Yann ») ;
 * - en anglais, le possessif : « Inès’s ».
 * L'apostrophe est typographique (’, U+2019), comme dans tous les textes. Le texte qui l'utilise
 * s'écrit sans « de » : « Voir la page {{nameOf}} ».
 */
export const nameOf = (language: Language, name: string): string => {
  if (language === 'en') return `${name}’s`
  // normalize('NFD') sépare la lettre de son accent (« É » → « E » + accent) : il suffit alors de
  // regarder la lettre de base. Le drapeau i accepte les minuscules comme les majuscules.
  // Pour le y, on regarde aussi la lettre suivante : NFD place l'accent après sa lettre (« Yé »
  // devient « Y », « e », accent), la deuxième lettre est donc déjà sans accent.
  const base = name.normalize('NFD')
  const elides = /^[aeiouhœæ]/i.test(base) || (/^y/i.test(base) && !/^y[aeiouyœæ]/i.test(base))
  return elides ? `d’${name}` : `de ${name}`
}

/** Les textes, dans la forme attendue par la bibliothèque i18next. */
export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const

// « Garde de type » : si la fonction répond true, TypeScript sait ensuite que `value`
// est une Language (grâce à la syntaxe `value is Language`).
const isLanguage = (value: string): value is Language =>
  (supportedLanguages as readonly string[]).includes(value)

/**
 * Choisit la première langue gérée parmi des préférences rangées de la plus à la moins voulue :
 * les langues du téléphone, ou l'en-tête Accept-Language du navigateur.
 * Une variante régionale correspond à sa langue de base : "en-US" donne "en".
 */
export const resolveLanguage = (preferences: readonly string[]): Language => {
  for (const preference of preferences) {
    // "EN-us " → "en-us" → ["en", "us"] → "en"
    const base = preference.trim().toLowerCase().split('-')[0] ?? ''
    if (isLanguage(base)) return base
  }
  return defaultLanguage
}

/**
 * Transforme un en-tête Accept-Language en liste de langues, la préférée en premier.
 * Exemple : "fr;q=0.5, en;q=0.9" → ["en", "fr"].
 * Les langues refusées (q=0) et le joker "*" sont ignorés.
 */
export const parseAcceptLanguage = (header: string | undefined | null): string[] => {
  if (!header) return []
  return (
    header
      .split(',')
      // Pour chaque morceau "fr;q=0.5" : la langue, sa note de préférence (q) et sa position.
      .map((part, index) => {
        const [tag = '', ...params] = part.trim().split(';')
        const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
        const quality = qParam ? Number.parseFloat(qParam.slice(2)) : 1 // sans q, la note vaut 1
        return { tag: tag.trim(), quality: Number.isNaN(quality) ? 0 : quality, index }
      })
      .filter(({ tag, quality }) => tag !== '' && tag !== '*' && quality > 0)
      // Tri par note décroissante ; à note égale, on garde l'ordre d'origine de l'en-tête.
      .sort((a, b) => b.quality - a.quality || a.index - b.index)
      .map(({ tag }) => tag)
  )
}
