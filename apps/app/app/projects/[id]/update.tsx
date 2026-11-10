// Page : publier une mise à jour d'un projet (« /projects/<id>/update », R7a). Une feuille posée sur
// la page du projet, comme « Modifier » : elle a sa propre adresse, et donc le Retour du navigateur.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../src/navigation/params'
import { UpdateSheet } from '../../../src/screens/UpdateSheet'

export default function NewUpdatePage() {
  // announce=<statut> : on arrive de « Modifier », où le statut vient de changer ; la feuille propose
  // de l'annoncer (une valeur inconnue ne préremplit rien, la feuille le vérifie).
  const { id, announce } = useLocalSearchParams<{ id: string; announce?: string }>()
  const status = firstParam(announce)
  return <UpdateSheet id={firstParam(id) ?? ''} {...(status ? { announce: status } : null)} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
