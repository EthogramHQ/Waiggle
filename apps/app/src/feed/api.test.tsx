// Tests du hook useFeedNews : combien de nouveautés au-dessus de ce que le membre voit, sans
// jamais toucher au fil affiché. R4 (F-Fil4) : il dit aussi qui les a publiées (3 auteurs au plus,
// chacun une fois) et de quelles sortes elles sont (projets, notes), pour le bouton des
// nouveautés.
//
// Et le hook useMarkFeedRead (R4, « Tu es à jour ») : quand la première page du fil s'affiche, il
// dit à l'API jusqu'où le membre a lu (PUT /v1/feed/read), une fois, avec la date `at` du premier
// élément affiché, jamais l'heure de l'appareil : la base garde jusqu'où il a lu, pas quand il
// était là (relecture juridique J3).
import type { FeedItem, ProjectSummary } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { useFeedNews, useMarkFeedRead } from './api'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const summary: ProjectSummary = {
  id: '00000000-0000-4000-8000-000000000000',
  author: { id: 'u1', name: 'Léa', avatarUrl: null },
  title: 'Mon agent de recettes',
  pitch: 'Un menu avec ce qu’il y a au frigo.',
  status: 'idea',
  visibility: 'public',
  tools: [],
  cover: null,
  demoUrl: null,
  portraitCover: null,
  primaryCategory: null,
  secondaryCategory: null,
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
  reactionTotal: 0,
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
    data: { items, nextCursor, followsAnyone: true, lastReadAt: null },
  })

/**
 * Le fil affiché, chargé il y a deux minutes : la vérification des nouveautés part de lui, et le
 * relit puisqu'il a plus d'une minute.
 */
const shown = (kind: 'following' | 'discover', testers: boolean, items: FeedItem[]) =>
  client.setQueryData(
    ['feed', kind, testers],
    {
      pages: [{ items, nextCursor: null, followsAnyone: true, lastReadAt: null }],
      pageParams: [undefined],
    },
    { updatedAt: Date.now() - 120_000 },
  )

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
  jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
})

/** Un auteur du fil. */
const author = (id: string, name: string) => ({ id, name, avatarUrl: null })
const nora = author('u2', 'Nora')
const sam = author('u3', 'Sam')
const max = author('u4', 'Max')
const ines = author('u5', 'Inès')

/** Un projet publié à l'heure donnée, par cet auteur. */
const projectBy = (n: number, hour: string, by: ProjectSummary['author']): FeedItem => ({
  kind: 'project',
  at: `2026-10-19T${hour}:00:00.000Z`,
  project: { ...summary, id: `00000000-0000-4000-8000-00000000010${n}`, author: by },
})

/** Une note publiée à l'heure donnée, sur un projet de cet auteur. */
const noteBy = (n: number, hour: string, by: ProjectSummary['author']): FeedItem => ({
  kind: 'note',
  at: `2026-10-19T${hour}:00:00.000Z`,
  note: {
    id: `00000000-0000-4000-8000-00000000020${n}`,
    body: 'Nouvelle version en ligne.',
    createdAt: `2026-10-19T${hour}:00:00.000Z`,
    removal: null,
  },
  project: { ...summary, id: `00000000-0000-4000-8000-00000000030${n}`, author: by },
})

