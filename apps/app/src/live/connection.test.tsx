// Tests de la connexion du temps réel (R21, choix 9 et 10 du plan) : un seul flux par appareil,
// `GET /v1/live`, ouvert quand le membre est connecté, la page hydratée et l'appli au premier plan ;
// fermé en arrière-plan. Les écrans déclarent ce qu'ils regardent (`useLiveTopic`), et la connexion
// envoie la liste au serveur, regroupée sur 300 ms (`PUT /v1/live/<connexion>/topics`). À chaque
// (re)connexion, elle fait relire une fois tout ce qu'elle écoute, et l'Activité : c'est
// « rattraper en une fois » ce qu'une coupure a fait manquer.
//
// Deux cas où le flux n'est pas là :
// - `replaced` : le membre a ouvert un sixième flux ailleurs, celui-ci est fermé par le serveur ;
//   il ne se rouvre qu'au retour au premier plan (sinon deux appareils se fermeraient en boucle) ;
// - trois échecs de suite (réseau d'entreprise, coupure longue) : l'appli relit comme avant R21,
//   toutes les minutes (le « repli »). Tant que le flux est ouvert, ces relectures se taisent.
//
// L'interface attendue (src/live/) :
//   useLiveConnection(): void       monté une fois, dans la mise en page des membres ; « connecté »
//                                   = `useSession()` a une session ; « hydraté » = `useHydrated()` ;
//                                   « premier plan » = `focusManager` de React Query ; le cache est
//                                   celui du `QueryClientProvider` (`useQueryClient()`) ;
//   useLiveTopic(topic | null): void  (topics.ts) un écran déclare un sujet tant qu'il est monté.
// Le flux est lu par `fetch` en flux (`expo/fetch` sur téléphone) : ici, un faux `fetch` qui rend
// un `ReadableStream` que le test remplit.
import { LIVE_EVENT_NAMES } from '@ruche/contracts'
import { focusManager, useQuery } from '@tanstack/react-query'
import { act } from '@testing-library/react-native'
import { commentsQueryKey } from '../comments/api'
import { useUnreadCount } from '../notifications/api'
import { mockSession, renderWithProviders } from '../testing/render'
import { useLiveConnection } from './connection'
import { useLiveTopic } from './topics'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Sur téléphone, le flux passe par `expo/fetch` (le `fetch` de React Native ne lit pas un flux) :
// ici, il renvoie au même faux `fetch` que le web.
jest.mock('expo/fetch', () => ({
  fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
}))
// « Hydraté » : choisi par chaque test (sur le web, rien ne part avant l'hydratation).
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
  isHydrated: () => mockHydrated,
}))

const P = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const ids = [
  '3f2b6c1a-8d4e-4f5a-9b6c-7d8e9f0a1b2c',
  '4a3c7d2b-9e5f-4a6b-8c7d-8e9f0a1b2c3d',
  '5b4d8e3c-0f6a-4b7c-9d8e-9f0a1b2c3d4e',
]

// --- Le faux serveur ---------------------------------------------------------------------------

type Stream = {
  /** Écrit du texte dans le flux, comme le serveur. */
  push: (text: string) => void
  /** Le serveur termine le flux (arrêt, `replaced`). */
  end: () => void
  /** Vrai une fois que l'appli a fermé le flux (abandon de la requête ou lecture annulée). */
  closed: () => boolean
}

let streams: Stream[] = []
/** Ce que rend la prochaine ouverture du flux : un flux, ou une panne de réseau. */
let liveAnswers: ('stream' | 'fail')[] = []
let puts: { connectionId: string; topics: string[] }[] = []
let unreadReads = 0

const encoder = new TextEncoder()

