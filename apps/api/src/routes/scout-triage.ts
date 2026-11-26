// La page de tri des Éclaireuses (R20), pour l'administrateur actif seul, sous
// /v1/moderation/scouts : le mois, les places, les missions de la semaine, les retours et
// « Retirer ». Monté par app.ts ; le routeur est encore vide : ses routes arrivent avec leur propre
// commit de la tranche.
import type { Database } from '@ruche/db'
import type { FileStorage } from '../media/storage'
import type { RateLimiter } from '../rate-limit'
import { createRouter } from './router'

export type ScoutTriageDeps = {
  db: Database
  storage: FileStorage
  limiter: RateLimiter
  publicApiUrl: string
}

export const scoutTriageRoutes = (_deps: ScoutTriageDeps) => createRouter()
