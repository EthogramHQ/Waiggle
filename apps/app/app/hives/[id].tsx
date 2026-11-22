// Page : une ruche (« /hives/<id> », R10), réservée à ses membres ; l'onglet dans `?tab=`. [id] dans
// le nom du fichier : cette partie de l'adresse est variable, et useLocalSearchParams la lit. L'écran
// se charge quand on ouvre la page (R18, navigation/lazyScreen.tsx).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../src/navigation/lazyScreen'
import { firstParam } from '../../src/navigation/params'

const HiveScreen = lazyScreen(
  () => import('../../src/navigation/chunks/hives').then((m) => m.HiveScreen),
  { shape: 'project' },
)

export default function HivePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <HiveScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug, morceau manquant…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
