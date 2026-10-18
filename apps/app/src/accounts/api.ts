// Tout ce que l'appli peut faire avec un compte, en un seul endroit.
// Les écrans n'appellent que ces fonctions : ils ne connaissent ni Better Auth, ni l'adresse de
// l'API. Avantage : dans les tests, on remplace ce fichier par de faux appels (jest.mock).
import { appName } from '@ruche/brand'
import type { SignInRequest, SignUpRequest } from '@ruche/contracts'
import { Platform, Share } from 'react-native'
import { apiFetch } from '../api/client'
import { queryClient } from '../api/query-client'
import { webAppUrl } from '../config'
import { authClient } from './auth-client'
import { type AuthErrorKey, authErrorKey } from './errors'

/** Résultat d'une action : réussie, ou ratée avec la clé du message à afficher. */
export type Result<E extends string = AuthErrorKey> = { ok: true } | { ok: false; error: E }

// Better Auth renvoie { data, error } au lieu de lever une erreur : on transforme l'erreur
// éventuelle en clé de message.
const toResult = (error: { status: number; code?: string | undefined } | null): Result => {
  if (!error) return { ok: true }
  return { ok: false, error: authErrorKey(error) }
}

/** Le membre connecté (ou null), mis à jour automatiquement : un hook React. */
export const useSession = authClient.useSession

/**
 * Sur téléphone : le cookie de session, gardé dans le coffre-fort du téléphone par le plugin Expo.
 * Il accompagne les demandes d'images, réservées aux membres (voir api/media.ts).
 */
export const getSessionCookie = (): Promise<string> => authClient.getCookie()

export const signUp = async (input: SignUpRequest): Promise<Result> => {
  const { error } = await authClient.signUp.email({
    ...input,
    // Le lien de l'e-mail ramènera sur cette page de l'appli web une fois l'adresse vérifiée.
    callbackURL: `${webAppUrl}/verified`,
  })
  return toResult(error)
}

export const signIn = async (input: SignInRequest): Promise<Result> => {
  const { error } = await authClient.signIn.email(input)
  // Nouveau membre connecté : on repart d'un cache vide (voir signOut).
  if (!error) queryClient.clear()
  return toResult(error)
}

export const signOut = async (): Promise<void> => {
  try {
    await authClient.signOut()
  } finally {
    // On vide le cache des données (profil…), même si le serveur n'a pas répondu : sur un appareil
    // partagé, la personne suivante ne doit rien voir de ce qui appartenait au membre précédent.
    queryClient.clear()
  }
}

/** Supprime le compte après vérification du mot de passe par le serveur. */
export const deleteAccount = async (
  password: string,
): Promise<Result<'wrongPassword' | AuthErrorKey>> => {
  const { error } = await authClient.deleteUser({ password })
  if (!error) {
    queryClient.clear() // même raison qu'à la déconnexion
    return { ok: true }
  }
  if (error.code === 'INVALID_PASSWORD') return { ok: false, error: 'wrongPassword' }
  return toResult(error)
}

/**
 * Télécharge l'export des données du membre (GET /v1/me/export).
 * Sur le web : le navigateur enregistre un fichier. Sur mobile : la feuille de partage s'ouvre.
 */
export const downloadMyData = async (): Promise<Result> => {
  // apiFetch ajoute la session du membre (voir api/client.ts).
  const res = await apiFetch('/v1/me/export').catch(() => null)
  if (!res) return { ok: false, error: 'generic' } // serveur injoignable
  if (!res.ok) return { ok: false, error: authErrorKey({ status: res.status }) }
  const json = await res.text()

  // Le nom du fichier vient du nom de l'appli (« waiggle-export.json ») : le nom de code du dépôt
  // n'apparaît jamais aux membres.
  const fileName = `${appName.toLowerCase()}-export.json`
  if (Platform.OS === 'web') {
    // Astuce web classique : un lien invisible vers le fichier, sur lequel on « clique ».
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  } else {
    await Share.share({ message: json, title: fileName })
  }
  return { ok: true }
}
