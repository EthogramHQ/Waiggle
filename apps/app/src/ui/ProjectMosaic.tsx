// La mosaïque des projets d'un membre (tranche R14, planches `R3-Moi` et `R3-Membre-Desktop`) : le
// projet le plus récent en grande carte, comme celles du Fil, les suivants en cartes compactes
// (`ProjectCard size="compact"`), sans case vide, dans l'ordre des projets.
//
// Deux pièces :
// - `mosaicRows(count, width, options)`, une fonction pure (même entrée, même sortie, rien d'autre) :
//   le plan des rangées. Une rangée est la liste des rangs posés côte à côte (`[3, 4, 5]`) ; le bloc
//   d'en tête, la grande carte avec deux compactes empilées à côté, s'écrit
//   `{ lead: 0, beside: [1, 2] }` ;
// - `ProjectMosaic`, qui dessine ce plan : l'écran lui donne les projets (`items`) et la façon de
//   dessiner la carte d'un projet à une taille donnée (`render(item, size)`).
//
// Selon la largeur (scénario, « Ce que la mosaïque devient selon la largeur ») :
// - téléphone (sous 700 points, et toujours avant l'hydratation du web : le pré-rendu ne connaît
//   pas la fenêtre) : la grande carte seule, puis des rangées de deux compactes ;
// - au-delà : 1 projet, la grande carte ; 2, deux grandes cartes égales côte à côte ; 3 et plus, le
//   bloc d'en tête, puis des rangées de trois, ou plus si la place le permet (R15) ;
// - 4 projets sur ordinateur (dès 1 100 points, planche `R15-Membre-4-Projets`, décision de Louis du
//   17/11/2026) : la grande carte sur la moitié ; à côté, une compacte large, puis deux compactes
//   côte à côte. La quatrième carte n'est plus seule sur sa rangée, étirée en bandeau ; la tablette
//   garde la forme de R14.
// La dernière rangée s'étire : ses cartes se partagent toute la largeur, jamais de case vide.
//
// Les rangées, pas des colonnes : un lecteur d'écran et la touche Tab suivent l'ordre des projets
// (1, 2, 3…), puisque l'ordre de l'arbre est celui de la lecture. Dans une rangée, les cases prennent
// la hauteur de la plus haute (l'étirement par défaut d'une rangée flexbox), et chaque case étire sa
// carte (`CardStretchContext`) : une compacte qui grandit à texte agrandi entraîne ses voisines, et
// la grande carte suit ses deux compactes. La mosaïque est annoncée comme une liste.
import { layout } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { CardStretchContext, PROJECT_CARD_GAP, type ProjectCardSize } from './ProjectCard'
import { useLargeText } from './textScale'
import { columnsFor, sizeClassFor, useContentWidth, useLayout } from './theme/layout'

/**
 * Une rangée de la mosaïque : des rangs côte à côte, ou un bloc d'en tête, la grande carte (`lead`)
 * et la colonne d'à côté (`beside`), lue de haut en bas. Dans `beside`, un rang seul prend toute la
 * largeur de la colonne ; une paire de rangs pose ces deux cartes côte à côte. Le bloc de R14 :
 * `{ lead: 0, beside: [1, 2] }` ; celui de 4 projets (R15) : `{ lead: 0, beside: [1, [2, 3]] }`.
 */
export type MosaicRow =
  | number[]
  | { lead: number; beside: [number, number] | [number, [number, number]] }

/** À partir de cette largeur (en points), les rangées sous le bloc d'en tête comptent quatre cartes. */
export const MOSAIC_FOUR_COLUMNS = 1536

/** Le nombre de colonnes sous le bloc d'en tête, sans place connue : trois, ou quatre (R14). */
const columnsForWindow = (width: number) => (width >= MOSAIC_FOUR_COLUMNS ? 4 : 3)

/**
 * Jamais moins de trois colonnes au-delà du téléphone : le bloc d'en tête (la grande carte sur deux
 * colonnes, deux compactes empilées sur la troisième) en a besoin. À côté du profil, entre 1 100 et
 * 1 535 points, la place ne tient pas trois cartes de `cardMin`, mais la mosaïque garde la forme de
 * R14 (relecture du plan R15, C3 : « rien ne recule »).
 */
const MIN_COLUMNS = 3

/** Les rangs de `from` à `count - 1`, coupés en rangées de `size` (la dernière, plus courte). */
const chunks = (from: number, count: number, size: number): number[][] => {
  const rows: number[][] = []
  for (let start = from; start < count; start += size) {
    rows.push(Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i))
  }
  return rows
}

/**
 * Le plan des rangées pour `count` projets dans une fenêtre de `width` points (la fenêtre, pas la
 * place : c'est elle qui dit téléphone, tablette ou ordinateur). `largeText` : le texte est très
 * agrandi (150 % et plus, `useLargeText`) ; sur téléphone, une compacte de 115 points (à 320) ne
 * tient plus son statut à 200 % : les compactes passent alors une par rangée. `columns` : le nombre
 * de cartes par rangée sous le bloc d'en tête, que le composant compte d'après sa place (R15) ; sans
 * lui, la règle de R14 (trois, quatre dès 1 536 points de fenêtre).
 */
