// Lire le flux du temps réel (R21) dans un test de l'API : ouvrir GET /v1/live comme l'appli, lire
// ses messages au fil de l'eau, déclarer des sujets, attendre un signal, constater la fermeture.
// Scénario : docs/scenarios/refonte.md, « R21 — Le temps réel » ; contrat : packages/contracts/src/live.ts.
//
// Le flux est une réponse HTTP qui ne se termine pas (SSE, « Server-Sent Events ») : son corps est un
// `ReadableStream` qu'on lit morceau par morceau. Chaque message est un bloc de lignes terminé par
// une ligne vide :
//
//   event: signal
//   data: {"topic":"project:…","kind":"comments"}
//
// Une ligne qui commence par « : » est un commentaire (le battement `: ping`). Une pompe lit le corps
// en continu et range chaque message dans une file ; les tests y piochent avec un délai réel (le
// scénario promet « en moins de 2 secondes »).
//
// Les formes supposées pour le backend (tests de R21, écrits avant le code) :
// - une écriture émet ses signaux **avant** de répondre (l'émission est attendue après la fin de la
//   transaction) : quand la réponse arrive, le signal est déjà écrit dans le flux. Les tests en
//   déduisent l'ordre : un témoin émis après un geste arrive après les signaux de ce geste ;
// - le battement (`LIVE_PING_MS`) et la revérification des sessions (`LIVE_RECHECK_MS`) partent
//   d'un `setInterval` ; les tests simulent `setInterval`, `clearInterval` et `Date`
//   (`useLiveClock`), jamais `setTimeout` : les attentes de ce fichier gardent un vrai minuteur ;
// - le quota des ouvertures est compté avant d'ouvrir le flux (un 429 est une réponse JSON
//   ordinaire, que l'inventaire des routes lit d'un coup).
// Rien ici n'est utilisé en production.
import { LIVE_EVENT_NAMES, LiveEvent, LiveHello } from '@ruche/contracts'
import { vi } from 'vitest'
import type { activity } from './activity'
import type { TestContext } from './context'
import { signedUpMember } from './hive-gestures'

/**
 * Le vrai `setTimeout`, gardé avant toute fausse horloge : un délai d'attente doit s'écouler
 * vraiment, même quand le test simule les minuteurs de l'API.
 */
const realSetTimeout = globalThis.setTimeout.bind(globalThis)
const realClearTimeout = globalThis.clearTimeout.bind(globalThis)

/** Le scénario : ce que font les autres arrive « en moins de 2 secondes ». */
export const LIVE_WAIT_MS = 2_000
/**
 * Après le témoin, on écoute encore un court instant : un signal en trop, arrivé juste après, ne
 * passerait pas inaperçu.
 */
const QUIET_MS = 150

/** Un message du flux : un événement nommé avec ses données, ou un commentaire (`: ping`). */
export type LiveFrame = { event: string; data: string } | { comment: string }

/** Ce qu'une attente rend quand rien n'arrive : le délai est passé, ou le flux s'est fermé. */
type Miss = 'timeout' | 'closed'

/**
 * Simule l'horloge du temps réel : `Date`, `setInterval` et `clearInterval` (le battement et la
 * revérification), à poser **avant** `createTestContext`, comme toute fausse horloge de l'API
 * (charte de l'API : la limite de débit garde la fonction `Date.now` qu'elle trouve).
 * `vi.advanceTimersByTimeAsync(ms)` fait ensuite passer le temps des minuteurs.
 */
export const useLiveClock = (start: Date | number) => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  vi.setSystemTime(start)
}

/** Les flux ouverts par le test en cours : `closeAllLive` les ferme tous, dans `afterEach`. */
const opened = new Set<LiveStream>()

/** Découpe un bloc SSE en message ; `null` pour un bloc vide. */
const parseBlock = (block: string): LiveFrame | null => {
  let event = 'message'
  const data: string[] = []
  const comments: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line === '') continue
    if (line.startsWith(':')) {
      comments.push(line.slice(1).trim())
      continue
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    // Une seule espace après les deux-points est retirée (la norme SSE).
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }
  if (data.length === 0 && event === 'message') {
    return comments.length > 0 ? { comment: comments.join('\n') } : null
  }
  return { event, data: data.join('\n') }
}

export type LiveStream = Awaited<ReturnType<typeof openLiveRaw>> & {
  connectionId: string
}

/**
 * Ouvre le flux et rend la réponse avec ses outils de lecture, sans rien vérifier : un test de
 * refus (401, 429) lit `response` ; les autres passent par `openLive`.
 */
