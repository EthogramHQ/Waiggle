// Le quota des nouveaux « Autre » (tranche R6b, relecture de sécurité sec-A5) : un membre en crée au
// plus 30 par jour, projets et profil confondus. Sans cela, publier et effacer des projets aux noms
// tous différents ferait grossir la table `tool` sans fin. Chaque création compte, même si elle est
// défaite ensuite (un projet effacé ne rend rien) ; un outil du catalogue ou un « Autre » qui
// existe déjà n'est pas une création.
import { OTHER_TOOLS_PER_DAY } from '@ruche/contracts'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'

const rule: RateRule = { windowMs: 24 * 60 * 60 * 1000, max: OTHER_TOOLS_PER_DAY }

/**
 * Compte `count` créations dans le quota du jour du membre, AVANT l'écriture. Rend `null` si elles
 * tiennent dans le quota, sinon le nombre de secondes à attendre (la route répond alors 429
 * `too_many_other_tools` avec `Retry-After`, sans rien écrire). Le compteur est celui de la table
 * `api_rate_limit` : une unité par appel de `hit`, donc une boucle ; elle s'arrête au premier refus.
 *
 * Ce n'est pas appelé dans une transaction : sous PGlite, une lecture par `db` pendant une
 * transaction attend sans fin, et le compteur passe par `db`.
 */
export const chargeOtherTools = async (
  limiter: RateLimiter,
  userId: string,
  count: number,
): Promise<number | null> => {
  const key = memberCounterKeys(userId).otherTools
  for (let i = 0; i < count; i++) {
    const decision = await limiter.hit(key, rule)
    if (!decision.allowed) return decision.retryAfterSeconds
  }
  return null
}
