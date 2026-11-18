// Une grille de cartes, quelles qu'elles soient (tranche R16, « Ruches, Recherche et Outils en
// grand » ; planches R16-Ruches et R16-Outils) : les cartes de ruche et les invitations de l'onglet
// Ruches, « Les plus utilisés » d'Outils. `ProjectGrid` fait la même chose pour les seuls projets
// (avec leur famille de cartes et leur message de liste vide) ; celle-ci reçoit la largeur minimale
// d'une carte, donnée par le composant de la carte (`hiveCardGrid` de HiveCard.tsx, par exemple),
// jamais écrite par un écran.
//
// Comme `ProjectGrid` :
// - le nombre de colonnes vient de la place : autant de cartes d'au moins `minWidth` qu'il en tient
//   dans la largeur de la colonne où la grille est posée (`useContentWidth`, publiée par `Screen`
//   ou `Columns`) ; une colonne avant l'hydratation (la page pré-rendue ne connaît pas la fenêtre) ;
// - la grille est faite de rangées de cases de même largeur ; la dernière rangée est complétée de
//   cases vides : une carte seule sur sa rangée garde la largeur des autres, jamais étirée ;
// - les cases d'une rangée ont la hauteur de la plus haute carte, et chaque carte peut la prendre
//   (`flexGrow` de sa vue la plus extérieure) ;
// - chaque case dit son rang (`GridColumnContext`) : la lueur d'une carte vide passe 150 ms plus
//   tard d'une colonne à la suivante.
import { layout, type Space, space } from '@ruche/brand'
import { Children, type ReactNode } from 'react'
import { View } from 'react-native'
import { GridColumnContext } from './ProjectGrid'
import { useLargeText } from './textScale'
import { columnsFor, useContentWidth, useLayout } from './theme/layout'

type Props = {
  /** Les cartes, dans l'ordre de lecture (de gauche à droite, puis rangée après rangée). */
  children: ReactNode
  /** La largeur minimale d'une carte, en points : celle que donne le composant de la carte. */
  minWidth: number
  /** L'écart entre deux cartes, de côté comme entre deux rangées ; `lg` par défaut. */
  gap?: Space
  /** Le nombre de colonnes, imposé (un entier, 1 au moins) ; sans lui, il suit la place. */
  columns?: number
  /**
   * Une liste pour les lecteurs d'écran (vrai par défaut) : « liste, 5 éléments », chaque carte un
   * élément. Faux pour des cartes qui ne forment pas une liste.
   */
  list?: boolean
}

/** Une valeur imposée reste raisonnable : entière, et 1 au moins (jamais une rangée sans fin). */
const bounded = (columns: number) =>
  Number.isFinite(columns) ? Math.max(1, Math.round(columns)) : 1

/**
 * Le texte très agrandi (200 %) : une carte demande une fois et demie sa largeur minimale, sinon
 * ses lignes se coupent au premier mot (deux cartes à 1 920 au lieu de quatre, une à 1 280).
 */
const LARGE_TEXT_FACTOR = 1.5

/**
 * Hook : le nombre de colonnes d'une grille de cartes d'au moins `minWidth` points posée ici, et la
 * ligne cachée qui mesure le texte agrandi sur le web (`probe`, à poser dans la grille). Exporté
 * pour un squelette qui dessine une rangée de cartes vides aux colonnes de la grille qui arrive.
 */
export function useCardColumns(minWidth: number, gap: Space = 'lg', imposed?: number) {
  const room = useContentWidth()
  const { large, probe } = useLargeText()
  const min = large ? Math.round(minWidth * LARGE_TEXT_FACTOR) : minWidth
  const columns = imposed === undefined ? columnsFor(room, min, space[gap]) : bounded(imposed)
  return { columns, probe }
}

/**
 * Hook : vrai quand la page peut prendre le gabarit large de R15 (`Screen width="wide"`) : une
 * fenêtre d'au moins 1 280 points (`layout.maxContentWidth`, la largeur d'une page ordinaire). En
 * dessous, Ruches, Recherche et Outils restent comme avant R16 (« sous 1 280, rien ne change »).
 * Faux avant l'hydratation (la page pré-rendue ne connaît pas la fenêtre). Le seuil vit ici, pas
 * dans les écrans.
 */
export function useWideTemplate() {
  const { width } = useLayout()
  return width >= layout.maxContentWidth
}

export function CardGrid({ children, minWidth, gap = 'lg', columns: imposed, list = true }: Props) {
  const { columns, probe } = useCardColumns(minWidth, gap, imposed)
  // Children.toArray : les cartes, sans les « trous » (null, false), chacune avec sa clé.
  const cards = Children.toArray(children)
  if (cards.length === 0) return null
  const rows: ReactNode[][] = []
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns))
  return (
    <View role={list ? 'list' : undefined} style={{ gap: space[gap] }}>
      {rows.map((row, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: une rangée n'a pas d'autre identité que sa place
        <View key={r} style={{ flexDirection: 'row', gap: space[gap] }}>
          {Array.from({ length: columns }, (_, c) => {
            const card = row[c]
            return (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: une case est une place dans la rangée
                key={c}
                // Une case pleine est un élément de la liste ; une case vide ne se lit pas.
                role={list && card !== undefined ? 'listitem' : undefined}
                style={{ flex: 1, minWidth: 0 }}
              >
                <GridColumnContext.Provider value={c}>{card ?? null}</GridColumnContext.Provider>
              </View>
            )
          })}
        </View>
      ))}
      {probe}
    </View>
  )
}
