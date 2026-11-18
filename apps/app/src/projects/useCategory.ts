// Lire la catégorie d'un projet pour l'étiqueter (R6b) : la carte et l'en-tête de la page disent le
// nom et l'icône que l'API donne, jamais un code brut. Le nom d'une catégorie vient de la liste lue
// par `useCategories` ; tant qu'elle charge, qu'elle a échoué, ou que le code n'y est pas, il n'y a
// pas d'étiquette (`undefined`). Un code que la liste lue ne connaît pas peut être celui d'une
// catégorie créée depuis la lecture : la liste est alors redemandée une fois.
//
// R16 (« La page ne bouge plus en arrivant ») : la carte d'un projet doit savoir, en plus, qu'une
// étiquette va venir, pour en garder la place. `useCategoryTag` distingue donc « en attente »
// (`'pending'` : le projet a une catégorie, la liste est encore en route) de « pas d'étiquette »
// (`undefined`). `useCategory`, que lisent les écrans qui ne gardent pas de place (l'en-tête de la
// page d'un projet, le formulaire), garde sa réponse d'avant.
import type { QueryClient } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { categoryOf, useCategories } from '../categories/api'
import { type CategoryOption, optionOf } from './categories'

// Les codes déjà redemandés, par client de requêtes : une fois par code, pas une fois par carte (un
// fil de vingt cartes d'une même catégorie inconnue ne relit la liste qu'une fois). Un `WeakMap`
// laisse partir le client avec ses codes (chaque test, chaque visite, en a un neuf).
const refetched = new WeakMap<QueryClient, Set<string>>()

/**
 * L'étiquette d'une carte : la catégorie prête à afficher, `'pending'` tant que la liste n'a pas
 * encore répondu pour un projet qui en a une, ou `undefined` (aucune étiquette, aucune place).
 */
export type CategoryTag = CategoryOption | 'pending' | undefined

/**
 * Hook : l'étiquette d'un code (voir `CategoryTag`). « En attente » seulement pendant la première
 * lecture de la liste (`isPending` de React Query : ni données ni erreur encore). Une liste en panne
 * libère la place (`undefined`) ; un code inconnu d'une liste lue aussi, le temps de la relecture :
 * une catégorie toute neuve est rare, et une place gardée pour rien serait un trou dans la carte.
 */
export function useCategoryTag(code: string | null | undefined): CategoryTag {
  const client = useQueryClient()
  const { data, isSuccess, isPending, refetch } = useCategories()
  const found = categoryOf(data?.categories, code)
  const hasCode = code !== null && code !== undefined
  // Liste lue, code absent : une catégorie créée depuis ? Relire, une seule fois par code.
  const unknown = isSuccess && hasCode && !found
  useEffect(() => {
    if (!unknown || !code) return
    const done = refetched.get(client) ?? new Set<string>()
    refetched.set(client, done)
    if (done.has(code)) return
    done.add(code)
    void refetch()
  }, [unknown, code, client, refetch])
  if (found) return optionOf(found)
  return hasCode && isPending ? 'pending' : undefined
}

/**
 * Hook : la catégorie d'un code, prête à afficher, ou `undefined` (code absent, liste en cours de
 * lecture ou en panne, code inconnu). Jamais le code brut à la place d'un nom.
 */
export function useCategory(code: string | null | undefined): CategoryOption | undefined {
  const tag = useCategoryTag(code)
  return tag === 'pending' ? undefined : tag
}