export const openLiveRaw = async (ctx: TestContext, cookie: string | null) => {
  const controller = new AbortController()
  const response = await ctx.request('/v1/live', {
    headers: { accept: 'text/event-stream', ...(cookie !== null && { cookie }) },
    signal: controller.signal,
  })

  const queue: LiveFrame[] = []
  /** Tout ce qui a été lu, dans l'ordre, pour les messages d'échec. */
  const seen: LiveFrame[] = []
  let done = false
  let wake: (() => void) | null = null
  const notify = () => {
    const current = wake
    wake = null
    current?.()
  }

  // La pompe : lit le corps tant qu'il coule. Un refus (JSON) n'est pas un flux : on ne la lance
  // que pour un `text/event-stream`, sinon le test lit lui-même le corps.
  const isStream = (response.headers.get('content-type') ?? '').startsWith('text/event-stream')
  const reader = isStream ? response.body?.getReader() : undefined
  if (reader) {
    void (async () => {
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        for (;;) {
          const { value, done: ended } = await reader.read()
          if (ended) break
          buffer += decoder.decode(value, { stream: true })
          for (;;) {
            const end = buffer.search(/\r?\n\r?\n/)
            if (end === -1) break
            const block = buffer.slice(0, end)
            buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
            const frame = parseBlock(block)
            if (frame) {
              queue.push(frame)
              seen.push(frame)
              notify()
            }
          }
        }
      } catch {
        // Le flux coupé par le test (`close`) ou par le serveur : il est fini, rien de plus.
      } finally {
        done = true
        notify()
      }
    })()
  } else {
    done = true
  }

  /** Le prochain message, ou `timeout` / `closed`. */
  const nextFrame = async (ms = LIVE_WAIT_MS): Promise<LiveFrame | Miss> => {
    const deadline = performance.now() + ms
    for (;;) {
      const frame = queue.shift()
      if (frame) return frame
      if (done) return 'closed'
      const left = deadline - performance.now()
      if (left <= 0) return 'timeout'
      await new Promise<void>((resolve) => {
        const timer = realSetTimeout(() => {
          wake = null
          resolve()
        }, left)
        wake = () => {
          realClearTimeout(timer)
          resolve()
        }
      })
    }
  }

  /**
   * Lit un signal : ses données passent par `LiveEvent.parse`, un objet strict. Un signal qui
   * porterait un texte, un nom ou un nombre fait donc échouer le test qui le lit.
   */
  const asSignal = (frame: LiveFrame): LiveEvent | null => {
    if ('comment' in frame) return null
    if (frame.event !== LIVE_EVENT_NAMES.signal) return null
    return LiveEvent.parse(JSON.parse(frame.data))
  }

  /** Les signaux lus pendant `ms` (les battements et les autres messages sont laissés de côté). */
  const signalsDuring = async (ms = QUIET_MS) => {
    const signals: LiveEvent[] = []
    const deadline = performance.now() + ms
    for (;;) {
      const left = deadline - performance.now()
      if (left <= 0) return signals
      const frame = await nextFrame(left)
      if (frame === 'timeout' || frame === 'closed') return signals
      const signal = asSignal(frame)
      if (signal) signals.push(signal)
    }
  }

  const describeSeen = () => JSON.stringify(seen)

  /**
   * Lit le flux jusqu'au signal `witness` (en moins de 2 s), puis encore un court instant ; rend
   * tous les signaux lus, témoin compris. Le test compare ensuite la liste entière : un signal en
   * trop, venu d'un geste que ce membre ne devait pas voir, s'y trouve.
   */
  const signalsUntil = async (witness: LiveEvent, ms = LIVE_WAIT_MS) => {
    const signals: LiveEvent[] = []
    const deadline = performance.now() + ms
    for (;;) {
      const frame = await nextFrame(Math.max(0, deadline - performance.now()))
      if (frame === 'timeout' || frame === 'closed') {
        throw new Error(
          `no ${JSON.stringify(witness)} within ${ms} ms (${frame}); read: ${describeSeen()}`,
        )
      }
      const signal = asSignal(frame)
      if (!signal) continue
      signals.push(signal)
      if (signal.topic === witness.topic && signal.kind === witness.kind) {
        return [...signals, ...(await signalsDuring())]
      }
    }
  }

  /** Le prochain signal, en moins de 2 s ; sinon le test échoue en disant ce qu'il a lu. */
  const nextSignal = async (ms = LIVE_WAIT_MS) => {
    const deadline = performance.now() + ms
    for (;;) {
      const frame = await nextFrame(Math.max(0, deadline - performance.now()))
      if (frame === 'timeout' || frame === 'closed') {
        throw new Error(`no signal within ${ms} ms (${frame}); read: ${describeSeen()}`)
      }
      const signal = asSignal(frame)
      if (signal) return signal
    }
  }

  /** Vrai si le serveur ferme le flux en moins de `ms` (les messages restants sont lus et jetés). */
  const closesWithin = async (ms = LIVE_WAIT_MS) => {
    const deadline = performance.now() + ms
    for (;;) {
      const frame = await nextFrame(Math.max(0, deadline - performance.now()))
      if (frame === 'closed') return true
      if (frame === 'timeout') return false
    }
  }

  /** Ferme le flux côté appli (l'onglet fermé) ; sans effet sur un flux déjà fini. */
  const close = async () => {
    controller.abort()
    await reader?.cancel().catch(() => undefined)
    done = true
    notify()
  }

  /** Les messages déjà arrivés et pas encore lus (sans attendre). */
  const pending = () => [...queue]

  return {
    response,
    nextFrame,
    nextSignal,
    signalsDuring,
    signalsUntil,
    closesWithin,
    close,
    pending,
    describeSeen,
    isClosed: () => done && queue.length === 0,
  }
}

