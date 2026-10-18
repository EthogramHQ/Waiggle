// Page : publier un projet (« /projects/new »). L'écran lui-même est dans src/screens.
import { ProjectFormScreen } from '../../src/screens/ProjectFormScreen'

export default function NewProjectPage() {
  return <ProjectFormScreen />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
