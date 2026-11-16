// Ce que l'appli peut faire avec le profil du membre connecté : le lire, le modifier, changer
// d'avatar. Comme pour accounts/api.ts, les écrans n'appellent que ces fonctions ; les tests les
// remplacent par de faux appels.
import {
  Me,
  MyPublicPage,
  type ProfileUpdate,
  type PublicPageSettings,
  type PublicPageSettingsPatch,
} from '@ruche/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'
import { appendImage, pickImage } from '../media/pick'

/** Lit le profil du membre connecté (GET /v1/me). Lève une ApiError en cas d'échec. */
export const getMe = async (): Promise<Me> => {
  const result = await request('/v1/me', {}, Me)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Modifie le profil et/ou la langue (PATCH /v1/me). Renvoie le profil à jour. */
export const updateProfile = (changes: ProfileUpdate): Promise<ApiResult<Me>> =>
  request(
    '/v1/me',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    },
    Me,
  )

/** Une image choisie sur l'appareil, prête à être envoyée. */
export type PickedImage = { uri: string }

/**
 * Ouvre la galerie de photos et prépare l'image choisie : recadrée en carré au centre, réduite à
 * 1 024 px au plus, enregistrée en JPEG (voir media/pick.ts). Renvoie null si le membre annule.
 */
export const pickAvatar = async (): Promise<PickedImage | null> => {
  const image = await pickImage('square')
  return image ? { uri: image.uri } : null
}

/** Envoie l'image comme nouvel avatar (POST /v1/me/avatar, formulaire multipart). */
export const uploadAvatar = async (image: PickedImage): Promise<ApiResult<Me>> => {
  // FormData : l'équivalent d'un formulaire HTML avec un champ fichier.
  const form = new FormData()
  await appendImage(form, 'avatar', image)
  // Pas d'en-tête Content-Type ici : fetch le calcule lui-même avec la « frontière » du multipart.
  return request('/v1/me/avatar', { method: 'POST', body: form }, Me)
}

/**
 * Retire la photo de profil (DELETE /v1/me/avatar, R9) : le seul geste sur la photo qu'un compte
 * suspendu garde (jur-R5). La réponse n'a pas de corps qu'on lise : l'écran met lui-même le profil
 * gardé en cache à jour (`useRemoveProfilePart`).
 */
export const deleteAvatar = (): Promise<ApiResult<null>> =>
  requestWithoutBody('/v1/me/avatar', { method: 'DELETE' })

// --- « Mon profil public » (tranche R12) : la page publique et ce qu'elle montre ---

/** La clé des réglages de la page publique dans le cache, sous celle du profil (`['me']`). */
export const myPublicPageKey = ['me', 'public-page'] as const

/** Lit les réglages de la page publique (GET /v1/me/public-page) : les cinq cases et les comptes. */
export const getMyPublicPage = async (): Promise<MyPublicPage> => {
  const result = await request('/v1/me/public-page', {}, MyPublicPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Change une ou plusieurs cases (PATCH /v1/me/public-page) ; la réponse est la page à jour. */
export const patchMyPublicPage = async (patch: PublicPageSettingsPatch): Promise<MyPublicPage> => {
  const result = await request(
    '/v1/me/public-page',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    MyPublicPage,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : les réglages de la page publique du membre connecté. `data` : `MyPublicPage` (`settings`,
 * puis `webProjectCount` sur `projectCount` pour écrire « 2 sur 4 »).
 */
export const usePublicPageSettings = (enabled = true) =>
  useQuery({ queryKey: myPublicPageKey, queryFn: getMyPublicPage, enabled })

/** Les champs d'un changement, pour ne remettre que ceux-ci en cas de refus. */
const keysOf = (patch: PublicPageSettingsPatch) =>
  Object.keys(patch) as (keyof PublicPageSettings)[]

/**
 * Hook : changer les réglages de la page publique. `change(patch)` modifie la case **au toucher**
 * (un second toucher lit déjà le nouvel état) puis envoie seulement les champs changés. Si l'API
 * refuse, seules les cases de ce changement reviennent à leur valeur d'avant (un autre changement
 * en route n'est pas défait) et `error` devient vrai jusqu'au prochain changement. Les changements
 * partent l'un après l'autre (`scope`) ; après le dernier, les réglages sont relus et l'aperçu d'un
 * visiteur est oublié : il se relira, au lieu de montrer l'ancienne page.
 */
export const usePublicPageChange = () => {
  const queryClient = useQueryClient()
  const mutationKey = ['public-page', 'change']
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ patch }: { patch: PublicPageSettingsPatch; previous: PublicPageSettings }) =>
      patchMyPublicPage(patch),
    scope: { id: 'public-page' },
    // Une lecture déjà en route ne doit pas écraser la case qu'on vient de changer.
    onMutate: () => queryClient.cancelQueries({ queryKey: myPublicPageKey }),
    onError: (_error, { patch, previous }) => {
      queryClient.setQueryData<MyPublicPage>(myPublicPageKey, (page) => {
        if (!page) return page
        const settings = { ...page.settings }
        for (const key of keysOf(patch)) settings[key] = previous[key]
        return { ...page, settings }
      })
    },
    onSettled: () => {
      // « 1 » : le changement qui se termine est encore compté.
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: myPublicPageKey })
      queryClient.removeQueries({ queryKey: ['public', 'member'] })
    },
  })
  const { mutate, reset } = mutation
  const change = useCallback(
    (patch: PublicPageSettingsPatch) => {
      const page = queryClient.getQueryData<MyPublicPage>(myPublicPageKey)
      if (!page) return
      reset()
      queryClient.setQueryData<MyPublicPage>(myPublicPageKey, {
        ...page,
        settings: { ...page.settings, ...patch },
      })
      mutate({ patch, previous: page.settings })
    },
    [queryClient, mutate, reset],
  )
  return { change, error: mutation.isError }
}
