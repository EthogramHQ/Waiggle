// Tests du hook des photos en mode « mise à jour » (R7a, U3b) : `usePhotoTiles(id, { slot: 'update',
// max: 4 })`. Chaque photo part tout de suite avec `slot=update` ; le serveur répond par la photo en
// attente (son `id`, que la mise à jour citera), pas par le projet, dont le cache ne bouge pas.
// Retirer une photo l'efface du serveur ; « Abandonner » efface toutes celles de la feuille (relecture
// de sécurité A11) ; le plafond de 100 photos par projet (409 `update_photos_full`) se dit sur la tuile.
// Le réseau est remplacé par un faux qui garde chaque demande (méthode, chemin, champ `slot`).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import type { ApiResult } from '../api/errors'
import { createI18n } from '../i18n'
import { projectWithPhotos } from '../testing/projects'
import { fr } from '../testing/text'
import { projectQueryKey } from './hooks'
import { usePhotoTiles } from './usePhotoTiles'

type Sent = { method: string; path: string; slot: unknown }
const mockSent: Sent[] = []
/** Les réponses imposées aux envois de photos, dans l'ordre (sinon : la photo en attente). */
const mockUploads: (() => Promise<ApiResult<unknown>> | ApiResult<unknown>)[] = []
const mockPick = { next: [] as { uri: string; width: number; height: number }[] }

const mockPendingId = (n: number) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`

/** Le champ `slot` d'un formulaire multipart (FormData de React Native, ou celui du web). */
const mockSlotOf = (body: unknown) => {
  const form = body as {
    getParts?: () => { fieldName: string; string?: string }[]
    get?: (name: string) => unknown
  }
  return form?.getParts?.().find((part) => part.fieldName === 'slot')?.string ?? form?.get?.('slot')
}

jest.mock('../api/client', () => {
  let uploads = 0
  const record = (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    mockSent.push({ method, path, slot: method === 'POST' ? mockSlotOf(init.body) : undefined })
    return method
  }
  return {
    request: async (path: string, init: RequestInit) => {
      const method = record(path, init)
      const fixtures = require('../testing/projects') as typeof import('../testing/projects')
      if (method === 'POST') {
        const forced = mockUploads.shift()
        if (forced) return forced()
        uploads += 1
        return { ok: true, data: fixtures.photo(mockPendingId(uploads)) }
      }
      // Toute autre réponse : un projet (celle des routes de la galerie).
      return { ok: true, data: { ...fixtures.projectWithPhotos } }
    },
    requestWithoutBody: async (path: string, init: RequestInit) => {
      record(path, init)
      return { ok: true, data: null }
    },
    resetUploads: () => {
      uploads = 0
    },
  }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../media/pick', () => ({
  appendImage: async () => undefined,
  pickVisuals: async (
    _slot: string,
    _remaining: number,
    onChosen: (images: { uri: string; width: number; height: number }[]) => void,
  ) => {
    const images = mockPick.next
    mockPick.next = []
    if (images.length > 0) onChosen(images)
    return images
  },
}))

const image = (name: string) => ({ uri: `file:///${name}.jpg`, width: 2048, height: 1536 })
const { id } = projectWithPhotos

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <I18nextProvider i18n={createI18n('fr')}>{children}</I18nextProvider>
  </QueryClientProvider>
)

beforeEach(() => {
  mockSent.length = 0
  mockUploads.length = 0
  ;(jest.requireMock('../api/client') as { resetUploads: () => void }).resetUploads()
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  })
  // Le projet est déjà dans le cache (la feuille l'a lu) : le hook ne doit pas y toucher.
  client.setQueryData(projectQueryKey(id), projectWithPhotos)
})

const sent = (method: string, path: RegExp) =>
  mockSent.filter((one) => one.method === method && path.test(one.path))
const VISUALS = /\/visuals$/
const VISUAL = /\/visuals\/[^/]+$/

const renderUpdateTiles = () =>
  renderHook(() => usePhotoTiles(id, { slot: 'update', max: 4 }), { wrapper })

/** Choisit des photos, comme la galerie de l'appareil, et attend que tout soit parti. */
const add = async (
  result: { current: ReturnType<typeof usePhotoTiles> },
  ...names: string[]
): Promise<void> => {
  mockPick.next = names.map(image)
  await act(async () => result.current.actions.onAdd())
}

