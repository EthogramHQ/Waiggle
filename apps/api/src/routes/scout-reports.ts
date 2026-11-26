// Les retours des Éclaireuses (R20) : envoyer un retour en multipart (POST /v1/me/scout/reports),
// « Mes retours » (GET /v1/me/scout/reports) et en supprimer un (DELETE /v1/me/scout/reports/{id}).
// Monté par app.ts ; le routeur est encore vide : ses routes arrivent avec leur propre commit de la
// tranche. La route d'envoi pose elle-même sa limite de taille (5 Mo et 64 Ko), après la garde et
// le quota : app.ts la sort de la limite commune de 16 Ko (relecture de sécurité A3).
import type { Database } from '@ruche/db'
import type { FileStorage } from '../media/storage'
import type { RateLimiter } from '../rate-limit'
import { createRouter } from './router'

export type ScoutReportDeps = {
  db: Database
  storage: FileStorage
  limiter: RateLimiter
  publicApiUrl: string
}

export const scoutReportRoutes = (_deps: ScoutReportDeps) => createRouter()
