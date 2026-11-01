// Page : le second lien d'un changement d'adresse, ouvert sans être connecté
// (« /email-change/sign-in-first », décision D1 du 29/10/2026). Le lien n'aboutit que depuis le
// compte du membre : la page demande de se connecter, puis de rouvrir le lien (il n'a pas servi).
// L'écran lui-même est dans src/screens.
import { EmailChangeResultScreen } from '../../src/screens/EmailChangeResultScreen'

export default function EmailChangeSignInFirst() {
  return <EmailChangeResultScreen step="signInFirst" />
}
