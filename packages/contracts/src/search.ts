// La recherche par mots (tranche R3) : ce que l'appli envoie (GET /v1/search?q=) et ce que l'API
// répond (projets, membres, outils), et la liste de tous les outils (GET /v1/tools). Ce fichier
// porte aussi le « repli » des accents, partagé par l'API (qui l'écrit en SQL) et par l'appli (qui
// surligne la partie du texte qui correspond) : une seule table, pour que « eleve » trouve
// « Élève » des deux côtés de la même façon.
import { z } from 'zod'
import { CategoryCode } from './categories'
import { foldForSearch } from './fold'
import { ProjectSummary } from './projects'
import { isCleanText } from './text'
import { CatalogueTool } from './tools'

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

export { foldForSearch, foldWithMap, SEARCH_FOLD } from './fold'

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
  /** R6b : ne garder, dans le groupe Projets, que ceux de cette catégorie (principale ou seconde). */
  category: CategoryCode.optional(),
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

/** Un groupe de résultats : 20 au plus, et `more` quand un 21e existait (l'appli dit « 20+ »). */
const groupOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item).max(SEARCH_GROUP_MAX), more: z.boolean() })

/** La réponse de GET /v1/search : les trois groupes, toujours présents, même vides. */
export const SearchResults = z
  .object({
    projects: groupOf(SearchProject),
    members: groupOf(SearchMember),
    // R6b : les outils du catalogue seulement (jamais un « Autre »), trouvés par leur nom ou un alias.
    tools: groupOf(CatalogueTool),
  })
  .meta({ id: 'SearchResults' })
export type SearchResults = z.infer<typeof SearchResults>
