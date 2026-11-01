// Tests du branchement de la barre d'onglets sur l'appli (refonte, tranche R3, « Où la barre se
// montre ») : AppTabBar lit l'adresse de la page (usePathname), la session, le profil (la photo,
// la suspension), la largeur (téléphone seulement) et l'hydratation (rien au pré-rendu), et ne
// passe à ui/TabBar que des données. Ici : la table des chemins (quel onglet est actif où), les
// pages où la barre se cache, le visiteur, le pré-rendu, le « + » d'un compte suspendu, et ce que
// fait l'onglet déjà actif quand on le retouche (remonter en haut, ou revenir à sa première page).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { getMe } from '../profile/api'
import { adminMe, leaMe, suspendedMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { TabBarHost } from '../ui/TabBar'
import { Text } from '../ui/Text'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { useHydrated } from '../ui/theme/hydration'
import { AppTabBar } from './AppTabBar'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre lit le profil pour la photo et la suspension : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Le pré-rendu du web : la page ne connaît pas encore le visiteur (hydration.ts).
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))

// L'adresse de la page et le routeur d'Expo Router, remplacés. Le test vérifie la destination
// demandée, quelle que soit la méthode choisie par le code (push, replace, navigate, dismissTo).
let mockPathname = '/'
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: mockDismissTo,
  }),
}))

const { t } = createI18n('fr')

/** Toutes les adresses demandées au routeur, dans l'ordre. */
const destinations = () => visited(mockPush, mockReplace, mockNavigate, mockDismissTo)

const region = () => screen.queryByLabelText(t(($) => $.nav.label))
const link = (label: string) => screen.getByRole('link', { name: label })
const activeLink = (label: string) => screen.queryByRole('link', { name: label, selected: true })

// Un composant témoin : le nombre de demandes de remontée en haut, lu par le contexte.
const Probe = () => {
  const { topSignal } = useTabBarSpace()
  return <Text>{`top ${topSignal}`}</Text>
}

/** La barre dans son cadre, avec un témoin à la place des pages. */
const app = () => (
  <TabBarHost bar={<AppTabBar />}>
    <Probe />
  </TabBarHost>
)

/** Affiche la barre à cette adresse, le profil de Léa chargé. */
const renderAt = async (pathname: string) => {
  mockPathname = pathname
  const result = await renderWithProviders(app())
  // Le profil (une promesse déjà résolue) est arrivé : la barre a eu le temps de le lire (photo,
  // suspension). Deux tours de microtâches : la réponse, puis la notification de React Query.
  await act(async () => {})
  await act(async () => {})
  return result
}

let restoreWindow = () => {}

beforeEach(() => {
  mockPathname = '/'
  for (const mock of [mockPush, mockReplace, mockNavigate, mockDismissTo]) mock.mockReset()
  // Léa (u1) est connectée, sur un téléphone, la page hydratée.
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
})

afterEach(() => {
  restoreWindow()
  restoreWindow = () => {}
})

