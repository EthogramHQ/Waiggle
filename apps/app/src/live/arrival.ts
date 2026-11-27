// L'arrivée annoncée d'une file qui ne se relit jamais seule (R21, choix 10 et 11 du plan) : la file
// de modération, par exemple. Un signal du flux ne la relit pas (une carte ne vient pas remplacer,
// sous le doigt, celle qu'on allait toucher) : il la marque seulement périmée (`refetchType:
// 'none'`, live/invalidations.ts). Ce hook voit ce moment-là, pour que l'écran l'annonce au lecteur
// d'écran, une fois, sans rien changer à la liste.
//
// Comment on le voit : le cache de React Query prévient ses abonnés de chaque changement d'une
// lecture (`queryCache.subscribe`). Un signal y laisse une trace précise : la lecture est marquée
// périmée (`invalidate`) et ne repart pas (juste après, elle est toujours `idle`). Une écriture de
// l'écran qui relit la file la marque périmée aussi, mais la relance aussitôt (`fetching`) : elle
// n'est pas une arrivée.
// La file marquée le reste jusqu'à sa prochaine lecture : un deuxième signal entre-temps ne change
// rien, et n'est donc pas annoncé une deuxième fois.
import { matchQuery, type QueryKey, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

/**
 * Hook : vrai quand un signal a marqué la lecture `queryKey` périmée sans la relire, pendant que
 * l'écran écoutait (`listening`) ; redevient faux quand la lecture se refait. `listening` faux (un
 * autre onglet de la page montré) : l'arrivée n'est pas retenue, la lecture se refera à son retour.
 */
export const useKeptArrival = (queryKey: QueryKey, listening = true): boolean => {
  const queryClient = useQueryClient()
  const [arrived, setArrived] = useState(false)
  // Lus au moment de l'évènement, sans relancer l'abonnement à chaque affichage.
  const listeningRef = useRef(listening)
  listeningRef.current = listening
  const arrivedRef = useRef(arrived)
  arrivedRef.current = arrived
  // La clé, en texte : un tableau neuf à chaque affichage ne doit pas relancer l'abonnement.
  const hash = JSON.stringify(queryKey)

  useEffect(() => {
    const key = JSON.parse(hash) as QueryKey
    // Vrai tant que l'abonnement vit : une micro-tâche partie avant le démontage ne fait plus rien.
    const live = { mounted: true }
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || !matchQuery({ queryKey: key, exact: true }, event.query))
        return
      const { action, query } = event
      if (action.type === 'invalidate') {
        if (!listeningRef.current) return
        // Le cache prévient pendant `invalidateQueries`, avant que la relecture éventuelle ne parte :
        // on regarde juste après (une micro-tâche, la suite immédiate du code en cours).
        queueMicrotask(() => {
          if (live.mounted && query.state.isInvalidated && query.state.fetchStatus === 'idle')
            setArrived(true)
        })
      } else if (action.type === 'success') {
        // `manual` : l'écran a écrit lui-même dans la file (une décision la retire), ce qui la
        // déclare fraîche. L'arrivée annoncée n'y est pas encore : la file est remarquée périmée,
        // pour qu'elle se relise bien à sa prochaine ouverture.
        if (action.manual && arrivedRef.current)
          void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' })
        else if (!action.manual) setArrived(false)
      }
    })
    return () => {
      live.mounted = false
      unsubscribe()
    }
  }, [queryClient, hash])

  return arrived
}
