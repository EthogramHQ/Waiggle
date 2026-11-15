// Page : la Confidentialité (« /privacy », tranche R11), lisible sans compte.
import { LegalPageScreen } from '../src/screens/LegalPageScreen'

export default function PrivacyPage() {
  return <LegalPageScreen page="privacy" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
