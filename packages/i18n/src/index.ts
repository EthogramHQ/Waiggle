// Point d'entrée du paquet @ruche/i18n, partagé par l'API et l'appli (téléphone, tests, `tsc`).
// Il contient les textes dans chaque langue, chargés d'emblée, et la logique pour choisir la bonne
// langue (dans `core.ts`). Le navigateur lit une autre entrée, `app.ts`, qui exporte les mêmes noms
// mais n'a d'abord que le français (R18 : l'anglais s'y charge à la demande).
import type { Language, LanguageHost } from './core'
import { en } from './locales/en'
import { fr } from './locales/fr'

// `export *` réexporte tous les noms d'un autre module : l'index et `app.ts` partagent ainsi le
// même cœur, sans le recopier.
export * from './core'

// `export type` ré-exporte uniquement un type : il disparaît à la compilation, aucun code n'est généré.
export type { Translation } from './types'

/** Les textes, dans la forme attendue par la bibliothèque i18next. */
export const resources = {
  fr: { translation: fr },
  en: { translation: en },
} as const

/**
 * Prépare une langue avant de l'afficher (R18). Ici, les deux langues sont déjà là : la promesse se
 * termine aussitôt. On ajoute seulement les textes à l'instance si elle ne les a pas (une instance
 * créée par `createI18n` les a toujours). Le navigateur, lui, reçoit la version d'`app.ts`, qui
 * charge l'anglais ; l'appli appelle la même fonction partout, sans savoir laquelle elle a.
 */
export const ensureLanguage = async (i18n: LanguageHost, language: Language): Promise<void> => {
  if (!i18n.hasResourceBundle(language, 'translation')) {
    i18n.addResourceBundle(language, 'translation', resources[language].translation)
  }
}
