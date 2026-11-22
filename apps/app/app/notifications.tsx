// Page : les notifications (« /notifications »). L'écran lui-même est dans src/screens ; il se
// charge quand on ouvre la page (R18, navigation/lazyScreen.tsx). Son squelette est celui de la
// garde de session (une liste, de la largeur d'un formulaire) : rien ne bouge quand elle prend la
// place.
import { lazyScreen } from '../src/navigation/lazyScreen'

const NotificationsScreen = lazyScreen(
  () => import('../src/navigation/chunks/explore').then((m) => m.NotificationsScreen),
  { shape: 'list', width: 'form' },
)

export default function NotificationsPage() {
  return <NotificationsScreen />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place (R18 : un
// morceau introuvable lance une erreur, que cet écran rattrape avec « Réessayer »).
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
