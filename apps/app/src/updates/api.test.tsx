// Tests des hooks des mises à jour (R7a, docs/scenarios/refonte.md, « Publier une mise à jour »,
// « La frise », « Supprimer une mise à jour ») : lire la frise par pages de 20, publier une mise à
// jour, en supprimer une. Le réseau est remplacé (`api/client`) : on lit les demandes envoyées et on
// choisit les réponses, et les vrais hooks rangent le résultat dans le cache de React Query.
//
// L'interface que ces tests fixent pour `updates/api.ts` :
// - `useProjectUpdates(projectId)` : un `useInfiniteQuery` (GET /v1/projects/{id}/updates, puis
//   `?cursor=` pour la suite) ; ses pages sont des `ProjectUpdatePage` ;
// - `usePublishUpdate(projectId)` → `{ publish(payload: NewProjectUpdate): Promise<boolean>,
//   pending: boolean, error: boolean, reason?: UpdateFailure }` ;
// - `useDeleteUpdate(projectId)` → `{ remove(updateId: string): Promise<boolean>, pending: boolean,
//   error: boolean, reason?: UpdateFailure }` ;
// - `UpdateFailure` = `'limited'` (429, 10 mises à jour par jour), `'expired'` (401),
//   `'invalidPhotos'` (400 `invalid_photos` : une photo n'est plus en attente) ; absent : une
//   erreur qu'un nouvel essai peut régler.
import type { NewProjectUpdate, Project, ProjectUpdate, ProjectUpdatePage } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { recipesProject } from '../testing/projects'
import { rocketUpdate } from '../testing/updates'
import { useDeleteUpdate, useProjectUpdates, usePublishUpdate } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const { id } = recipesProject

/** Une mise à jour plus ancienne, sans titre ni photo (la frise écrit alors sa version). */
const olderUpdate: ProjectUpdate = {
  id: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
  title: null,
  version: 'v1.1',
  lines: [{ family: 'polish', text: 'Des étoiles qui scintillent' }],
  photos: [],
  beforeAfter: false,
  createdAt: '2026-10-12T09:00:00.000Z',
  removal: null,
}

/** La mise à jour publiée par les tests : sans photo, et sans version. */
const freshUpdate: ProjectUpdate = {
  id: '8b9c0d1e-2f3a-4b4c-9d5e-6f7a8b9c0d1e',
  title: 'Le mode nuit',
  version: null,
  lines: [{ family: 'new', text: 'Un mode nuit' }],
  photos: [],
  beforeAfter: false,
  createdAt: '2026-10-20T09:00:00.000Z',
  removal: null,
}

/** Ce que la feuille envoie pour `freshUpdate`. */
const payload: NewProjectUpdate = {
  title: 'Le mode nuit',
  version: null,
  lines: [{ family: 'new', text: 'Un mode nuit' }],
  photos: [],
  beforeAfter: false,
}

/** Le projet de Léa, avec deux mises à jour : la fusée (v1.2), puis la v1.1. */
const withUpdates: Project = {
  ...recipesProject,
  latestUpdate: rocketUpdate,
  updateCount: 2,
  version: 'v1.2',
}

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Le projet en cache, tel que la page l'affiche. */
const cachedProject = () => client.getQueryData<Project>(['project', id])

/** Les chemins demandés à `request`, dans l'ordre. */
const requestedPaths = () => jest.mocked(request).mock.calls.map(([path]) => path)

/** Une réponse de l'API, telle que `request` la rend. */
const ok = <T,>(data: T) => ({ ok: true as const, data })

/** Une promesse dont le test choisit le moment de la fin. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * Un petit faux serveur, quand la frise est lue pendant le test : il rend la frise de `updates`
 * (une page), ajoute en tête la mise à jour publiée (`posted`) et retire celle qu'on supprime. Une
 * relecture après le geste (le projet, la frise) lit donc le même état que l'écran.
 */
const serve = (updates: ProjectUpdate[], posted: ProjectUpdate = freshUpdate) => {
  let list = [...updates]
  jest.mocked(request).mockImplementation((async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      list = [posted, ...list]
      return ok(posted)
    }
    if (path.startsWith(`/v1/projects/${id}/updates`)) return ok({ items: list, nextCursor: null })
    return ok({ ...withUpdates, latestUpdate: list[0] ?? null, updateCount: list.length })
  }) as never)
  jest.mocked(requestWithoutBody).mockImplementation((async (path: string) => {
    list = list.filter((update) => !path.endsWith(update.id))
    return { ok: true, data: null }
  }) as never)
}

