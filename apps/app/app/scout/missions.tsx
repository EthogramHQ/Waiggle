// Page : les missions de la semaine des Éclaireuses (« /scout/missions », tranche R20). L'écran
// lui-même est dans src/screens ; il se charge quand on ouvre la page, avec les autres pages des
// Éclaireuses (navigation/chunks/scout.ts), pas avec l'accueil. En attendant, des rangées vides à
// la largeur d'un formulaire, comme l'écran pendant sa propre attente.
import { lazyScreen } from '../../src/navigation/lazyScreen'

const ScoutMissionsScreen = lazyScreen(
  () => import('../../src/navigation/chunks/scout').then((m) => m.ScoutMissionsScreen),
  { shape: 'list', width: 'form' },
)

export default function ScoutMissionsPage() {
  return <ScoutMissionsScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
