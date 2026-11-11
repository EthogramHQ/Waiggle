// Tests des hooks du coin des testeurs (R7b) : lire le coin, ses appels, ses fils et leurs messages ;
// lancer et supprimer un appel ; envoyer et supprimer un message ; régler un retour et le remettre
// à traiter ; marquer un fil comme lu ; retirer un testeur ; les retours à régler d'une mise à jour ;
// envoyer une image. Les caches changent au toucher (avant la réponse) quand le geste retire ou
// coche quelque chose, reviennent en arrière si l'API refuse, et sont relus après. Et les brouillons
// du coin (`testers/drafts.ts`), oubliés à la déconnexion.
//
// L'interface attendue de `testers/corner-api.ts`, fixée par ces tests (plan R7b, U0) :
// - lectures, des `useQuery` / `useInfiniteQuery` de React Query (leur résultat tel quel) :
//   `useTesterCorner(projectId)` → `TesterCorner` (GET …/testers) ;
//   `useCalls(projectId)` → pages `TesterCallPage` (GET …/calls, puis `?cursor=`) ;
//   `useThreads(projectId, state)` → pages `TesterThreadPage` (GET …/threads?state=, puis `cursor`) ;
//   `useThreadMessages(projectId, testerId)` → pages `TesterMessagePage` (GET
//   …/threads/{testerId}/messages, puis `?cursor=`), du plus récent au plus ancien comme l'API ;
//   `useOpenFeedback(projectId)` → `OpenFeedbackList` (GET …/feedback/open) ;
// - écritures, chacune `{ <geste>, pending: boolean, error: boolean, reason?: CornerFailure }`, le
//   geste rendant `Promise<boolean>` (vrai si l'API a accepté) :
//   `useRemoveTester(projectId)` → `remove(memberId)` (DELETE …/testers/{memberId}) ;
//   `useSendCall(projectId)` → `send(call: NewTesterCall)` (POST …/calls) ;
//   `useDeleteCall(projectId)` → `remove(callId)` (DELETE …/calls/{callId}) ;
//   `useSendMessage(projectId, testerId)` → `send(message: NewTesterMessage)` (POST
//   …/threads/{testerId}/messages) ;
//   `useDeleteMessage(projectId, testerId)` → `remove(messageId)` (DELETE …/messages/{messageId}) ;
//   `useSettleFeedback(projectId)` → `settle(messageId)` / `unsettle(messageId)` (POST / DELETE
//   …/messages/{messageId}/settled) ;
//   `useMarkThreadRead(projectId, testerId)` → `markRead()` (POST …/threads/{testerId}/read) ;
//   `useUploadTesterMedia(projectId, kind)` → `upload(image: { uri })` qui rend
//   `Promise<TesterMedia | null>` (POST …/testers/media, multipart `file` et `kind`) ;
// - `CornerFailure` : `'limited'` (429), `'expired'` (401), `'invalidPhoto'` (400
//   `invalid_photo`), `'closed'` (409 `corner_closed` ou `thread_closed`), `'full'` (409
//   `tester_media_full`) ; absent pour une erreur qu'un nouvel essai peut régler.
// Et de `testers/drafts.ts` : `useDraft<T>(key, empty)` → `[value, setValue, clear]`, et
// `clearAllDrafts()`, appelée par `signOut` (`accounts/api.ts`, ui-B7).
import type {
  NewTesterCall,
  TesterCall,
  TesterCorner,
  TesterMessage,
  TesterThreadSummary,
} from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { signOut } from '../accounts/api'
import { authClient } from '../accounts/auth-client'
import { request, requestWithoutBody } from '../api/client'
import type { ApiResult } from '../api/errors'
import {
  useCalls,
  useDeleteCall,
  useDeleteMessage,
  useMarkThreadRead,
  useOpenFeedback,
  useRemoveTester,
  useSendCall,
  useSendMessage,
  useSettleFeedback,
  useTesterCorner,
  useThreadMessages,
  useThreads,
  useUploadTesterMedia,
} from './corner-api'
import { clearAllDrafts, useDraft } from './drafts'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({
  request: jest.fn(),
  requestWithoutBody: jest.fn(),
  apiFetch: jest.fn(),
}))
// Le magasin de session de Better Auth, pour la déconnexion (comme accounts/signOut.test.ts).
jest.mock('../accounts/auth-client', () => {
  let value: Record<string, unknown> = {}
  return {
    authClient: {
      signOut: jest.fn(),
      $store: {
        atoms: {
          session: {
            get: () => value,
            set: (next: Record<string, unknown>) => {
              value = next
            },
          },
        },
      },
    },
  }
})
jest.mock('../media/pick', () => ({
  ...jest.requireActual('../media/pick'),
  appendImage: async (form: FormData, field: string, image: { uri: string }) => {
    form.append(field, image.uri)
  },
}))

