// Transforme les erreurs de validation Zod d'un formulaire en messages par champ.
// On valide AVANT d'envoyer : le membre voit tout de suite ce qui ne va pas, sans attendre le réseau.
// (Le serveur revérifie de toute façon : on ne fait jamais confiance au seul contrôle de l'appli.)
import type { AuthErrorKey } from './errors'

export type FieldErrors = Partial<
  Record<
    'name' | 'email' | 'password' | 'inviteCode',
    AuthErrorKey | 'nameRequired' | 'inviteRequired'
  >
>

// La forme d'une erreur Zod qui nous intéresse : une liste de problèmes, chacun avec le chemin
// du champ concerné (['password']) et un code (too_small, too_big, invalid_format…).
type ValidationError = { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; code: string }> }

export const fieldErrorsFrom = (error: ValidationError): FieldErrors => {
  const errors: FieldErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (field === 'name') errors.name = 'nameRequired'
    if (field === 'email') errors.email = 'invalidEmail'
    if (field === 'inviteCode') errors.inviteCode = 'inviteRequired'
    if (field === 'password') {
      // too_small : trop court ; too_big : trop long.
      errors.password = issue.code === 'too_big' ? 'passwordTooLong' : 'passwordTooShort'
    }
  }
  return errors
}