const openStream = (init: RequestInit | undefined): Response => {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cancelled = false
  let ended = false
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    },
    cancel: () => {
      cancelled = true
    },
  })
  const signal = init?.signal ?? null
  signal?.addEventListener('abort', () => {
    if (ended) return
    ended = true
    controller.error(new Error('aborted'))
  })
  streams.push({
    push: (text) => controller.enqueue(encoder.encode(text)),
    end: () => {
      if (ended) return
      ended = true
      controller.close()
    },
    closed: () => cancelled || Boolean(signal?.aborted),
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const urlOf = (input: Parameters<typeof fetch>[0]) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const fakeFetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = urlOf(input)
  const method = init?.method ?? 'GET'
  if (/\/v1\/live$/.test(url) && method === 'GET') {
    const answer = liveAnswers.shift() ?? 'stream'
    if (answer === 'fail') throw new TypeError('Network request failed')
    return openStream(init)
  }
  const declared = /\/v1\/live\/([^/]+)\/topics$/.exec(url)
  if (declared && method === 'PUT') {
    const body = JSON.parse(String(init?.body)) as { topics: string[] }
    puts.push({ connectionId: decodeURIComponent(declared[1] ?? ''), topics: body.topics })
    return new Response(null, { status: 204 })
  }
  if (url.endsWith('/v1/notifications/unread')) {
    unreadReads += 1
    return Response.json({ count: 0 })
  }
  throw new TypeError('Network request failed')
}

const liveOpens = () =>
  jest
    .mocked(globalThis.fetch)
    .mock.calls.filter(
      ([input, init]) => /\/v1\/live$/.test(urlOf(input)) && (init?.method ?? 'GET') === 'GET',
    ).length

const helloOf = (connectionId: string) =>
  `event: ${LIVE_EVENT_NAMES.hello}\ndata: ${JSON.stringify({ connectionId })}\n\n`
const signalOf = (topic: string, kind: string) =>
  `event: ${LIVE_EVENT_NAMES.signal}\ndata: ${JSON.stringify({ topic, kind })}\n\n`

/** Laisse passer `ms` millisecondes de fausse horloge, promesses comprises. */
const wait = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

/** Attend (30 s au plus de fausse horloge, seconde par seconde) que le flux soit ouvert `count` fois. */
const untilOpened = async (count: number) => {
  for (let second = 0; second <= 31 && liveOpens() < count; second++) await wait(1000)
  expect(liveOpens()).toBe(count)
}

/** Le serveur écrit dans le dernier flux ouvert, puis l'appli lit. */
const say = async (text: string) => {
  await act(async () => {
    streams.at(-1)?.push(text)
  })
  await wait(0)
}

/** Passe l'appli en arrière-plan, ou la ramène au premier plan. */
const foreground = async (focused: boolean) => {
  await act(async () => {
    focusManager.setFocused(focused)
  })
  await wait(0)
}

// --- Ce que montre l'écran de test --------------------------------------------------------------

let commentReads = 0

/** Un écran ouvert sur la page du projet P : il écoute `project:P` et lit ses commentaires. */
function ProjectPageProbe() {
  useLiveTopic(`project:${P}`)
  useQuery({
    queryKey: commentsQueryKey(P),
    queryFn: async () => {
      commentReads += 1
      return { pages: [], pageParams: [] }
    },
    staleTime: Infinity,
  })
  return null
}

/** Un écran qui déclare les sujets qu'on lui donne (un composant par sujet, comme des écrans). */
function TopicProbe({ topic }: { topic: string }) {
  useLiveTopic(topic as `project:${string}`)
  return null
}

/** La mise en page des membres : la connexion, la cloche, et les écrans ouverts. */
function Layout({ topics = [], project = false }: { topics?: string[]; project?: boolean }) {
  useLiveConnection()
  useUnreadCount()
  return (
    <>
      {project ? <ProjectPageProbe /> : null}
      {topics.map((topic) => (
        <TopicProbe key={topic} topic={topic} />
      ))}
    </>
  )
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
  streams = []
  liveAnswers = []
  puts = []
  unreadReads = 0
  commentReads = 0
  mockHydrated = true
  mockSession({ user: { id: 'lea', name: 'Léa' } })
  jest.mocked(globalThis.fetch).mockReset().mockImplementation(fakeFetch)
  focusManager.setFocused(true)
})

