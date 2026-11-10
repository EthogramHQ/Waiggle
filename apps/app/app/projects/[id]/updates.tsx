// Page : la frise des mises à jour d'un projet (« /projects/<id>/updates », R7a). Une page à part
// entière (pas une feuille) : on y arrive depuis « Voir les N mises à jour » de la page du projet,
// ou depuis une notification d'Activité.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../src/navigation/params'
import { ProjectUpdatesScreen } from '../../../src/screens/ProjectUpdatesScreen'

export default function ProjectUpdatesPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ProjectUpdatesScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
