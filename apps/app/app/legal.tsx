// Page : les Mentions légales (« /legal », tranche R11), lisibles sans compte.
import { LegalPageScreen } from '../src/screens/LegalPageScreen'

export default function LegalNoticePage() {
  return <LegalPageScreen page="legal" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
