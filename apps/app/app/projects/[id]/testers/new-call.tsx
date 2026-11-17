// Page : lancer un appel à ses testeurs (« /projects/<id>/testers/new-call », R7b). Une feuille posée
// sur la page d'où l'on vient (le coin des testeurs), comme « Nouvelle mise à jour » : elle a sa
// propre adresse, et donc le Retour du navigateur. Elle se charge quand on l'ouvre (R13,
// navigation/lazyScreen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../../../src/navigation/lazyScreen'
import { firstParam } from '../../../../src/navigation/params'

const CallSheet = lazyScreen(
  () => import('../../../../src/navigation/chunks/testers').then((m) => m.CallSheet),
  { sheet: true },
)

export default function NewCallPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <CallSheet id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/ui/RouteErrorBoundary'
