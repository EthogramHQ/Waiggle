// Chercher dans le catalogue des outils ce qui se tape dans le champ des outils (tranche R6b,
// « Choisir ses outils ») : « clau » propose Claude et Claude Code, « chat gpt » propose ChatGPT
// (un de ses alias). Les accents, les majuscules, les espaces et la ponctuation ne comptent pas :
// on compare des noms « repliés » par `foldTool`, le même repli que l'API, pour que l'appli et le
// serveur reconnaissent toujours le même outil.
//
// Un fichier pur, sans React ni réseau : les écrans (la feuille « Catégorie et outils », le profil,
// « Rattacher » de l'administration) le partagent, et un test d'écran qui remplace `tools/api` ne
// le perd pas.
import { type CatalogueTool, foldTool } from '@ruche/contracts'
import type { ToolSuggestion } from '../ui/ToolField'

/** Le nombre de suggestions au plus : assez pour choisir, sans faire défiler la feuille. */
export const TOOL_SUGGESTIONS_MAX = 8

/**
 * Ce que le champ montre pour ce qui se tape : les outils proposés, et `known`, vrai quand le texte
 * tapé EST un outil du catalogue (son nom ou un alias, une fois replié). Le champ n'offre alors pas
 * d'« Ajouter « X » comme autre outil » : c'est l'outil du catalogue qu'on choisit.
 */
export type ToolMatch = { suggestions: ToolSuggestion[]; known: boolean }

/** Les noms repliés d'un outil : le sien, puis ceux de ses alias. */
const foldedNames = (tool: CatalogueTool): string[] => [
  foldTool(tool.name),
  ...tool.aliases.map(foldTool),
]

/** Un outil du catalogue devenu suggestion : la famille est son code (`assistant`), traduit par l'écran. */
const toSuggestion = (tool: CatalogueTool): ToolSuggestion => ({
  name: tool.name,
  uses: tool.projectCount,
  family: tool.family,
})

/**
 * Les outils du catalogue pour ce qui se tape (`query`), sauf ceux déjà choisis (`chosen`, comparés
 * repliés : « Chat GPT » choisi écarte ChatGPT) :
 * - champ vide : les plus utilisés (on voit ce qu'on peut prendre avant de taper) ;
 * - sinon, ceux dont le nom ou un alias commence par le texte d'abord, puis ceux qui le contiennent ;
 *   à rang égal, le plus utilisé d'abord (puis l'ordre du catalogue, déjà rangé par l'API) ;
 * - 8 au plus.
 */
export function matchTools(tools: CatalogueTool[], query: string, chosen: string[]): ToolMatch {
  const folded = query.trim() === '' ? '' : foldTool(query)
  const taken = new Set(chosen.map(foldTool))
  // Le rang de chaque outil : 0 s'il commence par le texte, 1 s'il le contient, absent sinon.
  const ranked: { tool: CatalogueTool; rank: number; index: number }[] = []
  let known = false
  tools.forEach((tool, index) => {
    const names = foldedNames(tool)
    if (folded !== '' && names.includes(folded)) known = true
    // Déjà choisi, par son nom ou par un alias (un vieux projet peut porter « chat gpt ») : rien.
    if (names.some((name) => taken.has(name))) return
    if (folded === '') {
      ranked.push({ tool, rank: 0, index })
      return
    }
    if (names.some((name) => name.startsWith(folded))) ranked.push({ tool, rank: 0, index })
    else if (names.some((name) => name.includes(folded))) ranked.push({ tool, rank: 1, index })
  })
  ranked.sort(
    (a, b) => a.rank - b.rank || b.tool.projectCount - a.tool.projectCount || a.index - b.index,
  )
  return {
    suggestions: ranked.slice(0, TOOL_SUGGESTIONS_MAX).map(({ tool }) => toSuggestion(tool)),
    known,
  }
}

/**
 * Le nom est-il celui d'un outil du catalogue, ou un de ses alias (une fois replié) ? Faux pour un
 * « Autre » : le champ marque alors sa pastille, et l'administration le relit.
 */
export function isCatalogueName(tools: CatalogueTool[], name: string): boolean {
  const folded = foldTool(name)
  return tools.some((tool) => foldedNames(tool).includes(folded))
}
