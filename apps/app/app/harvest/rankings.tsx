// Page : le classement de la semaine (« /harvest/rankings », R19), poussée depuis « Ma récolte ».
// L'écran lui-même est dans src/screens ; il se charge quand on ouvre la page, avec les réglages
// (navigation/chunks/settings.ts : pas de morceau neuf, leçon de R13). Son squelette est celui de la
// garde de session (une liste, à la largeur de la page) : rien ne bouge quand l'écran prend la place.
import { lazyScreen } from '../../src/navigation/lazyScreen'

const RankingsScreen = lazyScreen(
  () => import('../../src/navigation/chunks/settings').then((m) => m.RankingsScreen),
  { shape: 'list', width: 'page' },
)

export default function RankingsPage() {
  return <RankingsScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
