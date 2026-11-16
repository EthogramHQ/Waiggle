// Tests du Fil à sa propre adresse, `/feed` (tranche R12, docs/scenarios/refonte.md, « Qui arrive
// où » ; plan, choix 8 et décision 9 de la relecture, UI B2 et C3) : `/` devient l'accueil (la
// vitrine) pour tout le monde, le Fil passe à `/feed`. L'onglet Fil et la barre du haut y mènent ;
// le logo mène à l'accueil ; après « Publier », la feuille revient au Fil qui danse
// (`/feed?published=<id>`) ; après une connexion sans page à suivre, le Fil ; `/feed` sans session
// dit « Réservé aux membres » (`SignedOutScreen`). En plus (B4) : changer le statut d'un projet
// public (`web`) propose la mise à jour toute prête, comme pour un projet « Membres ».
//
// Ce que ces tests supposent du code (plan R12, UI-A2 ; à corriger si le code en décide autrement,
// en le disant) :
// - `app/feed.tsx` rend le Fil (`HomeScreen`) ; sans session, l'état « Réservé aux membres » ;
// - `useSubmitProject` garde sa signature ; seule l'adresse du Fil change ;
// - `SignInForm` garde ses props ; sans `next`, `router.replace` vers le Fil.
// Les anciens tests qui attendent `/` pour le Fil sont adaptés par l'interface, pas ici.

import { appName } from '@ruche/brand'
import type { Project } from '@ruche/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { signIn } from '../accounts/api'
import { request } from '../api/client'
import { createI18n } from '../i18n'
import { getMe } from '../profile/api'
import { createProject, updateProject } from '../projects/api'
import { emptyProjectForm, formFromProject } from '../projects/form'
import { useSubmitProject } from '../projects/useSubmitProject'
import { SignInForm } from '../screens/SignInForm'
import { leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { TabBarHost } from '../ui/TabBar'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'
import { AppTabBar } from './AppTabBar'
import { TopNav } from './TopNav'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), signIn: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../notifications/api', () => ({
  ...jest.requireActual('../notifications/api'),
  useUnreadCount: () => 0,
}))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))
// Le réseau : toute lecture est refusée (personne de connecté) ; aucun test n'en a besoin.
jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  request: jest.fn(),
  requestWithoutBody: jest.fn(),
}))
// L'envoi de la feuille de publication : de fausses fonctions, dont le test choisit la réponse.
jest.mock('../projects/api', () => ({
  ...jest.requireActual('../projects/api'),
  createProject: jest.fn(),
  updateProject: jest.fn(),
}))
const mockToast = jest.fn()
jest.mock('../ui/theme/toast', () => ({
  ...jest.requireActual('../ui/theme/toast'),
  useToast: () => ({ show: mockToast }),
}))
let mockPathname = '/feed'
let mockParams: Record<string, string> = {}
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  dismissTo: jest.fn(),
  back: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
}
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useGlobalSearchParams: () => mockParams,
  useSegments: () => [],
  useIsFocused: () => true,
  useFocusEffect: () => {},
  useNavigation: () => ({
    addListener: () => () => {},
    removeListener: () => {},
    isFocused: () => true,
    setOptions: () => {},
    canGoBack: () => true,
    getParent: () => undefined,
  }),
}))

const { t } = createI18n('fr')
const FEED = t(($) => $.nav.feed)

/** Toutes les adresses demandées au routeur, en texte (« /feed?published=<id> »). */
const destinations = () =>
  visited(mockRouter.push, mockRouter.replace, mockRouter.navigate, mockRouter.dismissTo).map(
    pathOf,
  )

let restoreWindow = () => {}

beforeEach(() => {
  mockPathname = '/feed'
  mockParams = {}
  for (const fn of Object.values(mockRouter)) fn.mockClear()
  mockToast.mockReset()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
  jest.mocked(request).mockReset().mockResolvedValue({ ok: false, error: 'unauthorized' })
})

afterEach(() => {
  restoreWindow()
  restoreWindow = () => {}
})

// --- La barre d'onglets (téléphone) ---

const renderTabBar = async (pathname: string) => {
  mockPathname = pathname
  await renderWithProviders(
    <TabBarHost bar={<AppTabBar />}>
      <Text>page</Text>
    </TabBarHost>,
  )
  await act(async () => {})
  await act(async () => {})
}

describe('the feed tab (R12)', () => {
  it('leads to /feed', async () => {
    await renderTabBar('/explore')

    expect(screen.getByRole('link', { name: FEED }).props.href).toBe('/feed')
  })

  it('is active on /feed', async () => {
    await renderTabBar('/feed')

    expect(screen.queryByRole('link', { name: FEED, selected: true })).toBeTruthy()
  })

  it('opens /feed when touched from another tab', async () => {
    await renderTabBar('/explore')

    await fireEvent.press(screen.getByRole('link', { name: FEED }))

    expect(destinations()).toContain('/feed')
  })
})

// --- La barre du haut (ordinateur) ---

