// Tests des hooks des commentaires (tranche 5) : lire la liste page par page, publier (en tête de la
// liste, ou à la fin de son fil pour une réponse), modifier, supprimer et masquer. Comme pour les
// notes, pas de mise à jour optimiste : le cache ne change qu'une fois l'API d'accord, et un refus
// laisse la liste telle quelle en le signalant.
import type { Comment, CommentPage, CommentReply, Project } from '@ruche/contracts'
import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request, requestWithoutBody } from '../api/client'
import {
  commentOf,
  maxAuthor,
  maxComment,
  replyOf,
  zoeComment,
  zoeReply,
} from '../testing/comments'
import { recipesProject } from '../testing/projects'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

const { id } = recipesProject
const path = `/v1/projects/${id}/comments`

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** La liste en cache, telle que la page l'affiche : les fils, chacun avec ses réponses. */
const cached = () => client.getQueryData<InfiniteData<CommentPage>>(['comments', id])
const threads = () =>
  cached()?.pages.flatMap((page) =>
    page.items.map((c) => [c.body, ...c.replies.map((r) => r.body)]),
  )
const commentCount = () => client.getQueryData<Project>(['project', id])?.commentCount

/** Met cette liste (une seule page) dans le cache, comme si la page l'avait déjà lue. */
const seed = (items: Comment[]) =>
  client.setQueryData<InfiniteData<CommentPage>>(['comments', id], {
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  })

/** Ce que contient le corps JSON de la demande numéro `index` envoyée par `request`. */
const bodySent = (index = 0) => {
  const init = jest.mocked(request).mock.calls[index]?.[1]
  return JSON.parse(String(init?.body))
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  // staleTime infini : rien ne se relit tout seul pendant le test (aucune vraie API ici).
  client.setQueryDefaults(['project', id], { staleTime: Infinity })
  client.setQueryDefaults(['comments', id], { staleTime: Infinity })
  client.setQueryData(['project', id], { ...recipesProject, commentCount: 4 })
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
})

describe('useComments', () => {
  it('reads the first page, then the next one with its cursor', async () => {
    jest
      .mocked(request)
      .mockResolvedValueOnce({ ok: true, data: { items: [maxComment], nextCursor: 'abc' } })
      .mockResolvedValueOnce({ ok: true, data: { items: [zoeComment], nextCursor: null } })
    const { result } = await renderHook(() => useComments(id), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)
    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(jest.mocked(request).mock.calls.map(([sentTo]) => sentTo)).toEqual([
      path,
      `${path}?cursor=abc`,
    ])
    expect(result.current.hasNextPage).toBe(false)
    expect(threads()).toEqual([
      ['Super idée, je teste ce soir.', 'Moi aussi, dis-nous !', 'Merci à vous deux.'],
      ['Ça marche aussi en anglais ?'],
    ])
  })
})

