// Tests des hooks des ruches (R10) : chaque lecture va à la bonne adresse et passe par le schéma du
// contrat ; chaque écriture envoie la bonne méthode et le bon corps, relit `['hives']` et `['feed']`
// (même refusée), et lève une ApiError dont la clé dit pourquoi (`hiveFull`, `invitationExpired`…) ;
// « Ne pas me proposer aux autres » change le profil en cache au toucher et le remet si l'API refuse.
import type { HiveSummary, Me } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, errorKeyFor } from '../api/errors'
import { updateProfile } from '../profile/api'
import {
  useAcceptInvitation,
  useCreateHive,
  useDeleteHive,
  useHive,
  useHiveActivity,
  useHiveFeed,
  useHiveMembers,
  useHiveProjects,
  useInvitable,
  useInvite,
  useLeaveHive,
  useMyHives,
  usePatchHive,
  useRefuseInvitation,
  useRemoveMember,
  useSetAnimator,
  useSetHideFromSuggestions,
} from './api'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))

const hiveId = '00000000-0000-4000-8000-0000000000a1'
const invitationId = '00000000-0000-4000-8000-0000000000b1'
const family: HiveSummary = {
  id: hiveId,
  name: 'Famille',
  icon: 'house-line',
  memberCount: 4,
  animator: { id: 'u1', name: 'Papi Jean' },
  faces: [],
  news: 2,
  role: 'member',
}
const me = { id: 'u9', hideFromSuggestions: false } as Me

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** L'adresse et la méthode de la dernière demande envoyée par `request` ou `requestWithoutBody`. */
const lastPath = (mock: typeof request | typeof requestWithoutBody) =>
  jest.mocked(mock).mock.lastCall?.[0]
const lastInit = (mock: typeof request | typeof requestWithoutBody) =>
  jest.mocked(mock).mock.lastCall?.[1]

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset().mockResolvedValue({ ok: true, data: null })
  jest.mocked(updateProfile).mockReset()
})

describe('reads', () => {
  it('reads my hives and my invitations', async () => {
    const data = { hives: [family], invitations: [], createdCount: 1 }
    jest.mocked(request).mockResolvedValue({ ok: true, data })

    const { result } = await renderHook(() => useMyHives(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(data))
    expect(lastPath(request)).toBe('/v1/hives')
  })

  it('reads the page of a hive, and says « not found » as an ApiError', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'notFound' })

    const { result } = await renderHook(() => useHive(hiveId), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(lastPath(request)).toBe(`/v1/hives/${hiveId}`)
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).key).toBe('notFound')
  })

  it('reads the activity page by page, following the cursor', async () => {
    jest
      .mocked(request)
      .mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: 'abc_-1' } })
      .mockResolvedValueOnce({ ok: true, data: { items: [], nextCursor: null } })

    const { result } = await renderHook(() => useHiveActivity(hiveId), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    expect(lastPath(request)).toBe(`/v1/hives/${hiveId}/activity`)

    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(lastPath(request)).toBe(`/v1/hives/${hiveId}/activity?cursor=abc_-1`)
    expect(result.current.hasNextPage).toBe(false)
  })

  it('reads the projects of the hive page by page', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: { items: [], nextCursor: 'next' } })

    const { result } = await renderHook(() => useHiveProjects(hiveId), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(lastPath(request)).toBe(`/v1/hives/${hiveId}/projects?cursor=next`)
  })

  it('reads the members', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: { members: [] } })

    const { result } = await renderHook(() => useHiveMembers(hiveId), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual({ members: [] }))
    expect(lastPath(request)).toBe(`/v1/hives/${hiveId}/members`)
  })

  it('reads the feed of a hive from the following feed, with ?hive=', async () => {
    jest.mocked(request).mockResolvedValue({
      ok: true,
      data: { items: [], nextCursor: null, followsAnyone: true, lastReadAt: null },
    })

    const { result } = await renderHook(() => useHiveFeed(hiveId), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastPath(request)).toBe(`/v1/feed/following?hive=${hiveId}`)
    // Sa clé commence par « feed » : relire les fils le relit aussi.
    expect(client.getQueryCache().findAll({ queryKey: ['feed'] })).toHaveLength(1)
  })

  it('does not read the feed of a hive while told to wait', async () => {
    await renderHook(() => useHiveFeed(hiveId, false), { wrapper })

    expect(request).not.toHaveBeenCalled()
  })

  describe('the « Inviter » search', () => {
    it('sends nothing under 2 characters, blanks not counted', async () => {
      await renderHook(() => useInvitable(hiveId, '  m '), { wrapper })

      expect(request).not.toHaveBeenCalled()
    })

    it('sends nothing over 50 characters', async () => {
      await renderHook(() => useInvitable(hiveId, 'a'.repeat(51)), { wrapper })

      expect(request).not.toHaveBeenCalled()
    })

    it('searches the trimmed text, encoded', async () => {
      jest.mocked(request).mockResolvedValue({ ok: true, data: { members: [] } })

      const { result } = await renderHook(() => useInvitable(hiveId, ' Léa & co '), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(lastPath(request)).toBe(`/v1/hives/${hiveId}/invitable?q=L%C3%A9a+%26+co`)
    })
  })
})

