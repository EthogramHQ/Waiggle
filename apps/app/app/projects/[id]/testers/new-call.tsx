// Page : lancer un appel à ses testeurs (« /projects/<id>/testers/new-call », R7b). Une feuille posée
// sur la page d'où l'on vient (le coin des testeurs), comme « Nouvelle mise à jour » : elle a sa
// propre adresse, et donc le Retour du navigateur.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../../src/navigation/params'
import { CallSheet } from '../../../../src/screens/CallSheet'

export default function NewCallPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <CallSheet id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