describe('useFeedNews, who and what is new (R4)', () => {
  it('gives the authors of the news, at most 3, each once, the latest first', async () => {
    const first = item(1, '09')
    shown('following', false, [first])
    // Cinq nouveautés de quatre auteurs : Nora deux fois.
    headIs([
      projectBy(5, '15', nora),
      projectBy(4, '14', sam),
      noteBy(3, '13', nora),
      projectBy(2, '12', max),
      projectBy(1, '11', ines),
      first,
    ])

    const { result } = await renderHook(() => useFeedNews('following', first), { wrapper })

    await waitFor(() => expect(result.current.count).toBe(5))
    expect(result.current.authors.map((who) => who.name)).toEqual(['Nora', 'Sam', 'Max'])
  })

  it('never names the author of an item already shown', async () => {
    const first = projectBy(1, '09', ines)
    shown('following', false, [first])
    headIs([projectBy(2, '10', nora), first])

    const { result } = await renderHook(() => useFeedNews('following', first), { wrapper })

    await waitFor(() => expect(result.current.count).toBe(1))
    expect(result.current.authors.map((who) => who.id)).toEqual([nora.id])
  })

  it('says projects only when only projects arrived', async () => {
    shown('following', false, [item(1, '09')])
    headIs([projectBy(3, '11', nora), projectBy(2, '10', sam), item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current.count).toBe(2))
    expect(result.current.kinds).toEqual(['project'])
  })

  it('says notes only when only notes arrived', async () => {
    shown('following', false, [item(1, '09')])
    headIs([noteBy(2, '10', nora), item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current.count).toBe(1))
    expect(result.current.kinds).toEqual(['note'])
  })

  it('gives both kinds, each once, when projects and notes arrived', async () => {
    shown('following', false, [item(1, '09')])
    headIs([noteBy(4, '12', nora), projectBy(3, '11', sam), noteBy(2, '10', sam), item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current.count).toBe(3))
    expect([...result.current.kinds].sort()).toEqual(['note', 'project'])
  })

  it('names no one and no kind when nothing is new', async () => {
    shown('following', false, [item(1, '09')])
    headIs([item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toEqual({ count: null, more: false, authors: [], kinds: [] })
  })
})

/** Les PUT /v1/feed/read envoyés, quelle que soit la fonction du client qui les porte. */
const feedReads = () =>
  [...jest.mocked(request).mock.calls, ...jest.mocked(requestWithoutBody).mock.calls]
    .filter(([path]) => path === '/v1/feed/read')
    .map(([, init]) => ({ method: init?.method, body: JSON.parse(String(init?.body)) }))

/** Ce que le fil affiche en premier, passé au hook (rien tant que la page n'est pas là). */
type Shown = { first: FeedItem | undefined }

describe('useMarkFeedRead (R4)', () => {
  // L'horloge de l'appareil, loin des dates du fil : si le hook la lisait, le test le verrait.
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-31T18:42:00.000Z') }))
  afterEach(() => jest.useRealTimers())

  it('waits for the first page: nothing is sent before an item is shown', async () => {
    await renderHook(() => useMarkFeedRead(undefined), { wrapper })

    expect(feedReads()).toEqual([])
  })

  it('sends PUT /v1/feed/read with the date of the first item, never the time of the device', async () => {
    const first = noteBy(1, '09', nora)
    await renderHook(() => useMarkFeedRead(first), { wrapper })

    await waitFor(() => expect(feedReads()).toHaveLength(1))
    expect(feedReads()[0]).toEqual({ method: 'PUT', body: { upTo: first.at } })
  })

  it('sends it once, however often the feed is drawn again', async () => {
    const { rerender } = await renderHook(({ first }: Shown) => useMarkFeedRead(first), {
      wrapper,
      initialProps: { first: undefined },
    })

    await rerender({ first: item(1, '09') })
    // Le même élément, relu (un nouvel objet, le même contenu).
    await rerender({ first: item(1, '09') })
    await rerender({ first: item(1, '09') })

    await waitFor(() => expect(feedReads()).toHaveLength(1))
    expect(feedReads()).toEqual([{ method: 'PUT', body: { upTo: item(1, '09').at } }])
  })

  it('moves on when newer items come at the top, after « nouveautés »', async () => {
    const { rerender } = await renderHook(({ first }: Shown) => useMarkFeedRead(first), {
      wrapper,
      initialProps: { first: item(1, '09') },
    })
    await waitFor(() => expect(feedReads()).toHaveLength(1))

    await rerender({ first: projectBy(2, '11', nora) })

    await waitFor(() => expect(feedReads()).toHaveLength(2))
    expect(feedReads()[1]).toEqual({ method: 'PUT', body: { upTo: '2026-10-19T11:00:00.000Z' } })
  })
})

describe('useFeedNews', () => {
  it('counts the items published above the first one shown', async () => {
    shown('following', false, [item(1, '09')])
    headIs([item(3, '11'), item(2, '10'), item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current).toMatchObject({ count: 2, more: false }))
  })

  it('finds nothing new when the first item shown is still at the top', async () => {
    shown('following', false, [item(1, '09')])
    headIs([item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toMatchObject({ count: null, more: false })
  })

  it('does not take a vanished first item (gone private) for a pile of news', async () => {
    // Le premier élément affiché a disparu du haut du fil ; rien n'est plus récent que lui.
    shown('following', false, [item(1, '09')])
    headIs([item(2, '08')])

    const { result } = await renderHook(() => useFeedNews('following', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toMatchObject({ count: null, more: false })
  })

  it('says « more » when a whole page of news waits, with more after it', async () => {
    const page = Array.from({ length: 20 }, (_, n) => ({
      ...item(0, '12'),
      project: {
        ...summary,
        id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
      },
    }))
    shown('discover', false, [item(1, '09')])
    headIs(page, 'next')

    const { result } = await renderHook(() => useFeedNews('discover', item(1, '09')), {
      wrapper,
    })

    await waitFor(() => expect(result.current).toMatchObject({ count: 20, more: true }))
  })

  it('waits for the feed shown before checking for news: no request twice at first', async () => {
    headIs([item(1, '09')])

    const { result } = await renderHook(() => useFeedNews('following', undefined), { wrapper })

    expect(request).not.toHaveBeenCalled()
    expect(result.current).toMatchObject({ count: null, more: false })
  })

  it('reads the page of the chosen feed, with the testers filter', async () => {
    shown('discover', true, [])
    headIs([])

    await renderHook(() => useFeedNews('discover', undefined, true), { wrapper })

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/v1/feed/discover?testers=true', {}, expect.anything()),
    )
  })
})
