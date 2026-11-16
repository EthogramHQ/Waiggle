// Page : la page publique d'un membre dans une langue (« /fr/members/<id> », tranche R12). Un membre
// connecté y voit la page du membre de toujours ; un visiteur, l'écran visiteur
// (src/navigation/MemberOrVisitor).
import { useLocalSearchParams } from 'expo-router'
import { MemberOrVisitor } from '../../../src/navigation/MemberOrVisitor'
import { firstParam } from '../../../src/navigation/params'
import { MemberScreen } from '../../../src/screens/MemberScreen'
import { PublicMemberScreen } from '../../../src/screens/PublicMemberScreen'

export default function PublicMemberPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const memberId = firstParam(id) ?? ''
  return (
    <MemberOrVisitor
      member={<MemberScreen id={memberId} />}
      visitor={<PublicMemberScreen id={memberId} />}
    />
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
