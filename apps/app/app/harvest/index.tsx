// Page : « Ma récolte » (« /harvest », tranche R19), réservée aux membres. L'écran lui-même est dans
// src/screens ; il se charge quand on ouvre la page, avec les réglages, pas avec l'accueil (R13,
// navigation/lazyScreen.tsx ; pas de morceau neuf, leçon de R13). En attendant, des rangées vides à
// la largeur de la page.
import { lazyScreen } from '../../src/navigation/lazyScreen'

const HarvestScreen = lazyScreen(
  () => import('../../src/navigation/chunks/settings').then((m) => m.HarvestScreen),
  { shape: 'list', width: 'page' },
)

export default function HarvestPage() {
  return <HarvestScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
