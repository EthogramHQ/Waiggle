// Tests de l'écran d'accueil (HomeScreen) après une publication (R6a, planche `R6-Danse`) : la
// feuille de publication se ferme sur le fil avec `?published=<id>` ; le fil remonte en haut,
// l'abeille danse vers la nouvelle carte (`PublishDance`), puis l'avis « Projet publié » paraît, et
// l'adresse est nettoyée pour qu'un rechargement ne rejoue rien.
//
// Relecture du plan : sec-A7 (le paramètre n'est cru que si la première page du fil contient ce
// projet, et que son auteur est le membre ; sinon l'adresse est nettoyée sans rien montrer), ui-I11
// (« Projet publié » une fois la feuille partie, mouvement réduit compris ; le fil remonte avant la
// danse). La feuille est une route posée par-dessus le fil : tant qu'elle est là, l'accueil n'est
// pas la page affichée (`useIsFocused` d'Expo Router, faux ici par `mockFocused`).
//
// La danse elle-même (le huit, la traînée, le vol vers la carte) est testée dans
// ui/PublishDance.test.tsx ; ici, un faux composant note ce qu'il reçoit et laisse le test dire
// quand elle se termine (`finishDance`).
import { act, screen, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { ScrollView } from 'react-native'
import { mockSession, renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import * as motion from '../ui/theme/motion'
import { ToastProvider } from '../ui/theme/toast'
import { HomeScreen } from './HomeScreen'
import {
  fromMax,
  mockFollowing,
  mockPush,
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
jest.mock('../feed/api', () => ({
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

// Ce qui s'est passé, dans l'ordre : le fil qui remonte (« scroll ») et la danse qui part
// (« dance »). Le test lit l'ordre, pas la façon de faire.
const mockEvents: string[] = []
// Les propriétés reçues par la fausse danse, à chaque rendu.
const mockDanceProps: { playing: boolean; onDone: () => void }[] = []
// La fausse danse : rien de dessiné ; elle note qu'elle part, et attend que le test la finisse.
jest.mock('../ui/PublishDance', () => ({
  PublishDance: (props: { playing: boolean; onDone: () => void }) => {
    mockDanceProps.push(props)
    if (props.playing && !mockEvents.includes('dance')) mockEvents.push('dance')
    return null
  },
}))

// L'hydratation (web) : vraie par défaut, comme sur un téléphone ; un test la retient.
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))

// L'adresse de l'accueil (?published=<id>) et la page affichée ou non (la feuille encore dessus).
let mockParams: Record<string, string | undefined> = {}
let mockFocused = true
// Une clé de route neuve à chaque test : ui/screenFocus.ts garde les routes vues pour la visite.
let mockRouteKey = 'index-0'
const mockReplace = jest.fn()
const mockSetParams = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      setParams: mockSetParams,
      dismissTo: mockDismissTo,
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

/** Léa, la membre connectée de ces tests. */
const lea = { id: 'u1', name: 'Léa', avatarUrl: null }
/** Le projet que Léa vient de publier, en tête de son fil. */
const mine = projectItem(
  'd1000000-0000-4000-8000-000000000001',
  'Le ciel de ce soir',
  lea,
  october('21'),
)
const published = fr.t(($) => $.project.form.published)

let route = 0
beforeEach(() => {
  resetHomeMocks()
  mockEvents.length = 0
  mockDanceProps.length = 0
  mockHydrated = true
  mockFocused = true
  route += 1
  mockRouteKey = `index-${route}`
  mockParams = {}
  mockReplace.mockReset()
  mockSetParams.mockReset()
  mockDismissTo.mockReset()
  mockFollowing({ items: [mine, fromMax] })
})

afterEach(() => {
  jest.restoreAllMocks()
})

/** L'accueil de Léa, avec les avis (toasts) branchés comme dans l'appli. */
const renderHome = async () => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  const view = await renderWithI18n(
    <ToastProvider>
      <HomeScreen />
    </ToastProvider>,
  )
  const redraw = async () => view.rerender(withToasts(<HomeScreen />))
  return { ...view, redraw }
}
const withToasts = (children: ReactNode) => <ToastProvider>{children}</ToastProvider>

/** La danse est-elle partie (une fois au moins) ? */
const danced = () => mockDanceProps.some((props) => props.playing)
/** Termine la danse en cours, comme le ferait l'abeille arrivée sur la carte. */
const finishDance = async () => {
  const last = [...mockDanceProps].reverse().find((props) => props.playing)
  if (!last) throw new Error('the dance never started')
  await act(async () => last.onDone())
}
/** L'adresse a-t-elle été nettoyée (plus de ?published=), quelle que soit la façon ? */
const cleaned = () =>
  mockSetParams.mock.calls.some(
    ([params]) => typeof params === 'object' && params !== null && params.published === undefined,
  ) || mockReplace.mock.calls.some(([href]) => href === '/')

describe('the feed after publishing a project (R6a)', () => {
  it('dances towards the new card, then says « Projet publié » and cleans the address', async () => {
    mockParams = { published: mine.project.id }
    await renderHome()

    await waitFor(() => expect(danced()).toBe(true))
    // Pendant la danse, l'avis attend : il vient après l'abeille.
    expect(screen.queryByText(published)).toBeNull()
    await finishDance()

    expect(await screen.findByText(published)).toBeTruthy()
    expect(cleaned()).toBe(true)
  })

  it('shows the new card at the top of the feed', async () => {
    mockParams = { published: mine.project.id }
    await renderHome()

    expect(screen.getByRole('link', { name: 'Le ciel de ce soir' })).toBeTruthy()
    await waitFor(() => expect(danced()).toBe(true))
  })

  it('waits for hydration before reading ?published=', async () => {
    mockParams = { published: mine.project.id }
    mockHydrated = false
    const { redraw } = await renderHome()

    // Témoin : le fil est là, avec la carte.
    expect(screen.getByRole('link', { name: 'Le ciel de ce soir' })).toBeTruthy()
    // Avant l'hydratation : ni danse, ni avis, ni adresse touchée (la page pré-rendue ne connaît
    // pas l'adresse du visiteur).
    expect(danced()).toBe(false)
    expect(screen.queryByText(published)).toBeNull()
    expect(cleaned()).toBe(false)

    mockHydrated = true
    await redraw()

    await waitFor(() => expect(danced()).toBe(true))
  })

  it('scrolls the feed back to the top before the dance', async () => {
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {
      mockEvents.push('scroll')
    })
    mockParams = { published: mine.project.id }
    await renderHome()

    await waitFor(() => expect(danced()).toBe(true))
    expect(mockEvents.indexOf('scroll')).toBeGreaterThanOrEqual(0)
    expect(mockEvents.indexOf('scroll')).toBeLessThan(mockEvents.indexOf('dance'))
  })

  it('shows « Projet publié » only once the sheet is gone, in calm motion too', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    mockParams = { published: mine.project.id }
    // La feuille de publication est encore posée sur le fil : l'accueil n'est pas la page affichée.
    mockFocused = false
    const { redraw } = await renderHome()

    expect(screen.getByRole('link', { name: 'Le ciel de ce soir' })).toBeTruthy() // témoin
    await act(async () => {})
    expect(screen.queryByText(published)).toBeNull()

    // La feuille est partie : l'accueil redevient la page affichée.
    mockFocused = true
    await redraw()
    // En mouvement réduit, l'abeille ne vole pas ; si une danse est montée, elle finit aussitôt.
    if (danced()) await finishDance()

    expect(await screen.findByText(published)).toBeTruthy()
  })

  it('ignores ?published= naming a project that is not mine or not in the feed, and cleans the address', async () => {
    // Trois adresses forgées : un projet de Max (dans le fil), un projet absent du fil, un
    // identifiant mal formé. Aucune ne montre la danse ni « Projet publié ».
    for (const forged of [fromMax.project.id, 'e1000000-0000-4000-8000-000000000009', 'abc']) {
      mockEvents.length = 0
      mockDanceProps.length = 0
      mockReplace.mockReset()
      mockSetParams.mockReset()
      mockParams = { published: forged }
      const view = await renderHome()

      // Témoin : le fil est là.
      expect(screen.getByRole('link', { name: 'Le ciel de ce soir' })).toBeTruthy()
      await waitFor(() => expect(cleaned()).toBe(true))
      expect(danced()).toBe(false)
      expect(screen.queryByText(published)).toBeNull()
      view.unmount()
    }
  })

  // Décision de la session (R6a, TW-A2) : l'API garde `followsAnyone: false` tant que le membre ne
  // suit personne, même quand son fil contient ses propres projets. Le premier lancement (les
  // proches à suivre) reste, sa carte vient dessous, et la danse la vise là aussi.
  it('shows the people to follow and the new card to a member who follows nobody, then « Projet publié »', async () => {
    mockFollowing({ items: [mine], followsAnyone: false })
    mockParams = { published: mine.project.id }
    await renderHome()

    expect(screen.getByText(fr.t(($) => $.feed.firstRun.title).replace(/\s+/g, ' '))).toBeTruthy()
    expect(screen.getAllByRole('switch', { name: /^Suivre/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Le ciel de ce soir' })).toBeTruthy()

    await waitFor(() => expect(danced()).toBe(true))
    await finishDance()
    expect(await screen.findByText(published)).toBeTruthy()
  })
})
