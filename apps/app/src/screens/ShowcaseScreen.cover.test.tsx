// Tests de la vitrine de l'accueil comme source de la photo qui vole jusqu'à la page du projet
// (tranche R17, docs/scenarios/refonte.md, « La carte qui devient la page » : « la vitrine de
// l'accueil » ; « Les pages publiques viendront avec R22 »). Pour un membre, chaque carte reçoit
// l'identifiant de son projet (`coverId`) : son ouverture passe par `capture`, puis par l'adresse
// des membres. Pour un visiteur, la carte ouvre la page publique sans passer par lui : cette page
// n'a pas encore de photo d'arrivée.
//
// `useCoverSource` est remplacé par un faux (comme `ui/coverSources.test.tsx`), qui ouvre tout de
// suite. Le faux serveur, les données et le faux routeur : Public.testkit.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { useCoverSource } from '../ui/coverTransition'
import { decollageId, mockNav, resetPublic, showcase } from './Public.testkit'
import { ShowcaseScreen } from './ShowcaseScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('expo-router', () => {
  const kit = () => require('./Public.testkit').mockNav
  return {
    useRouter: () => kit().router,
    usePathname: () => kit().pathname,
    useNavigation: () => kit().navigation,
    useLocalSearchParams: () => kit().params,
    useGlobalSearchParams: () => kit().params,
    useSegments: () => [],
    useFocusEffect: () => {},
    useIsFocused: () => true,
  }
})
const mockCapture = jest.fn((then: () => void) => then())
jest.mock('../ui/coverTransition', () => ({
  ...jest.requireActual('../ui/coverTransition'),
  useCoverSource: jest.fn(() => ({ ref: jest.fn(), capture: mockCapture, bounceStyle: {} })),
}))

const first = showcase[0]?.title ?? ''

const pushed = () =>
  visited(mockNav.router.push, mockNav.router.navigate, mockNav.router.replace).map(pathOf)

/** La carte d'un projet : un lien dont le nom contient son titre. */
const cardOf = (title: string) => {
  const found = screen.queryAllByRole('link', { name: containing(title) })[0]
  if (!found) throw new Error(`no card « ${title} »`)
  return found
}

beforeEach(() => {
  mockCapture.mockClear()
  jest.mocked(useCoverSource).mockClear()
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(useUnreadCount).mockReturnValue(0)
})

describe('the home showcase as a source of the card photo that becomes the page (R17)', () => {
  it('opens a card for a member through its cover, then at the members address', async () => {
    resetPublic('/')
    mockSession({ user: { id: leaMe.id, name: leaMe.name } })
    await renderWithProviders(<ShowcaseScreen />)
    await screen.findByText(containing(first))

    expect(useCoverSource).toHaveBeenCalledWith(decollageId)
    await fireEvent.press(cardOf(first))

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(pushed()).toContain(`/projects/${decollageId}`)
  })

  it('opens a card for a visitor at the public page, without the cover (témoin, R22)', async () => {
    resetPublic('/fr/', { lang: 'fr' })
    mockSession(null)
    await renderWithProviders(<ShowcaseScreen />)
    await screen.findByText(containing(first))

    await fireEvent.press(cardOf(first))

    expect(mockCapture).not.toHaveBeenCalled()
    expect(pushed()).toContain(`/fr/projects/${decollageId}`)
  })
})
