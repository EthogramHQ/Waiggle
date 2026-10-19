// Tests du hook useFollow : le bouton change tout de suite (mise à jour optimiste), l'API reçoit
// les demandes dans l'ordre, et un refus remet la page comme avant.
import type { FollowState } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { requestWithoutBody } from '../api/client'
import { useFollow } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ requestWithoutBody: jest.fn() }))

const lea = { kind: 'member' as const, id: 'u1' }
let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** La page de Léa en cache, telle que l'écran l'affiche. */
const page = () => client.getQueryData<FollowState>(['member', 'u1'])

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  // staleTime infini : la page en cache ne se relit pas pendant le test (aucune vraie API ici).
  client.setQueryDefaults(['member', 'u1'], { staleTime: Infinity })
  client.setQueryData(['member', 'u1'], { isFollowed: false, followerCount: 2 })
  jest.mocked(requestWithoutBody).mockReset().mockResolvedValue({ ok: true, data: null })
})

describe('useFollow', () => {
  it('follows at once, before the API even answers, and counts one more follower', async () => {
    const { result } = await renderHook(() => useFollow(lea), { wrapper })

    await act(async () => result.current.toggle())

    expect(page()).toEqual({ isFollowed: true, followerCount: 3 })
    await waitFor(() =>
      expect(requestWithoutBody).toHaveBeenCalledWith('/v1/members/u1/follow', { method: 'POST' }),
    )
  })

  it('sends a quick double touch as « follow » then « unfollow », in that order', async () => {
    const { result } = await renderHook(() => useFollow(lea), { wrapper })

    await act(async () => {
      result.current.toggle()
      result.current.toggle()
    })

    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalledTimes(2))
    expect(jest.mocked(requestWithoutBody).mock.calls.map(([, init]) => init.method)).toEqual([
      'POST',
      'DELETE',
    ])
    expect(page()).toMatchObject({ isFollowed: false, followerCount: 2 })
  })

  it('puts the page back as it was, and says so, when the API refuses', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => useFollow(lea), { wrapper })

    await act(async () => result.current.toggle())

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(page()).toEqual({ isFollowed: false, followerCount: 2 })
  })

  it('follows a project at its own address', async () => {
    const id = '0192abcd-ef01-7c2d-9e3f-a1b2c3d4e5f6'
    client.setQueryData(['project', id], { isFollowed: true, followerCount: 1 })
    const { result } = await renderHook(() => useFollow({ kind: 'project', id }), { wrapper })

    await act(async () => result.current.toggle())

    await waitFor(() =>
      expect(requestWithoutBody).toHaveBeenCalledWith(`/v1/projects/${id}/follow`, {
        method: 'DELETE',
      }),
    )
  })
})
