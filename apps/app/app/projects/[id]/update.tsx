// Page : publier une mise à jour d'un projet (« /projects/<id>/update », R7a). Une feuille posée sur
// la page du projet, comme « Modifier » : elle a sa propre adresse, et donc le Retour du navigateur.
// Elle se charge quand on l'ouvre, pas avec l'accueil (R13, navigation/lazyScreen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../../src/navigation/lazyScreen'
import { firstParam } from '../../../src/navigation/params'

const UpdateSheet = lazyScreen(
  () => import('../../../src/navigation/chunks/projectEditor').then((m) => m.UpdateSheet),
  { sheet: true },
)

export default function NewUpdatePage() {
  // announce=<statut> : on arrive de « Modifier », où le statut vient de changer ; la feuille propose
  // de l'annoncer (une valeur inconnue ne préremplit rien, la feuille le vérifie).
  const { id, announce } = useLocalSearchParams<{ id: string; announce?: string }>()
  const status = firstParam(announce)
  return <UpdateSheet id={firstParam(id) ?? ''} {...(status ? { announce: status } : null)} />
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
