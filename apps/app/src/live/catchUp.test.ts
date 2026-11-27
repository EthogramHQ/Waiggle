// Tests du rattrapage d'une (re)connexion du temps réel (R21, choix 10 du plan ; `catchUpFor` de
// src/live/invalidations.ts) : ce qu'une coupure a pu faire manquer sur les sujets écoutés, et
// l'Activité, se relit une seule fois par lecture, sans toucher les autres pages ; les files qui ne
// bougent pas sous le doigt restent à leur place.
import { QueryClient, type QueryKey, QueryObserver } from '@tanstack/react-query'
import { commentsQueryKey } from '../comments/api'
import { listKey, unreadKey } from '../notifications/api'
import { projectQueryKey } from '../projects/hooks'
import { catchUpFor } from './invalidations'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const P = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const Q = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

let client: QueryClient
const stops: (() => void)[] = []

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  })
})

afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  client.clear()
})

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

/** Une lecture suivie par un écran ouvert ; rend le nombre de fois où elle a été refaite. */
const watch = async (queryKey: QueryKey) => {
  const read = jest.fn(async () => ({ at: Date.now() }))
  const observer = new QueryObserver(client, { queryKey, queryFn: read })
  stops.push(observer.subscribe(() => {}))
  await settle()
  return () => read.mock.calls.length - 1
}

describe('the catch-up after a (re)connection', () => {
  it('rereads each read of the listened topics and the bell once, nothing else', async () => {
    const comments = await watch(commentsQueryKey(P))
    const page = await watch(projectQueryKey(P))
    const bell = await watch(unreadKey)
    const other = await watch(projectQueryKey(Q))

    for (const filters of catchUpFor([`project:${P}`])) void client.invalidateQueries(filters)
    await settle()

    // La page du projet répond à plusieurs sortes (commentaires, réactions…) : relue une fois.
    expect(comments()).toBe(1)
    expect(page()).toBe(1)
    expect(bell()).toBe(1)
    expect(other()).toBe(0)
  })

  it('keeps the open Activity list in place, only marked stale', async () => {
    const list = await watch(listKey)

    for (const filters of catchUpFor([])) void client.invalidateQueries(filters)
    await settle()

    expect(list()).toBe(0)
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true)
  })
})