describe('writes', () => {
  /** On regarde ce qui est relu : un client dont `invalidateQueries` est espionné. */
  const spyInvalidations = () => {
    const spy = jest.spyOn(client, 'invalidateQueries')
    return () => spy.mock.calls.map(([filters]) => filters?.queryKey)
  }

  it('creates a hive with POST and gives back its summary', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: family })
    const invalidated = spyInvalidations()
    const { result } = await renderHook(() => useCreateHive(), { wrapper })

    let created: HiveSummary | undefined
    await act(async () => {
      created = await result.current.mutateAsync({ name: 'Famille', icon: 'house-line' })
    })

    expect(created).toEqual(family)
    expect(lastPath(request)).toBe('/v1/hives')
    expect(lastInit(request)).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'Famille', icon: 'house-line' }),
    })
    await waitFor(() => expect(invalidated()).toEqual([['hives'], ['feed']]))
  })

  it('patches a hive, the pin removed by null', async () => {
    const { result } = await renderHook(() => usePatchHive(hiveId), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ pinnedProjectId: null })
    })

    expect(lastPath(requestWithoutBody)).toBe(`/v1/hives/${hiveId}`)
    expect(lastInit(requestWithoutBody)).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ pinnedProjectId: null }),
    })
  })

  it('deletes a hive', async () => {
    const { result } = await renderHook(() => useDeleteHive(hiveId), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(lastPath(requestWithoutBody)).toBe(`/v1/hives/${hiveId}`)
    expect(lastInit(requestWithoutBody)).toMatchObject({ method: 'DELETE' })
  })

  it('invites a member', async () => {
    const { result } = await renderHook(() => useInvite(hiveId), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('u2')
    })

    expect(lastPath(requestWithoutBody)).toBe(`/v1/hives/${hiveId}/invitations`)
    expect(lastInit(requestWithoutBody)).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ userId: 'u2' }),
    })
  })

  it('accepts an invitation and gives back the hive', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: family })
    const { result } = await renderHook(() => useAcceptInvitation(), { wrapper })

    let joined: HiveSummary | undefined
    await act(async () => {
      joined = await result.current.mutateAsync(invitationId)
    })

    expect(joined).toEqual(family)
    expect(lastPath(request)).toBe(`/v1/hive-invitations/${invitationId}/accept`)
    expect(lastInit(request)).toMatchObject({ method: 'POST' })
  })

  it('refuses an invitation with DELETE', async () => {
    const { result } = await renderHook(() => useRefuseInvitation(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(invitationId)
    })

    expect(lastPath(requestWithoutBody)).toBe(`/v1/hive-invitations/${invitationId}`)
    expect(lastInit(requestWithoutBody)).toMatchObject({ method: 'DELETE' })
  })

  it('removes a member, and hands the animation over', async () => {
    const { result } = await renderHook(
      () => ({ remove: useRemoveMember(hiveId), animator: useSetAnimator(hiveId) }),
      { wrapper },
    )

    await act(async () => {
      await result.current.remove.mutateAsync('u2')
    })
    expect(lastPath(requestWithoutBody)).toBe(`/v1/hives/${hiveId}/members/u2`)
    expect(lastInit(requestWithoutBody)).toMatchObject({ method: 'DELETE' })

    await act(async () => {
      await result.current.animator.mutateAsync('u3')
    })
    expect(lastPath(requestWithoutBody)).toBe(`/v1/hives/${hiveId}/animator`)
    expect(lastInit(requestWithoutBody)).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ userId: 'u3' }),
    })
  })

  it('leaves with my own identifier, read from the cached profile', async () => {
    client.setQueryData(['me'], me)
    const { result } = await renderHook(() => useLeaveHive(hiveId), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(lastPath(requestWithoutBody)).toBe(`/v1/hives/${hiveId}/members/u9`)
    expect(lastInit(requestWithoutBody)).toMatchObject({ method: 'DELETE' })
  })

  it('throws the refusal as an ApiError, and still re-reads what may have changed', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'hiveFull' })
    const invalidated = spyInvalidations()
    const { result } = await renderHook(() => useInvite(hiveId), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('u2')).rejects.toMatchObject({ key: 'hiveFull' })
    })

    await waitFor(() => expect(invalidated()).toEqual([['hives'], ['feed']]))
    expect(result.current.isError).toBe(true)
  })

  it('reads isPending while the answer is awaited', async () => {
    let answer: (value: unknown) => void = () => {}
    jest.mocked(requestWithoutBody).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve as (value: unknown) => void
        }) as ReturnType<typeof requestWithoutBody>,
    )
    const { result } = await renderHook(() => useDeleteHive(hiveId), { wrapper })

    await act(async () => {
      void result.current.mutateAsync()
    })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    await act(async () => answer({ ok: true, data: null }))

    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('sends two quick removals one after the other, never together', async () => {
    let answer: (value: unknown) => void = () => {}
    jest.mocked(requestWithoutBody).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve as (value: unknown) => void
        }) as ReturnType<typeof requestWithoutBody>,
    )
    const { result } = await renderHook(() => useRemoveMember(hiveId), { wrapper })

    await act(async () => {
      void result.current.mutateAsync('u2')
      void result.current.mutateAsync('u3')
    })
    expect(requestWithoutBody).toHaveBeenCalledTimes(1)

    await act(async () => answer({ ok: true, data: null }))
    await waitFor(() => expect(requestWithoutBody).toHaveBeenCalledTimes(2))
    await act(async () => answer({ ok: true, data: null }))
  })
})

