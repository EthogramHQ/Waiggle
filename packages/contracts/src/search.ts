// La recherche par mots (tranche R3) : ce que l'appli envoie (GET /v1/search?q=) et ce que l'API
// répond (projets, membres, outils), et la liste de tous les outils (GET /v1/tools). Ce fichier
// porte aussi le « repli » des accents, partagé par l'API (qui l'écrit en SQL) et par l'appli (qui
// surligne la partie du texte qui correspond) : une seule table, pour que « eleve » trouve
// « Élève » des deux côtés de la même façon.
import { z } from 'zod'
import { ProjectSummary } from './projects'
import { isCleanText } from './text'

/** La recherche commence à 2 caractères tapés… */
export const SEARCH_QUERY_MIN = 2
/** … et s'arrête à 80 : au-delà, ce n'est plus une recherche. */
export const SEARCH_QUERY_MAX = 80
/** Au plus 5 mots retenus ; les suivants sont ignorés (chaque mot coûte une condition SQL). */
export const SEARCH_WORDS_MAX = 5
/** Un mot d'une seule lettre est ignoré : « e » trouverait presque tout (relecture de sécurité, sec-B2). */
export const SEARCH_WORD_MIN = 2
/**
 * Les membres que l'on ne suit pas ne se trouvent qu'à partir de 3 caractères, comme les mentions
 * (décision de Louis du 30/10/2026, sec-B1 et jur-J1) : avec 2 lettres, 1 369 paires suffiraient à
 * relever l'annuaire du cercle en moins d'un jour. Projets et outils restent à 2.
 */
export const SEARCH_OTHERS_FROM = 3
/** Chaque groupe (projets, membres, outils) rend 20 résultats au plus. */
export const SEARCH_GROUP_MAX = 20
/** L'extrait d'une description, autour du premier mot trouvé : 160 caractères au plus. */
export const SEARCH_EXCERPT_MAX = 160
/** La liste de tous les outils s'arrête à 500 (sec-A9). */
export const TOOL_LIST_MAX = 500

/**
 * La table de repli : chaque caractère accentué latin, majuscule ou minuscule, devient sa lettre
 * simple en minuscule ; l'apostrophe typographique devient l'apostrophe droite ; « œ », « æ » et
 * « ß » deviennent deux lettres. C'est l'unique source : l'API en tire son `translate` (les
 * entrées à une lettre) et ses `replace` (les entrées à deux lettres), l'appli `foldForSearch`.
 * Les majuscules y sont, même si `foldForSearch` met d'abord en minuscules : en SQL, `lower()`
 * ne touche que l'ASCII quand la base est en locale « C » (PGlite), et c'est `translate` qui
 * replie « É » (sec-A2).
 */
export const SEARCH_FOLD: Readonly<Record<string, string>> = {
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  å: 'a',
  ç: 'c',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ñ: 'n',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ø: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ü: 'u',
  ý: 'y',
  ÿ: 'y',
  À: 'a',
  Á: 'a',
  Â: 'a',
  Ã: 'a',
  Ä: 'a',
  Å: 'a',
  Ç: 'c',
  È: 'e',
  É: 'e',
  Ê: 'e',
  Ë: 'e',
  Ì: 'i',
  Í: 'i',
  Î: 'i',
  Ï: 'i',
  Ñ: 'n',
  Ò: 'o',
  Ó: 'o',
  Ô: 'o',
  Õ: 'o',
  Ö: 'o',
  Ø: 'o',
  Ù: 'u',
  Ú: 'u',
  Û: 'u',
  Ü: 'u',
  Ý: 'y',
  Ÿ: 'y',
  '’': "'",
  œ: 'oe',
  Œ: 'oe',
  æ: 'ae',
  Æ: 'ae',
  ß: 'ss',
  ẞ: 'ss',
}

/**
 * Replie un texte pour la recherche : minuscules d'abord (`toLowerCase` connaît tous les
 * alphabets), puis la table. « L’Élève » devient « l'eleve », « ŒUVRE » devient « oeuvre ».
 */
export const foldForSearch = (text: string): string => {
  let folded = ''
  for (const char of text.toLowerCase()) folded += SEARCH_FOLD[char] ?? char
  return folded
}

/**
 * Le repli avec la correspondance des positions, pour surligner dans le texte d'origine ce qui a
 * été trouvé dans le texte replié. `map[i]` est la position (en unités UTF-16, celles de `slice`)
 * dans le texte d'origine du caractère qui a donné `folded[i]` ; `map[folded.length]` vaut
 * `text.length`, pour que la fin d'une correspondance `[start, end)` se lise `map[end]`.
 * Un « œ » donne deux caractères repliés qui pointent tous deux vers lui.
 */
