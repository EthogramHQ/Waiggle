// Page : avertissement avant d'ouvrir un site extérieur (« /out?url=… »). Depuis R5a, la démo d'un
// projet y ajoute l'identifiant du projet (« &project=… ») : la page le relit auprès de l'API pour
// dire « La démo de … ». Les deux paramètres sont passés bruts : l'écran les vérifie (une adresse
// https publique, un identifiant de projet bien formé), et ignore ce qui ne va pas.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../src/navigation/params'
import { LeavingScreen } from '../src/screens/LeavingScreen'

export default function OutPage() {
  const { url, project } = useLocalSearchParams<{ url?: string; project?: string }>()
  return <LeavingScreen url={firstParam(url)} project={firstParam(project)} />
}

// Si la page plante (contenu piégé, bug…), un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
