// Types partagés par les fichiers de l'API.
import type { Language } from '@ruche/i18n'
import type { Auth } from './auth/auth'

// Better Auth sait déduire (« infer ») le type exact d'un membre et d'une session,
// champs ajoutés par Waiggle compris (comme `language`).
export type AuthUser = Auth['$Infer']['Session']['user']
export type AuthSession = Auth['$Infer']['Session']['session']

/**
 * Les valeurs attachées à chaque requête par les middlewares :
 * la langue du visiteur, et le membre connecté (null si personne ne l'est).
 */
export type AppEnv = {
  Variables: {
    language: Language
    user: AuthUser | null
    session: AuthSession | null
  }
}
