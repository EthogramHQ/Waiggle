// Page : l'accueil public dans une langue (« /fr/ », « /en/ », tranche R12) : la vitrine, pour tous
// (un membre connecté y a sa barre). La langue vient de la mise en page (app/[lang]/_layout.tsx).
import { ShowcaseScreen } from '../../src/screens/ShowcaseScreen'

export default ShowcaseScreen

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
