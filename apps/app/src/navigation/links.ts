// Ouvrir un site extérieur : toujours en passant par la page d'avertissement « Tu quittes… »
// (voir screens/LeavingScreen.tsx), qui montre l'adresse réelle avant d'y aller.
import { useRouter } from 'expo-router'
import { useCallback } from 'react'

/** Hook : la fonction qui ouvre un lien extérieur via la page d'avertissement. */
export const useOpenOutside = () => {
  const router = useRouter()
  return useCallback((url: string) => router.push({ pathname: '/out', params: { url } }), [router])
}
