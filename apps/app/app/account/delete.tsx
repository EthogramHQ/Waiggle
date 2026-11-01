// Ancienne adresse : supprimer son compte (« /account/delete ») vit sous la rubrique « Compte » des
// réglages depuis la tranche R2.
import { Redirect } from 'expo-router'

export default function DeleteAccountRedirect() {
  return <Redirect href="/settings/account/delete" />
}
