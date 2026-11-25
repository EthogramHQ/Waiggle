// Tests des hooks de la récolte (R19) : chaque lecture va à la bonne adresse ; une écriture envoie
// la bonne méthode et le seul champ changé, relit « Ma récolte », et lève une ApiError dont la clé
// dit pourquoi (`honeyShort`, `rankingsOff`) ; un réglage change la récolte en cache au toucher et
// y revient si l'API refuse ; le défi perso, lui, attend la réponse.
import type { Harvest, Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError } from '../api/errors'
import { shouldRetry } from '../api/query-client'
import { projectQueryKey } from '../projects/hooks'
import { leaHarvest } from '../screens/Game.testkit'
import {
  harvestQueryKey,
  useDecorate,
  useGameSettings,
  useHarvest,
  useOfferHoney,
  useRankings,
} from './api'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn() }))

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

const lastCall = (mock: typeof request | typeof requestWithoutBody) => {
  const [path, init] = jest.mocked(mock).mock.lastCall ?? []
  return {
    path,
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }
}

const cached = () => client.getQueryData<Harvest>(harvestQueryKey)

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
  jest.mocked(request).mockResolvedValue({ ok: true, data: leaHarvest })
  jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
})

describe('useHarvest', () => {
  it('reads GET /v1/me/harvest', async () => {
    const { result } = await renderHook(() => useHarvest(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(leaHarvest))
    expect(lastCall(request).path).toBe('/v1/me/harvest')
  })

  it('reads nothing when disabled', async () => {
    await renderHook(() => useHarvest({ enabled: false }), { wrapper })

    expect(request).not.toHaveBeenCalled()
  })
})

describe('useGameSettings', () => {
  it('sends only the changed setting, and turns the switch at once', async () => {
    client.setQueryData(harvestQueryKey, leaHarvest)
    const { result } = await renderHook(() => useGameSettings(), { wrapper })

    await act(() => result.current.mutate({ inRankings: false }))

    expect(cached()?.settings.inRankings).toBe(false)
    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalled())
    expect(lastCall(requestWithoutBody)).toEqual({
      path: '/v1/me/game',
      method: 'PATCH',
      body: { inRankings: false },
    })
  })

  it('reads the harvest again once the setting is saved', async () => {
    client.setQueryData(harvestQueryKey, leaHarvest)
    const { result } = await renderHook(() => useGameSettings(), { wrapper })
    const reads = jest.spyOn(client, 'invalidateQueries')

    await act(() => result.current.mutateAsync({ harvestNotices: false }))

    expect(reads).toHaveBeenCalledWith({ queryKey: harvestQueryKey })
  })

  it('puts the switch back when the API refuses', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'internal' })
    client.setQueryData(harvestQueryKey, leaHarvest)
    const { result } = await renderHook(() => useGameSettings(), { wrapper })

    await act(() => result.current.mutate({ inRankings: false }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(cached()?.settings.inRankings).toBe(true)
  })

  it('writes the title in the chosen form at once', async () => {
    client.setQueryData(harvestQueryKey, leaHarvest)
    const { result } = await renderHook(() => useGameSettings(), { wrapper })

    await act(() => result.current.mutate({ titleForm: 'm' }))

    expect(cached()?.title).toEqual({ family: 'keeper', form: 'm', pinned: false })
  })

  it('waits for the API before showing a chosen challenge', async () => {
    const offered = { state: 'choose', offered: ['feedback', 'update', 'test'] } as const
    client.setQueryData(harvestQueryKey, { ...leaHarvest, personalChallenge: offered })
    const { result } = await renderHook(() => useGameSettings(), { wrapper })

    await act(() => result.current.mutate({ personalChallenge: 'update' }))

    expect(cached()?.personalChallenge).toEqual(offered)
    await waitFor(() =>
      expect(lastCall(requestWithoutBody).body).toEqual({ personalChallenge: 'update' }),
    )
  })
})

describe('useDecorate', () => {
  it('puts the chosen decoration', async () => {
    const { result } = await renderHook(() => useDecorate(), { wrapper })

    await act(() => result.current.mutateAsync({ tint: 'amber', pattern: 'waffle' }))

    expect(lastCall(requestWithoutBody)).toEqual({
      path: '/v1/me/game/decoration',
      method: 'PUT',
      body: { tint: 'amber', pattern: 'waffle' },
    })
  })

  it('says the balance is short', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'honeyShort' })
    const { result } = await renderHook(() => useDecorate(), { wrapper })

    await act(() =>
      result.current.mutateAsync({ tint: 'amber', pattern: 'smooth' }).catch(() => undefined),
    )

    expect(result.current.error).toEqual(new ApiError('honeyShort'))
  })
})

describe('useOfferHoney', () => {
  const projectId = 'p1'
  const page = { id: projectId, honeyGiven: false } as Project

  it('posts the gift and marks the project as given', async () => {
    client.setQueryData(projectQueryKey(projectId), page)
    const { result } = await renderHook(() => useOfferHoney(projectId), { wrapper })

    await act(() => result.current.mutateAsync())

    expect(lastCall(requestWithoutBody)).toMatchObject({
      path: '/v1/projects/p1/honey',
      method: 'POST',
    })
    expect(client.getQueryData<Project>(projectQueryKey(projectId))?.honeyGiven).toBe(true)
  })

  it('marks the project as given when the honey was already given elsewhere', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'honeyAlready' })
    client.setQueryData(projectQueryKey(projectId), page)
    const { result } = await renderHook(() => useOfferHoney(projectId), { wrapper })

    await act(() => result.current.mutateAsync().catch(() => undefined))

    expect(client.getQueryData<Project>(projectQueryKey(projectId))?.honeyGiven).toBe(true)
  })

  it('leaves the project as it was when the balance is short', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'honeyShort' })
    client.setQueryData(projectQueryKey(projectId), page)
    const { result } = await renderHook(() => useOfferHoney(projectId), { wrapper })

    await act(() => result.current.mutateAsync().catch(() => undefined))

    expect(result.current.error).toEqual(new ApiError('honeyShort'))
    expect(client.getQueryData<Project>(projectQueryKey(projectId))?.honeyGiven).toBe(false)
  })
})

describe('useRankings', () => {
  const ranking = { scope: 'close', week: '2026-11-23', rows: [] }

  it('reads the ranking of the close ones', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: ranking })
    const { result } = await renderHook(() => useRankings('close'), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(ranking))
    expect(lastCall(request).path).toBe('/v1/rankings?scope=close')
  })

  it('reads the ranking of a hive', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: { ...ranking, scope: 'hive' } })
    const { result } = await renderHook(() => useRankings('hive', 'h1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastCall(request).path).toBe('/v1/rankings?scope=hive&hive=h1')
  })

  it('reads nothing for a hive without its id', async () => {
    await renderHook(() => useRankings('hive'), { wrapper })

    expect(request).not.toHaveBeenCalled()
  })

  it('never retries for a member who left the rankings', async () => {
    expect(shouldRetry(0, new ApiError('rankingsOff'))).toBe(false)
  })
})
