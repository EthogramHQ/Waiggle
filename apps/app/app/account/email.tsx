// Ancienne adresse : changer d'adresse e-mail (« /account/email ») vit sous la rubrique « Compte »
// des réglages depuis la tranche R2.
import { Redirect } from 'expo-router'

export default function ChangeEmailRedirect() {
  return <Redirect href="/settings/account/email" />
}
