// Ancienne adresse : « Mon compte » (« /account ») est devenu la page « Réglages » (tranche R2).
// L'adresse reste dans les favoris et les anciens e-mails : elle mène aux réglages. <Redirect>
// d'Expo Router change de page dès qu'il s'affiche, en remplaçant l'adresse (pas de retour vers elle).
import { Redirect } from 'expo-router'

export default function AccountRedirect() {
  return <Redirect href="/settings" />
}
