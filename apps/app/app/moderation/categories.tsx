// Page : les catégories de la modération (« /moderation/categories »), réservée aux administrateurs :
// les projets classés « Autre » à ranger, et les catégories. L'écran lui-même est dans src/screens ;
// il se charge quand on ouvre la page, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { lazyScreen } from '../../src/navigation/lazyScreen'

export default lazyScreen(() =>
  import('../../src/navigation/chunks/moderation').then((m) => m.ModerationCategoriesScreen),
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
