// Les images servies par l'API (avatars, photos des projets) sont réservées aux membres connectés :
// le serveur vérifie la session à chaque image. Ce fichier fabrique la « source » à donner aux
// composants d'image pour que la session voyage avec la demande.
// - Sur le web, le navigateur joint lui-même le cookie de session : l'API est sur le même site
//   (api.waiggle.io pour waiggle.io).
// - Sur téléphone, il n'y a pas de cookies de navigateur : on ajoute l'en-tête Cookie, avec la
//   session gardée par le plugin Expo, comme pour les requêtes (voir api/client.ts).
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { Platform } from 'react-native'
import { getSessionCookie, useSession } from '../accounts/api'
import { apiUrl } from '../config'
import type { ImageSource } from '../ui/image'

const isWeb = Platform.OS === 'web'

/**
 * Vrai pour une image servie par notre API (…/media/…). Seules celles-là reçoivent la session :
 * le cookie ne doit jamais partir vers un autre site, même si une adresse étrangère arrivait ici
 * par erreur un jour.
 */
const isOurMedia = (url: string) => url.startsWith(`${apiUrl}/media/`)

/**
 * Renvoie une fonction qui transforme l'adresse d'une image de l'API en source d'image.
 * Elle renvoie null tant que la session n'est pas prête sur téléphone (l'image s'affichera un
 * instant plus tard), ou si l'adresse est absente.
 * `enabled: false` : l'écran n'affiche pas d'image pour l'instant ; on ne lit rien.
 */
export const useMediaSources = (enabled = true) => {
  const { data: session } = useSession()
  // Le cookie est relu à chaque écran qui en a besoin (c'est une lecture du coffre-fort du
  // téléphone, rapide) : après une reconnexion, c'est toujours celui de la session en cours.
  const cookie = useQuery({
    queryKey: ['media-cookie', session?.user.id ?? null],
    queryFn: () => getSessionCookie(),
    enabled: enabled && !isWeb && Boolean(session),
    staleTime: 0,
  })
  const value = cookie.data
  return useCallback(
    (url: string | null | undefined): ImageSource | null => {
      if (!url || !isOurMedia(url)) return null
      if (isWeb) return { uri: url }
      return value ? { uri: url, headers: { Cookie: value } } : null
    },
    [value],
  )
}
