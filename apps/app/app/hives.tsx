// Page : l'onglet Ruches (« /hives ») : mes invitations, mes ruches, « Créer une ruche » (R10). Il se
// charge quand on ouvre la page, pas avec l'accueil (R18, navigation/lazyScreen.tsx).
import { lazyScreen } from '../src/navigation/lazyScreen'

const HivesScreen = lazyScreen(
  () => import('../src/navigation/chunks/hives').then((m) => m.HivesScreen),
  { shape: 'list' },
)

export default function HivesPage() {
  return <HivesScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
