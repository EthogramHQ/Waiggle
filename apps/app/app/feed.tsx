// Page : le Fil (« /feed », tranche R12). Avant R12, le Fil était à `/` ; `/` est devenu l'accueil
// et sa vitrine, pour tous (app/index.tsx). Le Fil est une page des membres, sans langue dans
// l'adresse (scénario « Qui arrive où »).
//
// Trois cas, d'après la session (accounts/session.ts) :
// - pendant sa lecture (et dans la page pré-rendue du web, qui ne connaît pas le visiteur) : le
//   squelette de la page, jamais l'accueil d'un visiteur, qui apparaîtrait un instant à un membre ;
// - personne de connecté : « Réservé aux membres », avec « Se connecter » qui revient ici ; pas de
//   vitrine (plan R12, décision 14) : elle vit à l'accueil ;
// - sinon le Fil, qui dit lui-même quand la lecture de la session a échoué (« Réessayer »).
import { useMemberSession } from '../src/accounts/session'
import { HomeScreen } from '../src/screens/HomeScreen'
import { LoadingScreen, SignedOutScreen } from '../src/screens/states'

export default function FeedPage() {
  const { state } = useMemberSession()
  if (state === 'pending') return <LoadingScreen width="page" />
  if (state === 'signedOut') return <SignedOutScreen width="page" />
  return <HomeScreen />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
