// Tests des hooks des notifications (tranche 6b) : le nombre de la cloche, relu seul chaque minute
// et au retour sur l'appli ; la liste, page par page ; et « vu », qui remet la cloche à zéro.
import type { NotificationPage } from '@ruche/contracts'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import {
  commentNotification,
  notificationPageOf,
  notificationsAsOf,
  reactionsNotification,
} from '../testing/notifications'
import { useMarkSeen, useNotifications, useUnreadCount } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les adresses demandées à l'API par `request`, dans l'ordre. */
const requested = () => jest.mocked(request).mock.calls.map(([path]) => path)

/** L'API répond ce nombre à GET /v1/notifications/unread, et cette page à GET /v1/notifications. */
const apiAnswers = (count: number, pages: Record<string, NotificationPage> = {}) =>
  jest.mocked(request).mockImplementation(async (path: string) => {
    if (path === '/v1/notifications/unread') return { ok: true, data: { count } as never }
    const page = pages[path]
    return page ? { ok: true, data: page as never } : { ok: false, error: 'notFound' }
  })

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset().mockResolvedValue({ ok: true, data: null })
})

afterEach(() => {
  jest.useRealTimers()
  focusManager.setFocused(undefined)
})

describe('useUnreadCount', () => {
  it('gives the number of new groups the API counts', async () => {
    apiAnswers(3)

    const { result } = await renderHook(() => useUnreadCount(), { wrapper })

    await waitFor(() => expect(result.current).toBe(3))
    expect(requested()).toEqual(['/v1/notifications/unread'])
  })

  it('says 0 while the number is on its way, and when it could not be read', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'internal' })

    const { result } = await renderHook(() => useUnreadCount(), { wrapper })

    expect(result.current).toBe(0)
    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toBe(0)
  })

  it('asks nothing when it is turned off (nobody signed in)', async () => {
    apiAnswers(3)

    const { result } = await renderHook(() => useUnreadCount(false), { wrapper })

    expect(request).not.toHaveBeenCalled()
    expect(result.current).toBe(0)
  })

  it('reads the number again by itself every minute', async () => {
    jest.useFakeTimers()
    apiAnswers(1)
    const { result } = await renderHook(() => useUnreadCount(), { wrapper })
    await waitFor(() => expect(result.current).toBe(1))

    apiAnswers(2)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000)
    })
    // Une demi-minute : pas encore.
    expect(request).toHaveBeenCalledTimes(1)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(31_000)
    })

    await waitFor(() => expect(result.current).toBe(2))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reads the number again when the member comes back to the app', async () => {
    jest.useFakeTimers()
    apiAnswers(1)
    const { result } = await renderHook(() => useUnreadCount(), { wrapper })
    await waitFor(() => expect(result.current).toBe(1))

    // L'appli passe en arrière-plan plus d'une minute : rien n'est demandé pendant ce temps…
    await act(async () => {
      focusManager.setFocused(false)
      await jest.advanceTimersByTimeAsync(90_000)
    })
    expect(request).toHaveBeenCalledTimes(1)
    // … puis le membre revient : le nombre est relu.
    apiAnswers(4)
    await act(async () => {
      focusManager.setFocused(true)
      await jest.advanceTimersByTimeAsync(0)
    })

    await waitFor(() => expect(result.current).toBe(4))
  })
})

describe('useNotifications', () => {
  it('reads the first page, then the next one with its cursor', async () => {
    apiAnswers(0, {
      '/v1/notifications': notificationPageOf([reactionsNotification], 'abc'),
      '/v1/notifications?cursor=abc': notificationPageOf([commentNotification]),
    })

    const { result } = await renderHook(() => useNotifications(), { wrapper })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(result.current.data?.pages.flatMap((page) => page.items)).toEqual([
      reactionsNotification,
      commentNotification,
    ])
    expect(result.current.hasNextPage).toBe(false)
    expect(requested()).toEqual(['/v1/notifications', '/v1/notifications?cursor=abc'])
  })

  it('fails like the other lists when the API refuses', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'internal' })

    const { result } = await renderHook(() => useNotifications(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useMarkSeen', () => {
  it('tells the API what has been seen, up to the time it gave', async () => {
    const { result } = await renderHook(() => useMarkSeen(), { wrapper })

    await act(async () => {
      result.current.markSeen(notificationsAsOf)
    })

    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalledTimes(1))
    const [path, init] = jest.mocked(requestWithoutBody).mock.calls[0] ?? []
    expect(path).toBe('/v1/notifications/seen')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ upTo: notificationsAsOf })
  })

  it('puts the bell back to zero at once', async () => {
    apiAnswers(3)
    const { result } = await renderHook(() => ({ count: useUnreadCount(), seen: useMarkSeen() }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.count).toBe(3))
    // L'API répondra désormais 0 : mais la cloche n'attend pas sa réponse.
    jest.mocked(requestWithoutBody).mockReturnValue(new Promise(() => {}))

    await act(async () => {
      result.current.seen.markSeen(notificationsAsOf)
    })

    expect(result.current.count).toBe(0)
  })
})
