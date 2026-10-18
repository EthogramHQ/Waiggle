// La taille de l'écran, rangée en trois familles : téléphone (compact), tablette ou petite fenêtre
// (medium), ordinateur (wide). Les composants de mise en page s'en servent pour passer d'une colonne
// à plusieurs ; les écrans n'ont pas à mesurer la fenêtre eux-mêmes.
import { layout } from '@ruche/brand'
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
  return { width, height, sizeClass, padding: layout.screenPadding[sizeClass] }
}
