// Les deux noms de Node qu'`app.ts` emploie, décrits pour TypeScript : le paquet n'installe pas
// les types de Node (`@types/node`), et n'en a pas besoin ailleurs. Ce fichier ne produit aucun
// code ; il ne sert qu'à la vérification des types de ce paquet (l'appli et l'API ont déjà les
// leurs).
// - `process.env.EXPO_SERVER` : remplacé par `true` ou `false` à la construction du site par Expo ;
//   absent sous Vitest ;
// - `require` : le chargement synchrone d'un module, pour le pré-rendu.
declare const process: { readonly env: { readonly EXPO_SERVER?: boolean } }
declare function require(id: string): unknown
