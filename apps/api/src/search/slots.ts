// Les places de recherche (tranche R3, relecture C1) : combien de recherches tournent en même
// temps, par membre et pour toute l'API, et la courte file où attend une demande sans place. Le
// délai de 2 secondes (search/load.ts) borne la durée d'une recherche, pas leur nombre : sans ces
// places, une rafale permise par le quota (600 par heure) prendrait toutes les connexions à la
// base, et chaque autre route attendrait.

/**
 * Une recherche à la fois par membre : l'appli n'en envoie qu'une pendant qu'on tape (elle annule
 * la précédente), une deuxième en même temps vient d'un script, ou d'une frappe rapide pendant
 * qu'une recherche lente finit : celle-là attend dans la file plutôt que d'être refusée.
 */
export const SEARCHES_PER_MEMBER = 1

/**
 * Trois recherches au plus pour toute l'API : chacune garde une connexion pendant sa transaction,
 * jusqu'à 2 secondes, et la réserve de connexions en a 10 (`new Pool` de `pg`, réglage par défaut,
 * packages/db). Il en reste ainsi au moins 7 pour tout le reste.
 */
export const SEARCHES_AT_ONCE = 3

/**
 * Combien de temps une demande sans place attend qu'une place se libère, en millisecondes. Une
 * seconde : assez pour qu'une recherche normale (quelques dizaines de millisecondes) finisse et
 * laisse passer la suivante, assez court pour que la personne ne reste pas devant un écran figé.
 * Au-delà, la demande reçoit 429 (`Retry-After: 1`), comme avant la file.
 */
export const SEARCH_WAIT_MS = 1000

/**
 * Combien de demandes attendent au plus, pour toute l'API. Une demande en attente ne tient aucune
 * connexion, seulement un peu de mémoire ; la borne empêche qu'une rafale en garde des milliers.
 * Au-delà, 429 tout de suite. Vingt : bien plus que ce que trois places servent en une seconde
 * quand les recherches sont lentes, donc rarement atteinte sans un script.
 */
export const SEARCHES_WAITING = 20

/**
 * Combien de demandes un même membre a au plus dans la file. Deux : la recherche lente qu'il
 * attend, plus celle qu'il vient de taper, au cas où l'appli n'a pas encore fait savoir qu'elle
 * annulait la précédente. Au-delà, 429 tout de suite pour lui seul : un script ne peut pas remplir
 * à lui seul les vingt places de la file et faire refuser tous les autres.
 */
export const SEARCHES_WAITING_PER_MEMBER = 2

/** Les réglages d'une réserve de places ; les tests en passent de plus petits. */
export type SearchSlotOptions = {
  perMember: number
  atOnce: number
  waitMs: number
  maxWaiting: number
  waitingPerMember: number
}

/**
 * Le compte des places, gardé en mémoire : il vaut pour un processus de l'API (il n'y en a qu'un
 * en production ; plusieurs auraient chacun le leur, ce que la réserve de chacun supporte).
 * `take` rend une promesse : elle donne de quoi libérer la place dès qu'il y en a une, ou null si
 * l'attente dépasse `waitMs`, si la file est pleine (pour l'API ou pour ce membre), ou si le client abandonne sa demande
 * (`signal`, le signal d'annulation de la requête HTTP). L'appelant libère dans un `finally`
 * (exécuté que la recherche réussisse, échoue ou dépasse son délai), sinon une place perdue le
 * serait pour toujours.
 */
export type SearchSlots = {
  take: (memberId: string, signal?: AbortSignal) => Promise<(() => void) | null>
}

/** Une demande en attente : son membre, et de quoi lui répondre (place donnée, ou null). */
type Waiter = { memberId: string; settle: (release: (() => void) | null) => void }

export const createSearchSlots = ({
  perMember = SEARCHES_PER_MEMBER,
  atOnce = SEARCHES_AT_ONCE,
  waitMs = SEARCH_WAIT_MS,
  maxWaiting = SEARCHES_WAITING,
  waitingPerMember = SEARCHES_WAITING_PER_MEMBER,
}: Partial<SearchSlotOptions> = {}): SearchSlots => {
  /** Les recherches en cours de chaque membre (seuls les membres qui en ont une y figurent). */
  const running = new Map<string, number>()
  let total = 0
  /** La file, dans l'ordre d'arrivée : la plus ancienne demande en tête. */
  const queue: Waiter[] = []

  const fits = (memberId: string) => (running.get(memberId) ?? 0) < perMember && total < atOnce

  /** Prend une place et rend la fonction qui la libère (une seule fois, même appelée deux fois). */
  const occupy = (memberId: string) => {
    running.set(memberId, (running.get(memberId) ?? 0) + 1)
    total += 1
    let released = false
    return () => {
      if (released) return
      released = true
      total -= 1
      const left = (running.get(memberId) ?? 1) - 1
      if (left > 0) running.set(memberId, left)
      else running.delete(memberId)
      serve()
    }
  }

  /**
   * Donne les places libres aux demandes en attente, dans l'ordre d'arrivée. Une demande dont le
   * membre a déjà sa recherche en cours reste à sa place, et celles qui la suivent passent : un
   * membre qui attend ne bloque pas les autres (« la première qui peut partir », pas « la première
   * de la file »).
   */
  const serve = () => {
    let i = 0
    while (i < queue.length && total < atOnce) {
      const waiter = queue[i]
      if (waiter && fits(waiter.memberId)) {
        queue.splice(i, 1)
        waiter.settle(occupy(waiter.memberId))
      } else i += 1
    }
  }

  return {
    take: (memberId, signal) => {
      if (signal?.aborted) return Promise.resolve(null)
      // Une place libre : on la prend tout de suite. Aucune demande plus ancienne n'est doublée :
      // `serve` passe à chaque place rendue, donc celles qui attendent encore ne peuvent pas partir.
      if (fits(memberId)) return Promise.resolve(occupy(memberId))
      // File pleine, ou part de ce membre déjà prise : refus tout de suite. La file est courte
      // (vingt au plus), la parcourir pour compter coûte moins que tenir un second compte à jour.
      if (queue.length >= maxWaiting) return Promise.resolve(null)
      const mineWaiting = queue.filter((waiter) => waiter.memberId === memberId).length
      if (mineWaiting >= waitingPerMember) return Promise.resolve(null)
      return new Promise((resolve) => {
        const leave = () => {
          const index = queue.indexOf(waiter)
          if (index >= 0) queue.splice(index, 1)
          settle(null)
        }
        // Le minuteur de l'attente, et l'abandon du client : chacun retire la demande de la file.
        const timer = setTimeout(leave, waitMs)
        const settle = (release: (() => void) | null) => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', leave)
          resolve(release)
        }
        const waiter: Waiter = { memberId, settle }
        signal?.addEventListener('abort', leave, { once: true })
        queue.push(waiter)
      })
    },
  }
}