afterEach(() => {
  focusManager.setFocused(undefined)
  jest.useRealTimers()
  jest.mocked(globalThis.fetch).mockReset()
})

// --- Quand le flux s'ouvre et se ferme ---------------------------------------------------------

describe('when the live stream opens', () => {
  it('opens one stream for a signed-in member, hydrated and in the foreground', async () => {
    await renderWithProviders(<Layout />)
    await wait(100)

    expect(liveOpens()).toBe(1)
  })

  it('opens nothing for a visitor', async () => {
    mockSession(null)
    const { rerender } = await renderWithProviders(<Layout />)
    await wait(5000)
    expect(liveOpens()).toBe(0)

    // Témoin : Léa se connecte, le flux s'ouvre.
    mockSession({ user: { id: 'lea', name: 'Léa' } })
    await rerender(<Layout topics={[]} />)
    await wait(100)
    expect(liveOpens()).toBe(1)
  })

  it('waits for the page to be hydrated', async () => {
    mockHydrated = false
    const { rerender } = await renderWithProviders(<Layout />)
    await wait(5000)
    expect(liveOpens()).toBe(0)

    mockHydrated = true
    await rerender(<Layout topics={[]} />)
    await wait(100)

    expect(liveOpens()).toBe(1)
  })

  it('waits for the app to come to the foreground', async () => {
    focusManager.setFocused(false)
    await renderWithProviders(<Layout />)
    await wait(5000)
    expect(liveOpens()).toBe(0)

    await foreground(true)
    await wait(100)

    expect(liveOpens()).toBe(1)
  })

  it('closes the stream in the background, and opens a new one on return', async () => {
    await renderWithProviders(<Layout />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))

    await foreground(false)
    expect(streams[0]?.closed()).toBe(true)
    // En arrière-plan, rien ne se rouvre, même longtemps après.
    await wait(120_000)
    expect(liveOpens()).toBe(1)

    await foreground(true)
    await untilOpened(2)
  })

  it('closes the stream when the layout goes away', async () => {
    const { unmount } = await renderWithProviders(<Layout />)
    await untilOpened(1)

    await act(async () => {
      unmount()
    })

    expect(streams[0]?.closed()).toBe(true)
  })
})

// --- Les sujets des écrans ---------------------------------------------------------------------

describe('the topics the screens listen to', () => {
  const nora = 'member:nora'
  const project = `project:${P}`

  it('declares the topics of the open screens once, grouped over 300 ms', async () => {
    const { rerender } = await renderWithProviders(<Layout />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))
    await wait(300)
    const before = puts.length

    await rerender(<Layout topics={[project, nora]} />)
    await wait(299)
    expect(puts.length).toBe(before)
    await wait(1)

    expect(puts.slice(before)).toEqual([
      { connectionId: ids[0], topics: expect.arrayContaining([project, nora]) },
    ])
    expect(puts.at(-1)?.topics).toHaveLength(2)
  })

  it('sends the topics declared before the hello once the connection id is known', async () => {
    await renderWithProviders(<Layout topics={[project]} />)
    await untilOpened(1)
    await wait(1000)
    // Sans identifiant de connexion, rien ne peut partir.
    expect(puts).toEqual([])

    await say(helloOf(ids[0] as string))
    await wait(300)

    expect(puts).toEqual([{ connectionId: ids[0], topics: [project] }])
  })

  it('drops the topic of a screen that closes', async () => {
    const { rerender } = await renderWithProviders(<Layout topics={[project, nora]} />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))
    await wait(300)

    await rerender(<Layout topics={[nora]} />)
    await wait(300)

    expect(puts.at(-1)).toEqual({ connectionId: ids[0], topics: [nora] })
  })

  it('declares the topics again on the new connection after a reconnection', async () => {
    await renderWithProviders(<Layout topics={[project]} />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))
    await wait(300)

    await act(async () => streams[0]?.end())
    await untilOpened(2)
    await say(helloOf(ids[1] as string))
    await wait(300)

    expect(puts.at(-1)).toEqual({ connectionId: ids[1], topics: [project] })
  })
})

