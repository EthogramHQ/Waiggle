// Page : les réglages (« /settings », tranche R2). L'écran lui-même est dans src/screens.
import { SettingsScreen } from '../../src/screens/SettingsScreen'

export default function SettingsPage() {
  return <SettingsScreen />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
