// La connexion du temps réel (R21, choix 1, 9 et 10 du plan ; docs/scenarios/refonte.md, « R21 — Le
// temps réel ») : un seul flux par appareil, `GET /v1/live`, ouvert tant que le membre est connecté,
// la page hydratée et l'appli au premier plan. Le serveur y écrit des signaux sans contenu (« les
// commentaires du projet X ont changé ») ; la connexion fait relire ce qu'ils désignent
// (invalidations.ts), avec les droits du membre.
//
// Ce qu'elle fait, dans l'ordre d'une connexion :
// 1. elle ouvre le flux (`fetch` lu en flux ; sur téléphone, `expo/fetch`, le seul qui lise une
//    réponse morceau par morceau) ;
// 2. au premier message, `hello`, elle apprend l'identifiant de la connexion et déclare les sujets
//    des écrans ouverts (topics.ts) par `PUT /v1/live/<id>/topics`, regroupés sur 300 ms, puis à
//    chaque écran ouvert ou fermé ;
// 3. elle « rattrape en une fois » ce qu'une coupure a pu faire manquer : une seule relecture de tout
//    ce qu'elle écoute, et de l'Activité (`catchUpFor`) ;
// 4. chaque `signal` fait relire ses lectures (`invalidationsFor`) ;
// 5. le flux fini (redémarrage du serveur, métro), elle le rouvre seule : après 1 s, puis de plus
//    en plus tard, jusqu'à 30 s, au hasard (sinon tous les appareils reviendraient à la même seconde
//    sur un serveur qui redémarre) ;
// 6. `replaced` : le membre a ouvert un sixième flux ailleurs, le serveur ferme celui-ci. Elle ne le
//    rouvre qu'au retour au premier plan : sinon deux appareils se chasseraient l'un l'autre en
//    boucle.
// Elle dit aussi au repli (fallback.ts) si le flux couvre le membre ; sinon, la cloche, le Fil et
// les ruches se relisent toutes les minutes, comme avant R21.
//
// L'interface :
//   useLiveConnection(): void   monté une seule fois, à la racine de l'appli (app/_layout.tsx, par
//                               `LiveConnection`) ; ne fait rien pour un visiteur.
import type { LiveTopic } from '@ruche/contracts'
import { focusManager, type QueryClient, useQueryClient } from '@tanstack/react-query'
import { fetch as expoFetch } from 'expo/fetch'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { authClient } from '../accounts/auth-client'
import { useMemberSession } from '../accounts/session'
import { requestWithoutBody } from '../api/client'
import { apiUrl } from '../config'
import { useHydrated } from '../ui/theme/hydration'
import { setLiveCovers } from './fallback'
import { catchUpFor, invalidationsFor } from './invalidations'
import { createLiveParser } from './stream'
import { liveTopics, subscribeTopics } from './topics'

/** Les sujets partent 300 ms après le premier changement : plusieurs écrans montés d'un coup, un envoi. */
const TOPICS_GROUP_MS = 300
/** Une déclaration refusée (réseau, quota, 409 d'un envoi déjà en cours) est retentée 5 s plus tard. */
const TOPICS_RETRY_MS = 5_000
/** Trois échecs de suite : le flux ne couvre plus le membre, le repli reprend (fallback.ts). */
const FAILURES_BEFORE_FALLBACK = 3
/** Le plus long délai avant de rouvrir le flux. */
const MAX_RETRY_MS = 30_000

/**
 * Le délai avant de rouvrir le flux, après `failures` échecs de suite : au moins 1 s, et au plus
 * 2 s, 4 s, 8 s, 16 s, puis 30 s. Tiré au hasard dans cet intervalle (« gigue ») : après un
 * redémarrage du serveur, les appareils reviennent étalés, pas tous à la même seconde.
 */
const retryDelay = (failures: number): number => {
  const ceiling = Math.min(MAX_RETRY_MS, 1000 * 2 ** (failures + 1))
  return 1000 + Math.random() * (ceiling - 1000)
}

