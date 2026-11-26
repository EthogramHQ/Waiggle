// Tests du fil en temps réel (R21, docs/scenarios/refonte.md : « le Fil et Explorer : le bouton des
// nouveautés paraît dès la publication, au lieu d'attendre la minute ; le fil ne s'insère pas tout
// seul »). Nora publie un projet public : le serveur envoie `feed` à tous les membres, l'appli
// relit seulement la tête du fil (une lecture à part, choix 5 du plan), et le bouton
// « 1 nouveau projet » paraît. Les cartes affichées ne bougent pas : la nouvelle n'entre que quand
// le membre touche le bouton.
//
// Le fil « Découvrir » (`DiscoverFeed`, « Récents » d'Explorer) avec ses vrais hooks ; seul le
// client de l'API est simulé, avec ce que le serveur rendrait.
import type { DiscoverFeedPage, FeedItem } from '@ruche/contracts'
import { act, screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { liveSignal } from '../testing/live'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { DiscoverFeed } from './FeedList'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

/** Un projet public du fil, publié par Nora à cette date. */
const item = (id: string, title: string, at: string): FeedItem => ({
  kind: 'project',
  at,
  project: {
    ...summaryOf(recipesProject),
    id,
    title,
    demoUrl: null,
    author: { ...summaryOf(recipesProject).author, id: 'u2', name: 'Nora Benali' },
  },
})

const cafes = item('a1', 'Carnet de cafés', '2026-10-20T10:00:00.000Z')
const quiz = item('a2', 'Le quiz des capitales', '2026-10-19T10:00:00.000Z')
// Publié par Nora pendant que Malik regarde le fil.
const garden = item('a3', 'Le carnet de jardin', '2026-10-21T10:00:00.000Z')

/** Ce que rend GET /v1/feed/discover, choisi par le test. */
let serverItems: FeedItem[] = []
let feedReads = 0

beforeEach(() => {
  serverItems = [cafes, quiz]
  feedReads = 0
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/feed/discover')) {
        feedReads += 1
        const page: DiscoverFeedPage = {
          items: serverItems,
          nextCursor: null,
          followedAuthorIds: [],
        }
        return { ok: true, data: page }
      }
      return { ok: false, error: 'network' }
    })
})

/** Le fil de Malik (u4), lu une première fois. */
const renderFeed = async () => {
  const rendered = await renderWithProviders(<DiscoverFeed viewerId="u4" />)
  await act(async () => {})
  // Témoin : les deux cartes sont là, sans bouton des nouveautés.
  expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '1 nouveau projet' })).toBeNull()
  return rendered
}

describe('the feed in real time', () => {
  it('shows the news button as soon as a public project is published', async () => {
    const { queryClient } = await renderFeed()

    serverItems = [garden, cafes, quiz]
    await liveSignal(queryClient, { topic: 'feed', kind: 'feed' })

    expect(screen.getByRole('button', { name: '1 nouveau projet' })).toBeTruthy()
  })

  it('does not insert the new card by itself: the shown feed does not move', async () => {
    const { queryClient } = await renderFeed()
    const before = feedReads

    serverItems = [garden, cafes, quiz]
    await liveSignal(queryClient, { topic: 'feed', kind: 'feed' })

    // Seule la tête a été relue, une fois ; la nouvelle carte attend le toucher du bouton.
    expect(feedReads).toBe(before + 1)
    expect(screen.queryByRole('link', { name: 'Le carnet de jardin' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
  })
})
