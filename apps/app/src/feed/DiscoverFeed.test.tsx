// Tests du fil « Découvrir » filtré par une catégorie (tranche R6b, « Récents » d'Explorer) : changer
// de filtre change toute la liste, sans que rien n'« arrive ». Les cartes d'une autre catégorie ne
// tombent pas en place comme des nouveautés (`Arrival`), même quand la liste de l'autre filtre est
// déjà en cache et s'affiche aussitôt.
//
// Jest ne joue aucune animation : on lit l'animation d'entrée (`entering`) posée autour de chaque
// carte, comme FeedList.test.tsx.
import type { FeedItem, FeedPage } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { useDiscoverFeed, useFeedNews } from './api'
import { DiscoverFeed } from './FeedList'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les lectures qui ne sont pas celles du fil (les catégories d'une carte) : une panne, sans réseau.
jest.mock('../api/client', () => ({
  request: jest.fn(async () => ({ ok: false, error: 'internal' })),
  requestWithoutBody: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))
// Les fils : de faux hooks, qui rendent aussitôt la liste de chaque filtre (comme un cache déjà lu).
jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
}))

/** Un projet du fil, publié à cette date (`at`). */
const item = (id: string, title: string, at: string): FeedItem => ({
  kind: 'project',
  at,
  project: { ...summaryOf(recipesProject), id, title, demoUrl: null },
})

const cafes = item('a1', 'Carnet de cafés', '2026-10-20T10:00:00.000Z')
const quiz = item('a2', 'Le quiz des capitales', '2026-10-19T10:00:00.000Z')
// Le seul projet « Animaux », plus ancien que les autres.
const cat = item('a3', 'Le chat qui parle', '2026-09-01T10:00:00.000Z')

/** Un fil lu, d'une page, sans suite. */
const loaded = (items: FeedItem[]) => ({
  data: { pages: [{ items, nextCursor: null } satisfies FeedPage], pageParams: [undefined] },
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

type Node = { props: Record<string, unknown>; parent: Node | null }

/** L'animation d'entrée posée autour de la carte de ce projet, ou undefined. */
const enteringOf = (title: string) => {
  let node: Node | null = screen.getByRole('link', { name: title }) as unknown as Node
  while (node) {
    if (node.props.entering !== undefined) return node.props.entering
    node = node.parent
  }
  return undefined
}

beforeEach(() => {
  jest
    .mocked(useDiscoverFeed)
    .mockImplementation(
      ({ category }) =>
        (category === 'animals' ? loaded([cat]) : loaded([cafes, quiz])) as unknown as ReturnType<
          typeof useDiscoverFeed
        >,
    )
  jest
    .mocked(useFeedNews)
    .mockReset()
    .mockReturnValue({ count: null, more: false, authors: [], kinds: [] })
})

describe('DiscoverFeed, under a category filter (R6b)', () => {
  it('drops no card in place when the filter goes back to « Toutes »', async () => {
    const { rerender } = await renderWithProviders(
      <DiscoverFeed viewerId="u1" category="animals" />,
    )
    // Témoin : le fil filtré est là.
    expect(screen.getByRole('link', { name: 'Le chat qui parle' })).toBeTruthy()

    // « Toutes » touchée : sa liste, plus récente que la carte « Animaux », s'affiche aussitôt.
    await rerender(<DiscoverFeed viewerId="u1" category={null} />)

    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
    expect(enteringOf('Carnet de cafés')).toBeUndefined()
    expect(enteringOf('Le quiz des capitales')).toBeUndefined()
  })

  it('reads the news of the filtered feed itself, not those of the feed without filter', async () => {
    await renderWithProviders(<DiscoverFeed viewerId="u1" category="animals" />)

    // Témoin : le fil filtré est là.
    expect(screen.getByRole('link', { name: 'Le chat qui parle' })).toBeTruthy()
    const calls = jest.mocked(useFeedNews).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call[4]).toBe('animals')
  })
})