/** La partie d'une réponse dont la lecture du flux a besoin (celle du navigateur ou d'`expo/fetch`). */
type StreamResponse = { ok: boolean; body: ReadableStream<Uint8Array> | null }

/**
 * Ouvre `GET /v1/live` avec la session du membre, comme `apiFetch` (api/client.ts) : sur le web, le
 * navigateur joint son cookie (`credentials: 'include'`) ; sur téléphone, on pose nous-mêmes
 * l'en-tête `Cookie` gardé par Better Auth. `fetch` est lu au moment de l'appel (le web garde ainsi
 * celui de la page, que les captures remplacent).
 */
const openStream = async (signal: AbortSignal): Promise<StreamResponse> => {
  const url = `${apiUrl}/v1/live`
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  if (Platform.OS === 'web') return fetch(url, { headers, credentials: 'include', signal })
  const cookie = await authClient.getCookie()
  if (cookie) headers.Cookie = cookie
  return expoFetch(url, { headers, credentials: 'omit', signal })
}

/** Deux listes de sujets identiques, dans le même ordre (rien de neuf à déclarer). */
const sameTopics = (a: readonly LiveTopic[], b: readonly LiveTopic[]) =>
  a.length === b.length && a.every((topic, index) => topic === b[index])

/**
 * Lance la connexion, jusqu'à l'appel de la fonction rendue (qui ferme tout). `catchUpFirst` faux :
 * le premier flux de la mise en page ne rattrape rien, les écrans viennent de tout lire (sinon
 * chaque ouverture de l'appli lirait deux fois la cloche et la page ouverte).
 */
const startLive = (queryClient: QueryClient, catchUpFirst: boolean): (() => void) => {
  let stopped = false
  let attempts = 0
  // Les échecs de suite : une ouverture refusée, ou un flux fini avant son `hello`.
  let failures = 0
  let controller: AbortController | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  // La connexion en cours (son identifiant, appris par `hello`) et les sujets déjà déclarés.
  let connectionId: string | null = null
  let declared: readonly LiveTopic[] = []
  let topicsTimer: ReturnType<typeof setTimeout> | undefined
  // Un seul envoi des sujets à la fois (le serveur refuserait le second, 409) ; `pending` : la liste
  // a changé pendant l'envoi, un autre suivra.
  let sending = false
  let pending = false

  /** Prévoit l'envoi des sujets dans `delay` ms, sauf s'il est déjà prévu. */
  const scheduleTopics = (delay = TOPICS_GROUP_MS) => {
    if (stopped || connectionId === null || topicsTimer !== undefined) return
    topicsTimer = setTimeout(() => {
      topicsTimer = undefined
      void sendTopics()
    }, delay)
  }

  /** Déclare au serveur les sujets des écrans ouverts, s'ils ont changé depuis le dernier envoi. */
  const sendTopics = async () => {
    const id = connectionId
    if (stopped || id === null) return
    if (sending) {
      pending = true
      return
    }
    const topics = liveTopics()
    if (sameTopics(topics, declared)) return
    sending = true
    const result = await requestWithoutBody(`/v1/live/${encodeURIComponent(id)}/topics`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topics }),
    })
    sending = false
    // La connexion a changé pendant l'envoi : la nouvelle déclare ses sujets elle-même.
    if (connectionId !== id) return
    if (result.ok) declared = topics
    if (!result.ok) scheduleTopics(TOPICS_RETRY_MS)
    else if (pending) {
      pending = false
      scheduleTopics()
    }
  }

  const unsubscribeTopics = subscribeTopics(() => scheduleTopics())

  /** Une ouverture du flux, lue jusqu'à sa fin ; puis la suivante est prévue. */
  const connect = async () => {
    attempts += 1
    const first = attempts === 1
    const current = new AbortController()
    controller = current
    let greeted = false
    let replaced = false
    try {
      const response = await openStream(current.signal)
      if (!response.ok || response.body === null) {
        // Un refus (401, 429, 503…) : son corps est lu jusqu'au bout pour libérer la connexion.
        await response.body?.cancel().catch(() => undefined)
        throw new Error('live stream refused')
      }
      const reader = response.body.getReader()
      // Le réseau livre des octets ; une lettre accentuée peut tomber à cheval sur deux morceaux :
      // `stream: true` garde ses premiers octets pour le morceau suivant.
      const decoder = new TextDecoder()
      const parse = createLiveParser()
      while (!stopped && !replaced) {
        const { done, value } = await reader.read()
        if (done) break
        for (const message of parse(decoder.decode(value, { stream: true }))) {
          if (message.type === 'hello') {
            greeted = true
            failures = 0
            setLiveCovers(true)
            connectionId = message.connectionId
            // Une connexion neuve n'écoute que ses sujets d'office : tout est à redéclarer.
            declared = []
            if (catchUpFirst || !first)
              for (const filters of catchUpFor(liveTopics()))
                void queryClient.invalidateQueries(filters)
            scheduleTopics()
          } else if (message.type === 'signal') {
            for (const filters of invalidationsFor(message.event))
              void queryClient.invalidateQueries(filters)
          } else replaced = true
        }
      }
      if (replaced) current.abort()
    } catch {
      // Pas de réseau, un refus, ou la fermeture voulue (`abort`) : la suite le dit.
    }
    if (controller === current) controller = null
    connectionId = null
    clearTimeout(topicsTimer)
    topicsTimer = undefined
    pending = false
    if (stopped) return
    if (replaced) {
      // Plus de flux jusqu'au retour au premier plan : le repli reprend d'ici là.
      setLiveCovers(false)
      return
    }
    if (!greeted) failures += 1
    setLiveCovers(failures < FAILURES_BEFORE_FALLBACK)
    retryTimer = setTimeout(() => void connect(), retryDelay(failures))
  }

  setLiveCovers(true)
  void connect()

  return () => {
    stopped = true
    unsubscribeTopics()
    clearTimeout(retryTimer)
    clearTimeout(topicsTimer)
    controller?.abort()
    controller = null
    setLiveCovers(false)
  }
}

