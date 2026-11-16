// Tests de l'entrée « Mon profil public » de « Mon profil » (tranche R12) : une ligne qui mène aux
// réglages de la page publique, pour un membre comme pour un membre suspendu (qui peut encore
// fermer sa page, Q6). Fichier à part de ProfileScreen.test.tsx : l'entrée est venue après lui.
import { fireEvent, screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { hrefOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProfileScreen } from './ProfileScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/profile',
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

const title = fr.t(($) => $.profile.publicPage.title)
/** Une ligne-lien est un lien sur le web, un bouton sur téléphone. */
const entry = () =>
  screen.queryByRole('link', { name: title }) ?? screen.getByRole('button', { name: title })

beforeEach(() => {
  mockPush.mockReset()
  mockSession({ user: { name: 'Léa' } })
})

describe('ProfileScreen, « Mon profil public »', () => {
  it('offers « Mon profil public », which opens the public page settings', async () => {
    jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(entry())

    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(hrefOf(mockPush.mock.calls[0]?.[0])).toBe('/settings/public-page')
  })

  it('keeps the entry for a suspended member, who can still close the page', async () => {
    jest.mocked(getMe).mockReset().mockResolvedValue(suspendedMe)
    await renderWithProviders(<ProfileScreen />)
    await screen.findByText(fr.t(($) => $.suspension.profileLocked))

    await fireEvent.press(entry())

    expect(hrefOf(mockPush.mock.calls[0]?.[0])).toBe('/settings/public-page')
  })
})
