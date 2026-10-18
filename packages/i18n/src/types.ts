import type { fr } from './locales/fr'

// Type « récursif » : il recopie la forme d'un objet en remplaçant chaque texte par `string`.
// { home: { title: 'Bienvenue' } }  devient  { home: { title: string } }
type DeepString<T> = { readonly [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> }

/**
 * La forme que chaque langue doit respecter. Le français sert de référence :
 * une clé oubliée (ou en trop) dans une autre langue devient une erreur de compilation,
 * en plus du test qui vérifie la même chose à l'exécution.
 */
export type Translation = DeepString<typeof fr>
