// Ancienne adresse : « Mon profil » (« /profile ») vit dans les réglages depuis la tranche R2.
// « Gérer mes e-mails », dans les e-mails déjà envoyés, menait à /profile?section=emails : ces
// réglages sont maintenant la rubrique « Notifications » (relecture juridique, jur-B5).
import { Redirect, useLocalSearchParams } from 'expo-router'
import { firstParam } from '../src/navigation/params'

export default function ProfileRedirect() {
  const { section } = useLocalSearchParams<{ section?: string }>()
  return (
    <Redirect
      href={firstParam(section) === 'emails' ? '/settings/notifications' : '/settings/profile'}
    />
  )
}
