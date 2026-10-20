// Les membres proposés après « @ » dans un commentaire (tranche 6b). Pendant que le membre tape
// « @in… », l'écran demande ici qui proposer ; ce hook attend qu'il s'arrête de taper, demande à
// l'API (GET /v1/members/mentionable), et abandonne une demande devenue inutile. Les écrans
// n'appellent que ce hook ; les tests le remplacent par un faux.
import { MENTION_QUERY_MIN, type Mentionable, MentionableList } from '@ruche/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { request } from '../api/client'

/** Le temps d'attente après la dernière lettre tapée, avant de demander. */
const MENTION_DELAY_MS = 250

/** Rien à proposer : une seule liste vide, la même à chaque dessin (pas de redessin inutile). */
const NOBODY: Mentionable[] = []

/**
 * Hook : la valeur, mais seulement quand elle n'a plus bougé depuis `delay` millisecondes (on dit
 * « debounce »). Chaque changement relance le minuteur ; l'ancien est effacé par le nettoyage de
 * useEffect (la fonction rendue, appelée avant l'effet suivant). Une valeur nulle passe tout de
 * suite : il n'y a plus rien à chercher, inutile d'attendre.
 */
const useSettled = (value: string | null, delay: number) => {
  const [settled, setSettled] = useState<string | null>(null)
  useEffect(() => {
    if (value === null) {
      setSettled(null)
      return
    }
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

/** L'adresse de la recherche ; URLSearchParams encode chaque paramètre. */
const pathOf = (projectId: string, query: string) => {
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('projectId', projectId)
  return `/v1/members/mentionable?${params.toString()}`
}

/**
 * Hook : les membres à proposer pour « @<query> » sur ce projet (les proches d'abord, l'API les
 * range). `query` est le début du pseudo, sans « @ », ou null quand on ne cherche rien.
 *
 * - Rien sous 2 caractères : la recherche serait trop large.
 * - On attend 250 ms après la dernière lettre : une demande par mot plutôt qu'une par lettre.
 * - React Query passe un `signal` (AbortSignal) à la fonction de lecture. Transmis à fetch, il
 *   permet d'abandonner la demande : quand le texte change, l'ancienne recherche n'a plus de
 *   lecteur, et React Query l'annule au lieu d'attendre une réponse qui ne servira plus.
 * - Pendant qu'une nouvelle recherche part, la liste précédente reste affichée
 *   (`keepPreviousData`) : les suggestions ne clignotent pas à chaque lettre.
 * - Un refus de l'API (quota dépassé, réseau) ne propose personne, sans message : écrire le
 *   commentaire reste possible, on tape alors le pseudo en entier.
 */
export const useMentionable = (projectId: string, query: string | null): Mentionable[] => {
  const wanted = query !== null && query.length >= MENTION_QUERY_MIN ? query : null
  const settled = useSettled(wanted, MENTION_DELAY_MS)
  const result = useQuery({
    queryKey: ['mentionable', projectId, settled],
    queryFn: async ({ signal }) => {
      const answer = await request(pathOf(projectId, settled ?? ''), { signal }, MentionableList)
      return answer.ok ? answer.data.members : NOBODY
    },
    enabled: settled !== null,
    // Les mêmes lettres retapées dans la minute : la réponse déjà reçue suffit.
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
  // Plus rien à chercher (le mot est fini, la liste refermée) : personne, même si une ancienne
  // réponse est encore en mémoire.
  if (wanted === null) return NOBODY
  return result.data ?? NOBODY
}
