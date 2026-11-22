// Page : les réglages d'une ruche (« /hives/<id>/settings », R10), réservés à son animateur. On y
// arrive par « Réglages de la ruche », dans le menu « … » de la page de la ruche. L'écran se charge
// quand on ouvre la page, pas avec l'accueil (R18, navigation/lazyScreen.tsx) ; il vit dans le même
// morceau que les autres pages des ruches (navigation/chunks/hives.ts).
import { useLocalSearchParams } from 'expo-router'
import { lazyScreen } from '../../../src/navigation/lazyScreen'
import { firstParam } from '../../../src/navigation/params'

// Le squelette d'attente a la forme de l'écran : un formulaire.
const HiveSettingsScreen = lazyScreen(
  () => import('../../../src/navigation/chunks/hives').then((m) => m.HiveSettingsScreen),
  { shape: 'form' },
)

export default function HiveSettingsPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <HiveSettingsScreen id={firstParam(id) ?? ''} />
}

// Si la page plante, ou si son morceau manque, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../../src/ui/RouteErrorBoundary'
