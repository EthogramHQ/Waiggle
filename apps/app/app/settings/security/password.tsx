// Page : changer mon mot de passe (« /settings/security/password », tranche R2), ouverte depuis la
// rubrique Sécurité des réglages. L'écran lui-même est dans src/screens ; il se charge quand on
// ouvre la page, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { lazyScreen } from '../../../src/navigation/lazyScreen'

export default lazyScreen(() =>
  import('../../../src/navigation/chunks/settings').then((m) => m.ChangePasswordScreen),
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
