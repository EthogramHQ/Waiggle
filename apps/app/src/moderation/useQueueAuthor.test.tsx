// La fiche de l'auteur pour la fenêtre « Suspendre » (R9, C10) : son sous-titre (« @sam ·
// inscription le 14 août · déjà décidé : 2 retraits, 1 suspension ») vient de ce que la file sait
// du membre (`authorRecord`). La fenêtre a sa propre adresse (`/suspend`) : ouverte depuis la file,
// par un lien direct ou depuis la page du membre, elle retrouve cette fiche dans la file, déjà lue
// ou lue pour elle, sans relire sous les yeux une file déjà affichée dessous.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { moderationQueuePageOf, scamCommentItem } from '../testing/moderation'
import { useQueueAuthor } from './api'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

/** Les lectures de la file (GET /v1/moderation/reports). */
const queueReads = () =>
  jest
    .mocked(request)
    .mock.calls.filter(([path]) => String(path).startsWith('/v1/moderation/reports')).length

const sam = scamCommentItem.authorRecord

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset().mockResolvedValue({ ok: true, data: moderationQueuePageOf() })
})

describe('useQueueAuthor', () => {
  it('finds the record of the member in the queue, read for the sheet on a direct link', async () => {
    const { result } = await renderHook(() => useQueueAuthor('u5', true), { wrapper })
    await waitFor(() => expect(result.current).toEqual(sam))
    expect(queueReads()).toBe(1)
  })

  it('reads nothing while it is not enabled (before hydration, without a session)', async () => {
    const { result } = await renderHook(() => useQueueAuthor('u5', false), { wrapper })
    expect(result.current).toBeUndefined()
    expect(queueReads()).toBe(0)
  })

  it('takes the queue already shown below without reading it again', async () => {
    client.setQueryData(['moderation', 'queue'], {
      pages: [moderationQueuePageOf()],
      pageParams: [undefined],
    })
    const { result } = await renderHook(() => useQueueAuthor('u5', true), { wrapper })
    expect(result.current).toEqual(sam)
    // Le temps qu'une relecture parte, s'il en partait une.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(queueReads()).toBe(0)
  })

  it('gives nothing for a member the queue does not know', async () => {
    const { result } = await renderHook(() => useQueueAuthor('nobody', true), { wrapper })
    await waitFor(() => expect(queueReads()).toBe(1))
    expect(result.current).toBeUndefined()
  })
})
