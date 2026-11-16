// La limite de lecture des visiteurs sans compte (tranche R12, relecture de sécurité du plan, I4 ;
// décision 6) : au plus 300 lectures de `/v1/public/*` par 10 minutes et par réseau (une adresse
// IPv4, ou un réseau IPv6 /64 : security/ip.ts). Sans elle, n'importe qui ferait lire la base sans
// fin, sans même avoir de compte.
//
// Pourquoi en mémoire, et pas dans `api_rate_limit` comme les quotas des membres (rate-limit.ts) :
// une lecture ne doit pas devenir une écriture en base, sinon la limite coûterait plus cher que ce
// qu'elle protège. Le compteur vit dans le processus de l'API : il repart de zéro à chaque
// redémarrage, ce qui suffit contre un robot qui lit en boucle. Il est créé par `createApp`, jamais
// au chargement du fichier : deux API (deux tests) n'ont jamais le même compteur.
import type { MiddlewareHandler } from 'hono'
import { errorBody, languageOf } from '../errors'
import type { AppEnv } from '../types'
import { ipCounterId } from './ip'

/** 300 lectures par fenêtre de 10 minutes (décision 6 de la relecture du plan R12). */
export const VISITOR_READS = { windowMs: 10 * 60 * 1000, max: 300 } as const

/**
 * Au plus tant de réseaux suivis à la fois. Chaque entrée pèse une centaine d'octets : 50 000
 * réseaux, c'est 5 Mo. Un robot qui changerait de /64 à chaque demande (un /48 en compte 65 536) ne
 * peut donc pas remplir la mémoire du serveur : au-delà, la plus ancienne fenêtre est oubliée.
 */
const MAX_NETWORKS = 50_000

/** Où en est un réseau : le début de sa fenêtre, et ses lectures depuis. */
type Window = { startedAt: number; count: number }

export type VisitorLimit = {
  /** Compte une lecture de ce réseau ; `allowed` faux au-delà de la limite. */
  hit: (network: string) => { allowed: boolean; retryAfterSeconds: number }
}

/**
 * Une limite « à fenêtre fixe » : la première lecture d'un réseau ouvre une fenêtre de 10 minutes ;
 * chaque lecture y compte, refusée ou non (un robot qui insiste ne prolonge pas sa fenêtre, mais
 * n'en sort pas plus tôt). Fenêtre passée, le compte repart de zéro. L'heure vient de `Date.now()`,
 * lue à chaque lecture : les tests la règlent par leur fausse horloge.
 */
export const createVisitorLimit = (
  rule: { windowMs: number; max: number } = VISITOR_READS,
): VisitorLimit => {
  // Une Map garde ses clés dans l'ordre où elles sont entrées : la première est la plus ancienne.
  const windows = new Map<string, Window>()

  /** Oublie les fenêtres passées ; s'il en reste trop, les plus anciennes. */
  const sweep = (now: number) => {
    for (const [network, window] of windows) {
      if (now - window.startedAt >= rule.windowMs) windows.delete(network)
    }
    for (const network of windows.keys()) {
      if (windows.size < MAX_NETWORKS) break
      windows.delete(network)
    }
  }

  return {
    hit: (network) => {
      const now = Date.now()
      let window = windows.get(network)
      if (window === undefined || now - window.startedAt >= rule.windowMs) {
        // Une nouvelle fenêtre : on la remet en fin de Map (la plus récente).
        windows.delete(network)
        if (windows.size >= MAX_NETWORKS) sweep(now)
        window = { startedAt: now, count: 0 }
        windows.set(network, window)
      }
      window.count += 1
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((window.startedAt + rule.windowMs - now) / 1000),
      )
      return { allowed: window.count <= rule.max, retryAfterSeconds }
    },
  }
}

/**
 * Les chemins sous `/v1/public/` que la limite ne compte pas (décision 6) : la tête des pages et le
 * plan du site, demandés par Caddy lui-même à chaque page servie (sans eux, la page entière
 * tomberait), et qui répondent toujours.
 */
const EXEMPT = new Set(['/v1/public/head', '/v1/public/sitemap'])

/**
 * Le middleware de la limite, posé sur `/v1/public/*` : chaque lecture compte AVANT la route, donc
 * avant la validation de l'adresse (un identifiant mal formé compte aussi). Les écritures
 * (le signalement d'un visiteur) ont leur propre quota, en base. Au-delà : 429 `rate_limited`, avec
 * `Retry-After` (dans combien de secondes réessayer). L'adresse vient de `X-Real-IP`, posé par Caddy.
 */
export const visitorReadLimit =
  (limit: VisitorLimit): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!['GET', 'HEAD'].includes(c.req.method) || EXEMPT.has(c.req.path)) return next()
    const decision = limit.hit(ipCounterId(c.req.header('x-real-ip')))
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  }