describe('useSetHideFromSuggestions', () => {
  const hidden = () => client.getQueryData<Me>(['me'])?.hideFromSuggestions

  beforeEach(() => {
    client.setQueryDefaults(['me'], { staleTime: Infinity })
    client.setQueryData(['me'], me)
  })

  it('changes the cached profile at once, before the API answers, and sends PATCH /v1/me', async () => {
    jest
      .mocked(updateProfile)
      .mockResolvedValue({ ok: true, data: { ...me, hideFromSuggestions: true } })
    const { result } = await renderHook(() => useSetHideFromSuggestions(), { wrapper })

    let accepted: boolean | undefined
    await act(async () => {
      accepted = await result.current.set(true)
    })

    expect(accepted).toBe(true)
    expect(updateProfile).toHaveBeenCalledWith({ hideFromSuggestions: true })
    expect(hidden()).toBe(true)
  })

  it('puts the profile back, and says so, when the API refuses', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: false, error: 'unavailable' })
    const { result } = await renderHook(() => useSetHideFromSuggestions(), { wrapper })

    let accepted: boolean | undefined
    await act(async () => {
      accepted = await result.current.set(true)
    })

    expect(accepted).toBe(false)
    expect(hidden()).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
  })

  it('re-reads the profile and the suggestions once done', async () => {
    jest
      .mocked(updateProfile)
      .mockResolvedValue({ ok: true, data: { ...me, hideFromSuggestions: true } })
    const spy = jest.spyOn(client, 'invalidateQueries')
    const { result } = await renderHook(() => useSetHideFromSuggestions(), { wrapper })

    await act(async () => {
      await result.current.set(true)
    })

    await waitFor(() =>
      expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
        ['me'],
        ['suggestions'],
      ]),
    )
  })
})

describe('the errors of the hives', () => {
  it.each([
    [409, 'hive_full', 'hiveFull'],
    [409, 'hives_created_limit', 'hivesCreatedLimit'],
    [409, 'hives_joined_limit', 'hivesJoinedLimit'],
    [409, 'already_hive_member', 'alreadyHiveMember'],
    [409, 'already_invited', 'alreadyInvited'],
    [410, 'invitation_expired', 'invitationExpired'],
    [410, undefined, 'invitationExpired'],
    [422, 'pin_not_visible', 'pinNotVisible'],
  ] as const)('reads %i %s as %s', (status, code, key) => {
    expect(errorKeyFor(status, code)).toBe(key)
  })
})
