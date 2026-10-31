// Le « Retour » au même endroit sur les pages du compte (refonte, tranche R3, « Venus des listes ») :
// la connexion, le mot de passe oublié, « Vérifie ta boîte mail » et le nouveau mot de passe le
// posent tous par le cadre de page (`Screen.onBack`), en haut à gauche, avant le titre, avec le même
// rôle et le même nom (« Retour »). Un fichier pour quatre écrans : il réunit les faux modules de
// leurs tests (un `jest.mock` vaut pour tout le fichier).
import { fireEvent, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CheckEmailScreen } from './CheckEmailScreen'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'
import { ResetPasswordScreen } from './ResetPasswordScreen'
import { SignInScreen } from './SignInScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signUp: jest.fn(),
  requestPasswordReset: jest.fn(),
  resendVerification: jest.fn(),
  changeUnverifiedEmail: jest.fn(),
  resetPassword: jest.fn(),
}))
// Sur le web, le premier écran prend la langue de l'appareil : le français, comme sur ce PC.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés : le retour doit être le sien.
const mockScreenProps: Record<string, unknown>[] = []
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
let mockParams: Record<string, string> = {}
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports.
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/sign-in',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      setParams: jest.fn(),
      back: mockBack,
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

const back = fr.t(($) => $.common.back)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Les éléments nommés de la page, dans l'ordre de lecture (celui du clavier et des lecteurs). */
const inReadingOrder = (node: Node | string): Node[] =>
  typeof node === 'string'
    ? []
    : [
        ...(node.props.accessibilityRole || node.props.role ? [node] : []),
        ...node.children.flatMap(inReadingOrder),
      ]

const roleOf = (node: Node) => node.props.accessibilityRole ?? node.props.role

beforeEach(() => {
  mockSession(null)
  for (const mock of [mockPush, mockReplace, mockBack]) mock.mockReset()
  mockScreenProps.length = 0
  mockParams = {}
})

const cases: [string, () => ReactElement, Record<string, string>][] = [
  ['the sign-in page', () => <SignInScreen />, {}],
  ['the forgotten password page', () => <ForgotPasswordScreen />, {}],
  ['« Vérifie ta boîte mail »', () => <CheckEmailScreen />, { email: 'lea@exemple.fr' }],
  ['the new password page', () => <ResetPasswordScreen />, { token: 'tok-7f3c9a-valide' }], // gitleaks:allow
]

describe.each(cases)('the « Retour » of %s', (_name, page, params) => {
  it('is drawn by the page frame, top left, before anything else', async () => {
    mockParams = params
    await renderWithProviders(page())

    // Un seul « Retour », bouton nommé comme partout ailleurs.
    expect(screen.getAllByRole('button', { name: back })).toHaveLength(1)
    // Celui du cadre de page (Screen.onBack), et non un bouton posé à part dans l'en-tête.
    expect(mockScreenProps.some((props) => typeof props.onBack === 'function')).toBe(true)
    // Le premier bouton, lien ou titre de la page : avant le titre et les onglets. (Le choix de la
    // langue, en haut à droite de la connexion, n'est pas compté : ce sont des radios.)
    const first = inReadingOrder(screen.root as unknown as Node).find((node) =>
      ['button', 'link', 'header', 'tab'].includes(String(roleOf(node))),
    )
    expect(first?.props.accessibilityLabel ?? first?.props['aria-label']).toBe(back)
  })

  it('goes back when touched', async () => {
    mockParams = params
    await renderWithProviders(page())

    await fireEvent.press(screen.getByRole('button', { name: back }))

    // Revenir : la page d'avant, ou une page de secours quand il n'y en a pas.
    expect(mockBack.mock.calls.length + mockReplace.mock.calls.length).toBe(1)
  })
})
