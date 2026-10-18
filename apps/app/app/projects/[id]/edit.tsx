// Page : modifier un projet (« /projects/<id>/edit »).
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../src/navigation/params'
import { ProjectFormScreen } from '../../../src/screens/ProjectFormScreen'

export default function EditProjectPage() {
  // photos=failed : on arrive juste après une publication dont des photos n'ont pas pu partir.
  const { id, photos } = useLocalSearchParams<{ id: string; photos?: string }>()
  return (
    <ProjectFormScreen id={firstParam(id) ?? ''} uploadFailed={firstParam(photos) === 'failed'} />
  )
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
