// Page : la déclaration d'Accessibilité (« /accessibility », tranche R11), lisible sans compte.
import { LegalPageScreen } from '../src/screens/LegalPageScreen'

export default function AccessibilityPage() {
  return <LegalPageScreen page="accessibility" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
