// Page : les mises à jour d'un projet public dans une langue (« /fr/projects/<id>/updates », tranche
// R12). Un membre connecté y voit la frise de toujours ; un visiteur, l'écran visiteur
// (src/navigation/MemberOrVisitor).
import { useLocalSearchParams } from 'expo-router'
import { MemberOrVisitor } from '../../../../src/navigation/MemberOrVisitor'
import { firstParam } from '../../../../src/navigation/params'
import { ProjectUpdatesScreen } from '../../../../src/screens/ProjectUpdatesScreen'
import { PublicUpdatesScreen } from '../../../../src/screens/PublicUpdatesScreen'

export default function PublicUpdatesPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = firstParam(id) ?? ''
  return (
    <MemberOrVisitor
      member={<ProjectUpdatesScreen id={projectId} />}
      visitor={<PublicUpdatesScreen id={projectId} />}
    />
  )
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
