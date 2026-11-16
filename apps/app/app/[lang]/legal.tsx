// Page : les Mentions légales dans une langue (« /fr/legal », « /en/legal », tranche R12), lisibles
// sans compte. La langue vient de la mise en page (app/[lang]/_layout.tsx).
import { LegalPageScreen } from '../../src/screens/LegalPageScreen'

export default function LegalNoticePage() {
  return <LegalPageScreen page="legal" />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