const projectId = '6f1c2a8e-3b4d-4c5e-9f60-7a8b9c0d1e2f'
const P = `/v1/projects/${projectId}`
const uuid = (family: string, n: number) =>
  `${family.repeat(8)}-${family.repeat(4)}-4${family.repeat(3)}-8${family.repeat(3)}-${String(n).padStart(12, '0')}`
const at = '2026-11-09T12:00:00.000Z'

const corner: TesterCorner = {
  role: 'author',
  closed: false,
  testerCount: 2,
  testers: [
    { id: 'u4', name: 'Inès Martin', handle: null, avatarUrl: null, since: at },
    { id: 'u5', name: 'Sam Petit', handle: 'sam', avatarUrl: null, since: at },
  ],
}
const call = (n: number): TesterCall => ({
  id: uuid('a', n),
  text: `Appel ${n}`,
  photo: null,
  createdAt: at,
  removal: null,
})
const message = (n: number, changes: Partial<TesterMessage> = {}): TesterMessage => ({
  id: uuid('c', n),
  kind: 'feedback',
  sender: 'tester',
  outcome: 'partly',
  device: null,
  text: `Retour ${n}`,
  capture: null,
  createdAt: at,
  settled: null,
  removal: null,
  mine: false,
  ...changes,
})
const thread = (testerId: string, changes: Partial<TesterThreadSummary> = {}) => ({
  tester: { id: testerId, name: testerId, handle: null, avatarUrl: null, current: true, since: at },
  lastAt: at,
  lastFrom: 'tester' as const,
  unread: true,
  state: 'open' as const,
  excerpt: null,
  ...changes,
})
const media = {
  id: uuid('d', 1),
  url: 'https://api.example.com/media/testers/x.webp',
  width: 10,
  height: 10,
  thumbhash: null,
  description: null,
}

/** Les réponses du faux client, par méthode et chemin (sans paramètres). */
let answers: Record<string, ApiResult<unknown> | (() => Promise<ApiResult<unknown>>)> = {}
const answerFor = async (path: string, init: RequestInit = {}) => {
  const method = (init.method ?? 'GET').toUpperCase()
  const key = `${method} ${new URL(path, 'http://test').pathname}`
  const found = answers[key]
  if (typeof found === 'function') return found()
  return found ?? { ok: false, error: 'notFound' }
}
/** Les demandes reçues : méthode, chemin complet (avec paramètres) et corps. */
const sent = () =>
  [...jest.mocked(request).mock.calls, ...jest.mocked(requestWithoutBody).mock.calls].map(
    ([path, init]) => ({
      method: ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase(),
      path: String(path),
      body: (init as RequestInit | undefined)?.body,
    }),
  )
const sentTo = (method: string, path: string) =>
  sent().filter((one) => one.method === method && one.path.split('?')[0] === path)

