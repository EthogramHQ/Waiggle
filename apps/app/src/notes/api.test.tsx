// Tests des hooks des notes : publier range la note en tête du journal en cache, supprimer l'en
// retire, et un refus de l'API laisse le journal tel quel en le signalant.
import type { Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { recipesProject } from '../testing/projects'
import { useDeleteNote, usePublishNote } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const { id } = recipesProject
const v2 = {
  id: '0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718',
  body: 'v2 : mode hors ligne',
  createdAt: '2026-10-14T09:00:00.000Z',
}
const firstVersion = {
  id: '1c2d3e4f-5061-4b72-9c83-d4e5f6071829',
  body: 'Première version en ligne',
  createdAt: '2026-10-12T09:00:00.000Z',
}

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Le journal du projet en cache, tel que la page l'affiche. */
const journal = () => client.getQueryData<Project>(['project', id])?.notes.map((n) => n.body)

beforeEach(() => {
  client = new QueryClient({
    // gcTime: Infinity : pas de minuterie de nettoyage, qui empêcherait Jest de s'arrêter.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  // staleTime infini : le projet en cache ne se relit pas pendant le test (aucune vraie API ici).
  client.setQueryDefaults(['project', id], { staleTime: Infinity })
  client.setQueryData(['project', id], { ...recipesProject, notes: [firstVersion] })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
})

describe('usePublishNote', () => {
  it('sends the note to its project, then shows it first in the journal', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: v2 })
    const { result } = await renderHook(() => usePublishNote(id), { wrapper })

    let published = false
    await act(async () => {
      published = await result.current.publish('v2 : mode hors ligne')
    })

    expect(published).toBe(true)
    expect(request).toHaveBeenCalledWith(
      `/v1/projects/${id}/notes`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ body: v2.body }) }),
      expect.anything(),
    )
    expect(journal()).toEqual(['v2 : mode hors ligne', 'Première version en ligne'])
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe(false)
  })

  it('asks the feeds to be read again once the note is published', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: v2 })
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    const { result } = await renderHook(() => usePublishNote(id), { wrapper })

    await act(async () => {
      await result.current.publish('v2 : mode hors ligne')
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] })
    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('keeps the journal as it was, and says so, when the API refuses', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => usePublishNote(id), { wrapper })

    let published = true
    await act(async () => {
      published = await result.current.publish('v2 : mode hors ligne')
    })

    expect(published).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(journal()).toEqual(['Première version en ligne'])
  })
})

describe('useDeleteNote', () => {
  it('deletes the note at its own address, then removes it from the journal', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
    const { result } = await renderHook(() => useDeleteNote(id), { wrapper })

    let removed = false
    await act(async () => {
      removed = await result.current.remove(firstVersion.id)
    })

    expect(removed).toBe(true)
    expect(requestWithoutBody).toHaveBeenCalledWith(`/v1/projects/${id}/notes/${firstVersion.id}`, {
      method: 'DELETE',
    })
    expect(journal()).toEqual([])
    await waitFor(() => expect(result.current.error).toBe(false))
  })

  it('keeps the note, and says so, when the API refuses', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useDeleteNote(id), { wrapper })

    let removed = true
    await act(async () => {
      removed = await result.current.remove(firstVersion.id)
    })

    expect(removed).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(journal()).toEqual(['Première version en ligne'])
  })
})