describe('usePostComment', () => {
  const fresh = commentOf({
    id: '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b',
    author: maxAuthor,
    body: 'Testé : ça marche.',
    isMine: true,
  })

  it('sends the comment, then shows it first in the list, and counts one more', async () => {
    seed([maxComment, zoeComment])
    jest.mocked(request).mockResolvedValue({ ok: true, data: fresh })
    const { result } = await renderHook(() => usePostComment(id), { wrapper })

    let published = false
    await act(async () => {
      published = await result.current.post({ body: 'Testé : ça marche.' })
    })

    expect(published).toBe(true)
    expect(request).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ method: 'POST' }),
      expect.anything(),
    )
    expect(bodySent()).toEqual({ body: 'Testé : ça marche.' })
    expect(threads()?.map((thread) => thread[0])).toEqual([
      'Testé : ça marche.',
      'Super idée, je teste ce soir.',
      'Ça marche aussi en anglais ?',
    ])
    expect(commentCount()).toBe(5)
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe(false)
  })

  it('sends a reply with the comment it answers, then shows it at the end of its thread', async () => {
    seed([maxComment, zoeComment])
    const reply = commentOf({ id: fresh.id, body: 'Oui, en anglais aussi.', author: maxAuthor })
    jest.mocked(request).mockResolvedValue({ ok: true, data: reply })
    const { result } = await renderHook(() => usePostComment(id), { wrapper })

    await act(async () => {
      await result.current.post({ body: 'Oui, en anglais aussi.', replyTo: zoeComment.id })
    })

    expect(bodySent()).toEqual({ body: 'Oui, en anglais aussi.', replyTo: zoeComment.id })
    expect(threads()).toEqual([
      ['Super idée, je teste ce soir.', 'Moi aussi, dis-nous !', 'Merci à vous deux.'],
      ['Ça marche aussi en anglais ?', 'Oui, en anglais aussi.'],
    ])
    expect(commentCount()).toBe(5)
  })

  it('keeps the list as it was, and says why, when the API refuses', async () => {
    seed([zoeComment])
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = await renderHook(() => usePostComment(id), { wrapper })

    let published = true
    await act(async () => {
      published = await result.current.post({ body: 'Un de trop' })
    })

    expect(published).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.reason).toBe('limited')
    expect(threads()).toEqual([['Ça marche aussi en anglais ?']])
    expect(commentCount()).toBe(4)
  })

  it('says the session expired when the API answers 401', async () => {
    seed([])
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'unauthorized' })
    const { result } = await renderHook(() => usePostComment(id), { wrapper })

    await act(async () => {
      await result.current.post({ body: 'Bonjour' })
    })

    await waitFor(() => expect(result.current.reason).toBe('expired'))
  })

  it('gives no reason for an error that trying again can fix', async () => {
    seed([])
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => usePostComment(id), { wrapper })

    await act(async () => {
      await result.current.post({ body: 'Bonjour' })
    })

    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.reason).toBeUndefined()
  })
})

describe('useEditComment', () => {
  it('sends the new text to the comment, then shows it, marked as edited', async () => {
    seed([maxComment, zoeComment])
    const edited: CommentReply = {
      ...replyOf({ id: zoeComment.id, body: 'Et en espagnol ?' }),
      editedAt: '2026-10-16T09:00:00.000Z',
      isMine: true,
    }
    jest.mocked(request).mockResolvedValue({ ok: true, data: edited })
    const { result } = await renderHook(() => useEditComment(id), { wrapper })

    let saved = false
    await act(async () => {
      saved = await result.current.edit({ id: zoeComment.id, body: 'Et en espagnol ?' })
    })

    expect(saved).toBe(true)
    expect(request).toHaveBeenCalledWith(
      `${path}/${zoeComment.id}`,
      expect.objectContaining({ method: 'PATCH' }),
      expect.anything(),
    )
    expect(bodySent()).toEqual({ body: 'Et en espagnol ?' })
    const thread = cached()?.pages[0]?.items[1]
    expect(thread).toMatchObject({ body: 'Et en espagnol ?', editedAt: '2026-10-16T09:00:00.000Z' })
  })

  it('edits a reply in its thread', async () => {
    seed([maxComment])
    const edited = {
      ...zoeReply,
      body: 'Moi aussi, raconte !',
      editedAt: '2026-10-16T09:00:00.000Z',
    }
    jest.mocked(request).mockResolvedValue({ ok: true, data: edited })
    const { result } = await renderHook(() => useEditComment(id), { wrapper })

    await act(async () => {
      await result.current.edit({ id: zoeReply.id, body: 'Moi aussi, raconte !' })
    })

    expect(threads()).toEqual([
      ['Super idée, je teste ce soir.', 'Moi aussi, raconte !', 'Merci à vous deux.'],
    ])
  })

  it('keeps the text as it was, and says so, when the API refuses', async () => {
    seed([zoeComment])
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useEditComment(id), { wrapper })

    let saved = true
    await act(async () => {
      saved = await result.current.edit({ id: zoeComment.id, body: 'Autre' })
    })

    expect(saved).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(threads()).toEqual([['Ça marche aussi en anglais ?']])
  })
})

