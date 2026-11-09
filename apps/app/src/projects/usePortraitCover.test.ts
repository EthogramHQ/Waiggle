// Tests de `usePortraitCover` (R6a, correction C4, D1) : la couverture verticale de la feuille de
// publication. Création : l'image choisie attend sur l'appareil, `flush` l'envoie après la création
// du projet. Modification : la choisir l'envoie tout de suite, la retirer la supprime tout de suite
// (la vignette part au toucher), un échec se dit et le projet se relit. Dans tous les cas, la
// réponse du serveur ne touche que `portraitCover` dans le cache : jamais les photos.
import type { Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { createElement, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { createI18n } from '../i18n'
import { photo, projectWithPhotos } from '../testing/projects'
import { usePortraitCover } from './usePortraitCover'

type Sent = { method: string; path: string }
const mockSent: Sent[] = []
/** Ce que le « serveur » répond (null : une erreur 500). */
let mockReply: Project | null
let mockInitial: Project
const mockPick = { next: null as { uri: string; width: number; height: number } | null }

jest.mock('../api/client', () => ({
  request: async (path: string, init: RequestInit) => {
    mockSent.push({ method: init.method ?? 'GET', path })
    if (!init.method) return { ok: true, data: mockInitial }
    return mockReply ? { ok: true, data: mockReply } : { ok: false, error: 'internal' }
  },
  requestWithoutBody: async () => ({ ok: true, data: null }),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../media/pick', () => ({
  appendImage: async () => undefined,
  pickImage: async (_shape: string, onChosen?: () => void) => {
    const image = mockPick.next
    mockPick.next = null
    if (image) onChosen?.()
    return image
  },
}))

const newCover = photo('55555555-5555-4555-8555-555555555555', 900, 1600)
const image = { uri: 'file:///portrait.jpg', width: 1080, height: 1920 }

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client },
    createElement(I18nextProvider, { i18n: createI18n('fr') }, children),
  )
const cached = () => client.getQueryData<Project>(['project', projectWithPhotos.id])

beforeEach(() => {
  mockInitial = projectWithPhotos
  mockSent.length = 0
  mockPick.next = null
  mockReply = projectWithPhotos
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
})

describe('usePortraitCover, a project to create', () => {
  it('keeps the chosen image on the device until flush, which sends it once', async () => {
    const { result } = await renderHook(() => usePortraitCover(), { wrapper })
    expect(result.current.tile).toBeNull()

    mockPick.next = image
    await act(async () => result.current.onPick())
    // Témoin : rien n'est parti, mais la vignette est là et l'écran sait qu'une image attend.
    expect(mockSent).toHaveLength(0)
    expect(result.current.tile?.key).toBe(image.uri)
    expect(result.current.chosen).toBe(true)

    // L'image n'est pas encore dans le cache du projet : `flush` en crée le tiroir seulement si
    // le projet y est (il y est, la création vient de le ranger).
    client.setQueryData(['project', projectWithPhotos.id], {
      ...projectWithPhotos,
      portraitCover: null,
    })
    mockReply = { ...projectWithPhotos, portraitCover: newCover }
    let flushed: { failed: number } = { failed: -1 }
    await act(async () => {
      const first = result.current.flush(projectWithPhotos.id)
      const second = result.current.flush(projectWithPhotos.id) // double tape : le même envoi
      flushed = await first
      await second
    })
    expect(flushed).toEqual({ failed: 0 })
    expect(mockSent.filter((one) => one.method === 'POST')).toHaveLength(1)
    expect(cached()?.portraitCover?.id).toBe(newCover.id)
    expect(result.current.chosen).toBe(false)
  })

  it('removes a chosen image at once, without calling the server', async () => {
    const { result } = await renderHook(() => usePortraitCover(), { wrapper })
    mockPick.next = image
    await act(async () => result.current.onPick())
    expect(result.current.tile).not.toBeNull()

    await act(async () => result.current.onRemove())
    expect(result.current.tile).toBeNull()
    expect(mockSent).toHaveLength(0)
  })

  it('reports an upload that failed, so the screen opens the edit sheet', async () => {
    const { result } = await renderHook(() => usePortraitCover(), { wrapper })
    mockPick.next = image
    await act(async () => result.current.onPick())
    mockReply = null

    let flushed: { failed: number } = { failed: -1 }
    await act(async () => {
      flushed = await result.current.flush(projectWithPhotos.id)
    })
    expect(flushed).toEqual({ failed: 1 })
    // L'image reste choisie : rien n'est perdu.
    expect(result.current.chosen).toBe(true)
  })
})

describe('usePortraitCover, a project to edit', () => {
  beforeEach(() => {
    client.setQueryData(['project', projectWithPhotos.id], projectWithPhotos)
  })

  it('shows the saved cover, and sends a new one straight away, leaving the photos alone', async () => {
    const { result } = await renderHook(() => usePortraitCover(projectWithPhotos.id), { wrapper })
    expect(result.current.tile?.key).toBe(projectWithPhotos.portraitCover?.id)

    // Une réponse qui ne connaît (par retard) qu'une seule photo : le cache garde ses trois.
    mockReply = { ...projectWithPhotos, portraitCover: newCover, visuals: [] }
    mockPick.next = image
    await act(async () => result.current.onPick())

    await waitFor(() => expect(result.current.tile?.key).toBe(newCover.id))
    expect(mockSent.filter((one) => one.method === 'POST')).toHaveLength(1)
    expect(cached()?.visuals).toHaveLength(3)
  })

  it('removes the cover at once on the screen, then deletes it on the server', async () => {
    mockReply = { ...projectWithPhotos, portraitCover: null }
    const { result } = await renderHook(() => usePortraitCover(projectWithPhotos.id), { wrapper })

    await act(async () => result.current.onRemove())
    expect(result.current.tile).toBeNull()
    await waitFor(() => expect(mockSent.filter((one) => one.method === 'DELETE')).toHaveLength(1))
    expect(mockSent.find((one) => one.method === 'DELETE')?.path).toContain(
      projectWithPhotos.portraitCover?.id,
    )
  })

  it('says a failed removal and reads the project again, so the cover comes back', async () => {
    mockReply = null
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    const { result } = await renderHook(() => usePortraitCover(projectWithPhotos.id), { wrapper })

    await act(async () => result.current.onRemove())
    await waitFor(() => expect(result.current.problem).toBe('internal'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project', projectWithPhotos.id] })

    await act(async () => result.current.clearProblem())
    expect(result.current.problem).toBeNull()
  })

  it('ignores a second tap on "choose" while the first picks', async () => {
    const { result } = await renderHook(() => usePortraitCover(projectWithPhotos.id), { wrapper })
    mockPick.next = image
    await act(async () => {
      result.current.onPick()
      result.current.onPick()
    })
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(mockSent.filter((one) => one.method === 'POST')).toHaveLength(1)
  })
})
