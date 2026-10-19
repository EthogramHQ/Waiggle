// Tests du hook useFeedNews : combien de nouveautés au-dessus de ce que le membre voit, sans
// jamais toucher au fil affiché.
import type { FeedItem, ProjectSummary } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { useFeedNews } from './api'

jest.mock('../api/client', () => ({ request: jest.fn() }))

const summary: ProjectSummary = {
  id: '00000000-0000-4000-8000-000000000000',
  author: { id: 'u1', name: 'Léa', avatarUrl: null },
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  status: 'idea',
  visibility: 'public',
  tools: [],
  cover: null,
  portraitCover: null,
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
}

/** Un élément du fil, publié à l'heure donnée (« 09 » : 9 h). */
const item = (n: number, hour: string): FeedItem => ({
  kind: 'project',
  at: `2026-10-19T${hour}:00:00.000Z`,
  project: { ...summary, id: `00000000-0000-4000-8000-00000000000${n}` },
})

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** La première page relue par le hook : ces éléments, et peut-être une suite. */
const headIs = (items: FeedItem[], nextCursor: string | null = null) =>
  jest.mocked(request).mockResolvedValue({
    ok: true,
    data: { items, nextCursor, followsAnyone: true },
  })

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset()
})

describe('useFeedNews', () => {
  it('counts the items published above the first one shown', async () => {
    headIs([item(3, '11'), item(2, '10'), item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current).toEqual({ count: 2, more: false }))
  })

  it('finds nothing new when the first item shown is still at the top', async () => {
    headIs([item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toEqual({ count: null, more: false })
  })

  it('does not take a vanished first item (gone private) for a pile of news', async () => {
    // Le premier élément affiché a disparu du haut du fil ; rien n'est plus récent que lui.
    headIs([item(2, '08')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toEqual({ count: null, more: false })
  })

  it('says « more » when a whole page of news waits, with more after it', async () => {
    const page = Array.from({ length: 20 }, (_, n) => ({
      ...item(0, '12'),
      project: {
        ...summary,
        id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      },
    }))
    headIs(page, 'next')

    const { result } = await renderHook(() => useFeedNews('discover', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current).toEqual({ count: 20, more: true }))
  })

  it('reads the page of the chosen feed, with the testers filter', async () => {
    headIs([])

    await renderHook(() => useFeedNews('discover', undefined, true), { wrapper })

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/v1/feed/discover?testers=true', {}, expect.anything()),
    )
  })
})