/** Une réponse qui n'arrive qu'à l'appel de `release` : on regarde le cache entre-temps. */
const held = (value: ApiResult<unknown>) => {
  let release: () => void = () => {}
  const answer = () =>
    new Promise<ApiResult<unknown>>((resolve) => {
      release = () => resolve(value)
    })
  return { answer, release: () => release() }
}

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  client = new QueryClient({
    // gcTime: Infinity : pas de minuterie de nettoyage, qui empêcherait Jest de s'arrêter.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  answers = {
    [`GET ${P}/testers`]: { ok: true, data: corner },
    [`GET ${P}/calls`]: { ok: true, data: { items: [call(1), call(2)], nextCursor: null } },
    [`GET ${P}/threads`]: {
      ok: true,
      data: {
        items: [thread('u4'), thread('u5')],
        nextCursor: null,
        counts: { open: 2, settled: 0 },
      },
    },
    [`GET ${P}/threads/u4/messages`]: {
      ok: true,
      data: { items: [message(2, { kind: 'reply', outcome: null }), message(1)], nextCursor: null },
    },
    [`GET ${P}/feedback/open`]: {
      ok: true,
      data: [
        {
          id: uuid('c', 1),
          tester: { name: 'Inès Martin', current: true },
          outcome: 'partly',
          excerpt: 'Retour 1',
          createdAt: at,
        },
      ],
    },
  }
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
  jest.mocked(request).mockImplementation(async (path, init, schema) => {
    const result = await answerFor(path, init)
    if (!result.ok) return result
    const parsed = schema.safeParse(result.data)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
  })
  jest.mocked(requestWithoutBody).mockImplementation(async (path, init) => {
    const result = await answerFor(path, init)
    return result.ok ? { ok: true, data: null } : result
  })
  clearAllDrafts()
})

// --- Les lectures ---

describe('the readings of the corner', () => {
  it('reads the corner at GET …/testers', async () => {
    const { result } = await renderHook(() => useTesterCorner(projectId), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(corner))
  })

  it('reads the calls page by page, with the cursor of the previous page', async () => {
    answers[`GET ${P}/calls`] = { ok: true, data: { items: [call(1)], nextCursor: 'p2' } }
    const { result } = await renderHook(() => useCalls(projectId), { wrapper })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))

    answers[`GET ${P}/calls`] = { ok: true, data: { items: [call(2)], nextCursor: null } }
    await act(async () => {
      await result.current.fetchNextPage()
    })

    expect(result.current.data?.pages.flatMap((page) => page.items.map((one) => one.id))).toEqual([
      call(1).id,
      call(2).id,
    ])
    expect(sentTo('GET', `${P}/calls`).map((one) => one.path)).toContain(`${P}/calls?cursor=p2`)
    expect(result.current.hasNextPage).toBe(false)
  })

  it('reads the threads of one filter, « À traiter » or « Réglés »', async () => {
    const { result } = await renderHook(() => useThreads(projectId, 'settled'), { wrapper })

    await waitFor(() =>
      expect(result.current.data?.pages[0]?.counts).toEqual({ open: 2, settled: 0 }),
    )
    const asked = new URL(sentTo('GET', `${P}/threads`)[0]?.path ?? '', 'http://test')
    expect(asked.searchParams.get('state')).toBe('settled')
  })

  it('reads the messages of a thread, newest first as the API sends them', async () => {
    const { result } = await renderHook(() => useThreadMessages(projectId, 'u4'), { wrapper })

    await waitFor(() =>
      expect(result.current.data?.pages[0]?.items.map((one) => one.id)).toEqual([
        uuid('c', 2),
        uuid('c', 1),
      ]),
    )
  })

  it('reads the feedback still to handle for the update sheet', async () => {
    const { result } = await renderHook(() => useOpenFeedback(projectId), { wrapper })

    await waitFor(() => expect(result.current.data?.map((one) => one.id)).toEqual([uuid('c', 1)]))
  })
})

// --- Les appels ---

