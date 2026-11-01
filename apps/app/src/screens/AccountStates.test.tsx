// Ménage R4 (M7) : les états de « Changer d'adresse » (demande partie), des pages des liens d'un
// changement d'adresse (lien refusé, « connecte-toi d'abord », première étape, adresse changée)
// passent par l'état commun StateMessage, rangé à gauche : aucun texte n'y est centré. Jest ne
// calcule aucune position ; on lit donc la règle elle-même (le style `textAlign` de chaque texte
// dessiné) ; la mesure à 390 et 1440 px se fait dans le navigateur.
import type { Translation } from '@ruche/i18n'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { changeEmail } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ChangeEmailScreen } from './ChangeEmailScreen'
import { EmailChangeResultScreen } from './EmailChangeResultScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), changeEmail: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/email-change/done',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/**
 * Combien de nœuds dessinés ont un texte centré (`textAlign: 'center'`). Un bouton centre son
 * libellé dans sa pastille : on ne descend pas dans les boutons, ce ne sont pas des textes d'état.
 */
const centeredTexts = (node: Node): number => {
  if (node.props.accessibilityRole === 'button' || node.props.role === 'button') return 0
  const style = StyleSheet.flatten(node.props.style as never) as { textAlign?: string } | undefined
  const own = style?.textAlign === 'center' ? 1 : 0
  return node.children.reduce<number>(
    (sum, child) => (typeof child === 'string' ? sum : sum + centeredTexts(child)),
    own,
  )
}
const nothingCentered = () => expect(centeredTexts(screen.root as unknown as Node)).toBe(0)

const emailChange = (key: keyof Translation['account']['emailChange']) =>
  fr.t(($) => $.account.emailChange[key])

beforeEach(() => {
  mockParams = {}
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(changeEmail).mockReset().mockResolvedValue({ ok: true })
})

describe('« Changer d’adresse », demande partie (M7)', () => {
  it('shows the sent state with its title and its way back, nothing centered', async () => {
    await renderWithProviders(<ChangeEmailScreen />)
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.account.changeEmail.newEmail)),
      'lea.moreau@exemple.fr',
    )
    await fireEvent.changeText(
      screen.getByLabelText(fr.t(($) => $.account.changeEmail.password)),
      'mot-de-passe-de-lea',
    )
    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.account.changeEmail.submit) }),
    )

    // Témoin : l'état est bien là, avec son titre (un en-tête) et son issue.
    expect(
      await screen.findByRole('header', { name: fr.t(($) => $.account.changeEmail.sentTitle) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: fr.t(($) => $.account.changeEmail.back) }),
    ).toBeTruthy()
    nothingCentered()
  })
})

describe('les pages des liens d’un changement d’adresse (M7)', () => {
  it('has nothing centered when the link is refused', async () => {
    mockParams = { error: 'INVALID_TOKEN' }
    await renderWithProviders(<EmailChangeResultScreen step="done" />)

    expect(await screen.findByRole('header', { name: emailChange('errorTitle') })).toBeTruthy()
    nothingCentered()
  })

  it('has nothing centered when the member must sign in first', async () => {
    mockSession(null)
    await renderWithProviders(<EmailChangeResultScreen step="signInFirst" />)

    expect(
      await screen.findByRole('header', { name: emailChange('signInFirstTitle') }),
    ).toBeTruthy()
    nothingCentered()
  })

  it('has nothing centered after the first link', async () => {
    mockSession(null)
    await renderWithProviders(<EmailChangeResultScreen step="confirmed" />)

    expect(await screen.findByRole('header', { name: emailChange('confirmedTitle') })).toBeTruthy()
    nothingCentered()
  })

  it('has nothing centered once the address is changed, signed in', async () => {
    await renderWithProviders(<EmailChangeResultScreen step="done" />)

    expect(await screen.findByRole('header', { name: emailChange('doneTitle') })).toBeTruthy()
    nothingCentered()
  })

  it('has nothing centered once the address is changed, signed out', async () => {
    mockSession(null)
    await renderWithProviders(<EmailChangeResultScreen step="done" />)

    expect(await screen.findByRole('header', { name: emailChange('doneTitle') })).toBeTruthy()
    nothingCentered()
  })
})
