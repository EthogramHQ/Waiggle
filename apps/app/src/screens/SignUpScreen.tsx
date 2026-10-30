// Écran d'inscription (« /sign-up ») : la page d'entrée, onglet « Créer un compte ». Le formulaire
// est dans SignUpForm.tsx (un lien d'invitation, /sign-up?code=…, y remplit le code), la page
// commune à la connexion et à l'inscription dans AuthScreen.tsx.
import { AuthScreen } from './AuthScreen'

export function SignUpScreen() {
  return <AuthScreen tab="signUp" />
}
