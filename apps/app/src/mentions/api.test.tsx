// Tests du hook des suggestions après « @ » (tranche 6b) : il attend que le membre s'arrête de
// taper (250 ms) avant de demander, ne demande rien sous 2 caractères, et abandonne une demande
// devenue inutile quand le texte change.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { inesMember, inikoMember } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { useMentionable } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn() }))

const projectId = recipesProject.id
const pathFor = (q: string) => `/v1/members/mentionable?q=${q}&projectId=${projectId}`

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les adresses demandées à l'API, dans l'ordre. */
const requested = () => jest.mocked(request).mock.calls.map(([path]) => path)

/** Laisse passer le temps (minuteries simulées), et les réponses arriver. */
const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  jest.useFakeTimers()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest
    .mocked(request)
    .mockReset()
    .mockResolvedValue({ ok: true, data: { members: [inesMember, inikoMember] } as never })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useMentionable', () => {
  it('asks the API for the members whose handle starts so, on this project', async () => {
    const { result } = await renderHook(() => useMentionable(projectId, 'in'), { wrapper })
    await wait(250)

    await waitFor(() => expect(result.current).toEqual([inesMember, inikoMember]))
    expect(requested()).toEqual([pathFor('in')])
  })

  it('asks nothing without a search, or under 2 characters', async () => {
    const { result, rerender } = await renderHook(
      ({ query }: { query: string | null }) => useMentionable(projectId, query),
      { wrapper, initialProps: { query: null as string | null } },
    )
    await wait(1000)
    await rerender({ query: 'i' })
    await wait(1000)

    expect(request).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it('waits 250 ms after the last letter before asking', async () => {
    const { rerender } = await renderHook(
      ({ query }: { query: string }) => useMentionable(projectId, query),
      { wrapper, initialProps: { query: 'in' } },
    )
    await wait(100)
    await rerender({ query: 'ine' })
    await wait(100)
    await rerender({ query: 'ines' })
    await wait(200)
    // Toujours en train de taper : rien n'est encore parti.
    expect(request).not.toHaveBeenCalled()

    await wait(60)

    await waitFor(() => expect(requested()).toEqual([pathFor('ines')]))
  })

  it('gives up the request in flight when the text changes', async () => {
    // La première demande ne répond jamais : elle doit être abandonnée.
    jest.mocked(request).mockReturnValueOnce(new Promise(() => {}))
    const { rerender } = await renderHook(
      ({ query }: { query: string }) => useMentionable(projectId, query),
      { wrapper, initialProps: { query: 'in' } },
    )
    await wait(250)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    const signal = jest.mocked(request).mock.calls[0]?.[1]?.signal

    await rerender({ query: 'ine' })
    await wait(250)

    expect(signal?.aborted).toBe(true)
    await waitFor(() => expect(requested()).toEqual([pathFor('in'), pathFor('ine')]))
  })

  it('proposes nobody when the API refuses', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => useMentionable(projectId, 'in'), { wrapper })
    await wait(250)

    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })
})