export function mosaicRows(
  count: number,
  width: number,
  { largeText = false, columns }: { largeText?: boolean; columns?: number | undefined } = {},
): MosaicRow[] {
  if (count <= 0) return []
  // Le téléphone : la grande carte seule sur sa rangée, puis les compactes deux par deux (une par
  // une à texte très agrandi).
  const sizeClass = sizeClassFor(width)
  if (sizeClass === 'compact') return [[0], ...chunks(1, count, largeText ? 1 : 2)]
  if (count === 1) return [[0]]
  if (count === 2) return [[0, 1]]
  // 4 projets sur ordinateur : la planche R15, la grande carte sur la moitié, une compacte large à
  // côté, puis deux compactes côte à côte (la tablette garde la forme de R14).
  if (count === 4 && sizeClass === 'wide') return [{ lead: 0, beside: [1, [2, 3]] }]
  // Un nombre de colonnes donné reste raisonnable : entier, 1 au moins (0 boucle sans fin).
  const perRow =
    columns !== undefined && Number.isFinite(columns)
      ? Math.max(1, Math.round(columns))
      : columnsForWindow(width)
  return [{ lead: 0, beside: [1, 2] }, ...chunks(3, count, perRow)]
}

type Props<T> = {
  /** Les projets, dans l'ordre (le plus récent d'abord) ; leur `id` sert de clé. */
  items: readonly T[]
  /** La carte d'un projet, à la taille que lui donne la mosaïque. */
  render: (item: T, size: ProjectCardSize) => ReactNode
}

const GAP = PROJECT_CARD_GAP

/**
 * Une case de la mosaïque, ce que le lecteur d'écran compte (« liste, 5 éléments »). Elle étire sa
 * carte à sa hauteur. `listitem` posé à la main sur la case : les rangées ne sont que de la mise en
 * page (une liste `Stack` poserait ses éléments sur les rangées).
 */
function Cell({ style, children }: { style: ViewStyle; children: ReactNode }) {
  return (
    <View role="listitem" style={style}>
      <CardStretchContext.Provider value>{children}</CardStretchContext.Provider>
    </View>
  )
}

/**
 * Une part égale d'une rangée : base nulle et `minWidth: 0`, pour qu'un long titre ne l'élargisse
 * pas (jamais `flex: 1`, que le web lit autrement ; voir les pièges de react-native-web).
 */
const share = { flexGrow: 1, flexBasis: 0, minWidth: 0 } as const

export function ProjectMosaic<T extends { id: string }>({ items, render }: Props<T>) {
  // La largeur de la fenêtre, 0 avant l'hydratation du web (la mise en page du téléphone).
  const { width } = useLayout()
  // La place de la mosaïque : la largeur de la colonne où elle est posée (à côté du profil, sur la
  // page d'un membre), publiée par l'écran ou par `Columns`.
  const room = useContentWidth()
  // Le texte très agrandi (sur le web, lu par une ligne cachée, `probe`, posée dans la liste).
  const { large, probe } = useLargeText()
  // Les colonnes sous le bloc d'en tête, comptées d'après la place (R15). Les compactes s'y
  // alignent sur les bords de la grande carte ; elles ne descendent pas sous la largeur des cartes
  // du Fil sur grand écran (`cardMin.feedWide`) : trois de 437 points à côté du profil à 1 920
  // (planche R15-Membre-1920), et non quatre de 324 ; trois au moins, pour le bloc d'en tête.
  const columns = Math.max(MIN_COLUMNS, columnsFor(room, layout.cardMin.feedWide, GAP))
  const rows = mosaicRows(items.length, width, { largeText: large, columns })
  // Deux projets au-delà du téléphone : deux grandes cartes égales, côte à côte.
  const twoEqual = rows.length === 1 && Array.isArray(rows[0]) && rows[0].length === 2
  const sizeOf = (rank: number): ProjectCardSize => (rank === 0 || twoEqual ? 'full' : 'compact')

  const cell = (rank: number, style: ViewStyle) => {
    const item = items[rank]
    if (!item) return null
    return (
      <Cell key={item.id} style={style}>
        {render(item, sizeOf(rank))}
      </Cell>
    )
  }

  return (
    // role="list" posé à la main (les cases portent leur `listitem`) ; la liste ne dépasse jamais
    // sa colonne.
    <View role="list" style={{ gap: GAP, maxWidth: '100%', flexShrink: 1 }}>
      {rows.map((row) => {
        if (Array.isArray(row)) {
          return (
            <View key={items[row[0] ?? 0]?.id} style={{ flexDirection: 'row', gap: GAP }}>
              {row.map((rank) => cell(rank, share))}
            </View>
          )
        }
        // Le bloc de 4 projets (R15) : la grande carte et la colonne d'à côté à parts égales (même
        // part, même base), sans rangée dessous avec laquelle s'aligner.
        const half = Array.isArray(row.beside[1])
        // Le bloc de R14. La grande carte couvre toutes les colonnes sauf une, et ses deux
        // compactes empilées la dernière : la grande et la colonne d'à côté tombent sur les mêmes
        // bords que les rangées dessous. Pour cela, la grande part d'une base égale aux écarts
        // qu'elle enjambe, puis grandit de `columns - 1` parts : chaque part vaut alors exactement
        // une case des rangées du dessous.
        const lead = half
          ? share
          : { flexGrow: columns - 1, flexBasis: (columns - 2) * GAP, minWidth: 0 }
        return (
          <View key={items[row.lead]?.id} style={{ flexDirection: 'row', gap: GAP }}>
            {cell(row.lead, lead)}
            {/* La colonne d'à côté, à la hauteur de la rangée : ses lignes se la partagent. Une
                ligne est une compacte seule, ou deux compactes côte à côte (4 projets). */}
            <View style={{ ...share, gap: GAP }}>
              {row.beside.map((line) =>
                Array.isArray(line) ? (
                  <View
                    key={items[line[0]]?.id}
                    style={{ flexDirection: 'row', gap: GAP, flexGrow: 1 }}
                  >
                    {line.map((rank) => cell(rank, share))}
                  </View>
                ) : (
                  cell(line, { flexGrow: 1 })
                ),
              )}
            </View>
          </View>
        )
      })}
      {/* Hors du flux, caché à l'œil et aux lecteurs d'écran. */}
      {probe}
    </View>
  )
}
