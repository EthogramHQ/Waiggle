// Page : le fil d'un testeur, pour l'auteur du projet (« /projects/<id>/testers/threads/<id du
// testeur> », R7b). On y arrive depuis l'onglet « Retours » du coin des testeurs, ou depuis une
// notification d'Activité (un retour, une réponse). L'écran se charge quand on ouvre la page (R13,
// navigation/lazyScreen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../../../../src/navigation/lazyScreen'
import { firstParam } from '../../../../../src/navigation/params'

const TesterThreadScreen = lazyScreen(
  () => import('../../../../../src/navigation/chunks/testers').then((m) => m.TesterThreadScreen),
  { width: 'page' },
)

export default function TesterThreadPage() {
  const { id, member } = useLocalSearchParams<{ id: string; member: string }>()
  return <TesterThreadScreen id={firstParam(id) ?? ''} member={firstParam(member) ?? ''} />
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../../src/ui/RouteErrorBoundary'
