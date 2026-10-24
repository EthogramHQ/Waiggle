// Tests des hooks du blocage (tranche 7b) : bloquer et débloquer passent par la bonne adresse, et
// une fois faits, tout ce que le blocage change à l'écran se relit (la page du membre, le fil, les
// commentaires, les projets, les notifications, la liste « Membres bloqués »). La liste se lit page
// par page.
//
// L'interface attendue de `src/blocks/api.ts` (écrit par ui-dev, modèle : follows/api.ts) :
// - `useBlock()` → `{ block(memberId): Promise<ApiResult<null>> }` (PUT /v1/members/{id}/block) ;
// - `useUnblock()` → `{ unblock(memberId): Promise<ApiResult<null>> }` (DELETE, même adresse) ;
// - `useBlockedMembers()` : useInfiniteQuery des pages `BlockedPage` (GET /v1/me/blocks).
import { BlockedPage } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { blockedInes, blockedPageOf, blockedSam } from '../testing/blocks'
import { useBlock, useBlockedMembers, useUnblock } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

// Ce que le blocage change, dans le cache de React Query : chaque clé est posée avant le geste, puis
// on regarde si elle a été marquée « à relire » (invalidée).
const touchedKeys = {
  member: ['member', 'u5'],
  feed: ['feed'],
  comments: ['comments', '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'],
  project: ['project', '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'],
  notifications: ['notifications'],
  blocks: ['blocks'],
} as const

/** Les clés qui ont été marquées « à relire », parmi celles de `touchedKeys`. */
const invalidated = () =>
  Object.entries(touchedKeys)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  for (const key of Object.values(touchedKeys)) {
    // staleTime infini : rien ne se relit tout seul pendant le test (aucune vraie API ici).
    client.setQueryDefaults(key, { staleTime: Infinity })
    client.setQueryData(key, {})
  }
  jest.mocked(requestWithoutBody).mockReset().mockResolvedValue({ ok: true, data: null })
  jest.mocked(request).mockReset().mockResolvedValue({ ok: true, data: blockedPageOf() })
})

describe('useBlock', () => {
  it('blocks a member at her own address', async () => {
    const { result } = await renderHook(() => useBlock(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.block('u5')
    })

    expect(answer).toEqual({ ok: true, data: null })
    expect(requestWithoutBody).toHaveBeenCalledWith('/v1/members/u5/block', { method: 'PUT' })
  })

  it('keeps the id inside its part of the address', async () => {
    // Un identifiant fabriqué ne change pas l'adresse visée (encodeURIComponent).
    const { result } = await renderHook(() => useBlock(), { wrapper })

    await act(async () => {
      await result.current.block('u5/../../me')
    })

    expect(requestWithoutBody).toHaveBeenCalledWith('/v1/members/u5%2F..%2F..%2Fme/block', {
      method: 'PUT',
    })
  })

  it('reads again everything the block changes, once done', async () => {
    const { result } = await renderHook(() => useBlock(), { wrapper })

    await act(async () => {
      await result.current.block('u5')
    })

    await waitFor(() => expect(invalidated()).toEqual(Object.keys(touchedKeys)))
  })

  it('gives the refusal of the API, and reads nothing again', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => useBlock(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.block('u5')
    })

    expect(answer).toEqual({ ok: false, error: 'rateLimited' })
    expect(invalidated()).toEqual([])
  })
})

describe('useUnblock', () => {
  it('unblocks a member at the same address, with DELETE', async () => {
    const { result } = await renderHook(() => useUnblock(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.unblock('u5')
    })

    expect(answer).toEqual({ ok: true, data: null })
    expect(requestWithoutBody).toHaveBeenCalledWith('/v1/members/u5/block', { method: 'DELETE' })
  })

  it('reads again everything the unblock changes, the list of blocks included', async () => {
    const { result } = await renderHook(() => useUnblock(), { wrapper })

    await act(async () => {
      await result.current.unblock('u5')
    })

    await waitFor(() => expect(invalidated()).toEqual(Object.keys(touchedKeys)))
  })

  it('gives the refusal of the API', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useUnblock(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.unblock('u5')
    })

    expect(answer).toEqual({ ok: false, error: 'network' })
  })
})

describe('useBlockedMembers', () => {
  beforeEach(() => {
    // La liste se lit vraiment ici : on retire la fausse page posée pour les tests d'invalidation.
    client.removeQueries({ queryKey: ['blocks'] })
  })

  it('reads the first page of the members I blocked, checked against the contract', async () => {
    const { result } = await renderHook(() => useBlockedMembers(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(request).toHaveBeenCalledWith('/v1/me/blocks', expect.anything(), BlockedPage)
    expect(result.current.data?.pages[0]?.items).toEqual([blockedInes, blockedSam])
  })

  it('reads the next page with the cursor given by the previous one', async () => {
    jest
      .mocked(request)
      .mockResolvedValueOnce({ ok: true, data: blockedPageOf([blockedInes], 'curseur-suivant') })
      .mockResolvedValueOnce({ ok: true, data: blockedPageOf([blockedSam]) })
    const { result } = await renderHook(() => useBlockedMembers(), { wrapper })

    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(jest.mocked(request).mock.calls[1]?.[0]).toBe('/v1/me/blocks?cursor=curseur-suivant')
    expect(result.current.hasNextPage).toBe(false)
  })
})