describe('usePhotoTiles for an update (R7a)', () => {
  it('sends each photo as an update photo and keeps the id the server gives back', async () => {
    const { result } = await renderUpdateTiles()

    await add(result, 'jour', 'nuit')

    await waitFor(() => expect(result.current.photos.every((one) => !one.uploading)).toBe(true))
    expect(sent('POST', VISUALS).map((one) => one.slot)).toEqual(['update', 'update'])
    expect(result.current.photos.map((one) => one.id)).toEqual([mockPendingId(1), mockPendingId(2)])
    expect(result.current.tiles.map((tile) => tile.state)).toEqual(['ready', 'ready'])
  })

  it('has no id while the photo is uploading', async () => {
    let finish: (value: ApiResult<unknown>) => void = () => {}
    mockUploads.push(
      () =>
        new Promise((done) => {
          finish = done
        }),
    )
    const { result } = await renderUpdateTiles()

    await add(result, 'jour')

    expect(result.current.photos).toEqual([
      expect.objectContaining({ id: null, uploading: true, description: null }),
    ])
    expect(result.current.tiles[0]?.state).toBe('uploading')
    const { photo } = jest.requireActual(
      '../testing/projects',
    ) as typeof import('../testing/projects')
    await act(async () => finish({ ok: true, data: photo(mockPendingId(9)) }))
    expect(result.current.photos).toEqual([
      expect.objectContaining({ id: mockPendingId(9), uploading: false }),
    ])
  })

  it('leaves the cached project untouched', async () => {
    const { result } = await renderUpdateTiles()

    await add(result, 'jour')
    await waitFor(() => expect(result.current.photos[0]?.id).toBe(mockPendingId(1)))

    expect(client.getQueryData(projectQueryKey(id))).toBe(projectWithPhotos)
    // Témoin : la galerie du projet ne se montre pas dans les tuiles de la mise à jour.
    expect(result.current.tiles).toHaveLength(1)
  })

  it('erases a removed photo from the server', async () => {
    const { result } = await renderUpdateTiles()
    await add(result, 'jour', 'nuit')
    await waitFor(() => expect(result.current.photos[1]?.id).toBe(mockPendingId(2)))

    const first = result.current.tiles[0]?.key ?? ''
    await act(async () => result.current.actions.onRemove(first))

    await waitFor(() =>
      expect(sent('DELETE', VISUAL).map((one) => one.path)).toEqual([
        `/v1/projects/${id}/visuals/${mockPendingId(1)}`,
      ]),
    )
    expect(result.current.photos.map((one) => one.id)).toEqual([mockPendingId(2)])
  })

  it('erases a photo removed while it was uploading, once the server has it', async () => {
    let finish: (value: ApiResult<unknown>) => void = () => {}
    mockUploads.push(
      () =>
        new Promise((done) => {
          finish = done
        }),
    )
    const { result } = await renderUpdateTiles()
    await add(result, 'jour')

    const key = result.current.tiles[0]?.key ?? ''
    await act(async () => result.current.actions.onRemove(key))
    expect(result.current.tiles).toEqual([])

    const { photo } = jest.requireActual(
      '../testing/projects',
    ) as typeof import('../testing/projects')
    await act(async () => finish({ ok: true, data: photo(mockPendingId(7)) }))
    await waitFor(() =>
      expect(sent('DELETE', VISUAL).map((one) => one.path)).toEqual([
        `/v1/projects/${id}/visuals/${mockPendingId(7)}`,
      ]),
    )
    expect(result.current.photos).toEqual([])
  })

  it('erases every pending photo of the sheet on « Abandonner »', async () => {
    const { result } = await renderUpdateTiles()
    await add(result, 'jour', 'nuit')
    await waitFor(() => expect(result.current.photos[1]?.id).toBe(mockPendingId(2)))

    await act(async () => result.current.discardPending())

    expect(sent('DELETE', VISUAL).map((one) => one.path)).toEqual([
      `/v1/projects/${id}/visuals/${mockPendingId(1)}`,
      `/v1/projects/${id}/visuals/${mockPendingId(2)}`,
    ])
    expect(result.current.tiles).toEqual([])
  })

  it('says on the tile that the project has reached 100 update photos', async () => {
    mockUploads.push(() => ({ ok: false, error: 'updatePhotosFull' }))
    const { result } = await renderUpdateTiles()

    await add(result, 'jour')

    await waitFor(() => expect(result.current.tiles[0]?.state).toBe('failed'))
    expect(result.current.tiles[0]?.error).toBe(fr.t(($) => $.project.updates.photosFull))
    // Une photo refusée ne part pas avec la mise à jour.
    expect(result.current.photos).toEqual([])
  })

  it('keeps four photos at most, and says how many were kept', async () => {
    const { result } = await renderUpdateTiles()

    await add(result, 'a', 'b', 'c', 'd', 'e')

    expect(result.current.tiles).toHaveLength(4)
    expect(result.current.cut).toEqual({ count: 4, max: 4 })
    await waitFor(() => expect(sent('POST', VISUALS)).toHaveLength(4))
  })

  it('sends the description typed for a photo with the update', async () => {
    const { result } = await renderUpdateTiles()
    await add(result, 'jour')
    await waitFor(() => expect(result.current.photos[0]?.id).toBe(mockPendingId(1)))

    const key = result.current.tiles[0]?.key ?? ''
    await act(async () => result.current.describe(key, '  La fusée de jour  '))

    expect(result.current.photos[0]?.description).toBe('La fusée de jour')
    // Rien ne part pour la description : elle voyage avec la mise à jour (pas de PATCH).
    expect(sent('PATCH', VISUAL)).toEqual([])
  })
})
