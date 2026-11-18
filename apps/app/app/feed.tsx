// Page : le Fil (« /feed », tranche R12). Avant R12, le Fil était à `/` ; `/` est devenu l'accueil
// et sa vitrine, pour tous (app/index.tsx). Le Fil est une page des membres, sans langue dans
// l'adresse (scénario « Qui arrive où »).
//
// R16 : la page ne lit plus la session elle-même. L'écran a sa garde (`SessionGate`, dans
// HomeScreen) : pendant la lecture, le squelette du Fil (jamais l'accueil d'un visiteur, qui
// apparaîtrait un instant à un membre) ; personne de connecté, « Réservé aux membres », avec « Me
// connecter » qui revient ici ; une lecture ratée, « Réessayer ». Avant, la page posait son propre
// squelette, puis l'écran un second, puis la liste un troisième : il n'en reste qu'un.
import { HomeScreen } from '../src/screens/HomeScreen'

export default function FeedPage() {
  return <HomeScreen />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
