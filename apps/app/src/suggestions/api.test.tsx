// Tests des hooks de « Proches à suivre » (R4, F-Fil10) :
// - useSuggestions lit la liste (GET /v1/suggestions/members) ;
// - useDismissSuggestion écarte un membre (PUT …/{id}/dismissed) : la ligne quitte la liste tout de
//   suite, avant même la réponse, puis la liste se relit (un autre membre peut prendre la place) ;
//   si l'API refuse, le membre revient ;
// - suivre un membre depuis la liste (useFollow) ne relit pas la liste, pour que la ligne reste à sa
//   place avec « Tu suis », mais relit le fil : le fil de ce membre remplace l'accueil au prochain
//   passage (scénario R4, « Suivre depuis la liste »).
import type { MemberSuggestions, SuggestedMember } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import type { ApiResult } from '../api/errors'
import { useFollow } from '../follows/api'
import { recipesProject, summaryOf } from '../testing/projects'
import { useDismissSuggestion, useSuggestions } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const suggestionsPath = '/v1/suggestions/members'

const suggested = (id: string, name: string): SuggestedMember => ({
  id,
  name,
  avatarUrl: null,
  latestProject: {
    ...summaryOf(recipesProject),
    id: `00000000-0000-4000-8000-0000000000${id.slice(1).padStart(2, '0')}`,
    author: { id, name, avatarUrl: null },
  },
})
const lea = suggested('u1', 'Léa Martin')
const sam = suggested('u2', 'Sam Petit')
const nora = suggested('u3', 'Nora Benali')

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Combien de fois la liste a été lue. */
const reads = () =>
  jest.mocked(request).mock.calls.filter(([path]) => path === suggestionsPath).length

/** Les membres que la liste donne à l'écran, par leur identifiant. */
const ids = (data: MemberSuggestions | undefined) => data?.members.map((member) => member.id)

/** La liste répond d'abord `first`, puis `then` à chaque relecture. */
const listAnswers = (first: SuggestedMember[], then: SuggestedMember[] = first) => {
  let count = 0
  jest.mocked(request).mockImplementation((async (path: string) => {
    if (path !== suggestionsPath) return { ok: false, error: 'internal' }
    count += 1
    return { ok: true, data: { members: count === 1 ? first : then } }
  }) as typeof request)
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset().mockResolvedValue({ ok: true, data: null })
})

describe('useSuggestions', () => {
  it('reads the members to follow from /v1/suggestions/members', async () => {
    listAnswers([lea, sam])
    const { result } = await renderHook(() => useSuggestions(), { wrapper })

    await waitFor(() => expect(ids(result.current.data)).toEqual(['u1', 'u2']))
    expect(request).toHaveBeenCalledWith(suggestionsPath, expect.anything(), expect.anything())
  })

  it('reports an error when the list cannot be read', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useSuggestions(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useDismissSuggestion', () => {
  it('sends the dismissal to its own address', async () => {
    listAnswers([lea, sam])
    const { result } = await renderHook(() => useDismissSuggestion(), { wrapper })

    await act(async () => {
      await result.current.dismiss('u2')
    })

    expect(requestWithoutBody).toHaveBeenCalledWith(
      '/v1/suggestions/members/u2/dismissed',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('removes the member from the list at once, before the API answers, then reads it again', async () => {
    listAnswers([lea, sam], [lea, nora])
    // La réponse de l'écart attend : on la donne à la main.
    let answer: (result: ApiResult<null>) => void = () => {}
    jest
      .mocked(requestWithoutBody)
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { result } = await renderHook(
      () => ({ list: useSuggestions(), dismiss: useDismissSuggestion().dismiss }),
      { wrapper },
    )
    await waitFor(() => expect(ids(result.current.list.data)).toEqual(['u1', 'u2']))

    let sent: Promise<unknown> = Promise.resolve()
    await act(async () => {
      sent = result.current.dismiss('u2')
    })
    expect(ids(result.current.list.data)).toEqual(['u1'])
    expect(reads()).toBe(1)

    await act(async () => {
      answer({ ok: true, data: null })
      await sent
    })
    // Relue : Nora prend la place de Sam.
    await waitFor(() => expect(ids(result.current.list.data)).toEqual(['u1', 'u3']))
    expect(reads()).toBe(2)
  })

  it('puts the member back when the API refuses', async () => {
    listAnswers([lea, sam])
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(
      () => ({ list: useSuggestions(), dismiss: useDismissSuggestion().dismiss }),
      { wrapper },
    )
    await waitFor(() => expect(ids(result.current.list.data)).toEqual(['u1', 'u2']))

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.dismiss('u2')
    })

    expect(outcome).toMatchObject({ ok: false })
    await waitFor(() => expect(ids(result.current.list.data)).toEqual(['u1', 'u2']))
  })
})

describe('following from the list', () => {
  it('keeps the list as it is but refreshes the feed', async () => {
    listAnswers([lea, sam], [lea])
    // Le fil des abonnements déjà en cache : suivre quelqu'un doit le faire relire.
    client.setQueryData(['feed', 'following'], { pages: [], pageParams: [] })
    const { result } = await renderHook(
      () => ({ list: useSuggestions(), follow: useFollow({ kind: 'member', id: 'u2' }) }),
      { wrapper },
    )
    await waitFor(() => expect(ids(result.current.list.data)).toEqual(['u1', 'u2']))

    await act(async () => result.current.follow.toggle(false))

    await waitFor(() =>
      expect(requestWithoutBody).toHaveBeenCalledWith('/v1/members/u2/follow', { method: 'POST' }),
    )
    await waitFor(() =>
      expect(client.getQueryState(['feed', 'following'])?.isInvalidated).toBe(true),
    )
    // La ligne de Sam reste à sa place : la liste n'a pas été relue.
    expect(reads()).toBe(1)
    expect(ids(result.current.list.data)).toEqual(['u1', 'u2'])
  })
})
