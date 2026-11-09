// Tests des hooks du catalogue des outils (tranche R6b) : la page d'un outil se lit filtrée, page
// par page, dans la langue de l'appli, et seulement quand l'écran le permet ; les écritures d'un
// administrateur (admettre, créer, modifier) vont à leur adresse, rendent toujours un résultat, et
// marquent périmées la liste des outils et les pages d'outil quand elles réussissent.
import type { AdminCatalogueTool, ToolPage } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import '../testing/text'
import { useAdmitTool, useCreateTool, useEditTool, useToolPage } from './api'

// Le client réseau est remplacé : on lit les demandes envoyées, et on choisit les réponses.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))

let client: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

const page = (nextCursor: string | null): ToolPage => ({
  tool: {
    slug: 'lovable',
    name: 'Lovable',
    family: 'no-code',
    description: null,
    siteUrl: null,
    projectCount: 0,
  },
  categories: [],
  projects: [],
  nextCursor,
})

const lovable: AdminCatalogueTool = {
  slug: 'lovable',
  name: 'Lovable',
  family: 'no-code',
  descriptionFr: null,
  descriptionEn: null,
  siteUrl: null,
  aliases: [],
  projectCount: 3,
}

const values = {
  name: 'Lovable',
  family: 'no-code',
  descriptionFr: 'Écrit une application web.',
  descriptionEn: 'Writes a web app.',
  siteUrl: null,
} as const

/** Les adresses demandées, dans l'ordre. */
const paths = () => jest.mocked(request).mock.calls.map((call) => call[0])

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  jest.mocked(request).mockReset()
})

describe('useToolPage', () => {
  it('reads the filtered page in the language of the app, then the next page by its cursor', async () => {
    jest
      .mocked(request)
      .mockResolvedValueOnce({ ok: true, data: page('page-2') })
      .mockResolvedValueOnce({ ok: true, data: page(null) })
    const { result } = await renderHook(
      () => useToolPage('lovable', { status: 'testable', category: 'cooking' }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(paths()).toEqual(['/v1/tags/lovable?status=testable&category=cooking'])
    const init = jest.mocked(request).mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('Accept-Language')).toBe('fr')
    expect(result.current.hasNextPage).toBe(true)

    await act(async () => {
      await result.current.fetchNextPage()
    })
    expect(paths()[1]).toBe('/v1/tags/lovable?status=testable&category=cooking&cursor=page-2')
    expect(result.current.hasNextPage).toBe(false)
  })

  it('keeps the slug a single path segment', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: page(null) })
    const { result } = await renderHook(() => useToolPage('../me', {}), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(paths()).toEqual(['/v1/tags/..%2Fme'])
  })

  it('sends nothing while it is not enabled (the page waits for its address)', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: page(null) })
    await renderHook(() => useToolPage('lovable', {}, false), { wrapper })
    await act(async () => {})

    expect(paths()).toEqual([])
  })

  it('says « not found » for a tool outside the catalogue', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'notFound' })
    const { result } = await renderHook(() => useToolPage('teachable-machine', {}), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ key: 'notFound' })
  })
})

describe('the writes of an administrator on a tool', () => {
  /** Pose la liste des outils et une page d'outil en cache, pour voir si elles sont marquées périmées. */
  const seed = () => {
    for (const key of [['tools'], ['tool', 'lovable', 'fr', null, null]]) {
      client.setQueryDefaults(key, { staleTime: Infinity })
      client.setQueryData(key, {})
    }
  }
  const stale = () =>
    [['tools'], ['tool', 'lovable', 'fr', null, null]].map(
      (key) => client.getQueryState(key)?.isInvalidated ?? false,
    )

  it('admits an other tool at its own address, and marks the tools and tool pages stale', async () => {
    seed()
    jest.mocked(request).mockResolvedValue({ ok: true, data: lovable })
    const { result } = await renderHook(() => useAdmitTool(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.admit('make-com', values)
    })

    expect(answer).toEqual({ ok: true, data: lovable })
    const [path, init] = jest.mocked(request).mock.calls[0] ?? []
    expect(path).toBe('/v1/moderation/tools/make-com/admit')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(values)
    expect(stale()).toEqual([true, true])
  })

  it('creates a tool, then edits one, each at its address', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: lovable })
    const create = await renderHook(() => useCreateTool(), { wrapper })
    const edit = await renderHook(() => useEditTool(), { wrapper })

    await act(async () => {
      await create.result.current.create(values)
      await edit.result.current.edit('lovable', { name: 'Lovable Studio' })
    })

    const calls = jest.mocked(request).mock.calls
    expect(calls.map(([path, init]) => [init.method, path])).toEqual([
      ['POST', '/v1/moderation/tools'],
      ['PATCH', '/v1/moderation/tools/lovable'],
    ])
    expect(JSON.parse(String(calls[1]?.[1].body))).toEqual({ name: 'Lovable Studio' })
  })

  it('gives back a refusal without throwing, and leaves the caches as they were', async () => {
    seed()
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'toolNameTaken' })
    const { result } = await renderHook(() => useEditTool(), { wrapper })

    let answer: unknown
    await act(async () => {
      answer = await result.current.edit('lovable', { name: 'Claude' })
    })

    expect(answer).toEqual({ ok: false, error: 'toolNameTaken' })
    expect(stale()).toEqual([false, false])
    expect(result.current.pending).toBe(false)
  })
})
