// Page : envoyer un retour à l'auteur d'un projet qu'on teste (« /projects/<id>/testers/new-feedback »,
// R7b). Une feuille posée sur la page d'où l'on vient (le coin des testeurs), comme « Nouvel appel » :
// elle a sa propre adresse, et donc le Retour du navigateur.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../../src/navigation/params'
import { FeedbackSheet } from '../../../../src/screens/FeedbackSheet'

export default function NewFeedbackPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <FeedbackSheet id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
