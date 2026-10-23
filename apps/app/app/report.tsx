// Page : Signaler un contenu (« /report?kind=comment&id=… », tranche 7a). L'écran lui-même est dans
// src/screens ; ici, on lit seulement la sorte et l'identifiant de la cible dans l'adresse.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../src/navigation/params'
import { ReportScreen } from '../src/screens/ReportScreen'

export default function ReportPage() {
  const { kind, id } = useLocalSearchParams<{ kind?: string | string[]; id?: string | string[] }>()
  return <ReportScreen kind={firstParam(kind) ?? ''} id={firstParam(id) ?? ''} />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
