// Page : un projet (« /projects/<id> »). [id] dans le nom du dossier : cette partie de l'adresse
// est variable, et useLocalSearchParams la lit.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../src/navigation/params'
import { ProjectScreen } from '../../../src/screens/ProjectScreen'

export default function ProjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ProjectScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
