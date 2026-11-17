// Une liste de cartes de projets, en grille. Le nombre de colonnes vient de la place (R15, « Des
// colonnes qui suivent la place ») : autant de cartes qu'il en tient côte à côte sans descendre sous
// `layout.cardMin.feed`, dans la largeur de la colonne où la grille est posée. Cette largeur, l'écran
// (`Screen`) ou la colonne principale de `Columns` la publient (`useContentWidth()`) : la grille la
// lit, sans qu'aucun écran ne fasse le calcul (relecture du plan R15, C2). Un écran peut encore
// imposer son nombre (`columns`), sans plafond. Sans projet, un message (donné par l'écran)
// remplace la grille, ou rien sans message (les deux grilles du Fil, autour de « Tu es à jour »).
//
// Les cases d'une rangée ont la hauteur de la plus haute carte, et chaque case l'offre à sa carte :
// une carte de note, plus basse qu'une carte de projet, s'étire à sa hauteur (sa couverture prend
// la place qui reste) au lieu de laisser un vide dessous (relecture de design de R4, A2).
import { layout, space } from '@ruche/brand'
import { Children, type ReactNode } from 'react'
import { View } from 'react-native'
import { Button } from './Button'
import { Stack } from './Stack'
import { Surface } from './Surface'
import { Text } from './Text'
import { columnsFor, useContentWidth, useLayout } from './theme/layout'

type Props = {
  children: ReactNode
  /** Le message affiché quand la liste est vide ; sans lui, une liste vide n'affiche rien. */
  empty?: string | undefined
  /**
   * L'issue d'une liste vide, sous son message (relecture de design de R6b, C4 : une catégorie
   * vide d'Explorer, « Voir tous les projets »). Un bouton secondaire : l'action miel de la page
   * reste ailleurs. Ignorée sans `empty`.
   */
  emptyAction?: { label: string; onPress: () => void } | undefined
  /**
   * Le nombre de colonnes, imposé par l'écran (un entier, 1 au moins) ; sans lui, il suit la place.
   * R15 : facultatif, et le plus souvent inutile, puisque la grille connaît la largeur de sa
   * colonne ; reste pour un écran qui veut un nombre précis (une colonne dans un aperçu).
   */
  columns?: number
}

// Une valeur donnée par l'écran reste raisonnable : entière, et 1 au moins (une valeur absurde,
// 0 ou `NaN`, ne casse pas la grille en rangées vides ou en boucle sans fin). Plus de plafond de 3
// depuis R15 : un grand écran peut demander cinq colonnes.
const boundedColumns = (columns: number) =>
  Number.isFinite(columns) ? Math.max(1, Math.round(columns)) : 1

export function ProjectGrid({ children, empty, emptyAction, columns: imposed }: Props) {
  // La largeur de la fenêtre (0 avant l'hydratation du web) : à partir de `breakpoints.xwide`, une
  // carte du Fil ne descend plus sous `cardMin.feedWide` (trois colonnes de 436 à 1 920 à côté du
  // panneau, et non quatre plus serrées : planche R15-Fil-1920).
  const { width } = useLayout()
  // La largeur de la colonne où la grille est posée ; 0 avant l'hydratation, donc une colonne : la
  // page du téléphone, celle du pré-rendu, qui ne connaît pas la fenêtre.
  const room = useContentWidth()
  const cardMin = width >= layout.breakpoints.xwide ? layout.cardMin.feedWide : layout.cardMin.feed
  // Children.toArray : la liste des cartes, sans les « trous » (null, false) laissés par l'écran,
  // chacune avec sa clé.
  const cards = Children.toArray(children)
  if (cards.length === 0) {
    if (empty === undefined) return null
    return (
      <Surface variant="grouped" padding="xl">
        <Stack gap="md" align="center">
          <Text tone="secondary" align="center">
            {empty}
          </Text>
          {emptyAction ? (
            <Button label={emptyAction.label} variant="secondary" onPress={emptyAction.onPress} />
          ) : null}
        </Stack>
      </Surface>
    )
  }
  // La grille est faite de rangées de `columns` cases de même largeur (flex: 1). La dernière
  // rangée est complétée par des cases vides, pour que ses cartes gardent la même largeur. Une
  // rangée étire ses cases à la hauteur de la plus haute (le réglage par défaut d'une rangée) ; une
  // carte qui veut s'étirer avec sa case le peut (`flexGrow` de sa vue la plus extérieure).
  // Sans nombre imposé : autant de cartes d'au moins `cardMin` qu'il en tient dans la place, l'écart
  // entre deux cartes compris (`columnsFor`, une colonne au moins).
  const columns =
    imposed === undefined ? columnsFor(room, cardMin, space.lg) : boundedColumns(imposed)
  const rows: ReactNode[][] = []
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns))
  return (
    // accessibilityRole="list" : les lecteurs d'écran annoncent une liste et son nombre d'éléments.
    <View accessibilityRole="list" style={{ gap: space.lg }}>
      {rows.map((row, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: une rangée n'a pas d'autre identité que sa place
        <View key={r} style={{ flexDirection: 'row', gap: space.lg }}>
          {Array.from({ length: columns }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: idem, une case est une place dans la rangée
            <View key={c} style={{ flex: 1 }}>
              {row[c] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