export const foldWithMap = (text: string): { folded: string; map: number[] } => {
  let folded = ''
  const map: number[] = []
  let offset = 0
  // for…of avance caractère par caractère, emoji compris (deux unités UTF-16 pour un seul).
  for (const char of text) {
    for (const lowered of char.toLowerCase()) {
      const replaced = SEARCH_FOLD[lowered] ?? lowered
      for (const _ of replaced) map.push(offset)
      folded += replaced
    }
    offset += char.length
  }
  map.push(text.length)
  return { folded, map }
}

/**
 * Les mots d'une recherche, prêts pour la comparaison : repliés, sans les mots d'une seule lettre
 * ni les doublons, 5 au plus (sec-B2). L'API cherche chaque mot (tous doivent apparaître), l'appli
 * les surligne. Un tableau vide veut dire : rien à chercher (la requête est alors refusée).
 */
export const searchWords = (q: string): string[] => {
  const words: string[] = []
  for (const word of foldForSearch(q).split(/\s+/)) {
    if (word.length < SEARCH_WORD_MIN || words.includes(word)) continue
    words.push(word)
    if (words.length === SEARCH_WORDS_MAX) break
  }
  return words
}

/**
 * Ce que l'appli demande : le texte tapé, nettoyé (`trim`), de 2 à 80 caractères, sans caractère
 * invisible (comme tout texte reçu), et dont il reste au moins un mot de deux lettres. Le texte
 * n'est gardé nulle part : ni en base, ni dans les journaux (scénario, « Les garde-fous »).
 */
export const SearchQuery = z.object({
  q: z
    .string()
    .trim()
    .min(SEARCH_QUERY_MIN)
    .max(SEARCH_QUERY_MAX)
    .refine((text) => isCleanText(text), { message: 'contains forbidden characters' })
    .refine((text) => searchWords(text).length > 0, { message: 'has no word to search' }),
})
export type SearchQuery = z.infer<typeof SearchQuery>

/**
 * Un projet trouvé : son résumé, et un extrait de sa description quand c'est elle qui contient le
 * mot (ni le titre ni le pitch) : texte simple, Markdown retiré, « … » aux coupures ; null sinon.
 */
export const SearchProject = ProjectSummary.extend({
  excerpt: z.string().max(SEARCH_EXCERPT_MAX).nullable(),
}).meta({ id: 'SearchProject' })
export type SearchProject = z.infer<typeof SearchProject>

/** Un membre trouvé : de quoi le reconnaître, et son nombre d'abonnés (jamais leurs noms). */
export const SearchMember = z
  .object({
    id: z.string(),
    name: z.string(),
    handle: z.string(),
    avatarUrl: z.url().nullable(),
    followerCount: z.int().nonnegative(),
  })
  .meta({ id: 'SearchMember' })
export type SearchMember = z.infer<typeof SearchMember>

/**
 * Un outil et son nombre de projets publics. `label` est le nom tel que tapé sur le projet le plus
 * récent qui le cite (« Claude Code »), `slug` son étiquette dans les adresses (/tags/claude-code).
 */
export const ToolCount = z
  .object({
    slug: z.string(),
    label: z.string(),
    projectCount: z.int().nonnegative(),
  })
  .meta({ id: 'ToolCount' })
export type ToolCount = z.infer<typeof ToolCount>

/** Un groupe de résultats : 20 au plus, et `more` quand un 21e existait (l'appli dit « 20+ »). */
const groupOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item).max(SEARCH_GROUP_MAX), more: z.boolean() })

/** La réponse de GET /v1/search : les trois groupes, toujours présents, même vides. */
export const SearchResults = z
  .object({
    projects: groupOf(SearchProject),
    members: groupOf(SearchMember),
    tools: groupOf(ToolCount),
  })
  .meta({ id: 'SearchResults' })
export type SearchResults = z.infer<typeof SearchResults>

/**
 * La réponse de GET /v1/tools : les outils des projets publics visibles par le membre, du plus
 * utilisé au moins utilisé, puis par libellé ; 500 au plus. L'appli les retrie par ordre
 * alphabétique pour « Tous les outils ».
 */
export const ToolList = z
  .object({ tools: z.array(ToolCount).max(TOOL_LIST_MAX) })
  .meta({ id: 'ToolList' })
export type ToolList = z.infer<typeof ToolList>
