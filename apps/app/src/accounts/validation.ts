// Transforme les erreurs de validation Zod d'un formulaire en messages par champ.
// On valide AVANT d'envoyer : le membre voit tout de suite ce qui ne va pas, sans attendre le réseau.
// (Le serveur revérifie de toute façon : on ne fait jamais confiance au seul contrôle de l'appli.)
import type { AuthErrorKey } from './errors'

export type FieldErrors = Partial<
  Record<
    // R11 : les deux cases de l'inscription (« J'accepte les règles », « J'ai 15 ans ou plus »).
    'name' | 'email' | 'password' | 'inviteCode' | 'acceptRules' | 'ageDeclared',
    // R2 : un champ laissé vide dit ce qu'il attend (« Indique ton adresse e-mail. »).
    | AuthErrorKey
    | 'nameRequired'
    | 'inviteRequired'
    | 'emailRequired'
    | 'passwordRequired'
    // R11 : une case laissée vide dit pourquoi elle compte.
    | 'rulesUnchecked'
    | 'ageUnchecked'
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
    // Les cases valent `true` seulement (z.literal(true)) : non cochées, elles sont refusées.
    if (field === 'acceptRules') errors.acceptRules = 'rulesUnchecked'
    if (field === 'ageDeclared') errors.ageDeclared = 'ageUnchecked'
    if (field === 'password') {
      // too_small : trop court ; too_big : trop long.
      errors.password = issue.code === 'too_big' ? 'passwordTooLong' : 'passwordTooShort'
    }
  }
  return errors
}
