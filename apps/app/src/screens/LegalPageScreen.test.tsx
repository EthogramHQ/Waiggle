// Tests des quatre pages publiques de R11 (« La conformité ») : les Règles (/rules), la
// Confidentialité (/privacy), les Mentions légales (/legal) et l'Accessibilité (/accessibility),
// lisibles sans compte. Chacune montre son titre, sa version, « En bref », puis « Le texte complet,
// qui fait foi », et en bas les liens vers les trois autres pages et l'adresse de contact ; sur
// ordinateur, le « Sommaire » est à côté du texte.
//
// Les textes viennent de `legal/documents.ts` (plan de R11, « API des modules partagés ») :
//   legalDocument(page: LegalPage, t): { title, version, summary, sections }
// `summary` : les puces `{ icon, text }[]` (relecture de l'interface, U2), `sections` :
// `{ id, title, body }[]`, `version` : la date `AAAA-MM-JJ` de la page. Le corps d'une partie est du
// Markdown dont les seuls liens sont des adresses https publiques (jamais un lien interne ni un
// `mailto:` : le pied et le lien de contact s'en chargent).
import { contactEmail, legal } from '@ruche/brand'
import { LEGAL_PAGES, type LegalPage, publicHttpsUrl, RULES_VERSION } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { legalDocument } from '../legal/documents'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { LegalPageScreen } from './LegalPageScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/rules',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

const en = createI18n('en')

/** Le titre de chaque page, en français. */
const titles: Record<LegalPage, string> = {
  rules: fr.t(($) => $.legal.pages.rules.title),
  privacy: fr.t(($) => $.legal.pages.privacy.title),
  legal: fr.t(($) => $.legal.pages.legal.title),
  accessibility: fr.t(($) => $.legal.pages.accessibility.title),
}
const linkNames: Record<LegalPage, string> = {
  rules: fr.t(($) => $.legal.links.rules),
  privacy: fr.t(($) => $.legal.links.privacy),
  legal: fr.t(($) => $.legal.links.legal),
  accessibility: fr.t(($) => $.legal.links.accessibility),
}
const summaryTitle = fr.t(($) => $.legal.summaryTitle)
const fullTextTitle = fr.t(($) => $.legal.fullTextTitle)
const contents = fr.t(($) => $.legal.contents)

/** Tous les textes d'une page, tels que `legalDocument` les donne, à la suite. */
const allTexts = (doc: ReturnType<typeof legalDocument>): string[] => [
  doc.title,
  ...doc.summary.map((point) => point.text),
  ...doc.sections.flatMap((section) => [section.title, section.body]),
]

/** Les adresses des liens Markdown d'un texte (`[texte](adresse)`), et les adresses écrites en clair. */
const linksOf = (text: string): string[] => [
  ...Array.from(text.matchAll(/\]\(([^)\s]*)\)/g), (match) => match[1] ?? ''),
  ...Array.from(text.matchAll(/\b(?:https?|mailto|ftp|javascript):[^\s)]*/gi), (match) => match[0]),
]

beforeEach(() => {
  mockPush.mockReset()
  mockReplace.mockReset()
  mockNavigate.mockReset()
  // Un visiteur sans compte : les quatre pages ne demandent rien.
  mockSession(null)
})

