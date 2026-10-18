import type { Translation } from '@ruche/i18n'

// Fichier de « déclaration » : il ne contient pas de code exécuté, seulement des types.
// Ici, on explique à i18next la forme de nos traductions. Résultat : t('home.titre') (faute de
// frappe) est signalé par l'éditeur avant même de lancer l'appli.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Translation }
  }
}