describe('useDeleteComment', () => {
  beforeEach(() => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
  })

  it('deletes a comment without replies at its own address, and removes it from the list', async () => {
    seed([maxComment, zoeComment])
    const { result } = await renderHook(() => useDeleteComment(id), { wrapper })

    let removed = false
    await act(async () => {
      removed = await result.current.remove(zoeComment.id)
    })

    expect(removed).toBe(true)
    expect(requestWithoutBody).toHaveBeenCalledWith(
      `${path}/${zoeComment.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(threads()).toEqual([
      ['Super idée, je teste ce soir.', 'Moi aussi, dis-nous !', 'Merci à vous deux.'],
    ])
  })

  it('turns a comment with replies into « deleted comment », and keeps the replies', async () => {
    seed([maxComment])
    const { result } = await renderHook(() => useDeleteComment(id), { wrapper })

    await act(async () => {
      await result.current.remove(maxComment.id)
    })

    const [thread] = cached()?.pages[0]?.items ?? []
    expect(thread).toMatchObject({ id: maxComment.id, state: 'deleted', author: null, body: '' })
    expect(thread?.replies.map((r) => r.body)).toEqual([
      'Moi aussi, dis-nous !',
      'Merci à vous deux.',
    ])
  })

  it('removes a reply from its thread', async () => {
    seed([maxComment])
    const { result } = await renderHook(() => useDeleteComment(id), { wrapper })

    await act(async () => {
      await result.current.remove(zoeReply.id)
    })

    expect(threads()).toEqual([['Super idée, je teste ce soir.', 'Merci à vous deux.']])
  })

  it('keeps the comment, and says so, when the API refuses', async () => {
    seed([zoeComment])
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'unauthorized' })
    const { result } = await renderHook(() => useDeleteComment(id), { wrapper })

    let removed = true
    await act(async () => {
      removed = await result.current.remove(zoeComment.id)
    })

    expect(removed).toBe(false)
    await waitFor(() => expect(result.current.reason).toBe('expired'))
    expect(threads()).toEqual([['Ça marche aussi en anglais ?']])
  })
})

describe('useHideComment', () => {
  beforeEach(() => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: true, data: null })
  })

  it('hides a comment at its own address, and marks it as hidden in the list', async () => {
    seed([maxComment])
    const { result } = await renderHook(() => useHideComment(id), { wrapper })

    let done = false
    await act(async () => {
      done = await result.current.setHidden({ id: maxComment.id, hidden: true })
    })

    expect(done).toBe(true)
    expect(requestWithoutBody).toHaveBeenCalledWith(
      `${path}/${maxComment.id}/hide`,
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(cached()?.pages[0]?.items[0]).toMatchObject({
      state: 'hidden',
      body: 'Super idée, je teste ce soir.', // l'autrice du projet le lit encore
    })
  })

  it('shows a hidden reply back', async () => {
    seed([{ ...maxComment, replies: [{ ...zoeReply, state: 'hidden' }] }])
    const { result } = await renderHook(() => useHideComment(id), { wrapper })

    await act(async () => {
      await result.current.setHidden({ id: zoeReply.id, hidden: false })
    })

    expect(requestWithoutBody).toHaveBeenCalledWith(
      `${path}/${zoeReply.id}/hide`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(cached()?.pages[0]?.items[0]?.replies[0]?.state).toBe('visible')
  })

  it('keeps the comment as it was, and says so, when the API refuses', async () => {
    seed([maxComment])
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useHideComment(id), { wrapper })

    let done = true
    await act(async () => {
      done = await result.current.setHidden({ id: maxComment.id, hidden: true })
    })

    expect(done).toBe(false)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(cached()?.pages[0]?.items[0]?.state).toBe('visible')
  })
})
