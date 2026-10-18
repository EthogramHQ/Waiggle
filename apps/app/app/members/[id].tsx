// Page : un membre (« /members/<id> »). [id] dans le nom du fichier : cette partie de l'adresse
// est variable, et useLocalSearchParams la lit.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../src/navigation/params'
import { MemberScreen } from '../../src/screens/MemberScreen'

export default function MemberPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <MemberScreen id={firstParam(id) ?? ''} />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
