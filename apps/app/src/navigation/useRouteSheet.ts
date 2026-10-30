// Une feuille qui a sa propre adresse (tranche R2 : /settings/profile, /settings/account/delete) :
// la page s'ouvre directement sur la feuille, et la fermer revient en arrière (aux réglages).
import { type Href, usePathname } from 'expo-router'
import { useState } from 'react'
import { useHydrated } from '../ui/theme/hydration'
import { useGoBack } from './useGoBack'

/**
 * Hook : quand la feuille de cette page est ouverte, et comment la fermer.
 *
 * - Ouverte une fois la page hydratée (web) : la feuille est une couche posée sur toute la page,
 *   que le serveur ne prépare pas ; l'ouvrir dès le premier dessin ferait différer le navigateur du
 *   HTML pré-rendu (ui/theme/hydration.ts).
 * - Ouverte tant que l'adresse est celle de la page : sur le web, Expo Router garde montée la page
 *   qu'on quitte (« Mot de passe oublié ? » ouvre une autre page par-dessus), et sa couche, posée
 *   sur toute la fenêtre, cacherait la nouvelle. Au retour, l'adresse redevient la sienne : la
 *   feuille se rouvre.
 * - Fermer revient à la page d'avant, ou à `fallback` quand on est arrivé par un lien direct.
 */
export const useRouteSheet = (fallback: Href) => {
  const pathname = usePathname()
  // L'adresse de la page à son premier dessin : useState la garde telle quelle ensuite.
  const [own] = useState(pathname)
  const hydrated = useHydrated()
  const close = useGoBack(fallback)
  return { open: hydrated && pathname === own, close }
}
