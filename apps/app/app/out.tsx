// Page : avertissement avant d'ouvrir un site extérieur (« /out?url=… »).
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../src/navigation/params'
import { LeavingScreen } from '../src/screens/LeavingScreen'

export default function OutPage() {
  const { url } = useLocalSearchParams<{ url?: string }>()
  return <LeavingScreen url={firstParam(url)} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
