// Les places de recherche (tranche R3, relecture C1) : combien de recherches tournent en même
// temps, par membre et pour toute l'API. Le délai de 2 secondes (search/load.ts) borne la durée
// d'une recherche, pas leur nombre : sans ces places, une rafale permise par le quota (600 par
// heure) prendrait toutes les connexions à la base, et chaque autre route attendrait.

/**
 * Une recherche à la fois par membre : l'appli n'en envoie qu'une pendant qu'on tape (elle annule
 * la précédente), une deuxième en même temps vient d'un script.
 */
export const SEARCHES_PER_MEMBER = 1

/**
 * Trois recherches au plus pour toute l'API : chacune garde une connexion pendant sa transaction,
 * jusqu'à 2 secondes, et la réserve de connexions en a 10 (`new Pool` de `pg`, réglage par défaut,
 * packages/db). Il en reste ainsi au moins 7 pour tout le reste.
 */
export const SEARCHES_AT_ONCE = 3

/**
 * Le compte des places, gardé en mémoire : il vaut pour un processus de l'API (il n'y en a qu'un
 * en production ; plusieurs auraient chacun le leur, ce que la réserve de chacun supporte).
 * `take` rend de quoi libérer la place, ou null quand il n'y en a plus : l'appelant libère dans
 * un `finally` (exécuté que la recherche réussisse, échoue ou dépasse son délai), sinon une place
 * perdue le serait pour toujours.
 */
export type SearchSlots = { take: (memberId: string) => (() => void) | null }

export const createSearchSlots = (
  perMember = SEARCHES_PER_MEMBER,
  atOnce = SEARCHES_AT_ONCE,
): SearchSlots => {
  /** Les recherches en cours de chaque membre (seuls les membres qui en ont une y figurent). */
  const running = new Map<string, number>()
  let total = 0
  return {
    take: (memberId) => {
      const mine = running.get(memberId) ?? 0
      if (mine >= perMember || total >= atOnce) return null
      running.set(memberId, mine + 1)
      total += 1
      return () => {
        total -= 1
        const left = (running.get(memberId) ?? 1) - 1
        if (left > 0) running.set(memberId, left)
        else running.delete(memberId)
      }
    },
  }
}
