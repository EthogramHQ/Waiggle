// Tests du hook des photos de la feuille de publication (R6a) : en création rien ne part avant
// `flushPending`, puis les photos partent dans l'ordre, chacune suivie de sa description ; en
// modification, chaque geste part tout de suite ; des photos au-delà des places sont coupées.
// Le réseau est remplacé par un faux qui garde chaque demande (méthode, chemin, corps).
import type { Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createI18n } from '../i18n'
import { projectWithPhotos } from '../testing/projects'
import { usePhotoTiles } from './usePhotoTiles'

type Sent = { method: string; path: string; body: unknown }
const mockSent: Sent[] = []
let mockProject: Project
const mockPick = { next: [] as { uri: string; width: number; height: number }[] }

const mockUploadedId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`

jest.mock('../api/client', () => ({
  request: async (path: string, init: RequestInit) => {
    const method = init.method ?? 'GET'
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : 'form'
    mockSent.push({ method, path, body })
    const { photo: makePhoto } =
      require('../testing/projects') as typeof import('../testing/projects')
    const visualId = /\/visuals\/([^/]+)$/.exec(path)?.[1]
    if (method === 'POST') {
      const id = mockUploadedId(mockProject.visuals.length + 1)
      mockProject = { ...mockProject, visuals: [...mockProject.visuals, makePhoto(id)] }
    } else if (method === 'DELETE') {
      mockProject = {
        ...mockProject,
        visuals: mockProject.visuals.filter((visual) => visual.id !== visualId),
      }
    } else if (method === 'PATCH' && !visualId) {
      const order = (body as { visualOrder: string[] }).visualOrder
      mockProject = {
        ...mockProject,
        visuals: order.flatMap((id) => mockProject.visuals.filter((visual) => visual.id === id)),
      }
    }
    return { ok: true, data: mockProject }
  },
  requestWithoutBody: async () => ({ ok: true, data: null }),
}))
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

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <I18nextProvider i18n={createI18n('fr')}>{children}</I18nextProvider>
  </QueryClientProvider>
)

beforeEach(() => {
  mockSent.length = 0
  mockProject = { ...projectWithPhotos, visuals: [] }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
})

const sentTo = (method: string, path: RegExp) =>
  mockSent.filter((one) => one.method === method && path.test(one.path))

describe('usePhotoTiles, a project to create', () => {
  it('keeps the chosen photos on the device, then sends them in order with their description', async () => {
    mockPick.next = [image('a'), image('b'), image('c')]
    const { result } = await renderHook(() => usePhotoTiles(), { wrapper })

    await act(async () => result.current.actions.onAdd())
    await waitFor(() => expect(result.current.tiles).toHaveLength(3))
    expect(result.current.tiles.map((tile) => tile.state)).toEqual(['ready', 'ready', 'ready'])
    const first = result.current.tiles[0]?.key ?? ''
    await act(async () => result.current.describe(first, 'La Lune'))
    // Le deuxième geste inverse les deux premières : la description suit sa photo.
    await act(async () => result.current.actions.onMove(0, 1))
    expect(mockSent).toHaveLength(0)

    const flushed = await act(async () => result.current.flushPending('projet-neuf'))
    expect(flushed).toEqual({ failed: 0 })
    expect(sentTo('POST', /visuals$/)).toHaveLength(3)
    // La photo décrite est partie en deuxième : elle a reçu le deuxième identifiant.
    expect(sentTo('PATCH', /visuals\//).map((one) => [one.path, one.body])).toEqual([
      [expect.stringContaining(mockUploadedId(2)), { description: 'La Lune' }],
    ])
  })

  it('cuts the photos beyond the free places and says how many were kept', async () => {
    mockPick.next = Array.from({ length: 8 }, (_, i) => image(`p${i}`))
    const { result } = await renderHook(() => usePhotoTiles(), { wrapper })

    await act(async () => result.current.actions.onAdd())

    await waitFor(() => expect(result.current.tiles).toHaveLength(6))
    expect(result.current.cut).toEqual({ count: 6, max: 6 })
  })
})

describe('usePhotoTiles, a project to edit', () => {
  const ids = projectWithPhotos.visuals.map((visual) => visual.id)
  beforeEach(() => {
    mockProject = projectWithPhotos
    client.setQueryData(['project', projectWithPhotos.id], projectWithPhotos)
  })

  it('removes a photo at once and writes the new order and description straight away', async () => {
    const { result } = await renderHook(() => usePhotoTiles(projectWithPhotos.id), { wrapper })
    expect(result.current.tiles.map((tile) => tile.key)).toEqual(ids)

    await act(async () => result.current.actions.onRemove(ids[1] ?? ''))
    expect(result.current.tiles.map((tile) => tile.key)).toEqual([ids[0], ids[2]])
    await waitFor(() => expect(sentTo('DELETE', new RegExp(`${ids[1]}$`))).toHaveLength(1))

    await act(async () => result.current.actions.onMove(1, 0))
    await waitFor(() =>
      expect(sentTo('PATCH', /\/v1\/projects\/[^/]+$/).map((one) => one.body)).toEqual([
        { visualOrder: [ids[2], ids[0]] },
      ]),
    )

    await act(async () => result.current.describe(ids[0] ?? '', 'Vue de face'))
    await act(async () => {
      await result.current.flushPending(projectWithPhotos.id)
      await result.current.flushPending(projectWithPhotos.id) // blur puis fermeture : une seule écriture
    })
    expect(sentTo('PATCH', /visuals\//).map((one) => one.body)).toEqual([
      { description: 'Vue de face' },
    ])
  })
})
