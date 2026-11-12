// Tests du hook « Voir en contexte » (R8) : `useCommentContext(commentId)` lit
// GET /v1/comments/{commentId}/context, qui rend le projet du commentaire et son fil entier
// (`CommentContext` : `{ projectId, thread }`). Sans commentaire visé, rien ne part (`idle`). L'API
// répond 404 pour tout ce que le membre ne peut pas voir ou qui n'existe plus : le hook dit alors
// `gone`, et la feuille écrit « Ce commentaire n'est plus là. ». Un fichier à part de
// `api.test.tsx`, pour que l'absence du hook ne fasse pas tomber les tests des autres hooks.
import type { CommentContext } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { maxComment } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { useCommentContext } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** La réponse de Léa : la réponse de Zoé, dans le fil de Max, sur le projet des recettes. */
const [zoeReply] = maxComment.replies
const context: CommentContext = { projectId: recipesProject.id, thread: maxComment }

/** Les adresses demandées à l'API, dans l'ordre. */
const asked = () => jest.mocked(request).mock.calls.map(([to]) => to)

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  jest.mocked(request).mockReset()
})

describe('useCommentContext', () => {
  it('stays idle and asks nothing without a comment to show', async () => {
    const { result } = await renderHook(() => useCommentContext(null), { wrapper })

    expect(result.current.status).toBe('idle')
    expect(result.current.thread).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('is loading until the context arrives', async () => {
    jest.mocked(request).mockImplementation(() => new Promise(() => {}))
    const { result } = await renderHook(() => useCommentContext(zoeReply?.id ?? ''), { wrapper })

    expect(result.current.status).toBe('loading')
  })

  it('finds the project and the whole thread of the comment', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: context })
    const { result } = await renderHook(() => useCommentContext(zoeReply?.id ?? ''), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('found'))
    expect(result.current.projectId).toBe(recipesProject.id)
    expect(result.current.thread?.id).toBe(maxComment.id)
    expect(result.current.thread?.replies.map((reply) => reply.body)).toEqual([
      'Moi aussi, dis-nous !',
      'Merci à vous deux.',
    ])
    expect(asked()).toEqual([`/v1/comments/${zoeReply?.id}/context`])
  })

  it('says the comment is gone when the API answers 404', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'notFound' })
    const { result } = await renderHook(() => useCommentContext(zoeReply?.id ?? ''), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('gone'))
    expect(result.current.thread).toBeUndefined()
    expect(result.current.projectId).toBeUndefined()
  })

  it('keeps the identifier a single part of the address', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'notFound' })
    const { result } = await renderHook(() => useCommentContext('../me?x=1'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('gone'))
    expect(asked()).toEqual([`/v1/comments/${encodeURIComponent('../me?x=1')}/context`])
  })

  it('asks again for another comment', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: context })
    const { result, rerender } = await renderHook(
      ({ id }: { id: string | null }) => useCommentContext(id),
      { wrapper, initialProps: { id: zoeReply?.id ?? null } },
    )
    await waitFor(() => expect(result.current.status).toBe('found'))

    jest.mocked(request).mockResolvedValue({ ok: false, error: 'notFound' })
    await rerender({ id: maxComment.id })

    await waitFor(() => expect(result.current.status).toBe('gone'))
    expect(asked()).toEqual([
      `/v1/comments/${zoeReply?.id}/context`,
      `/v1/comments/${maxComment.id}/context`,
    ])
  })
})
