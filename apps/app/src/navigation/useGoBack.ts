// Le retour en arrière commun à tous les écrans. Arrivé par un lien direct (un lien partagé, une
// page rechargée), il n'y a pas de page précédente dans l'historique : le retour mène alors à une
// page de secours (l'accueil, ou la page « parente » comme le compte pour le profil).
import { type Href, useRouter } from 'expo-router'
import { useCallback } from 'react'
import { announcePassage } from '../ui/pageTransition'

/** Hook : la fonction « revenir », avec sa page de secours. */
export const useGoBack = (fallback: Href = '/') => {
  const router = useRouter()
  // useCallback garde la même fonction d'un affichage à l'autre, tant que ses ingrédients ne
  // changent pas : les boutons qui la reçoivent n'ont pas à se redessiner pour rien.
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    // R17 : rien dans un `replace` ne dit « retour ». On l'annonce au moteur des passages juste
    // avant, pour que la page de secours arrive comme une page d'avant (elle descend de 12 points).
    announcePassage('back')
    router.replace(fallback)
  }, [router, fallback])
}
