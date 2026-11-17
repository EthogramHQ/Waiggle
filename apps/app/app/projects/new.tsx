// Page : publier un projet (« /projects/new »). L'écran lui-même est dans src/screens : l'éditeur
// (photos, texte mis en forme) est lourd, il se charge quand on ouvre la feuille, pas avec l'accueil
// (R13, navigation/lazyScreen.tsx).
import { lazyScreen } from '../../src/navigation/lazyScreen'

const ProjectFormScreen = lazyScreen(
  () => import('../../src/navigation/chunks/projectEditor').then((m) => m.ProjectFormScreen),
  { sheet: true },
)

export default function NewProjectPage() {
  return <ProjectFormScreen />
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
