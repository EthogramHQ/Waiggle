// Tests du repli du temps réel (R21, choix 10 du plan) : sans flux, l'appli relit toutes les minutes
// comme avant R21 ; tant que le flux couvre le membre, ces relectures se taisent. La cloche est
// essayée avec la vraie connexion (connection.test.tsx) ; ici, le magasin lui-même et la tête du Fil
// (`useFeedNews`), la deuxième des trois lectures du repli.
import type { FeedItem, ProjectSummary } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { useFeedNews } from '../feed/api'
import { setLiveCovers, useLiveFallback } from './fallback'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const summary = {
  id: '00000000-0000-4000-8000-000000000001',
  author: { id: 'u2', name: 'Nora', avatarUrl: null },
} as unknown as ProjectSummary
const first: FeedItem = { kind: 'project', at: '2026-10-19T09:00:00.000Z', project: summary }

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Laisse passer `ms` millisecondes de fausse horloge, promesses comprises. */
const wait = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

/** Le Fil affiché, lu il y a deux minutes, et sa tête telle que l'API la rend. */
const feedShown = () => {
  const page = { items: [first], nextCursor: null, followsAnyone: true, lastReadAt: null }
  client.setQueryData(
    ['feed', 'following', false],
    { pages: [page], pageParams: [undefined] },
    { updatedAt: Date.now() - 120_000 },
  )
  jest.mocked(request).mockResolvedValue({ ok: true, data: page })
}

beforeEach(() => {
  jest.useFakeTimers()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset()
})

afterEach(async () => {
  await act(async () => setLiveCovers(false))
  jest.useRealTimers()
})

describe('useLiveFallback', () => {
  it('asks for the one-minute rereads while no stream covers the member', async () => {
    const { result } = await renderHook(() => useLiveFallback())
    expect(result.current).toBe(true)

    await act(async () => setLiveCovers(true))
    expect(result.current).toBe(false)

    await act(async () => setLiveCovers(false))
    expect(result.current).toBe(true)
  })
})

describe('the head of the feed', () => {
  it('rereads every minute without the stream', async () => {
    feedShown()
    await renderHook(() => useFeedNews('following', first), { wrapper })
    await wait(0)
    const before = jest.mocked(request).mock.calls.length

    await wait(61_000)

    expect(jest.mocked(request).mock.calls.length).toBeGreaterThan(before)
  })

  it('waits for the signals while the stream is open', async () => {
    feedShown()
    await act(async () => setLiveCovers(true))
    await renderHook(() => useFeedNews('following', first), { wrapper })
    await wait(0)
    const before = jest.mocked(request).mock.calls.length

    await wait(180_000)

    expect(jest.mocked(request).mock.calls.length).toBe(before)
  })
})
