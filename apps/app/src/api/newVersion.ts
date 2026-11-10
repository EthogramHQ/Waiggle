// Un onglet ouvert avant un déploiement garde l'ancienne appli en mémoire, alors que l'API, elle,
// est déjà la nouvelle. Quand une réponse change de forme (une tranche qui modifie le contrat),
// l'ancienne appli la refuse (`request`, client.ts) et affiche « n'a pas pu aboutir » ; « Réessayer »
// n'y peut rien, seul un rechargement de la page aide (constaté le 10/11/2026 sur la recherche).
//
// Ce module fait ce rechargement à la place du membre : sur le web, après une réponse refusée, il
// demande à l'API sa version (`/health`) et la compare à celle de l'appli, écrite au moment de la
// construction (`appVersion`, config.ts). Différentes : la page se recharge, une seule fois pour une
// version donnée (le sessionStorage s'en souvient), pour ne jamais tourner en boucle si l'API avait
// un vrai défaut. Sans version connue (développement, tests, captures), il ne fait rien.
import { Platform } from 'react-native'
import { apiUrl, appVersion } from '../config'

/** La clé du sessionStorage : la version pour laquelle la page s'est déjà rechargée. */
export const RELOADED_FOR_KEY = 'waiggle.reloadedFor'

/** Les versions qui ne disent rien du commit (développement, pile locale) : jamais de rechargement. */
const UNKNOWN_VERSIONS = new Set(['', 'dev', 'local'])

/** Ce dont la vérification a besoin, remplaçable dans les tests. */
export type NewVersionDeps = {
  platform: string
  current: string | null
  fetchHealth: () => Promise<unknown>
  storage: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
  } | null
  reload: () => void
}

const defaults = (): NewVersionDeps => ({
  platform: Platform.OS,
  current: appVersion,
  // Sans cookie : la version n'a rien de privé, et la requête reste la plus légère possible.
  fetchHealth: async () => (await fetch(`${apiUrl}/health`, { credentials: 'omit' })).json(),
  storage: typeof sessionStorage === 'undefined' ? null : sessionStorage,
  reload: () => window.location.reload(),
})

// Plusieurs réponses refusées en même temps (une page qui charge trois listes) : une seule
// vérification part, les autres attendent la sienne.
let pending: Promise<boolean> | null = null

/**
 * Recharge la page si l'API en ligne est d'une autre version que l'appli, au plus une fois par
 * version. Rend vrai quand elle a demandé le rechargement.
 */
export const reloadIfNewVersion = (deps: Partial<NewVersionDeps> = {}): Promise<boolean> => {
  pending ??= check({ ...defaults(), ...deps }).finally(() => {
    pending = null
  })
  return pending
}

const check = async ({ platform, current, fetchHealth, storage, reload }: NewVersionDeps) => {
  if (platform !== 'web' || current === null || UNKNOWN_VERSIONS.has(current)) return false
  let online: unknown
  try {
    online = ((await fetchHealth()) as { version?: unknown } | null)?.version
  } catch {
    return false // l'API injoignable : la page dit déjà l'erreur, recharger n'aiderait pas
  }
  if (typeof online !== 'string' || UNKNOWN_VERSIONS.has(online) || online === current) return false
  try {
    // Déjà rechargée pour cette version : l'écart vient d'ailleurs, on ne recommence pas.
    if (storage?.getItem(RELOADED_FOR_KEY) === online) return false
    storage?.setItem(RELOADED_FOR_KEY, online)
  } catch {
    return false // stockage refusé (navigation privée stricte) : sans mémoire, pas de rechargement
  }
  reload()
  return true
}
