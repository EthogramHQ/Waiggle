// Le client Better Auth : il parle aux routes /api/auth/… de l'API et garde la session.
// - Sur le web, la session est un cookie, géré par le navigateur.
// - Sur iOS / Android, il n'y a pas de cookies de navigateur : le plugin Expo range le jeton
//   dans le coffre-fort chiffré du téléphone (SecureStore) et l'ajoute à chaque requête.
import { expoClient } from '@better-auth/expo/client'
import { createAuthClient } from 'better-auth/react'
import * as SecureStore from 'expo-secure-store'
import { apiUrl } from '../config'

export const authClient = createAuthClient({
  baseURL: apiUrl,
  // Envoie le cookie de session même si l'API est sur un autre domaine que l'appli web.
  fetchOptions: { credentials: 'include' },
  plugins: [
    expoClient({
      scheme: 'ruche', // adresse de l'appli mobile : ruche://
      storagePrefix: 'ruche',
      cookiePrefix: 'ruche', // doit correspondre au réglage du serveur (advanced.cookiePrefix)
      storage: SecureStore,
    }),
  ],
})
