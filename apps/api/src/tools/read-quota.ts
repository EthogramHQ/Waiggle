// Le quota des lectures du catalogue (tranche R6b) : 600 par heure et par membre, partagées entre
// la liste des outils, la liste des catégories et la page d'un outil. Ces lectures se calculent à
// chaque appel (projets visibles comptés et regroupés) : des lectures coûteuses, comptées comme
// telles (securite.md). Un seul compteur (`toolsHour`) : changer de page ne le remet pas à zéro.
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'

export const toolsHourRule: RateRule = { windowMs: 60 * 60 * 1000, max: 600 }

/**
 * Compte une lecture. Rend `null` si elle passe, sinon le nombre de secondes à attendre (la route
 * répond 429 `rate_limited` avec `Retry-After`).
 */
export const chargeToolsRead = async (
  limiter: RateLimiter,
  userId: string,
): Promise<number | null> => {
  const decision = await limiter.hit(memberCounterKeys(userId).toolsHour, toolsHourRule)
  return decision.allowed ? null : decision.retryAfterSeconds
}
