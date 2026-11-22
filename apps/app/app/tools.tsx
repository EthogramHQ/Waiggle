// Page : « Tous les outils » (« /tools », tranche R3) : les outils des projets publics, de A à Z.
// L'écran se charge quand on ouvre la page (R18, navigation/lazyScreen.tsx), avec un squelette de
// liste.
import { lazyScreen } from '../src/navigation/lazyScreen'

const ToolsScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.ToolsScreen),
  { shape: 'list', width: 'page' },
)

export default function ToolsPage() {
  return <ToolsScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
