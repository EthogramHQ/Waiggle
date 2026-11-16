// Page : mon profil public (« /settings/public-page », tranche R12), ouverte depuis « Mon profil ».
// L'écran lui-même est dans src/screens. Cette page a sa propre adresse : Expo Router la préfère à
// la rubrique variable de [section].tsx.
import { PublicPageSettingsScreen } from '../../src/screens/PublicPageSettingsScreen'

export default PublicPageSettingsScreen

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
