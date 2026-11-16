// Page : la Confidentialité dans une langue (« /fr/privacy », « /en/privacy », tranche R12),
// lisible sans compte. La langue vient de la mise en page (app/[lang]/_layout.tsx).
import { LegalPageScreen } from '../../src/screens/LegalPageScreen'

export default function PrivacyPage() {
  return <LegalPageScreen page="privacy" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
