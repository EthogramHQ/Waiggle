// Une file d'attente : au plus `limit` tâches en même temps, les suivantes attendent leur tour.
// Analogie : un guichet avec deux employés. Dix clients arrivent ensemble ; deux sont servis,
// huit patientent. Ici, chaque « client » est une image à traiter, qui occupe beaucoup de mémoire :
// sans file, dix envois simultanés pourraient saturer le serveur.

/** Levée quand la salle d'attente est pleine : mieux vaut refuser que s'empiler sans fin. */
export class QueueFullError extends Error {
  constructor() {
    super('queue full')
  }
}

/**
 * Crée une file. Usage : `const queue = createQueue(2, 8); await queue(() => travail())`.
 * `maxWaiting` : nombre maximal de tâches en attente (chacune garde son image en mémoire).
 */
export const createQueue = (limit: number, maxWaiting = Number.POSITIVE_INFINITY) => {
  let running = 0
  // Les tâches en attente : chacune est une fonction qui la « réveille ».
  const waiting: Array<() => void> = []

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= limit) {
      if (waiting.length >= maxWaiting) throw new QueueFullError()
      // Pas de place : on attend qu'une tâche en cours nous réveille.
      await new Promise<void>((wake) => waiting.push(wake))
    } else {
      running++
    }
    try {
      return await task()
    } finally {
      // Réussite ou échec, on libère la place : on la passe directement à la tâche suivante
      // (running ne change pas), ou on la rend s'il n'y a personne.
      const next = waiting.shift()
      if (next) next()
      else running--
    }
  }
}
