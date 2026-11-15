// Page : une ruche (« /hives/<id> », R10), réservée à ses membres ; l'onglet dans `?tab=`. [id] dans
// le nom du fichier : cette partie de l'adresse est variable, et useLocalSearchParams la lit.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../src/navigation/params'
import { HiveScreen } from '../../src/screens/HiveScreen'

export default function HivePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <HiveScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
