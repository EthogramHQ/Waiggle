// Page : l'onglet Explorer (« /explore », tranche R3) : les projets de tous les membres. L'écran se
// charge quand on ouvre la page, pas avec l'accueil (R18, navigation/lazyScreen.tsx) ; pendant
// l'attente, Explorer vide, aux places et à la largeur d'Explorer (`ExploreWaiting`, un module léger),
// le même que pendant la lecture de la session : la barre du haut ne bouge plus (relecture de
// design R18 ; la grille commune, plus étroite, la faisait rétrécir).
import { lazyScreen } from '../src/navigation/lazyScreen'
import { ExploreWaiting } from '../src/screens/ExploreWaiting'

const ExploreScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.ExploreScreen),
  { loading: ExploreWaiting },
)

export default function ExplorePage() {
  return <ExploreScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