describe('calls', () => {
  it('sends a call and puts it at the top of the calls', async () => {
    const created = call(9)
    answers[`POST ${P}/calls`] = { ok: true, data: created }
    const { result } = await renderHook(
      () => ({ calls: useCalls(projectId), send: useSendCall(projectId) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.calls.data?.pages).toHaveLength(1))
    const body: NewTesterCall = { text: 'Appel 9', photoId: null, photoDescription: null }

    let accepted = false
    await act(async () => {
      accepted = await result.current.send.send(body)
    })

    expect(accepted).toBe(true)
    expect(JSON.parse(String(sentTo('POST', `${P}/calls`)[0]?.body))).toEqual(body)
    expect(result.current.calls.data?.pages[0]?.items[0]?.id).toBe(created.id)
  })

  it.each([
    ['rateLimited', 'limited'],
    ['unauthorized', 'expired'],
    ['invalidPhoto', 'invalidPhoto'],
    ['cornerClosed', 'closed'],
  ] as const)('says why a call failed when the API answers %s', async (error, reason) => {
    answers[`POST ${P}/calls`] = { ok: false, error }
    const { result } = await renderHook(() => useSendCall(projectId), { wrapper })

    let accepted = true
    await act(async () => {
      accepted = await result.current.send({
        text: 'Un appel',
        photoId: null,
        photoDescription: null,
      })
    })

    expect(accepted).toBe(false)
    await waitFor(() => expect(result.current.reason).toBe(reason))
    expect(result.current.error).toBe(true)
  })

  it('tells the quota of the project from the quota of the member when a call is refused', async () => {
    answers[`POST ${P}/calls`] = { ok: false, error: 'rateLimited', projectLimit: true }
    const { result } = await renderHook(() => useSendCall(projectId), { wrapper })

    await act(async () => {
      await result.current.send({ text: 'Un appel', photoId: null, photoDescription: null })
    })

    await waitFor(() => expect(result.current.reason).toBe('callsLimited'))
  })

  it('removes a call at the touch, before the answer comes', async () => {
    const answer = held({ ok: true, data: null })
    answers[`DELETE ${P}/calls/${call(1).id}`] = answer.answer
    const { result } = await renderHook(
      () => ({ calls: useCalls(projectId), del: useDeleteCall(projectId) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.calls.data?.pages).toHaveLength(1))

    let removing: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      removing = result.current.del.remove(call(1).id)
    })

    expect(result.current.calls.data?.pages[0]?.items.map((one) => one.id)).toEqual([call(2).id])
    await act(async () => {
      answer.release()
      await removing
    })
  })

  it('puts the call back when the API refuses its deletion', async () => {
    answers[`DELETE ${P}/calls/${call(1).id}`] = { ok: false, error: 'network' }
    const { result } = await renderHook(
      () => ({ calls: useCalls(projectId), del: useDeleteCall(projectId) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.calls.data?.pages).toHaveLength(1))

    let removed = true
    await act(async () => {
      removed = await result.current.del.remove(call(1).id)
    })

    expect(removed).toBe(false)
    expect(result.current.calls.data?.pages[0]?.items.map((one) => one.id)).toContain(call(1).id)
  })
})

// --- Les messages ---

describe('messages', () => {
  const renderThread = async () => {
    const view = await renderHook(
      () => ({
        messages: useThreadMessages(projectId, 'u4'),
        send: useSendMessage(projectId, 'u4'),
        del: useDeleteMessage(projectId, 'u4'),
        settle: useSettleFeedback(projectId),
        read: useMarkThreadRead(projectId, 'u4'),
      }),
      { wrapper },
    )
    await waitFor(() => expect(view.result.current.messages.data?.pages).toHaveLength(1))
    return view
  }
  const shownIds = (result: {
    current: Awaited<ReturnType<typeof renderThread>>['result']['current']
  }) => result.current.messages.data?.pages.flatMap((page) => page.items.map((one) => one.id))
  const settledOf = (
    result: { current: Awaited<ReturnType<typeof renderThread>>['result']['current'] },
    id: string,
  ) =>
    result.current.messages.data?.pages.flatMap((page) => page.items).find((one) => one.id === id)
      ?.settled

  it('sends a reply into the thread and shows it as the newest message', async () => {
    const reply = message(5, { kind: 'reply', outcome: null, sender: 'author', mine: true })
    answers[`POST ${P}/threads/u4/messages`] = { ok: true, data: reply }
    const { result } = await renderThread()

    let accepted = false
    await act(async () => {
      accepted = await result.current.send.send({ kind: 'reply', text: 'Merci !' })
    })

    expect(accepted).toBe(true)
    expect(JSON.parse(String(sentTo('POST', `${P}/threads/u4/messages`)[0]?.body))).toEqual({
      kind: 'reply',
      text: 'Merci !',
    })
    expect(shownIds(result)?.[0]).toBe(reply.id)
  })

  it.each([
    ['rateLimited', 'limited'],
    ['threadClosed', 'closed'],
    ['cornerClosed', 'closed'],
    ['invalidPhoto', 'invalidPhoto'],
  ] as const)('says why a message failed when the API answers %s', async (error, reason) => {
    answers[`POST ${P}/threads/u4/messages`] = { ok: false, error }
    const { result } = await renderThread()

    await act(async () => {
      await result.current.send.send({ kind: 'reply', text: 'Merci !' })
    })

    await waitFor(() => expect(result.current.send.reason).toBe(reason))
  })

  it('removes a message at the touch, before the answer comes', async () => {
    const answer = held({ ok: true, data: null })
    answers[`DELETE ${P}/messages/${uuid('c', 2)}`] = answer.answer
    const { result } = await renderThread()

    let removing: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      removing = result.current.del.remove(uuid('c', 2))
    })

    expect(shownIds(result)).toEqual([uuid('c', 1)])
    await act(async () => {
      answer.release()
      await removing
    })
  })

  it('marks a feedback settled at the touch, then unsettles it', async () => {
    const answer = held({ ok: true, data: null })
    answers[`POST ${P}/messages/${uuid('c', 1)}/settled`] = answer.answer
    answers[`DELETE ${P}/messages/${uuid('c', 1)}/settled`] = { ok: true, data: null }
    const { result } = await renderThread()

    let settling: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      settling = result.current.settle.settle(uuid('c', 1))
    })
    // « Réglé » paraît avant la réponse : un second toucher lit déjà le nouvel état.
    expect(settledOf(result, uuid('c', 1))).toEqual(expect.objectContaining({ update: null }))
    await act(async () => {
      answer.release()
      await settling
    })

    await act(async () => {
      await result.current.settle.unsettle(uuid('c', 1))
    })
    expect(settledOf(result, uuid('c', 1))).toBeNull()
    expect(sentTo('DELETE', `${P}/messages/${uuid('c', 1)}/settled`)).toHaveLength(1)
  })

  it('puts « Réglé » back off when the API refuses', async () => {
    answers[`POST ${P}/messages/${uuid('c', 1)}/settled`] = { ok: false, error: 'network' }
    const { result } = await renderThread()

    let settled = true
    await act(async () => {
      settled = await result.current.settle.settle(uuid('c', 1))
    })

    expect(settled).toBe(false)
    expect(settledOf(result, uuid('c', 1))).toBeNull()
  })

  it('marks the thread read with POST …/threads/{testerId}/read', async () => {
    answers[`POST ${P}/threads/u4/read`] = { ok: true, data: null }
    const { result } = await renderThread()

    await act(async () => {
      await result.current.read.markRead()
    })

    expect(sentTo('POST', `${P}/threads/u4/read`)).toHaveLength(1)
  })

  it('takes the unread mark off the thread row at the touch', async () => {
    answers[`POST ${P}/threads/u4/read`] = { ok: true, data: null }
    const { result } = await renderHook(
      () => ({ threads: useThreads(projectId, 'open'), read: useMarkThreadRead(projectId, 'u4') }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.threads.data?.pages).toHaveLength(1))

    await act(async () => {
      await result.current.read.markRead()
    })

    const rows = result.current.threads.data?.pages.flatMap((page) => page.items) ?? []
    expect(rows.find((one) => one.tester.id === 'u4')?.unread).toBe(false)
    expect(rows.find((one) => one.tester.id === 'u5')?.unread).toBe(true)
  })
})

