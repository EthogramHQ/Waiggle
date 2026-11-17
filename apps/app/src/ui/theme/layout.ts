// La taille de l'écran, rangée en trois familles : téléphone (compact), tablette ou petite fenêtre
// (medium), ordinateur (wide). Les composants de mise en page s'en servent pour passer d'une colonne
// à plusieurs ; les écrans n'ont pas à mesurer la fenêtre eux-mêmes.
import { layout, space } from '@ruche/brand'
import { createContext, useContext } from 'react'
import { useWindowDimensions } from 'react-native'
import { useHydrated } from './hydration'

export type SizeClass = 'compact' | 'medium' | 'wide'

export const sizeClassFor = (width: number): SizeClass =>
  width >= layout.breakpoints.wide
    ? 'wide'
    : width >= layout.breakpoints.medium
      ? 'medium'
      : 'compact'

/** Hook : la famille de taille et les marges à appliquer. Se met à jour quand la fenêtre change. */
export const useLayout = () => {
  // useWindowDimensions : la largeur et la hauteur de la fenêtre, recalculées à chaque changement
  // (rotation du téléphone, fenêtre redimensionnée sur ordinateur).
  const window = useWindowDimensions()
  // Avant l'hydratation (web), on se comporte comme le serveur, qui ne connaît pas la fenêtre.
  const hydrated = useHydrated()
  const width = hydrated ? window.width : 0
  const height = hydrated ? window.height : 0
  const sizeClass = sizeClassFor(width)
  const padding = layout.screenPadding[sizeClass]
  // Les deux colonnes (principale et latérale) tiennent-elles côte à côte ? Leur largeur de base,
  // l'écart entre elles (celui de Columns) et les marges de l'écran, sans dépasser la largeur max.
  // R15 : la colonne de côté du gabarit large est le panneau (`layout.sidePanel`, 340) ; avec la
  // base de 320 d'avant, le panneau passait sous un Fil sans fin entre 952 et 971 points.
  const columns =
    Math.min(width - 2 * padding, layout.maxContentWidth) >=
    layout.mainColumn + layout.sidePanel + space.xxl
  // Les écrans de marque (miel vif) : la scène à gauche et la carte à droite, dès 1 000 points
  // (plus tôt que la mise en colonnes, `wide`).
  const card = width >= layout.breakpoints.card
  // R15 : un très grand écran (dès `breakpoints.xwide`, 1 536 points), où le panneau d'Explorer
  // apparaît et où les cartes du Fil s'élargissent. Le seuil est lu ici, pas dans les écrans.
  const xwide = width >= layout.breakpoints.xwide
  return { width, height, sizeClass, padding, columns, card, xwide }
}

/** La largeur d'une page ordinaire (`Screen width="page"`) dans une fenêtre : ses marges, puis 1 280 au plus. */
const pageWidth = (window: number) =>
  Math.max(
    0,
    Math.min(window - 2 * layout.screenPadding[sizeClassFor(window)], layout.maxContentWidth),
  )

/**
 * R15 : la largeur du contenu d'un écran de cartes (gabarit large, `Screen width="wide"`), pour une
 * fenêtre donnée. Une fonction pure : même entrée, même sortie, testée largeur par largeur.
 * - sous 1 280 : la largeur d'une page ordinaire (« sous 1 280, rien ne change ») ; 0 pour une
 *   fenêtre de 0 (la page pré-rendue, avant l'hydratation), jamais une largeur négative ;
 * - jusqu'à 1 536 : des marges de 32 ;
 * - au-delà : 5 % de la fenêtre de chaque côté, mais jamais moins que la largeur atteinte à 1 536
 *   (sinon le contenu rétrécirait d'un coup en passant le seuil : 1 472 à 1 536, 1 383 à 1 537) ;
 * - jamais plus de 1 920.
 */
export const wideContentWidth = (window: number): number => {
  if (!(window > 0)) return 0
  if (window < layout.maxContentWidth) return pageWidth(window)
  const gutter = 2 * layout.wideGutter
  if (window <= layout.breakpoints.xwide) return Math.min(window - gutter, layout.maxWideWidth)
  const atThreshold = layout.breakpoints.xwide - gutter
  const share = Math.round(window * (1 - 2 * layout.wideGutterShare))
  return Math.min(Math.max(share, atThreshold), layout.maxWideWidth)
}

/**
 * R15 : combien de cartes d'au moins `min` points tiennent côte à côte dans `width`, séparées par
 * `gap`. Toujours une au moins (une largeur de 0, avant l'hydratation, ne doit jamais donner 0
 * colonne : une grille de 0 colonne ne finirait pas ses rangées).
 */
export const columnsFor = (width: number, min: number, gap: number): number => {
  const count = Math.floor((width + gap) / (min + gap))
  return Number.isFinite(count) && count > 1 ? count : 1
}

/**
 * R15 : la largeur du contenu où l'on est. Un « contexte » React fait passer une valeur à tous les
 * composants placés dessous sans la donner de main en main : `Screen` y pose la largeur de son
 * contenu, `Columns` celle de chacune de ses colonnes, et les grilles la lisent pour compter
 * leurs colonnes. `null` : aucun des deux au-dessus.
 */
export const ContentWidthContext = createContext<number | null>(null)

/** Hook : la largeur du contenu où l'on est ; hors d'un écran, celle d'une page ordinaire. */
export const useContentWidth = (): number => {
  const given = useContext(ContentWidthContext)
  const { width } = useLayout()
  return given ?? pageWidth(width)
}
