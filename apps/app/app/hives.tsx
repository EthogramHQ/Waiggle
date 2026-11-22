// Page : l'onglet Ruches (« /hives ») : mes invitations, mes ruches, « Créer une ruche » (R10). Il se
// charge quand on ouvre la page, pas avec l'accueil (R18, navigation/lazyScreen.tsx) ; pendant
// l'attente, l'attente de l'onglet lui-même (`HivesLoading`, un module léger), à sa largeur : dès
// 1 280 points, le gabarit large, sans quoi la barre du haut rétrécissait (relecture de design R18).
import { lazyScreen } from '../src/navigation/lazyScreen'
import { HivesLoading } from '../src/screens/HivesLoading'

const HivesScreen = lazyScreen(
  () => import('../src/navigation/chunks/hives').then((m) => m.HivesScreen),
  { loading: HivesLoading },
)

export default function HivesPage() {
  return <HivesScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
