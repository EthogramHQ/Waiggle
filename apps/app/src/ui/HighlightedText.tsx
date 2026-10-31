// Un texte dont certaines parties sont surlignées de miel : les mots d'une recherche (R3, « la partie
// du texte qui correspond est surlignée de miel »). « eleve » surligne « Élève », « oeu » surligne
// « Œu » de « Œuvre » : la comparaison se fait sur le texte « replié » (minuscules, sans accents,
// `foldWithMap` du contrat, la même table que l'API), puis chaque morceau trouvé est reporté sur le
// texte d'origine, qu'on affiche tel quel.
//
// Le texte reste un seul nœud, lu d'un tenant par les lecteurs d'écran (« Carnet de cafés », pas
// « Carn », « et de cafés ») ; les parties surlignées sont des textes imbriqués dedans. Le
// surlignage est un indice pour l'œil seulement : il ne change pas ce qui est lu.

import { radii } from '@ruche/brand'
import { foldForSearch, foldWithMap } from '@ruche/contracts'
import type { ReactElement } from 'react'
import { Text as NativeText, Platform, type TextStyle } from 'react-native'
import { Text, type TextProps } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Un morceau du texte d'origine, `[début, fin)`, en unités UTF-16 (celles de `slice`). */
type Range = readonly [number, number]

export type HighlightedTextProps = Omit<TextProps, 'children'> & {
  /** Le texte à afficher, tel qu'écrit (accents et majuscules gardés). */
  text: string
  /**
   * Les mots à surligner. Ils sont repliés ici (« ÉLÈVE » trouve « Élève ») : on peut passer ceux de
   * `searchWords` comme ce qui a été tapé. Aucun mot : le texte s'affiche sans surlignage.
   */
  words: readonly string[]
}

/**
 * Les morceaux du texte d'origine qui correspondent à l'un des mots, triés et fusionnés quand ils se
 * chevauchent ou se touchent (« café » et « caf » ne font qu'un surlignage).
 *
 * Le report d'une position du texte replié vers le texte d'origine passe par `map` : `map[i]` est
 * la position d'origine du caractère qui a donné la lettre repliée `i`. Un « œ » donne deux lettres
 * (« oe ») qui pointent toutes deux vers lui : une correspondance qui commence ou finit au milieu
 * prend le « œ » entier (on ne coupe jamais un caractère en deux).
 */
export const highlightRanges = (text: string, words: readonly string[]): Range[] => {
  const { folded, map } = foldWithMap(text)
  const found: [number, number][] = []
  for (const word of new Set(words.map(foldForSearch))) {
    // Un mot vide trouverait une correspondance vide à chaque position : on l'ignore.
    if (word.length === 0) continue
    let at = folded.indexOf(word)
    while (at !== -1) {
      const end = at + word.length
      // La fin dans le texte d'origine : la position du premier caractère d'origine qui suit la
      // dernière lettre trouvée. `map[end]` ne suffit pas quand cette lettre est la première moitié
      // d'un « œ » (« o » de « oe ») : il pointerait encore sur le « œ ».
      const last = map[end - 1] ?? 0
      let after = end
      while ((map[after] ?? text.length) <= last) after++
      found.push([map[at] ?? 0, map[after] ?? text.length])
      // Le mot suivant peut chevaucher celui-ci (« aa » dans « aaa ») : on repart une lettre plus loin.
      at = folded.indexOf(word, at + 1)
    }
  }
  found.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of found) {
    const previous = merged.at(-1)
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end)
    else merged.push([start, end])
  }
  return merged
}

// Les coins arrondis du surlignage : sur le web, une partie de texte (`<span>`) les dessine ; sur
// téléphone, un texte imbriqué n'en a pas (React Native les ignore), le surlignage y est droit.
// `boxDecorationBreak: 'clone'` : un mot surligné coupé en fin de ligne garde ses coins des deux
// côtés de la coupure. Cette propriété CSS manque aux types de React Native, d'où la conversion.
const markShape = (
  Platform.OS === 'web' ? { borderRadius: radii.mark, boxDecorationBreak: 'clone' } : {}
) as TextStyle

export function HighlightedText({ text, words, ...props }: HighlightedTextProps) {
  const { colors } = useTheme()
  const ranges = words.length === 0 ? [] : highlightRanges(text, words)
  // Le surlignage passe l'encre (`text`) sur le miel, même dans une ligne grise : couple mesuré
  // dans `contrastPairs` (packages/brand). Il hérite du reste (police, taille, graisse) du texte
  // qui l'entoure : seuls le fond et la couleur changent.
  const mark: TextStyle = { backgroundColor: colors.highlight, color: colors.text, ...markShape }
  const parts: (string | ReactElement)[] = []
  let from = 0
  for (const [start, end] of ranges) {
    if (start > from) parts.push(text.slice(from, start))
    parts.push(
      <NativeText key={start} style={mark}>
        {text.slice(start, end)}
      </NativeText>,
    )
    from = end
  }
  if (from < text.length) parts.push(text.slice(from))
  return <Text {...props}>{parts}</Text>
}
