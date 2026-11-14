// Les garde-fous partagés par les deux recherches de membres (tranche R3, puis R10) : la recherche
// par mots (routes/search.ts) et la recherche de la feuille « Inviter » d'une ruche
// (routes/hive-invitations.ts). Elles comptent dans les mêmes compteurs, avec les mêmes plafonds
// (relecture de sécurité de R10, point 3) : sans cela, la feuille « Inviter » ouvrirait une seconde
// porte sur l'annuaire, avec son propre quota.
import {
  memberCounterKeys,
  type RateDecision,
  type RateLimiter,
  type RateRule,
} from '../rate-limit'

// Anti-abus (plan de R3) : 600 recherches par heure et 2 000 par jour, comme les suggestions de
// mentions (routes/members.ts). L'appli cherche pendant qu'on tape, après une courte pause : 600
// dans l'heure, c'est beaucoup d'écriture ; le plafond du jour empêche de relever peu à peu tout
// l'annuaire, jour et nuit (avec la règle des 3 caractères pour les membres, search/load.ts).
export const searchHourRule: RateRule = { windowMs: 60 * 60 * 1000, max: 600 }
export const searchDayRule: RateRule = { windowMs: 24 * 60 * 60 * 1000, max: 2000 }

/**
 * Compte une recherche de ce membre dans les deux compteurs (l'heure, puis le jour). Les deux
 * avancent à chaque demande ; le premier refus l'emporte, avec son délai d'attente.
 */
export const hitSearchQuota = async (
  limiter: RateLimiter,
  userId: string,
): Promise<RateDecision> => {
  const keys = memberCounterKeys(userId)
  for (const [key, rule] of [
    [keys.searchHour, searchHourRule],
    [keys.searchDay, searchDayRule],
  ] as const) {
    const decision = await limiter.hit(key, rule)
    if (!decision.allowed) return decision
  }
  return { allowed: true }
}

/** Le code d'erreur de PostgreSQL quand `statement_timeout` arrête une requête. */
export const STATEMENT_TIMEOUT = '57014'

/**
 * Le code PostgreSQL d'une erreur, sur l'erreur elle-même ou sur sa cause (Drizzle enveloppe
 * l'erreur du pilote dans la sienne, qui la garde dans `cause`).
 */
export const pgCodeOf = (error: unknown): string | undefined => {
  for (let current = error, depth = 0; current && depth < 3; depth++) {
    if (typeof current !== 'object') return undefined
    const code = Reflect.get(current, 'code')
    if (typeof code === 'string') return code
    current = Reflect.get(current, 'cause')
  }
  return undefined
}
