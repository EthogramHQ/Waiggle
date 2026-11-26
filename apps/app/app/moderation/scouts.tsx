// Page : la page de tri des Éclaireuses (« /moderation/scouts », R20), réservée à l'administrateur.
// L'écran lui-même est dans src/screens ; il se charge quand on ouvre la page, avec le morceau de la
// modération, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { lazyScreen } from '../../src/navigation/lazyScreen'

export default lazyScreen(() =>
  import('../../src/navigation/chunks/moderation').then((m) => m.ScoutTriageScreen),
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