/**
 * Ouvre le flux d'un membre et lit son premier message, `hello`, qui donne l'identifiant de la
 * connexion. Le flux est noté pour être fermé à la fin du test (`closeAllLive`).
 */
export const openLive = async (ctx: TestContext, cookie: string): Promise<LiveStream> => {
  const raw = await openLiveRaw(ctx, cookie)
  if (raw.response.status !== 200) {
    throw new Error(`GET /v1/live → ${raw.response.status}: ${await raw.response.text()}`)
  }
  const first = await raw.nextFrame()
  if (first === 'timeout' || first === 'closed' || !('event' in first)) {
    throw new Error(`no hello on the stream (${JSON.stringify(first)})`)
  }
  if (first.event !== LIVE_EVENT_NAMES.hello) {
    throw new Error(`first message ${first.event} instead of hello`)
  }
  const { connectionId } = LiveHello.parse(JSON.parse(first.data))
  const stream = { ...raw, connectionId }
  opened.add(stream)
  return stream
}

/** Ferme tous les flux ouverts par le test (à appeler dans `afterEach`, avant `ctx.close()`). */
export const closeAllLive = async () => {
  const all = [...opened]
  opened.clear()
  await Promise.all(all.map((stream) => stream.close()))
}

/** PUT /v1/live/{connectionId}/topics : la réponse brute (204 attendu, ou un refus). */
export const putTopics = (
  ctx: TestContext,
  cookie: string | null,
  connectionId: string,
  body: unknown,
) =>
  ctx.request(`/v1/live/${encodeURIComponent(connectionId)}/topics`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(cookie !== null && { cookie }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** Déclare les sujets des écrans ouverts de ce flux, et vérifie le 204 sans corps. */
export const declareTopics = async (
  ctx: TestContext,
  cookie: string,
  stream: LiveStream,
  topics: string[],
) => {
  const res = await putTopics(ctx, cookie, stream.connectionId, { topics })
  if (res.status !== 204) {
    throw new Error(`PUT topics → ${res.status}: ${await res.text()}`)
  }
}

/** Les sujets, écrits comme l'appli les écrit. */
export const topic = {
  project: (id: string) => `project:${id}` as const,
  member: (id: string) => `member:${id}` as const,
  hive: (id: string) => `hive:${id}` as const,
  corner: (projectId: string) => `corner:${projectId}` as const,
}

/** Avance la fausse horloge (une minute par défaut) : chaque geste a sa minute, sous les quotas. */
export const later = (ms = 60_000) => vi.setSystemTime(Date.now() + ms)

/**
 * La distribution des tests du temps réel, chacun inscrit depuis sa propre adresse IP (le quota
 * des inscriptions par IP) : Léa (qui écoute, le plus souvent), Nora (qui publie), Marc et Zoé
 * (deux autres membres), Louis (l'administrateur). Zoé a publié « Le témoin », un projet ouvert à
 * tous les membres : son commentaire sur ce projet est le geste témoin de `poke`.
 */
export const liveCast = async (ctx: TestContext, act: ReturnType<typeof activity>) => {
  const lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.41')
  const nora = await signedUpMember(ctx, act, 'Nora', '203.0.113.42')
  const marc = await signedUpMember(ctx, act, 'Marc', '203.0.113.43')
  const zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.44')
  const louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.45')
  await act.makeAdmin(louis.id)
  later()
  const witness = (await act.publish(zoe.cookie, 'Le témoin')).id
  later()
  return { lea, nora, marc, zoe, louis, witness }
}
export type LiveCast = Awaited<ReturnType<typeof liveCast>>

/**
 * Le geste témoin : Zoé commente son propre projet « Le témoin ». Rend le signal qu'en reçoit qui
 * écoute ce projet. Lu après un geste qui ne doit rien envoyer, il prouve que le flux coule
 * toujours (sinon un test « rien n'arrive » passerait sur un flux mort).
 */
export const poke = async (act: ReturnType<typeof activity>, cast: LiveCast) => {
  later()
  await act.comment(cast.witness, cast.zoe.cookie, 'Témoin.')
  return signal(topic.project(cast.witness), 'comments')
}

/** Un signal attendu, écrit comme le contrat le décrit. */
export const signal = (topicName: string, kind: LiveEvent['kind']): LiveEvent => ({
  topic: topicName,
  kind,
})
