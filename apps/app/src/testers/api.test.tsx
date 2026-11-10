// Tests des hooks des testeurs (R7a) : rejoindre les testeurs d'un projet (POST
// /v1/projects/{id}/testers) et les quitter (DELETE, même adresse). Le projet en cache change au
// toucher (`isTester`), avant toute réponse : un second toucher lit déjà le nouvel état. Un refus
// de l'API remet le projet tel qu'il était, et dit pourquoi quand réessayer ne servirait à rien
// (200 testeurs, projet qui ne cherche plus de testeurs, session expirée, limite atteinte).
//
// L'interface attendue de `testers/api.ts` (agent U0), fixée par ces tests :
// - `useBecomeTester(projectId)` → `{ join: () => Promise<boolean>, pending, error, reason? }` ;
// - `useQuitTester(projectId)` → `{ quit: () => Promise<boolean>, pending, error, reason? }` ;
// - `reason` : `'full'` (409 `testers_full`), `'notTestable'` (409 `not_testable`), `'expired'`
//   (401), `'limited'` (429), absent pour une erreur qu'un nouvel essai peut régler.
import type { Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { requestWithoutBody } from '../api/client'
import { recipesProject } from '../testing/projects'
import { useBecomeTester, useQuitTester } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

/** Le projet de Léa, vu par Inès : « Testable », avec une démo. */
const seenByInes: Project = { ...recipesProject, isMine: false, isTester: false }
const { id } = seenByInes
const testersPath = `/v1/projects/${id}/testers`

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Inès est-elle testeuse, d'après le projet en cache (celui que la page affiche) ? */
const testerInCache = () => client.getQueryData<Project>(['project', id])?.isTester

/** Une réponse qui n'arrive qu'à l'appel de `answer` : on regarde l'écran entre-temps. */
const heldAnswer = () => {
  let answer: (value: unknown) => void = () => {}
  jest.mocked(requestWithoutBody).mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve as (value: unknown) => void
      }) as ReturnType<typeof requestWithoutBody>,
  )
  return (value: unknown) => answer(value)
}

beforeEach(() => {
  client = new QueryClient({
    // gcTime: Infinity : pas de minuterie de nettoyage, qui empêcherait Jest de s'arrêter.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  // staleTime infini : le projet en cache ne se relit pas tout seul pendant le test.
  client.setQueryDefaults(['project', id], { staleTime: Infinity })
  client.setQueryData(['project', id], seenByInes)
  jest.mocked(requestWithoutBody).mockReset()
})

describe('useBecomeTester', () => {
  it('asks to join the testers of the project, with POST at its address', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const { result } = await renderHook(() => useBecomeTester(id), { wrapper })

    let joined = false
    await act(async () => {
      joined = await result.current.join()
    })

    expect(joined).toBe(true)
    expect(requestWithoutBody).toHaveBeenCalledTimes(1)
    expect(requestWithoutBody).toHaveBeenCalledWith(
      testersPath,
      expect.objectContaining({ method: 'POST' }),
    )
    expect(testerInCache()).toBe(true)
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe(false)
  })

  it('marks the project as tested at the touch, before the answer comes', async () => {
    const answer = heldAnswer()
    const { result } = await renderHook(() => useBecomeTester(id), { wrapper })

    let joining: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      joining = result.current.join()
    })

    // La réponse n'est pas arrivée : la page dit déjà « Tu testes ce projet ».
    expect(testerInCache()).toBe(true)
    await waitFor(() => expect(result.current.pending).toBe(true))
    await act(async () => {
      answer({ ok: true, data: null })
      await joining
    })
    expect(testerInCache()).toBe(true)
  })

  it('reads the project again once joined', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    const { result } = await renderHook(() => useBecomeTester(id), { wrapper })

    await act(async () => {
      await result.current.join()
    })

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['project', id] }),
      ),
    )
  })

  it('puts the project back as it was, and says so, when the API refuses', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useBecomeTester(id), { wrapper })

    let joined = true
    await act(async () => {
      joined = await result.current.join()
    })

    expect(joined).toBe(false)
    expect(testerInCache()).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    // Une erreur de réseau : réessayer peut suffire, aucune raison particulière.
    expect(result.current.reason).toBeUndefined()
  })

  it.each([
    ['testersFull', 'full'],
    ['notTestable', 'notTestable'],
    ['unauthorized', 'expired'],
    ['rateLimited', 'limited'],
  ] as const)('says why joining failed when the API answers %s', async (error, reason) => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error })
    const { result } = await renderHook(() => useBecomeTester(id), { wrapper })

    await act(async () => {
      await result.current.join()
    })

    await waitFor(() => expect(result.current.reason).toBe(reason))
    expect(testerInCache()).toBe(false)
  })
})

describe('useQuitTester', () => {
  beforeEach(() => {
    client.setQueryData(['project', id], { ...seenByInes, isTester: true })
  })

  it('leaves the testers of the project, with DELETE at the same address', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const { result } = await renderHook(() => useQuitTester(id), { wrapper })

    let left = false
    await act(async () => {
      left = await result.current.quit()
    })

    expect(left).toBe(true)
    expect(requestWithoutBody).toHaveBeenCalledTimes(1)
    expect(requestWithoutBody).toHaveBeenCalledWith(
      testersPath,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(testerInCache()).toBe(false)
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe(false)
  })

  it('marks the project as no longer tested at the touch, before the answer comes', async () => {
    const answer = heldAnswer()
    const { result } = await renderHook(() => useQuitTester(id), { wrapper })

    let leaving: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      leaving = result.current.quit()
    })

    expect(testerInCache()).toBe(false)
    await act(async () => {
      answer({ ok: true, data: null })
      await leaving
    })
    expect(testerInCache()).toBe(false)
  })

  it('keeps the member a tester, and says so, when the departure could not be sent', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useQuitTester(id), { wrapper })

    let left = true
    await act(async () => {
      left = await result.current.quit()
    })

    expect(left).toBe(false)
    expect(testerInCache()).toBe(true)
    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it('says the session expired when the API answers 401', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'unauthorized' })
    const { result } = await renderHook(() => useQuitTester(id), { wrapper })

    await act(async () => {
      await result.current.quit()
    })

    await waitFor(() => expect(result.current.reason).toBe('expired'))
  })
})
