// Ce que l'appli peut faire avec le profil du membre connecté : le lire, le modifier, changer
// d'avatar. Comme pour accounts/api.ts, les écrans n'appellent que ces fonctions ; les tests les
// remplacent par de faux appels.
import { Me, type ProfileUpdate } from '@ruche/contracts'
import { request } from '../api/client'
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
