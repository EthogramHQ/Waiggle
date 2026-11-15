// Tests des liens vers les quatre pages légales (tranche R11) : le pied de l'accueil des visiteurs,
// de la connexion et des quatre pages elles-mêmes, et les lignes « À propos » des réglages.
//
// L'API attendue de `ui/LegalLinks` (plan de R11, « API des modules partagés », revue par la
// relecture de l'interface, U2) :
//   { variant: 'footer' | 'rows'; current?: LegalPage }
// - des liens (rôle `link`) nommés par la page (« Règles », « Confidentialité », « Mentions
//   légales », « Accessibilité »), à vraie adresse (`linkProps` : `href` = « /rules »…), pour que le
//   navigateur les ouvre dans un onglet et que les moteurs les suivent ;
// - « Le code source » passe par la page d'avertissement (`/out`), comme tout site extérieur ;
// - avec `current` (le pied d'une des quatre pages) : les trois autres pages et l'adresse de
//   contact, sans « Le code source » (option 7 des planches R11) ;
// - `rows` : les mêmes liens, en lignes des réglages.
import { contactEmail, sourceUrl } from '@ruche/brand'
import type { LegalPage } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { createI18n } from '../i18n'
import { hrefOf, pathOf, visited } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LegalLinks } from './LegalLinks'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

let openURL: jest.SpyInstance
beforeEach(() => {
  mockPush.mockReset()
  mockReplace.mockReset()
  mockNavigate.mockReset()
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

/** Le nom de chaque page, tel que le pied l'écrit. */
const pageNames: Record<LegalPage, string> = {
  rules: fr.t(($) => $.legal.links.rules),
  privacy: fr.t(($) => $.legal.links.privacy),
  legal: fr.t(($) => $.legal.links.legal),
  accessibility: fr.t(($) => $.legal.links.accessibility),
}
const pages = Object.keys(pageNames) as LegalPage[]
const sourceCode = fr.t(($) => $.legal.links.sourceCode)
const contact = fr.t(($) => $.legal.links.contact, { contactEmail })

/** Un lien, ou, faute de mieux, une ligne bouton (charte : `queryByRole('link') ?? getByRole('button')`). */
const linkNamed = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

/** Toutes les adresses demandées au routeur, chemin seul. */
const paths = () => visited(mockPush, mockReplace, mockNavigate).map(pathOf)

describe('LegalLinks (R11)', () => {
  it('links to the four pages by their real address, in a navigation named after the app', async () => {
    await renderWithProviders(<LegalLinks variant="footer" />)

    expect(screen.getByLabelText(fr.t(($) => $.legal.links.label))).toBeTruthy()
    for (const page of pages) {
      const link = screen.getByRole('link', { name: pageNames[page] })
      expect(hrefOf(link.props.href)).toBe(`/${page}`)
    }
  })

  it('opens a page inside the app when its link is pressed', async () => {
    await renderWithProviders(<LegalLinks variant="footer" />)

    await fireEvent.press(screen.getByRole('link', { name: pageNames.privacy }))

    expect(paths()).toEqual(['/privacy'])
  })

  it('opens the source code through the warning page', async () => {
    await renderWithProviders(<LegalLinks variant="footer" />)

    await fireEvent.press(screen.getByRole('link', { name: sourceCode }))

    // La page « Tu quittes… », avec l'adresse du dépôt ; jamais le site ouvert directement.
    const [destination] = paths()
    expect(destination?.startsWith('/out?')).toBe(true)
    expect(new URLSearchParams(destination?.slice('/out'.length)).get('url')).toBe(sourceUrl)
    expect(openURL).not.toHaveBeenCalled()
  })

  it('on a page, links to the three other pages and the contact address, not to the source code', async () => {
    await renderWithProviders(<LegalLinks variant="footer" current="privacy" />)

    for (const page of pages.filter((other) => other !== 'privacy')) {
      expect(screen.getByRole('link', { name: pageNames[page] })).toBeTruthy()
    }
    // La page lue n'a pas de lien vers elle-même, ni « Le code source ».
    expect(screen.queryByRole('link', { name: pageNames.privacy })).toBeNull()
    expect(screen.queryByRole('link', { name: sourceCode })).toBeNull()

    // L'adresse de contact, lien qui ouvre la messagerie.
    await fireEvent.press(screen.getByRole('link', { name: contact }))
    expect(String(openURL.mock.calls.at(-1)?.[0] ?? '')).toMatch(
      new RegExp(`^mailto:${contactEmail.replace('.', '\\.')}`),
    )
  })

  it('in the settings, shows the four pages and the source code as rows', async () => {
    await renderWithProviders(<LegalLinks variant="rows" />)

    for (const page of pages) {
      await fireEvent.press(linkNamed(pageNames[page]))
    }
    expect(paths()).toEqual(pages.map((page) => `/${page}`))
    expect(linkNamed(sourceCode)).toBeTruthy()
  })

  it('names the links in English for an English reader', async () => {
    await renderWithProviders(<LegalLinks variant="footer" />, 'en')

    const en = createI18n('en')
    for (const page of pages) {
      const name = en.t(($) => $.legal.links[page])
      expect(screen.getByRole('link', { name })).toBeTruthy()
    }
  })
})
