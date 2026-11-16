// « Retour » d'une page légale ouverte par un lien direct, sans page d'avant (relecture de
// l'interface R12, A1) : sous `/en/rules`, l'accueil de la langue de l'adresse (`/en/`), pas `/`,
// qui reposait le choix de la langue ; sous `/rules`, sans langue, `/`. Un fichier à part : celui de
// R11 fixe l'adresse à `/rules` pour toutes ses pages.
import { fireEvent, screen } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LegalPageScreen } from './LegalPageScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
const mockReplace = jest.fn()
const mockAddress = { pathname: '/en/rules' }
jest.mock('expo-router', () => ({
  usePathname: () => mockAddress.pathname,
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

beforeEach(() => {
  mockReplace.mockReset()
  mockSession(null)
})

const pressBack = async () =>
  fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.common.back) }))

describe('LegalPageScreen, « Retour » without a page before (R12)', () => {
  it('goes back to the home of the address language when opened directly', async () => {
    mockAddress.pathname = '/en/rules'
    await renderWithProviders(<LegalPageScreen page="rules" />)

    await pressBack()

    expect(mockReplace).toHaveBeenCalledWith('/en/')
  })

  it('goes back to / when the address has no language (témoin)', async () => {
    mockAddress.pathname = '/rules'
    await renderWithProviders(<LegalPageScreen page="rules" />)

    await pressBack()

    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})
