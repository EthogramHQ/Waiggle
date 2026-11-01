// Tests de la mémoire de la barre d'onglets (refonte, tranche R3, « Où la barre se montre ») : sur la
// page d'un autre membre, l'onglet d'où l'on vient reste actif, même après une page sans barre (un
// projet). Et les gardes de AppTabBar : une page n'est jamais demandée deux fois par une double tape
// (le « + », l'onglet actif retouché hors de sa première page), et, sur Android, la barre se cache
// pendant la frappe (elle remonterait avec le clavier).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Keyboard, Platform } from 'react-native'
import { createI18n } from '../i18n'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { TabBarHost } from '../ui/TabBar'
import { Text } from '../ui/Text'
import { useTabBarSpace } from '../ui/tabBarSpace'
import { useHydrated } from '../ui/theme/hydration'
import { AppTabBar, placeOf } from './AppTabBar'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))

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

const destinations = () => visited(mockPush, mockReplace, mockNavigate, mockDismissTo)
const region = () => screen.queryByLabelText(t(($) => $.nav.label))
const link = (label: string) => screen.getByRole('link', { name: label })
const activeLink = (label: string) => screen.queryByRole('link', { name: label, selected: true })

const Probe = () => {
  const { topSignal } = useTabBarSpace()
  return <Text>{`top ${topSignal}`}</Text>
}

const app = () => (
  <TabBarHost bar={<AppTabBar />}>
    <Probe />
  </TabBarHost>
)

/** Laisse arriver le profil (la réponse, puis la notification de React Query). */
const settle = async () => {
  await act(async () => {})
  await act(async () => {})
}

/** Affiche la barre à la première adresse, puis suit le parcours, une adresse après l'autre. */
const walk = async (...pathnames: string[]) => {
  const [first, ...rest] = pathnames
  mockPathname = first ?? '/'
  const result = await renderWithProviders(app())
  await settle()
  for (const pathname of rest) {
    mockPathname = pathname
    // Le même arbre, redessiné à la nouvelle adresse : la barre reste montée, comme dans l'appli.
    await result.rerender(app())
    await settle()
  }
  return result
}

beforeEach(() => {
  mockPathname = '/'
  for (const mock of [mockPush, mockReplace, mockNavigate, mockDismissTo]) mock.mockReset()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
})

describe('the tab one came from, on the page of another member', () => {
  it('keeps Explorer active after opening a member from Explorer', async () => {
    await walk('/explore', '/members/u7')

    expect(region()).toBeTruthy()
    expect(activeLink(t(($) => $.nav.explore))).toBeTruthy()
    expect(activeLink(t(($) => $.nav.me))).toBeNull()
  })

  it('keeps the Fil active through a project page, which has no bar', async () => {
    await walk('/', '/projects/p1', '/members/u7')

    expect(activeLink(t(($) => $.nav.feed))).toBeTruthy()
  })

  it('keeps « Moi » active after opening another member from one’s own page', async () => {
    await walk('/me', '/members/u7')

    expect(activeLink(t(($) => $.nav.me))).toBeTruthy()
  })

  it('takes the remembered tab back to its first page, without scrolling', async () => {
    await walk('/explore', '/members/u7')

    await fireEvent.press(link(t(($) => $.nav.explore)))

    expect(destinations()).toEqual(['/explore'])
    expect(screen.getByText('top 0')).toBeTruthy()
  })
})

describe('the place of each address', () => {
  it.each([
    ['/', { kind: 'tab', tab: 'feed', firstPage: true }],
    ['/explore/', { kind: 'tab', tab: 'explore', firstPage: true }],
    ['/tags/claude', { kind: 'tab', tab: 'explore', firstPage: false }],
    ['/tags/claude/edit', { kind: 'hidden' }],
    ['/members/u1', { kind: 'tab', tab: 'me', firstPage: false }],
    ['/members/u7', { kind: 'member' }],
    ['/members/u7/followers', { kind: 'hidden' }],
    ['/hivesx', { kind: 'hidden' }],
  ] as const)('places %s', (pathname, place) => {
    expect(placeOf(pathname, 'u1')).toEqual(place)
  })
})

describe('no page asked twice by a double tap', () => {
  it('opens the publication once', async () => {
    await walk('/')

    const plus = screen.getByRole('button', { name: t(($) => $.nav.publish) })
    await fireEvent.press(plus)
    await fireEvent.press(plus)

    expect(destinations()).toEqual(['/projects/new'])
  })

  it('goes back to the first page of the active tab once', async () => {
    await walk('/tags/claude')

    await fireEvent.press(link(t(($) => $.nav.explore)))
    await fireEvent.press(link(t(($) => $.nav.explore)))

    expect(destinations()).toEqual(['/explore'])
  })
})

describe('the keyboard of Android', () => {
  it('hides the bar while the member types, and brings it back after', async () => {
    const listeners: Record<string, () => void> = {}
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      listeners[event] = listener as () => void
      return { remove: () => {} } as ReturnType<typeof Keyboard.addListener>
    })
    jest.replaceProperty(Platform, 'OS', 'android')
    try {
      await walk('/search')
      expect(region()).toBeTruthy()

      await act(async () => listeners.keyboardDidShow?.())
      expect(region()).toBeNull()

      await act(async () => listeners.keyboardDidHide?.())
      expect(region()).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
