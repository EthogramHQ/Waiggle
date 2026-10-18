// Le retour en arrière commun à tous les écrans. Arrivé par un lien direct (un lien partagé, une
// page rechargée), il n'y a pas de page précédente dans l'historique : le retour mène alors à une
// page de secours (l'accueil, ou la page « parente » comme le compte pour le profil).
import { type Href, useRouter } from 'expo-router'
import { useCallback } from 'react'

/** Hook : la fonction « revenir », avec sa page de secours. */
export const useGoBack = (fallback: Href = '/') => {
  const router = useRouter()
  // useCallback garde la même fonction d'un affichage à l'autre, tant que ses ingrédients ne
  // changent pas : les boutons qui la reçoivent n'ont pas à se redessiner pour rien.
  return useCallback(
    () => (router.canGoBack() ? router.back() : router.replace(fallback)),
    [router, fallback],
  )
}