// --- Retirer un testeur ---

describe('removing a tester', () => {
  it('takes the tester off the list and the count at the touch, with DELETE …/testers/{id}', async () => {
    const answer = held({ ok: true, data: null })
    answers[`DELETE ${P}/testers/u4`] = answer.answer
    const { result } = await renderHook(
      () => ({ corner: useTesterCorner(projectId), remove: useRemoveTester(projectId) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.corner.data).toBeTruthy())

    let removing: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      removing = result.current.remove.remove('u4')
    })

    expect(result.current.corner.data?.testers?.map((one) => one.id)).toEqual(['u5'])
    expect(result.current.corner.data?.testerCount).toBe(1)
    await act(async () => {
      answer.release()
      await removing
    })
    expect(sentTo('DELETE', `${P}/testers/u4`)).toHaveLength(1)
  })

  it('puts the tester back when the API refuses, and says why for a closed corner', async () => {
    answers[`DELETE ${P}/testers/u4`] = { ok: false, error: 'cornerClosed' }
    const { result } = await renderHook(
      () => ({ corner: useTesterCorner(projectId), remove: useRemoveTester(projectId) }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.corner.data).toBeTruthy())

    await act(async () => {
      await result.current.remove.remove('u4')
    })

    expect(result.current.corner.data?.testers?.map((one) => one.id)).toEqual(['u4', 'u5'])
    expect(result.current.corner.data?.testerCount).toBe(2)
    await waitFor(() => expect(result.current.remove.reason).toBe('closed'))
  })
})

