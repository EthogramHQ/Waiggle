// Correction C8 (H1) : l'abeille de « Tu es à jour » s'efface le temps de l'avis « Projet publié ».
// Mêmes simulations que HomeScreen.publish.test.tsx, dont voici le résumé :
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

/** L'abeille endormie de « Tu es à jour », nommée comme la lit un lecteur d'écran. */
const sleepingBee = () => screen.queryByRole('img', { name: fr.t(($) => $.mascot.sleep) })

describe('the sleeping bee of « Tu es à jour » during the « Projet publié » notice (R6a, H1)', () => {
  it('hides the sleeping bee while the notice is on screen, and brings it back after', async () => {
    mockParams = { published: mine.project.id }
    await renderHome()
    await waitFor(() => expect(danced()).toBe(true))
    // Témoin : pendant la danse, l'abeille dort sur « Tu es à jour ».
    expect(sleepingBee()).toBeTruthy()

    await finishDance()
    expect(await screen.findByText(published)).toBeTruthy()
    expect(sleepingBee()).toBeNull()

    // L'avis part (temps de lecture, puis fondu) : l'abeille revient.
    await waitFor(() => expect(screen.queryByText(published)).toBeNull(), { timeout: 8000 })
    await waitFor(() => expect(sleepingBee()).toBeTruthy())
  }, 15000)
})
