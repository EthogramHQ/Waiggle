// Page : les réglages (« /settings », tranche R2). L'écran lui-même est dans src/screens ; il se
// charge quand on ouvre la page, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { lazyScreen } from '../../src/navigation/lazyScreen'

const SettingsScreen = lazyScreen(() =>
  import('../../src/navigation/chunks/settings').then((m) => m.SettingsScreen),
)

export default function SettingsPage() {
  return <SettingsScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
