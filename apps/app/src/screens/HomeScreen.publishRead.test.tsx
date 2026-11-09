// Tests de l'écran d'accueil (HomeScreen) après une publication, avec le vrai cache de React Query
// (correction C2 de R6a, relecture de design B1). HomeScreen.publish.test.tsx prête un faux fil,
// déjà à jour ; ici, le fil est le vrai `useFollowingFeed`, branché sur une fausse API, pour rejouer
// ce qui se passe dans l'appli :
//
// 1. le fil est affiché sous la feuille de publication (l'accueil n'est pas la page affichée) ;
// 2. « Publier » : la feuille demande au cache de relire les fils (`invalidateQueries`), puis se
//    ferme sur `/?published=<id>` ;
// 3. l'accueil redevient la page affichée, pendant que la lecture du fil est en route.
//
// La relecture vit dans le navigateur : l'avis « Projet publié » manquait une fois sur deux, que
// l'API réponde tout de suite ou en 300 ms. L'écran décidait sur la page gardée en mémoire, celle
// d'avant la publication, parce que sa propre relecture avait annulé celle du cache. Une lecture en
// route se laisse finir ; une lecture annulée ne vaut pas un refus.
import type { FeedItem, FollowingFeedPage } from '@ruche/contracts'
import type { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { useFeedNews, useFollowingFeed } from '../feed/api'
import { mockSession, renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { HomeScreen } from './HomeScreen'
import {
  fromMax,
  mockScreenProps,
  october,
  projectItem,
  resetHomeMocks,
} from './HomeScreen.testkit'

jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La fausse API : seul le fil « Abonnements » est lu par ce test (voir `serve`).
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Le fil « Abonnements » et ses nouveautés restent les vrais (rebranchés dans `beforeEach`) : la
// relecture des nouveautés, lancée elle aussi par le cache, redessine l'accueil pendant la lecture
// du fil, comme dans l'appli. La date de lecture et « Découvrir » sont de faux hooks.
jest.mock('../feed/api', () => ({
  ...jest.requireActual('../feed/api'),
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
  useMarkFeedRead: jest.fn(),
}))
jest.mock('../suggestions/api', () => ({
  useSuggestions: jest.fn(),
  useDismissSuggestion: jest.fn(),
}))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))

// La fausse danse (comme dans HomeScreen.publish.test.tsx) : elle note qu'elle part, et attend que
// le test la finisse.
const mockDanceProps: { playing: boolean; onDone: () => void }[] = []
jest.mock('../ui/PublishDance', () => ({
  PublishDance: (props: { playing: boolean; onDone: () => void }) => {
    mockDanceProps.push(props)
    return null
  },
}))

// L'adresse de l'accueil et la page affichée ou non (la feuille encore dessus).
let mockParams: Record<string, string | undefined> = {}
let mockFocused = true
let mockRouteKey = 'index-0'
const mockSetParams = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/',
    useRouter: () => ({
      push: jest.fn(),
      replace: mockReplace,
      setParams: mockSetParams,
      dismissTo: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
    }),
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => mockFocused,
    useRoute: () => ({ key: mockRouteKey, name: 'index' }),
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mockFocused
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})

const lea = { id: 'u1', name: 'Léa', avatarUrl: null }
const mine = projectItem(
  'd1000000-0000-4000-8000-000000000001',
  'Le ciel de ce soir',
  lea,
  october('21'),
)
const published = fr.t(($) => $.project.form.published)

/** Ce que la fausse API rend pour le fil, et en combien de temps (0 : tout de suite). */
let feedItems: FeedItem[] = [fromMax]
let feedDelay = 0
/** Les lectures du fil reçues par la fausse API. */
let feedReads = 0
const serve = () =>
  jest.mocked(request).mockImplementation(async (path: string) => {
    if (!path.startsWith('/v1/feed/following')) throw new Error(`unexpected request ${path}`)
    feedReads += 1
    // La page telle qu'elle est au moment de la demande : une publication faite pendant la
    // lecture n'y est pas, comme sur le vrai serveur.
    const page: FollowingFeedPage = {
      items: [...feedItems],
      nextCursor: null,
      followsAnyone: true,
      lastReadAt: null,
    }
    if (feedDelay > 0) await new Promise((resolve) => setTimeout(resolve, feedDelay))
    return { ok: true, data: page } as never
  })

