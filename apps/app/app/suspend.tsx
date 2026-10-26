// Page : Suspendre un compte, ou lever sa suspension (« /suspend?member=…&fromKind=…&fromId=… »,
// tranche 7c), réservée aux administrateurs. L'écran lui-même est dans src/screens ; ici, on lit
// seulement le membre visé et, si l'on vient d'une carte de la file, le signalement d'où l'on part.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../src/navigation/params'
import { SuspendScreen } from '../src/screens/SuspendScreen'

export default function SuspendPage() {
  const { member, fromKind, fromId } = useLocalSearchParams<{
    member?: string | string[]
    fromKind?: string | string[]
    fromId?: string | string[]
  }>()
  const kind = firstParam(fromKind)
  const id = firstParam(fromId)
  return (
    <SuspendScreen
      memberId={firstParam(member) ?? ''}
      {...(kind ? { fromKind: kind } : null)}
      {...(id ? { fromId: id } : null)}
    />
  )
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../src/ui/RouteErrorBoundary'