describe('where the tab bar shows, and which tab is active', () => {
  // La table des chemins du plan : chaque page de premier niveau et son onglet.
  it.each([
    ['/', 'feed'],
    ['/explore', 'explore'],
    ['/search', 'explore'],
    ['/search?q=carn', 'explore'],
    ['/tools', 'explore'],
    ['/tags/claude', 'explore'],
    ['/hives', 'hives'],
    ['/me', 'me'],
    [`/members/${leaMe.id}`, 'me'],
  ] as const)('on %s, shows the bar with « %s » active', async (pathname, key) => {
    await renderAt(pathname)

    expect(region()).toBeTruthy()
    const labels = {
      feed: t(($) => $.nav.feed),
      explore: t(($) => $.nav.explore),
      hives: t(($) => $.nav.hives),
      me: t(($) => $.nav.me),
    }
    expect(activeLink(labels[key])).toBeTruthy()
    // Un seul onglet actif.
    const others = (Object.keys(labels) as (keyof typeof labels)[]).filter((k) => k !== key)
    for (const other of others) expect(activeLink(labels[other])).toBeNull()
  })

  it('shows the bar on the page of another member', async () => {
    await renderAt('/members/u7')

    expect(region()).toBeTruthy()
    // Ce n'est pas « Moi » : la page d'un autre membre ne marque pas son onglet.
    expect(activeLink(t(($) => $.nav.me))).toBeNull()
  })

  it.each([
    '/projects/p1',
    '/projects/new',
    '/projects/p1/edit',
    '/notifications',
    '/settings',
    '/settings/profile',
    '/report?kind=project&id=p1',
    '/moderation',
    '/out?url=https%3A%2F%2Fexample.com',
  ])('hides the bar on %s, a page pushed over the tabs', async (pathname) => {
    await renderAt(pathname)

    expect(region()).toBeNull()
  })

  it('never shows the bar to a visitor', async () => {
    mockSession(null)
    mockPathname = '/'
    await renderWithProviders(app())

    expect(region()).toBeNull()
    expect(getMe).not.toHaveBeenCalled()
  })

  it('shows nothing before the page is hydrated on the web', async () => {
    jest.mocked(useHydrated).mockReturnValue(false)
    mockPathname = '/'
    await renderWithProviders(app())

    expect(region()).toBeNull()
  })

  it('leaves the computer to the top bar', async () => {
    restoreWindow = setDesktopWindow()
    await renderAt('/')

    expect(region()).toBeNull()
  })

  it('gives each tab its address', async () => {
    await renderAt('/')

    expect(link(t(($) => $.nav.feed)).props.href).toBe('/')
    expect(link(t(($) => $.nav.explore)).props.href).toBe('/explore')
    expect(link(t(($) => $.nav.hives)).props.href).toBe('/hives')
    expect(link(t(($) => $.nav.me)).props.href).toBe('/me')
  })
})

describe('the « + » of the tab bar', () => {
  it('opens the publication', async () => {
    await renderAt('/')

    await fireEvent.press(screen.getByRole('button', { name: t(($) => $.nav.publish) }))

    expect(destinations()).toEqual(['/projects/new'])
  })

  it('is gone for a suspended member, who keeps the four tabs', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderAt('/')

    expect(screen.queryByRole('button', { name: t(($) => $.nav.publish) })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('stays for an administrator (not suspended)', async () => {
    jest.mocked(getMe).mockResolvedValue(adminMe)
    await renderAt('/')

    expect(screen.getByRole('button', { name: t(($) => $.nav.publish) })).toBeTruthy()
  })
})

describe('touching a tab', () => {
  it('opens the first page of another tab', async () => {
    await renderAt('/')

    await fireEvent.press(link(t(($) => $.nav.explore)))

    expect(destinations()).toEqual(['/explore'])
    expect(screen.getByText('top 0')).toBeTruthy()
  })

  it('opens one’s own page from « Moi »', async () => {
    await renderAt('/explore')

    await fireEvent.press(link(t(($) => $.nav.me)))

    expect(destinations()).toEqual(['/me'])
  })

  it('scrolls to the top when the active tab is touched on its first page', async () => {
    await renderAt('/')

    await fireEvent.press(link(t(($) => $.nav.feed)))

    expect(screen.getByText('top 1')).toBeTruthy()
    expect(destinations()).toEqual([])
  })

  it('goes back to the first page of the active tab when touched elsewhere', async () => {
    await renderAt('/tags/claude')

    await fireEvent.press(link(t(($) => $.nav.explore)))

    expect(destinations()).toEqual(['/explore'])
    expect(screen.getByText('top 0')).toBeTruthy()
  })

  it('goes back to « Moi » from one’s own member page', async () => {
    await renderAt(`/members/${leaMe.id}`)

    await fireEvent.press(link(t(($) => $.nav.me)))

    expect(destinations()).toEqual(['/me'])
  })

  it('shows the photo of the member on « Moi »', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, avatarUrl: 'https://cdn.example/lea.jpg' })
    await renderAt('/')

    // Avec une photo, les initiales ne sont plus là (ui/Avatar) ; le lien garde son nom.
    expect(screen.queryByText('LÉ')).toBeNull()
    expect(link(t(($) => $.nav.me))).toBeTruthy()
  })

  it('shows the initials of the member on « Moi » without a photo', async () => {
    await renderAt('/')

    expect(screen.getByText('LÉ')).toBeTruthy()
  })
})
