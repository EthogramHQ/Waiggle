// Page : le coin des testeurs d'un projet (« /projects/<id>/testers », R7b), l'onglet dans
// `?tab=calls|feedback`. On y arrive par « Le coin des testeurs » de la page du projet, ou depuis
// une notification d'Activité (un appel, un retour réglé).
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../../src/navigation/params'
import { TestersCornerScreen } from '../../../../src/screens/TestersCornerScreen'

export default function TestersCornerPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <TestersCornerScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
