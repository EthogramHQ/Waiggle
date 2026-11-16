// Tests du pied des pages publiques de R12 (plan R12, décision 16), à part de LegalLinks.test.tsx
// (R11) : « Signaler un contenu » (`report`), qui écrit à l'adresse de contact, et le lien vers la
// même page dans l'autre langue (`otherLanguage`), seulement quand l'écran les demande.
import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { hrefOf } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LegalLinks } from './LegalLinks'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
let mockPathname = '/fr/'
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const report = fr.t(($) => $.legal.links.report)
const rules = fr.t(($) => $.legal.links.rules)

let openURL: jest.SpyInstance
beforeEach(() => {
  mockPathname = '/fr/'
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

describe('LegalLinks, the footer of public pages (R12)', () => {
  it('adds « Signaler un contenu », which writes to the contact address', async () => {
    await renderWithProviders(<LegalLinks variant="footer" report />)

    const link = screen.getByRole('link', { name: report })
    expect(hrefOf(link.props.href)).toBe(`mailto:${contactEmail}`)
    await fireEvent.press(link)
    expect(openURL).toHaveBeenCalledWith(`mailto:${contactEmail}`)
  })

  it('adds the link to the other language at the end, only when asked', async () => {
    await renderWithProviders(<LegalLinks variant="footer" otherLanguage />)

    const links = screen.getAllByRole('link')
    expect(links.at(-1)?.props.accessibilityLabel).toBe('English')
  })

  it('has neither when the screen does not ask for them', async () => {
    await renderWithProviders(<LegalLinks variant="footer" />)

    // Témoin : le pied est là.
    expect(screen.getByRole('link', { name: rules })).toBeTruthy()
    expect(screen.queryByRole('link', { name: report })).toBeNull()
    expect(screen.queryByRole('link', { name: 'English' })).toBeNull()
  })
})
