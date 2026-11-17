// Page : la modération (« /moderation »), réservée aux administrateurs. L'écran lui-même est dans
// src/screens ; rare et lourd, il se charge quand on ouvre la page, pas avec l'accueil (R13,
// navigation/lazyScreen.tsx).
import { lazyScreen } from '../../src/navigation/lazyScreen'

export default lazyScreen(() =>
  import('../../src/navigation/chunks/moderation').then((m) => m.ModerationScreen),
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