describe('the top bar (R12)', () => {
  beforeEach(() => {
    restoreWindow = setDesktopWindow()
  })

  it('leads to /feed from « Fil »', async () => {
    mockPathname = '/explore'
    await renderWithProviders(<TopNav />)

    expect(screen.getByRole('link', { name: FEED }).props.href).toBe('/feed')
  })

  it('marks « Fil » as the current page on /feed', async () => {
    await renderWithProviders(<TopNav />)

    expect(screen.getByRole('link', { name: FEED }).props['aria-current']).toBe('page')
  })

  it('leads to the home page and its showcase from the logo', async () => {
    // Déjà vrai avant R12 (le logo menait au Fil, à `/`) : le test garde la décision 2.
    await renderWithProviders(<TopNav />)

    await fireEvent.press(screen.getByRole('link', { name: appName }))

    expect(destinations()).toEqual(['/'])
  })
})

// --- Après « Publier » et « Enregistrer » ---

const NEW_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'

/** Le hook d'envoi de la feuille, comme `ProjectFormScreen` le monte, avec traductions et cache. */
const submitHook = (projectId: string | undefined, initial = emptyProjectForm) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  })
  const i18n = createI18n('fr')
  return renderHook(
    () =>
      useSubmitProject({
        projectId,
        initial,
        flushPhotos: async () => ({ failed: 0 }),
        flushPortrait: async () => ({ failed: 0 }),
        release: async () => {},
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        </QueryClientProvider>
      ),
    },
  )
}

describe('after publishing or saving a project (R12, UI B2 and B4)', () => {
  it('goes back to the feed at /feed, which dances for the published project', async () => {
    const created: Project = { ...recipesProject, id: NEW_ID }
    jest.mocked(createProject).mockResolvedValue({ ok: true, data: created })
    const { result } = await submitHook(undefined)

    await act(async () => {
      await result.current.send(formFromProject(created), {} as never)
    })

    expect(destinations()).toEqual([`/feed?published=${NEW_ID}`])
  })

  it('offers the ready update after a status change of a public project, as for members', async () => {
    const before: Project = { ...recipesProject, visibility: 'web', hive: null, status: 'idea' }
    const after: Project = { ...before, status: 'testable' }
    jest.mocked(updateProject).mockResolvedValue({ ok: true, data: after })
    const { result } = await submitHook(before.id, formFromProject(before))

    await act(async () => {
      await result.current.send(formFromProject(after), { status: 'testable' })
    })

    expect(destinations()).toEqual([`/projects/${before.id}?announce=testable`])
  })
})

// --- Après une connexion ---

describe('after signing in (R12, UI B2)', () => {
  it('goes to the feed after signing in without next', async () => {
    mockSession(null)
    jest.mocked(signIn).mockResolvedValue({ ok: true })
    await renderWithProviders(
      <SignInForm
        draft={{ inviteCode: '', name: '', email: 'lea@example.com' }}
        onDraft={jest.fn()}
      />,
    )

    await fireEvent.changeText(
      screen.getByLabelText(t(($) => $.auth.fields.email)),
      'lea@example.com',
    )
    await fireEvent.changeText(
      screen.getByLabelText(t(($) => $.auth.fields.password)),
      'un mot de passe assez long',
    )
    await fireEvent.press(screen.getByRole('button', { name: t(($) => $.auth.signIn.submit) }))

    expect(signIn).toHaveBeenCalledTimes(1) // témoin : la connexion est partie
    expect(mockRouter.replace).toHaveBeenCalledTimes(1)
    expect(destinations()).toEqual(['/feed'])
  })

  it('still goes to the page it was asked to come back to (témoin)', async () => {
    mockSession(null)
    mockParams = { next: '/members/u2' }
    jest.mocked(signIn).mockResolvedValue({ ok: true })
    await renderWithProviders(
      <SignInForm
        draft={{ inviteCode: '', name: '', email: 'lea@example.com' }}
        onDraft={jest.fn()}
      />,
    )

    await fireEvent.changeText(
      screen.getByLabelText(t(($) => $.auth.fields.email)),
      'lea@example.com',
    )
    await fireEvent.changeText(
      screen.getByLabelText(t(($) => $.auth.fields.password)),
      'un mot de passe assez long',
    )
    await fireEvent.press(screen.getByRole('button', { name: t(($) => $.auth.signIn.submit) }))

    expect(destinations()).toEqual(['/members/u2'])
  })
})

// --- `/feed` sans session ---

describe('/feed for a visitor (R12, UI C3)', () => {
  it('says « Réservé aux membres », never the showcase nor a feed', async () => {
    mockSession(null)
    // La page de l'adresse /feed (`app/feed.tsx`), chargée ici : sans elle, ce test seul échoue.
    const FeedPage = (require('../../app/feed') as { default: () => ReactNode }).default
    await renderWithProviders(<FeedPage />)

    expect(
      await screen.findByRole('header', { name: t(($) => $.states.signedOutTitle) }),
    ).toBeTruthy()
    expect(screen.queryByText(t(($) => $.home.showcase))).toBeNull()
  })
})
