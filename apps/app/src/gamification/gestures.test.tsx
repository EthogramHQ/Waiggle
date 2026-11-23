// Les hooks de geste montrent le pollen que l'API rapporte (R19) : à la réussite, `reportPollen` est
// appelé avec le bon ancrage, et « Ma récolte » est relue. Sans en-tête (geste déjà fait, retrait,
// plafond atteint) : rien ne se montre ni ne se relit. Le client réseau est remplacé par un faux qui
// rend (ou non) `pollen`, comme le vrai client lit l'en-tête `Waiggle-Pollen`.
import type { NewComment } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { usePostComment } from '../comments/api'
import { useFollow } from '../follows/api'
import { useAcceptInvitation, useCreateHive } from '../hives/api'
import { useReaction } from '../reactions/api'
import { useBecomeTester, useQuitTester } from '../testers/api'
import { useSendMessage, useSettleFeedback } from '../testers/corner-api'
import { commentOf } from '../testing/comments'
import { famille } from '../testing/hives'
import { recipesProject } from '../testing/projects'
import { harvestQueryKey } from './keys'
import { reportPollen } from './pollen'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('./pollen', () => ({ reportPollen: jest.fn() }))

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Un client qui pose une lecture de la récolte, pour voir si le geste la déclare périmée. */
const harvestIsStale = () => client.getQueryState(harvestQueryKey)?.isInvalidated === true

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  client.setQueryData(harvestQueryKey, { level: 1 })
  client.setQueryData(['project', recipesProject.id], { ...recipesProject, isMine: false })
  jest.mocked(reportPollen).mockReset()
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
  jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
})

describe('reactions', () => {
  it('shows the pollen of the first reaction above its capsule, and nothing for the repeats', async () => {
    jest
      .mocked(requestWithoutBody)
      .mockResolvedValueOnce({ ok: true, data: null, pollen: 2 })
      .mockResolvedValue({ ok: true, data: null })
    const { result } = await renderHook(() => useReaction(recipesProject.id), { wrapper })

    await act(async () => result.current.toggle('bravo'))
    await waitFor(() => expect(reportPollen).toHaveBeenCalledWith(2, 'reaction', 'bravo'))
    expect(harvestIsStale()).toBe(true)

    // Retirer, puis réagir de nouveau : l'API ne rapporte plus rien, la pastille non plus.
    client.invalidateQueries = jest.fn()
    await act(async () => result.current.toggle('bravo'))
    await act(async () => result.current.toggle('bravo'))
    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalledTimes(3))
    expect(reportPollen).toHaveBeenCalledTimes(1)
    expect(client.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: harvestQueryKey })
  })
})

describe('follows', () => {
  it('shows the pollen of a follow in the global host', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null, pollen: 1 })
    const { result } = await renderHook(() => useFollow({ kind: 'member', id: 'nora' }), {
      wrapper,
    })

    await act(async () => result.current.toggle(false))
    await waitFor(() => expect(reportPollen).toHaveBeenCalledWith(1, 'global', undefined))
    expect(harvestIsStale()).toBe(true)
  })
})

describe('comments', () => {
  it('shows the pollen of a posted comment above « Envoyer »', async () => {
    const posted = commentOf({ id: 'c1', body: 'Bravo !' })
    jest.mocked(request).mockResolvedValue({ ok: true, data: posted, pollen: 2 })
    const { result } = await renderHook(() => usePostComment(recipesProject.id), { wrapper })

    await act(async () => {
      await result.current.post({ body: 'Bravo !' } as NewComment)
    })
    expect(reportPollen).toHaveBeenCalledWith(2, 'comment', undefined)
    expect(harvestIsStale()).toBe(true)
  })

  it('shows nothing when the API reports no pollen', async () => {
    jest
      .mocked(request)
      .mockResolvedValue({ ok: true, data: commentOf({ id: 'c2', body: 'Encore' }) })
    const { result } = await renderHook(() => usePostComment(recipesProject.id), { wrapper })

    await act(async () => {
      await result.current.post({ body: 'Encore' } as NewComment)
    })
    expect(reportPollen).not.toHaveBeenCalled()
    expect(harvestIsStale()).toBe(false)
  })
})

describe('testers', () => {
  it('shows the pollen of joining the testers beside the corner, none for leaving', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null, pollen: 3 })
    const join = await renderHook(() => useBecomeTester(recipesProject.id), { wrapper })
    await act(async () => {
      await join.result.current.join()
    })
    expect(reportPollen).toHaveBeenCalledWith(3, 'tester', undefined)

    jest.mocked(reportPollen).mockClear()
    const quit = await renderHook(() => useQuitTester(recipesProject.id), { wrapper })
    await act(async () => {
      await quit.result.current.quit()
    })
    expect(reportPollen).not.toHaveBeenCalled()
  })

  it('shows the pollen of a sent feedback above « Envoyer » of the thread', async () => {
    jest.mocked(request).mockResolvedValue({
      ok: true,
      data: { id: 'm1', kind: 'reply', text: 'Merci', createdAt: '2026-11-23T10:00:00.000Z' },
      pollen: 4,
    })
    const { result } = await renderHook(() => useSendMessage(recipesProject.id, 'tester-1'), {
      wrapper,
    })
    await act(async () => {
      await result.current.send({ kind: 'reply', text: 'Merci' })
    })
    // Le faux message n'a pas le schéma exact : seul l'appel de la pastille compte ici.
    expect(reportPollen).toHaveBeenCalledWith(4, 'feedback', undefined)
  })

  it('shows the pollen of settling a feedback', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null, pollen: 2 })
    const { result } = await renderHook(() => useSettleFeedback(recipesProject.id), { wrapper })
    await act(async () => {
      await result.current.settle('m1')
    })
    expect(reportPollen).toHaveBeenCalledWith(2, 'feedback', undefined)
  })
})

describe('hives', () => {
  it('shows the pollen of creating a hive and of accepting an invitation', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: famille, pollen: 5 })
    const create = await renderHook(() => useCreateHive(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ name: 'Famille', icon: 'home' } as never)
    })
    expect(reportPollen).toHaveBeenCalledWith(5, 'global', undefined)

    jest.mocked(reportPollen).mockClear()
    const accept = await renderHook(() => useAcceptInvitation(), { wrapper })
    await act(async () => {
      await accept.result.current.mutateAsync('inv-1')
    })
    expect(reportPollen).toHaveBeenCalledWith(5, 'global', undefined)
  })

  it('shows nothing when the invitation brings no pollen', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: famille })
    const accept = await renderHook(() => useAcceptInvitation(), { wrapper })
    await act(async () => {
      await accept.result.current.mutateAsync('inv-2')
    })
    expect(reportPollen).not.toHaveBeenCalled()
  })
})
