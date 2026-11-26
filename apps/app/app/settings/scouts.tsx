// Page : les réglages « Les Éclaireuses » (« /settings/scouts », tranche R20), ouverte depuis la
// liste des réglages. L'écran lui-même est dans src/screens ; il se charge quand on ouvre la page,
// avec les autres réglages (navigation/chunks/settings.ts), pas avec l'accueil. Cette page a sa
// propre adresse : Expo Router la préfère à la rubrique variable de [section].tsx.
import { lazyScreen } from '../../src/navigation/lazyScreen'

export default lazyScreen(
  () => import('../../src/navigation/chunks/settings').then((m) => m.ScoutSettingsScreen),
  { shape: 'list', width: 'form' },
)

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
