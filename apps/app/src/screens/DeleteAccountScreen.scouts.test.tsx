// Test de la page de suppression du compte pour les Éclaireuses (R20, relecture juridique du plan,
// J3) : ce qui part avec le compte nomme aussi ses retours d'Éclaireuse et leurs captures
// (`account.delete.scoutReportsItem`), comme les retours de testeur.
import { screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { scoutMe } from '../scout/scout.testkit'
import { mockSession, renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import { DeleteAccountScreen } from './DeleteAccountScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  deleteAccount: jest.fn(),
  downloadMyData: jest.fn(),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/account/delete',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  // Léa est Éclaireuse : que la ligne se montre à tous ou aux seules Éclaireuses, elle la lit.
  jest.mocked(getMe).mockReset().mockResolvedValue(scoutMe())
})

describe('DeleteAccountScreen, for the scouts', () => {
  it('lists scout reports and their captures among what account deletion erases', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(await screen.findByText(fr.t(($) => $.account.delete.scoutReportsItem))).toBeTruthy()
    // Témoin : la liste de ce qui part est bien là.
    expect(screen.getByText(fr.t(($) => $.account.delete.testerFeedbackItem))).toBeTruthy()
  })
})