// --- Les images ---

describe('uploading a tester image', () => {
  it.each(['call', 'capture'] as const)('sends a %s as multipart, with its kind', async (kind) => {
    answers[`POST ${P}/testers/media`] = { ok: true, data: media }
    const { result } = await renderHook(() => useUploadTesterMedia(projectId, kind), { wrapper })

    let uploaded: unknown = null
    await act(async () => {
      uploaded = await result.current.upload({ uri: 'file:///capture.jpg' })
    })

    expect(uploaded).toEqual(media)
    const body = sentTo('POST', `${P}/testers/media`)[0]?.body as FormData | undefined
    const parts = (
      body as unknown as { getParts?: () => { fieldName: string; string?: string }[] }
    )?.getParts?.()
    const field = (name: string) =>
      parts?.find((part) => part.fieldName === name)?.string ?? body?.get?.(name)
    expect(field('kind')).toBe(kind)
    expect(field('file')).toBe('file:///capture.jpg')
  })

  it('says the thread holds too many images when the API answers tester_media_full', async () => {
    answers[`POST ${P}/testers/media`] = { ok: false, error: 'testerMediaFull' }
    const { result } = await renderHook(() => useUploadTesterMedia(projectId, 'capture'), {
      wrapper,
    })

    let uploaded: unknown = 'not yet'
    await act(async () => {
      uploaded = await result.current.upload({ uri: 'file:///capture.jpg' })
    })

    expect(uploaded).toBeNull()
    await waitFor(() => expect(result.current.reason).toBe('full'))
  })
})

// --- Les brouillons du coin ---

describe('the drafts of the tester corner', () => {
  const key = `u4:${projectId}:feedback`

  it('keeps a draft for the next sheet opened with the same key', async () => {
    const first = await renderHook(() => useDraft(key, ''), { wrapper })
    await act(async () => {
      first.result.current[1]('Un retour à finir')
    })
    await first.unmount()

    const second = await renderHook(() => useDraft(key, ''), { wrapper })
    expect(second.result.current[0]).toBe('Un retour à finir')
  })

  it('forgets the tester corner drafts when the member signs out', async () => {
    jest
      .mocked(authClient.signOut)
      .mockResolvedValue({ data: { success: true }, error: null } as never)
    const first = await renderHook(() => useDraft(key, ''), { wrapper })
    await act(async () => {
      first.result.current[1]('Un retour à finir')
    })
    await first.unmount()
    // Témoin : avant la déconnexion, le brouillon est bien gardé.
    const before = await renderHook(() => useDraft(key, ''), { wrapper })
    expect(before.result.current[0]).toBe('Un retour à finir')
    await before.unmount()

    await signOut()

    const after = await renderHook(() => useDraft(key, ''), { wrapper })
    expect(after.result.current[0]).toBe('')
  })
})
