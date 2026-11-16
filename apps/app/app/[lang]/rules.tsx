// Page : les Règles de la communauté dans une langue (« /fr/rules », « /en/rules », tranche R12),
// lisibles sans compte. La langue vient de la mise en page (app/[lang]/_layout.tsx).
import { LegalPageScreen } from '../../src/screens/LegalPageScreen'

export default function RulesPage() {
  return <LegalPageScreen page="rules" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
