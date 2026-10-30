// Page : une rubrique des réglages (« /settings/<rubrique> », tranche R2). [section] dans le nom du
// fichier : cette partie de l'adresse est variable, et useLocalSearchParams la lit. Une rubrique
// inconnue (« /settings/nimporte ») donne la page « introuvable ». « /settings/profile » a sa
// propre page (profile.tsx), qu'Expo Router préfère à celle-ci.
import { useLocalSearchParams } from 'expo-router'
import { firstParam } from '../../src/navigation/params'
import { NotFoundScreen } from '../../src/screens/NotFoundScreen'
import { SettingsScreen, type SettingsSectionKey } from '../../src/screens/SettingsScreen'

const sections: readonly SettingsSectionKey[] = [
  'profile',
  'notifications',
  'language',
  'appearance',
  'data',
  'security',
  'account',
  'about',
  'moderation',
]

/** La rubrique nommée par l'adresse, si elle existe. */
const asSection = (value: string | undefined): SettingsSectionKey | null =>
  sections.find((section) => section === value) ?? null

export default function SettingsSectionPage() {
  const { section } = useLocalSearchParams<{ section: string }>()
  const known = asSection(firstParam(section))
  return known ? <SettingsScreen section={known} /> : <NotFoundScreen />
}

// Si la page plante, un écran de secours s'affiche à sa place.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/ui/RouteErrorBoundary'
