// Page : « Moi » (« /me », tranche R3), l'onglet du membre connecté. C'est sa propre page de
// membre, la même que « /members/<son identifiant> », avec sa roue des réglages : l'identifiant vient
// de la session. Tant que la session se lit, ou pour un visiteur, MemberScreen montre lui-même
// l'attente ou « Connecte-toi d'abord », sans rien demander à l'API.
import { useMemberSession } from '../src/accounts/session'
import { MemberScreen } from '../src/screens/MemberScreen'

export default function MePage() {
  const { session } = useMemberSession()
  return <MemberScreen id={session?.user.id ?? ''} />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
