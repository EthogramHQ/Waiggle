// Écran de connexion (« /sign-in ») : la page d'entrée, onglet « Se connecter ». Le formulaire est
// dans SignInForm.tsx, la page commune à la connexion et à l'inscription dans AuthScreen.tsx.
import { AuthScreen } from './AuthScreen'

export function SignInScreen() {
  return <AuthScreen tab="signIn" />
}
