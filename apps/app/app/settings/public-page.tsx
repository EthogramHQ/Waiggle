// Page : mon profil public (« /settings/public-page », tranche R12), ouverte depuis « Mon profil ».
// L'écran lui-même est dans src/screens ; il se charge quand on ouvre la page, pas avec l'accueil
// (R13, navigation/lazyScreen.tsx). Cette page a sa propre adresse : Expo Router la préfère à la
// rubrique variable de [section].tsx.
import { lazyScreen } from '../../src/navigation/lazyScreen'

export default lazyScreen(() =>
  import('../../src/navigation/chunks/settings').then((m) => m.PublicPageSettingsScreen),
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
