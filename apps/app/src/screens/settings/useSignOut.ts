// « Me déconnecter », le geste commun aux réglages (rubrique « Compte ») et à l'écran « Accepter »
// des règles (tranche R11) : une seule façon de se déconnecter, avec la même garde et le même
// message d'échec.
//
// Un hook React est une fonction `use…` qu'un composant appelle à chaque dessin : il peut garder un
// état (`useState`) et une valeur qui ne redessine rien (`useRef`).
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { signOut } from '../../accounts/api'

/**
 * `signOut()` déconnecte puis ramène à l'accueil. Refusée (serveur, réseau), la déconnexion laisse
 * le membre où il est et `failed` passe à vrai : l'écran le dit, sinon le membre partirait en se
 * croyant déconnecté (relecture de sécurité de la PR #64). Une seule demande à la fois : la garde
 * est lue au toucher même (un état React ne serait pas encore à jour à la seconde tape).
 */
export const useSignOut = (): { signOut: () => Promise<void>; failed: boolean } => {
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const signingOut = useRef(false)
  const run = useCallback(async () => {
    if (signingOut.current) return
    signingOut.current = true
    setFailed(false)
    try {
      const result = await signOut()
      if (result.ok) {
        router.replace('/')
        return
      }
    } catch {
      // Pas de réponse du serveur : même message qu'un refus.
    } finally {
      signingOut.current = false
    }
    setFailed(true)
  }, [router])
  return { signOut: run, failed }
}
