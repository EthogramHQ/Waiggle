// Page : l'onglet Explorer (« /explore », tranche R3) : les projets de tous les membres. L'écran se
// charge quand on ouvre la page, pas avec l'accueil (R18, navigation/lazyScreen.tsx) ; son squelette,
// pendant l'attente, a la forme d'une grille de cartes.
import { lazyScreen } from '../src/navigation/lazyScreen'

const ExploreScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.ExploreScreen),
  { shape: 'grid', width: 'page' },
)

export default function ExplorePage() {
  return <ExploreScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
