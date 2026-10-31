// Cet écran est-il celui qui est affiché ? (tranche R3). Sur le web, Expo Router garde les pages
// quittées montées sous la page ouverte : quand l'onglet actif est touché de nouveau, seul l'écran
// affiché doit remonter en haut (ui/Screen.tsx). La réponse vient de `useIsFocused` d'Expo Router.
//
// Hors d'un navigateur (le catalogue monté seul, un test qui affiche un écran sans routeur, ou qui
// remplace expo-router par un faux sans cette fonction), `useIsFocused` lève une erreur : l'aide
// répond alors « oui », comme si l'écran était seul à l'écran, ce qui est le cas.
import { useIsFocused } from 'expo-router'

/** Hook : vrai si l'écran est celui qui est affiché, ou s'il n'y a pas de navigateur autour. */
export const useScreenFocused = (): boolean => {
  try {
    // Un hook appelé dans un try, ce que la règle des hooks refuse d'ordinaire : permis ici, car
    // l'issue ne change pas d'un rendu à l'autre (un composant est toujours dans un navigateur, ou
    // toujours hors de lui), et React compte donc les mêmes hooks à chaque rendu. Expo Router ne
    // donne aucun autre moyen de savoir s'il y a un navigateur (son NavigationContext n'est pas
    // exporté).
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir ci-dessus)
    return useIsFocused()
  } catch {
    return true
  }
}