// --- Les signaux et le rattrapage --------------------------------------------------------------

describe('signals and catching up', () => {
  it('rereads the comments of the open project when a signal says they changed', async () => {
    await renderWithProviders(<Layout project />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))
    await wait(300)
    const before = commentReads

    await say(signalOf(`project:${P}`, 'comments'))

    expect(commentReads).toBe(before + 1)
  })

  it('catches up once on reconnection: what it listens to, and the Activity', async () => {
    await renderWithProviders(<Layout project />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))
    await wait(300)

    // Le métro : le flux coupe, l'appli se reconnecte toute seule.
    await act(async () => streams[0]?.end())
    await untilOpened(2)
    const comments = commentReads
    const bell = unreadReads

    await say(helloOf(ids[1] as string))
    await wait(1000)

    // Une seule relecture de chaque, pas une par sujet ni une par message.
    expect(commentReads).toBe(comments + 1)
    expect(unreadReads).toBe(bell + 1)
  })

  it('reconnects by itself after the server ends the stream (a restart)', async () => {
    await renderWithProviders(<Layout />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))

    await act(async () => streams[0]?.end())

    // Après 1 s, puis de plus en plus tard, jusqu'à 30 s au plus : le premier essai vient vite.
    await untilOpened(2)
  })
})

// --- Remplacé par un sixième flux ---------------------------------------------------------------

describe('a stream replaced by a sixth one elsewhere', () => {
  it('does not reconnect until the app comes back to the foreground', async () => {
    await renderWithProviders(<Layout />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))

    await say(`event: ${LIVE_EVENT_NAMES.replaced}\ndata: {}\n\n`)
    await act(async () => streams[0]?.end())
    await wait(120_000)
    expect(liveOpens()).toBe(1)

    await foreground(false)
    await foreground(true)

    await untilOpened(2)
  })
})

// --- Le repli : relire toutes les minutes ------------------------------------------------------

describe('the fallback when the stream cannot be opened', () => {
  it('stops the one-minute rereads of the bell while the stream is open', async () => {
    await renderWithProviders(<Layout />)
    await untilOpened(1)
    await say(helloOf(ids[0] as string))
    await wait(1000)
    const before = unreadReads

    // Deux minutes de flux ouvert, avec ses battements : la cloche attend les signaux.
    for (let beat = 0; beat < 6; beat++) {
      await wait(20_000)
      await say(': ping\n\n')
    }

    expect(liveOpens()).toBe(1)
    expect(unreadReads).toBe(before)
  })

  it('rereads the bell every minute after three failed openings in a row', async () => {
    liveAnswers = ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail']
    await renderWithProviders(<Layout />)
    await untilOpened(1)
    await untilOpened(2)
    await untilOpened(3)
    await wait(0)
    const before = unreadReads

    await wait(61_000)

    expect(unreadReads).toBeGreaterThan(before)
  })

  it('goes quiet again once the stream finally opens', async () => {
    liveAnswers = ['fail', 'fail', 'fail']
    await renderWithProviders(<Layout />)
    await untilOpened(1)
    await untilOpened(2)
    await untilOpened(3)
    // Le quatrième essai réussit.
    await untilOpened(4)
    await say(helloOf(ids[2] as string))
    await wait(1000)
    const before = unreadReads

    for (let beat = 0; beat < 6; beat++) {
      await wait(20_000)
      await say(': ping\n\n')
    }

    expect(unreadReads).toBe(before)
  })
})
