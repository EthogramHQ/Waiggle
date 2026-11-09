// Une réponse de photo ne remplace pas la couverture verticale du cache (R6a, correction C4, D2) :
// la couverture a sa propre file d'écritures (`usePortraitCover`). Si la réponse d'une photo, partie
// avant que la couverture change, arrive après, elle porte l'ancienne couverture : l'écrire dans le
// cache la ferait disparaître de la feuille (affichage seulement, le serveur a la bonne).
import type { Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createI18n } from '../i18n'
import { projectWithPhotos } from '../testing/projects'
import { usePhotoTiles } from './usePhotoTiles'

const mockSent: { method: string; path: string }[] = []
/** La réponse tardive : le projet d'avant la couverture. */
let mockStale: Project
let mockInitial: Project

jest.mock('../api/client', () => ({
  request: async (path: string, init: RequestInit) => {
    mockSent.push({ method: init.method ?? 'GET', path })
    return { ok: true, data: init.method ? mockStale : mockInitial }
  },
  requestWithoutBody: async () => ({ ok: true, data: null }),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../media/pick', () => ({
  appendImage: async () => undefined,
  pickVisuals: async () => [],
}))

const ids = projectWithPhotos.visuals.map((visual) => visual.id)

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>
    <I18nextProvider i18n={createI18n('fr')}>{children}</I18nextProvider>
  </QueryClientProvider>
)
const cached = () => client.getQueryData<Project>(['project', projectWithPhotos.id])

beforeEach(() => {
  mockInitial = projectWithPhotos
  mockSent.length = 0
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(['project', projectWithPhotos.id], projectWithPhotos)
})

describe('usePhotoTiles, a late photo response', () => {
  it('keeps the cached portrait cover when a removal answers with an older one', async () => {
    mockStale = {
      ...projectWithPhotos,
      portraitCover: null,
      visuals: projectWithPhotos.visuals.slice(1),
    }
    const { result } = await renderHook(() => usePhotoTiles(projectWithPhotos.id), { wrapper })

    await act(async () => result.current.actions.onRemove(ids[0] ?? ''))
    await waitFor(() => expect(mockSent.filter((one) => one.method === 'DELETE')).toHaveLength(1))

    // Témoin : la réponse a bien été rangée (les photos suivent le serveur)…
    await waitFor(() => expect(cached()?.visuals).toHaveLength(2))
    // … mais pas sa couverture verticale.
    expect(cached()?.portraitCover?.id).toBe(projectWithPhotos.portraitCover?.id)
  })

  it('keeps it too after a reorder and after a description is written', async () => {
    mockStale = { ...projectWithPhotos, portraitCover: null }
    const { result } = await renderHook(() => usePhotoTiles(projectWithPhotos.id), { wrapper })

    await act(async () => result.current.actions.onMove(1, 0))
    await waitFor(() => expect(mockSent.filter((one) => one.method === 'PATCH')).toHaveLength(1))
    await waitFor(() => expect(cached()?.portraitCover).not.toBeNull())

    await act(async () => result.current.describe(ids[0] ?? '', 'Vue de face'))
    await act(async () => {
      await result.current.flushPending(projectWithPhotos.id)
    })
    await waitFor(() => expect(mockSent.filter((one) => one.method === 'PATCH')).toHaveLength(2))
    expect(cached()?.portraitCover?.id).toBe(projectWithPhotos.portraitCover?.id)
  })
})
