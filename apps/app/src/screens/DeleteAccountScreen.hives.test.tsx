// Tests des ruches sur la page de suppression du compte (R10, docs/scenarios/refonte.md, « Mes
// données et la suppression du compte » ; relecture juridique du plan, C5) : « Tes ruches » dans ce
// qui disparaît (on quitte chacune, l'animation passe au plus ancien, la dernière part), et « Le nom
// des ruches que tu as créées » dans ce qui reste.
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

describe('the hives on the account deletion screen', () => {
  it('lists hives on the account deletion screen, and the hive names that stay', async () => {
    await renderWithI18n(<DeleteAccountScreen />)
    await screen.findByText(containing('@lea'))

    const hivesItem = fr.t(($) => $.account.delete.hivesItem)
    const hivesDetail = fr.t(($) => $.account.delete.hivesDetail)
    const hiveNames = fr.t(($) => $.account.delete.remains.hiveNames)
    expect(screen.getAllByText(containing(hivesItem))).toHaveLength(1)
    expect(screen.getAllByText(containing(hivesDetail)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(hiveNames)).length).toBeGreaterThan(0)

    // « Tes ruches » dans ce qui disparaît ; le nom des ruches dans ce qui reste.
    const goes = placeOf(fr.t(($) => $.account.delete.goesTitle))
    const remains = placeOf(fr.t(($) => $.account.delete.remains.title))
    expect(goes).toBeLessThan(placeOf(hivesItem))
    expect(placeOf(hivesItem)).toBeLessThan(remains)
    expect(remains).toBeLessThan(placeOf(hiveNames))
  })
})
