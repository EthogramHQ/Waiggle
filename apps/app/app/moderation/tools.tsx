// Page : les outils de la modération (« /moderation/tools »), réservée aux administrateurs : les
// autres outils tapés par les membres, et le catalogue. L'écran lui-même est dans src/screens ; il
// se charge quand on ouvre la page, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { lazyScreen } from '../../src/navigation/lazyScreen'

export default lazyScreen(() =>
  import('../../src/navigation/chunks/moderation').then((m) => m.ModerationToolsScreen),
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
