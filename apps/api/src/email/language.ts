// La langue d'un e-mail : celle du compte du membre qui le reçoit (« fr » ou « en »), le français
// si elle est absente ou invalide. Partagée par les e-mails de compte (auth/auth.ts) et par les
// e-mails de notification (jobs/), pour qu'un membre reçoive tout dans la même langue.
import { defaultLanguage, type Language, supportedLanguages } from '@ruche/i18n'

/** Vrai si la valeur est une langue de l'appli (un « type guard » : TypeScript le retient). */
export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)

/** La langue d'un membre déjà inscrit, lue sur sa fiche (`user.language`). */
export const languageOfMember = (user: object): Language => {
  const language = 'language' in user ? user.language : undefined
  return isLanguage(language) ? language : defaultLanguage
}