let route = 0
beforeEach(() => {
  resetHomeMocks()
  const actual = jest.requireActual<typeof import('../feed/api')>('../feed/api')
  jest.mocked(useFollowingFeed).mockImplementation(actual.useFollowingFeed)
  jest.mocked(useFeedNews).mockImplementation(actual.useFeedNews)
  mockDanceProps.length = 0
  route += 1
  mockRouteKey = `index-${route}`
  mockParams = {}
  mockFocused = true
  mockSetParams.mockReset()
  mockReplace.mockReset()
  feedItems = [fromMax]
  feedDelay = 0
  feedReads = 0
  serve()
})

const withToasts = (children: ReactNode) => <ToastProvider>{children}</ToastProvider>

/** L'accueil de Léa, sous la feuille de publication (pas la page affichée), son fil lu. */
const renderUnderSheet = async () => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  mockFocused = false
  const view = await renderWithI18n(withToasts(<HomeScreen />))
  // Témoin : le fil d'avant la publication est affiché.
  expect(await screen.findByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
  return view
}

/**
 * « Publier », comme le fait la feuille (ProjectFormScreen) : le projet existe, le cache relit les
 * fils, puis la feuille se ferme sur `/?published=<id>` et l'accueil redevient la page affichée.
 */
const publish = async (
  view: Awaited<ReturnType<typeof renderUnderSheet>>,
  queryClient: QueryClient,
) => {
  feedItems = [mine, fromMax]
  // Sans attendre : la feuille se ferme pendant que la lecture du cache est en route.
  void queryClient.invalidateQueries({ queryKey: ['feed'] })
  mockParams = { published: mine.project.id }
  mockFocused = true
  await view.rerender(withToasts(<HomeScreen />))
}

const danced = () => mockDanceProps.some((props) => props.playing)
const finishDance = async () => {
  const last = [...mockDanceProps].reverse().find((props) => props.playing)
  if (!last) throw new Error('the dance never started')
  await act(async () => last.onDone())
}
const cleaned = () =>
  mockSetParams.mock.calls.some(
    ([params]) => typeof params === 'object' && params !== null && params.published === undefined,
  ) || mockReplace.mock.calls.some(([href]) => href === '/')

describe('the feed after publishing, with the feed read again by the cache (R6a, C2)', () => {
  it('dances and says « Projet publié » when the API answers at once', async () => {
    const view = await renderUnderSheet()
    await publish(view, view.queryClient)

    await waitFor(() => expect(danced()).toBe(true))
    // Pendant la danse, l'adresse garde son paramètre : rien n'a été écarté.
    expect(cleaned()).toBe(false)
    await finishDance()
    expect(await screen.findByText(published)).toBeTruthy()
    expect(cleaned()).toBe(true)
  })

  it('dances and says « Projet publié » when the API takes 300 ms', async () => {
    const view = await renderUnderSheet()
    feedDelay = 300
    await publish(view, view.queryClient)

    await waitFor(() => expect(danced()).toBe(true), { timeout: 3000 })
    expect(cleaned()).toBe(false)
    await finishDance()
    expect(await screen.findByText(published)).toBeTruthy()
  })

  it('reads the feed once more when the page in memory predates the project', async () => {
    // Le fil gardé en mémoire date d'avant la publication, et aucune lecture n'est en route.
    const view = await renderUnderSheet()
    const before = feedReads
    feedItems = [mine, fromMax]
    mockParams = { published: mine.project.id }
    mockFocused = true
    await view.rerender(withToasts(<HomeScreen />))

    await waitFor(() => expect(danced()).toBe(true))
    expect(feedReads).toBe(before + 1)
  })

  it('cleans the address once the feed, read again, still lacks the project', async () => {
    // Témoin du refus : le projet n'arrive jamais dans le fil (un lien forgé, un projet retiré).
    const view = await renderUnderSheet()
    feedDelay = 50
    mockParams = { published: mine.project.id }
    mockFocused = true
    await view.rerender(withToasts(<HomeScreen />))

    await waitFor(() => expect(cleaned()).toBe(true))
    expect(danced()).toBe(false)
    expect(screen.queryByText(published)).toBeNull()
  })
})
