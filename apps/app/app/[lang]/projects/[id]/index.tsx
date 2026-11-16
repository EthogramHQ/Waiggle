// Page : un projet public dans une langue (« /fr/projects/<id> », tranche R12). Un membre connecté y
// voit la page du projet de toujours ; un visiteur, l'écran visiteur (src/navigation/MemberOrVisitor).
import { useLocalSearchParams } from 'expo-router'
import { MemberOrVisitor } from '../../../../src/navigation/MemberOrVisitor'
import { firstParam } from '../../../../src/navigation/params'
import { ProjectScreen } from '../../../../src/screens/ProjectScreen'
import { PublicProjectScreen } from '../../../../src/screens/PublicProjectScreen'

export default function PublicProjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = firstParam(id) ?? ''
  return (
    <MemberOrVisitor
      member={<ProjectScreen id={projectId} />}
      visitor={<PublicProjectScreen id={projectId} />}
    />
  )
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
