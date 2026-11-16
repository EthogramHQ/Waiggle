// Tests de ce que la page de suppression du compte dit des projets et de la page publics (R12,
// relecture juridique de la branche, point 3) : les Règles (« Quitter ») citent les copies que les
// moteurs de recherche auraient gardées ; « Ce qui reste » doit le dire aussi, à qui a rendu public
// un projet ou sa page. La phrase est au conditionnel : l'écran est le même pour tous.
import { screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
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
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
})

/** La place d'un texte dans la page, dans l'ordre de lecture. */
const placeOf = (sentence: string) =>
  JSON.stringify(screen.toJSON()).indexOf(JSON.stringify(sentence).slice(1, -1))

describe('public projects on the account deletion screen (R12)', () => {
  it('says that search engines may keep copies of public projects and pages', async () => {
    await renderWithI18n(<DeleteAccountScreen />)
    await screen.findByText(containing('@lea'))

    const searchCopies = fr.t(($) => $.account.delete.remains.searchCopies)
    expect(screen.getAllByText(containing(searchCopies))).toHaveLength(1)
    // Dans « Ce qui reste », après son titre et les copies des signalements.
    const remains = placeOf(fr.t(($) => $.account.delete.remains.title))
    expect(remains).toBeLessThan(placeOf(fr.t(($) => $.account.delete.remains.reportCopies)))
    expect(placeOf(fr.t(($) => $.account.delete.remains.reportCopies))).toBeLessThan(
      placeOf(searchCopies),
    )
  })
})