/**
 * La frise et un geste ensemble, dans le même composant : la frise (lue par `useProjectUpdates`)
 * montre ce que le geste a rangé dans le cache, sans que le test connaisse la clé du cache.
 */
const withTimeline = <T,>(useGesture: () => T) =>
  renderHook(() => ({ timeline: useProjectUpdates(id), gesture: useGesture() }), { wrapper })

/** Les identifiants des mises à jour de la frise, toutes pages confondues. */
const timelineIds = (timeline: ReturnType<typeof useProjectUpdates>) =>
  (timeline.data?.pages as ProjectUpdatePage[] | undefined)?.flatMap((page) =>
    page.items.map((item) => item.id),
  )

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
  client.setQueryData(['project', id], withUpdates)
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
})

describe('useProjectUpdates', () => {
  it('reads the first page of the timeline of the project', async () => {
    jest
      .mocked(request)
      .mockResolvedValue(ok({ items: [rocketUpdate, olderUpdate], nextCursor: null }))
    const { result } = await renderHook(() => useProjectUpdates(id), { wrapper })

    await waitFor(() =>
      expect(timelineIds(result.current)).toEqual([rocketUpdate.id, olderUpdate.id]),
    )
    expect(requestedPaths()).toEqual([`/v1/projects/${id}/updates`])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('reads the next page with the cursor of the page before', async () => {
    jest
      .mocked(request)
      .mockResolvedValueOnce(ok({ items: [rocketUpdate], nextCursor: 'abc' }))
      .mockResolvedValueOnce(ok({ items: [olderUpdate], nextCursor: null }))
    const { result } = await renderHook(() => useProjectUpdates(id), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(requestedPaths()).toEqual([
      `/v1/projects/${id}/updates`,
      `/v1/projects/${id}/updates?cursor=abc`,
    ])
    expect(timelineIds(result.current)).toEqual([rocketUpdate.id, olderUpdate.id])
    expect(result.current.hasNextPage).toBe(false)
  })

  it('says so when the timeline cannot be read', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'internal' })
    const { result } = await renderHook(() => useProjectUpdates(id), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('usePublishUpdate', () => {
  it('sends the update to its project, and says it is published', async () => {
    jest.mocked(request).mockResolvedValue(ok(freshUpdate))
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    let published = false
    await act(async () => {
      published = await result.current.publish(payload)
    })

    expect(published).toBe(true)
    expect(request).toHaveBeenCalledWith(
      `/v1/projects/${id}/updates`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
      expect.anything(),
    )
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe(false)
  })

  it('makes the update the latest of the project in the cache, one more in the count', async () => {
    jest.mocked(request).mockResolvedValue(ok(freshUpdate))
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    await act(async () => {
      await result.current.publish(payload)
    })

    expect(cachedProject()?.latestUpdate?.id).toBe(freshUpdate.id)
    expect(cachedProject()?.updateCount).toBe(3)
    // Sans version, la mise à jour ne change pas celle du projet (« la dernière qui en a une »).
    expect(cachedProject()?.version).toBe('v1.2')
  })

  it('takes the version of the new update when it has one', async () => {
    jest.mocked(request).mockResolvedValue(ok({ ...freshUpdate, version: 'v1.3' }))
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    await act(async () => {
      await result.current.publish({ ...payload, version: 'v1.3' })
    })

    expect(cachedProject()?.version).toBe('v1.3')
  })

  it('puts the update first in the timeline already read', async () => {
    serve([rocketUpdate, olderUpdate])
    const { result } = await withTimeline(() => usePublishUpdate(id))
    await waitFor(() => expect(timelineIds(result.current.timeline)).toHaveLength(2))

    await act(async () => {
      await result.current.gesture.publish(payload)
    })

    await waitFor(() => expect(timelineIds(result.current.timeline)?.[0]).toBe(freshUpdate.id))
    expect(timelineIds(result.current.timeline)).toEqual([
      freshUpdate.id,
      rocketUpdate.id,
      olderUpdate.id,
    ])
  })

  it('asks the project and the feeds to be read again once the update is published', async () => {
    jest.mocked(request).mockResolvedValue(ok(freshUpdate))
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    await act(async () => {
      await result.current.publish(payload)
    })

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toContainEqual(['feed'])
    expect(keys).toContainEqual(['project', id])
    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('is pending while the update is on its way', async () => {
    const answer = deferred<ReturnType<typeof ok<ProjectUpdate>>>()
    jest.mocked(request).mockReturnValue(answer.promise)
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    let sent: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      sent = result.current.publish(payload)
    })
    await waitFor(() => expect(result.current.pending).toBe(true))

    await act(async () => {
      answer.resolve(ok(freshUpdate))
      await sent
    })
    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('keeps the project as it was, and says so, when the API refuses', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'internal' })
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    let published = true
    await act(async () => {
      published = await result.current.publish(payload)
    })

    expect(published).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.reason).toBeUndefined()
    expect(cachedProject()?.latestUpdate?.id).toBe(rocketUpdate.id)
    expect(cachedProject()?.updateCount).toBe(2)
  })
})

describe('useDeleteUpdate', () => {
  it('deletes the update at its own address', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const { result } = await renderHook(() => useDeleteUpdate(id), { wrapper })

    let removed = false
    await act(async () => {
      removed = await result.current.remove(rocketUpdate.id)
    })

    expect(removed).toBe(true)
    expect(requestWithoutBody).toHaveBeenCalledWith(
      `/v1/projects/${id}/updates/${rocketUpdate.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    await waitFor(() => expect(result.current.error).toBe(false))
  })

  it('takes the update out of the timeline, and the one before becomes the latest', async () => {
    serve([rocketUpdate, olderUpdate])
    const { result } = await withTimeline(() => useDeleteUpdate(id))
    await waitFor(() => expect(timelineIds(result.current.timeline)).toHaveLength(2))

    await act(async () => {
      await result.current.gesture.remove(rocketUpdate.id)
    })

    await waitFor(() => expect(timelineIds(result.current.timeline)).toEqual([olderUpdate.id]))
    expect(cachedProject()?.latestUpdate?.id).toBe(olderUpdate.id)
    expect(cachedProject()?.updateCount).toBe(1)
  })

  it('leaves the project with no latest update once the last one is deleted', async () => {
    client.setQueryData(['project', id], { ...withUpdates, updateCount: 1 })
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const { result } = await renderHook(() => useDeleteUpdate(id), { wrapper })

    await act(async () => {
      await result.current.remove(rocketUpdate.id)
    })

    expect(cachedProject()?.latestUpdate).toBeNull()
    expect(cachedProject()?.updateCount).toBe(0)
  })

  it('asks the project and the feeds to be read again once the update is deleted', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    const { result } = await renderHook(() => useDeleteUpdate(id), { wrapper })

    await act(async () => {
      await result.current.remove(rocketUpdate.id)
    })

    // La version et « Mis à jour » sous le titre suivent la mise à jour précédente : seule l'API
    // la connaît quand la frise n'a pas été lue.
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toContainEqual(['feed'])
    expect(keys).toContainEqual(['project', id])
  })

  it('keeps the update, and says so, when the API refuses', async () => {
    serve([rocketUpdate, olderUpdate])
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await withTimeline(() => useDeleteUpdate(id))
    await waitFor(() => expect(timelineIds(result.current.timeline)).toHaveLength(2))

    let removed = true
    await act(async () => {
      removed = await result.current.gesture.remove(rocketUpdate.id)
    })

    expect(removed).toBe(false)
    await waitFor(() => expect(result.current.gesture.error).toBe(true))
    expect(timelineIds(result.current.timeline)).toEqual([rocketUpdate.id, olderUpdate.id])
    expect(cachedProject()?.latestUpdate?.id).toBe(rocketUpdate.id)
    expect(cachedProject()?.updateCount).toBe(2)
  })
})

// Quand « Réessaie » ne servirait à rien, le hook dit pourquoi : la feuille choisit son message.
describe('why sending an update failed', () => {
  it('says the ten updates of the day are used up when the API answers 429', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    await act(async () => {
      await result.current.publish(payload)
    })

    await waitFor(() => expect(result.current.reason).toBe('limited'))
  })

  it('says a photo is no longer waiting when the API answers invalid_photos', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'invalidPhotos' })
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    await act(async () => {
      await result.current.publish(payload)
    })

    await waitFor(() => expect(result.current.reason).toBe('invalidPhotos'))
  })

  it('says the session expired when the API answers 401, for publishing and deleting', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'unauthorized' })
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'unauthorized' })
    const publishing = await renderHook(() => usePublishUpdate(id), { wrapper })
    const deleting = await renderHook(() => useDeleteUpdate(id), { wrapper })

    await act(async () => {
      await publishing.result.current.publish(payload)
      await deleting.result.current.remove(rocketUpdate.id)
    })

    await waitFor(() => expect(publishing.result.current.reason).toBe('expired'))
    await waitFor(() => expect(deleting.result.current.reason).toBe('expired'))
  })

  it('gives no reason for an error that trying again can fix', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => usePublishUpdate(id), { wrapper })

    await act(async () => {
      await result.current.publish(payload)
    })

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.reason).toBeUndefined()
  })
})
