// Tests de la page « Connecte-toi d'abord » (tranche R2, décision D1 du 29/10/2026,
// /email-change/sign-in-first) : le second lien d'un changement d'adresse ouvert sans session y
// mène. Rien n'a changé ; la page demande de se connecter, puis de rouvrir le lien.
import { fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { EmailChangeResultScreen } from './EmailChangeResultScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/email-change/sign-in-first',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: jest.fn(),
}))

beforeEach(() => {
  mockSession(null)
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useLocalSearchParams).mockReturnValue({})
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('the second link opened without a session (D1)', () => {
  it('asks to sign in first and says nothing changed yet', async () => {
    await renderWithProviders(<EmailChangeResultScreen step="signInFirst" />)

    expect(
      screen.getByRole('header', { name: fr.t(($) => $.account.emailChange.signInFirstTitle) }),
    ).toBeTruthy()
    expect(
      screen.getByText(containing(fr.t(($) => $.account.emailChange.signInFirstBody))),
    ).toBeTruthy()
    // Ni réussite, ni refus : ce n'est pas la page « Adresse changée ».
    expect(screen.queryByText(fr.t(($) => $.account.emailChange.doneTitle))).toBeNull()
  })

  it('leads to the sign-in page', async () => {
    await renderWithProviders(<EmailChangeResultScreen step="signInFirst" />)

    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.account.emailChange.signIn) }),
    )

    expect(visited(mockPush, mockReplace)).toContain('/sign-in')
  })
})
