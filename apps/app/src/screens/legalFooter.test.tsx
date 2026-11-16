// Tests du pied des pages d'entrée (tranche R11, planche R11-Pied) : l'accueil d'un visiteur, la
// connexion et l'inscription montrent les liens vers les quatre pages publiques (Règles,
// Confidentialité, Mentions légales, Accessibilité) et « Le code source », sur téléphone comme sur
// ordinateur. « Moins de mots » : la phrase « … est un logiciel libre » est partie, et le lien vers
// le code n'est plus répété ailleurs sur la page (ni « Voir le code » sous les boutons, ni dans la
// scène de gauche).
import { sourceUrl } from '@ruche/brand'
import { LEGAL_PAGES } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { hrefOf, pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithI18n, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'
import { SignInScreen } from './SignInScreen'
import { SignUpScreen } from './SignUpScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signUp: jest.fn(),
}))
// Le choix de la langue enregistre la langue sur le compte : on remplace ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      setParams: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

const navigationName = fr.t(($) => $.legal.links.label)
const sourceCode = fr.t(($) => $.legal.links.sourceCode)
const externalSite = fr.t(($) => $.common.externalSite)
const pageNames = LEGAL_PAGES.map((page) => ({ page, name: fr.t(($) => $.legal.links[page]) }))

beforeEach(() => {
  mockSession(null)
  mockPush.mockReset()
  mockReplace.mockReset()
})

const screens = [
  ['the visitor home', () => <HomeScreen />],
  ['the sign-in page', () => <SignInScreen />],
  ['the sign-up page', () => <SignUpScreen />],
] as const

describe.each(screens)('the footer of %s (R11)', (_, render) => {
  it('links to the four public pages and to the source code', async () => {
    await renderWithI18n(render())

    expect(screen.getByLabelText(navigationName)).toBeTruthy()
    for (const { page, name } of pageNames) {
      expect(hrefOf(screen.getByRole('link', { name }).props.href)).toBe(`/${page}`)
    }
    // Le code source quitte l'appli : le lecteur d'écran l'entend (indice sur téléphone), et le
    // geste passe par la page « Tu quittes… ».
    const source = screen.getByRole('link', { name: sourceCode })
    expect(source.props.accessibilityHint).toBe(externalSite)
    await fireEvent.press(source)
    const paths = visited(mockPush, mockReplace).map(pathOf)
    expect(paths.some((path) => path.startsWith('/out') && path.includes(sourceUrl))).toBe(true)
  })

  it('no longer says the app is free software, and links to the code only once', async () => {
    await renderWithI18n(render())

    // Témoin : le pied est là.
    expect(screen.getByRole('link', { name: sourceCode })).toBeTruthy()
    expect(screen.queryByText(/logiciel libre/)).toBeNull()
    expect(screen.queryAllByRole('link', { name: /code/ })).toHaveLength(1)
  })

  it('keeps the footer on a computer, where the scene on the left has no link of its own', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithI18n(render())

      expect(screen.getByLabelText(navigationName)).toBeTruthy()
      expect(screen.queryByText(/logiciel libre/)).toBeNull()
      expect(screen.queryAllByRole('link', { name: /code/ })).toHaveLength(1)
    } finally {
      restore()
    }
  })
})
