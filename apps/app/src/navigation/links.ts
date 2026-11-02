// Ouvrir un site extérieur : toujours en passant par la page d'avertissement « Tu quittes… »
// (voir screens/LeavingScreen.tsx), qui montre l'adresse réelle avant d'y aller.
import { useRouter } from 'expo-router'
import { useCallback } from 'react'

/** Hook : la fonction qui ouvre un lien extérieur via la page d'avertissement. */
export const useOpenOutside = () => {
  const router = useRouter()
  return useCallback((url: string) => router.push({ pathname: '/out', params: { url } }), [router])
}

/**
 * Hook (R5a) : la fonction qui ouvre la démo d'un projet via la même page, en lui disant de quel
 * projet vient le lien (`project`). La page relit ce projet auprès de l'API pour écrire « La démo
 * de …, ajoutée par … », et seulement si sa démo est exactement cette adresse : l'identifiant ne
 * fait rien dire de lui-même (voir screens/LeavingScreen.tsx).
 */
export const useOpenDemo = () => {
  const router = useRouter()
  return useCallback(
    (url: string, projectId: string) =>
      router.push({ pathname: '/out', params: { url, project: projectId } }),
    [router],
  )
}
