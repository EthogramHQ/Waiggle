// Page : la déclaration d'Accessibilité dans une langue (« /fr/accessibility », « /en/accessibility »,
// tranche R12), lisible sans compte. La langue vient de la mise en page (app/[lang]/_layout.tsx).
import { LegalPageScreen } from '../../src/screens/LegalPageScreen'

export default function AccessibilityPage() {
  return <LegalPageScreen page="accessibility" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
