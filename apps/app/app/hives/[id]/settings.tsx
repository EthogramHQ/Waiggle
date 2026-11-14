// Page : les réglages d'une ruche (« /hives/<id>/settings », R10), réservés à son animateur. On y
// arrive par « Réglages de la ruche », dans le menu « … » de la page de la ruche.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../../src/navigation/params'
import { HiveSettingsScreen } from '../../../src/screens/HiveSettingsScreen'

export default function HiveSettingsPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <HiveSettingsScreen id={firstParam(id) ?? ''} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