describe('LegalPageScreen (R11)', () => {
  it('shows the rules to a visitor without an account: version, En bref, then the full text', async () => {
    await renderWithProviders(<LegalPageScreen page="rules" />)

    expect(screen.getByRole('header', { name: titles.rules })).toBeTruthy()
    // La version en vigueur des règles (RULES_VERSION, 2026-11-16), écrite en date courte.
    expect(RULES_VERSION).toBe('2026-11-16')
    expect(screen.getByText(/^Version du 16 nov\.? 2026$/)).toBeTruthy()
    expect(screen.getByRole('header', { name: summaryTitle })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.legal.pages.rules.summary.respect))).toBeTruthy()
    expect(screen.getByRole('header', { name: fullTextTitle })).toBeTruthy()
    expect(
      screen.getByRole('header', { name: fr.t(($) => $.legal.pages.rules.sections.account.title) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('header', {
        name: fr.t(($) => $.legal.pages.rules.sections.liability.title),
      }),
    ).toBeTruthy()
  })

  it('makes the four pages the same way', async () => {
    for (const page of LEGAL_PAGES) {
      const view = await renderWithProviders(<LegalPageScreen page={page} />)

      expect(screen.getByRole('header', { name: titles[page] })).toBeTruthy()
      expect(screen.getByText(/^Version du \d{1,2}(?:er)? \S+ \d{4}$/)).toBeTruthy()
      expect(screen.getByRole('header', { name: summaryTitle })).toBeTruthy()
      expect(screen.getByRole('header', { name: fullTextTitle })).toBeTruthy()
      // Chaque partie de `legalDocument`, sous son titre.
      for (const section of legalDocument(page, fr.t).sections) {
        expect(screen.getByRole('header', { name: section.title })).toBeTruthy()
      }
      // Avec RNTL 14, démonter est asynchrone : sans `await`, le rendu suivant chevauche son `act`.
      await view.unmount()
    }
  })

  it('links at the bottom to the three other pages and the contact address', async () => {
    await renderWithProviders(<LegalPageScreen page="legal" />)

    for (const page of LEGAL_PAGES.filter((other) => other !== 'legal')) {
      expect(screen.getByRole('link', { name: linkNames[page] })).toBeTruthy()
    }
    expect(screen.queryByRole('link', { name: linkNames.legal })).toBeNull()
    expect(
      screen.getByRole('link', { name: fr.t(($) => $.legal.links.contact, { contactEmail }) }),
    ).toBeTruthy()
  })

  it('shows the Sommaire beside the text on a computer, and not on a phone', async () => {
    const phone = await renderWithProviders(<LegalPageScreen page="rules" />)
    // Témoin : la page est là.
    expect(screen.getByRole('header', { name: titles.rules })).toBeTruthy()
    expect(screen.queryByLabelText(contents)).toBeNull()
    await phone.unmount()

    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<LegalPageScreen page="rules" />)

      expect(screen.getByLabelText(contents)).toBeTruthy()
      // Une entrée par partie, nommée par son titre.
      for (const section of legalDocument('rules', fr.t).sections) {
        expect(screen.getByRole('link', { name: section.title })).toBeTruthy()
      }
    } finally {
      restore()
    }
  })

  it('follows the language of the app', async () => {
    await renderWithProviders(<LegalPageScreen page="privacy" />, 'en')

    expect(
      screen.getByRole('header', { name: en.t(($) => $.legal.pages.privacy.title) }),
    ).toBeTruthy()
    expect(screen.getByRole('header', { name: en.t(($) => $.legal.summaryTitle) })).toBeTruthy()
    expect(screen.queryByRole('header', { name: titles.privacy })).toBeNull()
  })

  it('opens a link of the text through the warning page', async () => {
    await renderWithProviders(<LegalPageScreen page="accessibility" />)

    await fireEvent.press(screen.getByRole('link', { name: 'Défenseur des droits' }))

    const [destination] = visited(mockPush, mockReplace, mockNavigate).map(pathOf)
    expect(destination?.startsWith('/out?')).toBe(true)
    expect(new URLSearchParams(destination?.slice('/out'.length)).get('url')).toBe(
      'https://www.defenseurdesdroits.fr/',
    )
  })

  it('fills the legal notice from packages/brand, leaving no parameter unfilled', async () => {
    await renderWithProviders(<LegalPageScreen page="legal" />)

    // L'hébergeur vient de brand/legal (seul endroit où il est écrit).
    expect(screen.getAllByText(new RegExp(legal.host.name)).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/\{\{/)).toHaveLength(0)
  })

  it('every text of the four pages has its parameters filled, in both languages', () => {
    for (const t of [fr.t, en.t]) {
      for (const page of LEGAL_PAGES) {
        const doc = legalDocument(page, t)
        // Témoin : la page a des parties.
        expect(doc.sections.length).toBeGreaterThan(0)
        for (const text of allTexts(doc)) expect(text).not.toMatch(/\{\{|\}\}/)
      }
    }
  })

  it('every link of the four legal texts is a public https address', () => {
    const found: string[] = []
    for (const t of [fr.t, en.t]) {
      for (const page of LEGAL_PAGES) {
        for (const text of allTexts(legalDocument(page, t))) found.push(...linksOf(text))
      }
    }
    // Témoin : les textes ont des liens (le code source, le Défenseur des droits, la CNIL…).
    expect(found.length).toBeGreaterThan(0)
    for (const link of found) {
      // Ni lien interne (« /settings »), ni « mailto: », ni adresse privée : une adresse https
      // publique, la seule que ui/Markdown rend touchable.
      expect({ link, public: publicHttpsUrl(link) !== null }).toEqual({ link, public: true })
      expect(link.startsWith('https://')).toBe(true)
    }
  })
})
