// Tests du message « Mot de passe changé » de la connexion (tranche R2) : la page du nouveau mot de
// passe envoie vers /sign-in?announce=passwordChanged. Le message paraît pour cette valeur seule,
// puis le paramètre quitte l'adresse.
import { screen } from '@testing-library/react-native'
import { renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SignInScreen } from './SignInScreen'

jest.mock('../accounts/api', () => ({ signIn: jest.fn(), signUp: jest.fn() }))
const mockSetParams = jest.fn()
let mockParams: { announce?: string | string[] } = {}
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports.
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/sign-in',
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      setParams: mockSetParams,
      back: jest.fn(),
      canGoBack: () => false,
    }),
    useLocalSearchParams: () => mockParams,
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

const changed = fr.t(($) => $.auth.signIn.passwordChanged)

beforeEach(() => {
  mockSetParams.mockReset()
  mockParams = {}
})

describe('SignInScreen after a new password (R2)', () => {
  it('says the password changed, politely, then takes the parameter out of the address', async () => {
    mockParams = { announce: 'passwordChanged' }
    await renderWithI18n(<SignInScreen />)

    const message = await screen.findByText(containing(changed))
    // Lu sans couper le lecteur d'écran : le message est dans un « status », pas une alerte.
    let node: typeof message | null = message
    let role: unknown = null
    while (node && role === null) {
      const props = node.props as Record<string, unknown>
      role = props.role ?? props.accessibilityRole ?? null
      if (role !== 'status' && role !== 'alert') role = null
      node = node.parent
    }
    expect(role).toBe('status')
    expect(mockSetParams).toHaveBeenCalledWith({ announce: undefined })
  })

  it('says nothing for any other value', async () => {
    mockParams = { announce: 'somethingElse' }
    await renderWithI18n(<SignInScreen />)

    // Témoin : la page est là.
    expect(await screen.findByText(fr.t(($) => $.auth.signIn.title))).toBeTruthy()
    expect(screen.queryByText(containing(changed))).toBeNull()
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  it('says nothing without the parameter', async () => {
    await renderWithI18n(<SignInScreen />)

    expect(await screen.findByText(fr.t(($) => $.auth.signIn.title))).toBeTruthy()
    expect(screen.queryByText(containing(changed))).toBeNull()
  })
})
