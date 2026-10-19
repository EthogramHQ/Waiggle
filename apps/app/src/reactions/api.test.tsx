// Tests du hook useReaction (tranche 5) : le bouton change tout de suite (mise à jour optimiste,
// comme « Suivre »), l'API reçoit les demandes dans l'ordre, et un refus remet la page comme avant.
import { NO_REACTIONS, type Project, type ReactionState } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { requestWithoutBody } from '../api/client'
import { recipesProject } from '../testing/projects'
import { useReaction } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ requestWithoutBody: jest.fn() }))

const { id } = recipesProject
let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les réactions du projet en cache, telles que la page les affiche. */
const reactions = () => client.getQueryData<Project>(['project', id])?.reactions

/** Les nombres par type, tous à zéro sauf ceux donnés. */
const counts = (some: Partial<ReactionState['counts']> = {}) => ({
  ...NO_REACTIONS.counts,
  ...some,
})

/** Le projet de Léa, vu par Max, avec ces réactions. */
const seed = (state: ReactionState) =>
  client.setQueryData<Project>(['project', id], {
    ...recipesProject,
    isMine: false,
    reactions: state,
  })

/** Les demandes envoyées à l'API : la méthode et l'adresse, dans l'ordre. */
const sent = () =>
  jest.mocked(requestWithoutBody).mock.calls.map(([path, init]) => `${init?.method} ${path}`)

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  // staleTime infini : le projet en cache ne se relit pas pendant le test (aucune vraie API ici).
  client.setQueryDefaults(['project', id], { staleTime: Infinity })
  seed({ counts: counts({ bravo: 2 }), mine: [] })
  jest.mocked(requestWithoutBody).mockReset().mockResolvedValue({ ok: true, data: null })
})

describe('useReaction', () => {
  it('reacts at once, before the API even answers, and counts one more', async () => {
    const { result } = await renderHook(() => useReaction(id), { wrapper })

    await act(async () => result.current.toggle('bravo'))

    expect(reactions()).toEqual({ counts: counts({ bravo: 3 }), mine: ['bravo'] })
    await waitFor(() => expect(sent()).toEqual([`PUT /v1/projects/${id}/reactions/bravo`]))
  })

  it('removes the reaction when touched again, and counts one less', async () => {
    seed({ counts: counts({ bravo: 2 }), mine: ['bravo'] })
    const { result } = await renderHook(() => useReaction(id), { wrapper })

    await act(async () => result.current.toggle('bravo'))

    expect(reactions()).toEqual({ counts: counts({ bravo: 1 }), mine: [] })
    await waitFor(() => expect(sent()).toEqual([`DELETE /v1/projects/${id}/reactions/bravo`]))
  })

  it('sends a quick double touch as « react » then « remove », in that order', async () => {
    const { result } = await renderHook(() => useReaction(id), { wrapper })

    await act(async () => {
      result.current.toggle('bravo')
      result.current.toggle('bravo')
    })

    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalledTimes(2))
    expect(sent()).toEqual([
      `PUT /v1/projects/${id}/reactions/bravo`,
      `DELETE /v1/projects/${id}/reactions/bravo`,
    ])
    expect(reactions()).toEqual({ counts: counts({ bravo: 2 }), mine: [] })
  })

  it('keeps each kind of reaction apart', async () => {
    const { result } = await renderHook(() => useReaction(id), { wrapper })

    await act(async () => {
      result.current.toggle('bravo')
      result.current.toggle('useful')
    })

    expect(reactions()?.counts).toEqual(counts({ bravo: 3, useful: 1 }))
    expect([...(reactions()?.mine ?? [])].sort()).toEqual(['bravo', 'useful'])
    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalledTimes(2))
    expect([...sent()].sort()).toEqual([
      `PUT /v1/projects/${id}/reactions/bravo`,
      `PUT /v1/projects/${id}/reactions/useful`,
    ])
  })

  it('puts the page back as it was, and says so, when the API refuses', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => useReaction(id), { wrapper })

    await act(async () => result.current.toggle('bravo'))

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.expired).toBe(false)
    expect(reactions()).toEqual({ counts: counts({ bravo: 2 }), mine: [] })
  })

  it('says the session expired when the API answers 401', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'unauthorized' })
    const { result } = await renderHook(() => useReaction(id), { wrapper })

    await act(async () => result.current.toggle('bravo'))

    await waitFor(() => expect(result.current.expired).toBe(true))
  })
})
