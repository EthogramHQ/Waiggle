// Lire la catégorie d'un projet pour l'étiqueter (R6b) : la carte et l'en-tête de la page disent le
// nom et l'icône que l'API donne, jamais un code brut. Le nom d'une catégorie vient de la liste lue
// par `useCategories` ; tant qu'elle charge, qu'elle a échoué, ou que le code n'y est pas, il n'y a
// pas d'étiquette (`undefined`). Un code que la liste lue ne connaît pas peut être celui d'une
// catégorie créée depuis la lecture : la liste est alors redemandée une fois.
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
 * Hook : la catégorie d'un code, prête à afficher, ou `undefined` (code absent, liste en cours de
 * lecture ou en panne, code inconnu). Jamais le code brut à la place d'un nom.
 */
export function useCategory(code: string | null | undefined): CategoryOption | undefined {
  const client = useQueryClient()
  const { data, isSuccess, refetch } = useCategories()
  const found = categoryOf(data?.categories, code)
  // Liste lue, code absent : une catégorie créée depuis ? Relire, une seule fois par code.
  const unknown = isSuccess && code !== null && code !== undefined && !found
  useEffect(() => {
    if (!unknown || !code) return
    const done = refetched.get(client) ?? new Set<string>()
    refetched.set(client, done)
    if (done.has(code)) return
    done.add(code)
    void refetch()
  }, [unknown, code, client, refetch])
  return found ? optionOf(found) : undefined
}
