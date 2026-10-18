// Le cache des données venues de l'API, partagé par toute l'appli (bibliothèque React Query).
// Analogie : un tableau d'affichage. Un écran qui a besoin du profil regarde d'abord le tableau ;
// si l'information y est, il l'affiche tout de suite, sinon il va la chercher et l'épingle.
// Les autres écrans en profitent sans refaire la requête.
import { QueryClient } from '@tanstack/react-query'
import { ApiError, type ApiErrorKey } from './errors'

// Les refus définitifs : réessayer donnerait la même réponse, et ferait attendre le membre
// plusieurs secondes avant de voir « introuvable ». Seules les pannes passagères sont réessayées.
const final: readonly ApiErrorKey[] = [
  'validation',
  'unauthorized',
  'forbidden',
  'notFound',
  'payloadTooLarge',
  'unsupportedMediaType',
  'rateLimited',
]

/** Faut-il retenter une lecture ratée ? Au plus deux fois, et jamais pour un refus définitif. */
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  !(error instanceof ApiError && final.includes(error.key)) && failureCount < 2

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Une donnée lue il y a moins d'une minute est considérée comme fraîche : pas de nouvelle requête.
      staleTime: 60_000,
      retry: shouldRetry,
    },
  },
})
