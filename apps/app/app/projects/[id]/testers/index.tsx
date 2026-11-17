// Page : le coin des testeurs d'un projet (« /projects/<id>/testers », R7b), l'onglet dans
// `?tab=calls|feedback`. On y arrive par « Le coin des testeurs » de la page du projet, ou depuis
// une notification d'Activité (un appel, un retour réglé). L'écran se charge quand on ouvre la
// page, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../../../src/navigation/lazyScreen'
import { firstParam } from '../../../../src/navigation/params'

const TestersCornerScreen = lazyScreen(
  () => import('../../../../src/navigation/chunks/testers').then((m) => m.TestersCornerScreen),
  { width: 'page' },
)

export default function TestersCornerPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <TestersCornerScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