/** S'abonne aux passages au premier plan et en arrière-plan (onglet, appli). */
const subscribeFocus = (listener: () => void) => focusManager.subscribe(listener)

/**
 * Hook : la connexion du temps réel. Elle ne vit que si les trois conditions tiennent : un membre
 * connecté, la page hydratée (le pré-rendu ne connaît personne), l'appli au premier plan (le
 * `focusManager` de React Query, qui suit l'onglet sur le web et `AppState` sur téléphone). Que
 * l'une tombe, l'effet se nettoie et ferme le flux ; qu'elle revienne, un flux neuf s'ouvre. Un
 * autre membre qui se connecte en ouvre un neuf aussi (son identifiant est une dépendance).
 */
export const useLiveConnection = (): void => {
  const queryClient = useQueryClient()
  const member = useMemberSession()
  const memberId = member.state === 'signedIn' ? member.session.user.id : null
  const hydrated = useHydrated()
  const focused = useSyncExternalStore(
    subscribeFocus,
    () => focusManager.isFocused(),
    () => false,
  )
  // Vrai après le premier flux de la mise en page : les suivants (retour au premier plan) rattrapent.
  const started = useRef(false)

  useEffect(() => {
    if (memberId === null || !hydrated || !focused) return
    const stop = startLive(queryClient, started.current)
    started.current = true
    return stop
  }, [memberId, hydrated, focused, queryClient])
}

/**
 * Composant invisible qui monte la connexion, posé une fois à la racine (app/_layout.tsx). Un
 * composant à part plutôt qu'un appel dans la mise en page : un changement de session ou de premier
 * plan redessine ce seul composant, pas toute l'appli.
 */
export function LiveConnection() {
  useLiveConnection()
  return null
}
