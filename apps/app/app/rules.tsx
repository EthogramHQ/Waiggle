// Page : les Règles de la communauté (« /rules », tranche R11), lisibles sans compte.
import { LegalPageScreen } from '../src/screens/LegalPageScreen'

export default function RulesPage() {
  return <LegalPageScreen page="rules" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
