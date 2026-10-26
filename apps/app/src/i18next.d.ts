import type { Translation } from '@ruche/i18n'

// Fichier de « déclaration » : il ne contient pas de code exécuté, seulement des types.
// Ici, on explique à i18next la forme de nos traductions. Résultat : t(($) => $.home.titre)
// (faute de frappe) est signalé par l'éditeur avant même de lancer l'appli.

// Les formes du pluriel : « bellNew_one » et « bellNew_other » se lisent toutes deux $.bellNew,
// et i18next choisit la bonne d'après `count`.
type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
type Selectable<T> = {
  readonly [K in keyof T as K extends `${infer Base}_${PluralSuffix}`
    ? Base
    : K]: T[K] extends string ? string : Selectable<T[K]>
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    enableSelector: 'optimize'
    resources: { translation: Selectable<Translation> }
  }
}
