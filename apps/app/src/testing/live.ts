// Une aide des tests d'écran du temps réel (R21) : fait arriver un signal du flux comme le fait la
// connexion (src/live/connection), sans ouvrir de flux. Le signal ne porte que son sujet et sa
// sorte ; la table de src/live/invalidations dit quelles lectures du cache il rend périmées, et
// React Query relit celles que l'écran montre. Le test choisit d'abord la nouvelle réponse de son
// faux serveur, puis envoie le signal.
import type { LiveEvent } from '@ruche/contracts'
import type { QueryClient } from '@tanstack/react-query'
import { act } from '@testing-library/react-native'
import { invalidationsFor } from '../live/invalidations'

/** Applique un signal au cache de l'écran rendu, et attend la fin des relectures qu'il lance. */
export const liveSignal = async (queryClient: QueryClient, event: LiveEvent) => {
  await act(async () => {
    await Promise.all(
      invalidationsFor(event).map((filters) => queryClient.invalidateQueries(filters)),
    )
  })
}
