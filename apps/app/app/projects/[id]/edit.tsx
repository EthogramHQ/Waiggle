// Page : modifier un projet (« /projects/<id>/edit »). L'éditeur se charge quand on ouvre la
// feuille, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../../src/navigation/lazyScreen'
import { firstParam } from '../../../src/navigation/params'

const ProjectFormScreen = lazyScreen(
  () => import('../../../src/navigation/chunks/projectEditor').then((m) => m.ProjectFormScreen),
  { sheet: true },
)

export default function EditProjectPage() {
  // photos=failed : on arrive juste après une publication dont des photos n'ont pas pu partir.
  const { id, photos } = useLocalSearchParams<{ id: string; photos?: string }>()
  return (
    <ProjectFormScreen id={firstParam(id) ?? ''} uploadFailed={firstParam(photos) === 'failed'} />
  )
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
