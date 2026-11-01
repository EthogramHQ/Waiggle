// Tests du message « Mot de passe changé » de la rubrique Sécurité (tranche R2, relecture de
// l'interface B2) : l'écran du mot de passe revient à /settings/security?announce=passwordChanged,
// et la rubrique le dit elle-même (un toast ne porte aucune information absente de l'écran,
// décision R1). Le message paraît pour cette valeur seule, puis le paramètre quitte l'adresse.
import { screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SettingsScreen } from './SettingsScreen'

jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  downloadMyData: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockSetParams = jest.fn()
let mockParams: { announce?: string | string[] } = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/security',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: mockSetParams,
  }),
  useLocalSearchParams: () => mockParams,
}))

const changed = fr.t(($) => $.settings.changePassword.done)

/** Le rôle de la région qui annonce ce texte : `status` (poli) ou `alert`, sinon null. */
const announcedAs = (node: { props: unknown; parent: unknown } | null) => {
  let current = node as { props: Record<string, unknown>; parent: unknown } | null
  while (current) {
    const role = current.props.role ?? current.props.accessibilityRole
    if (role === 'status' || role === 'alert') return role
    current = current.parent as typeof current
  }
  return null
}

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockSetParams.mockReset()
  mockParams = {}
})

describe('the Security section after a password change (R2, B2)', () => {
  it('says the password changed, politely, then takes the parameter out of the address', async () => {
    mockParams = { announce: 'passwordChanged' }
    await renderWithI18n(<SettingsScreen section="security" />)

    const message = await screen.findByText(containing(changed))
    expect(announcedAs(message)).toBe('status')
    expect(mockSetParams).toHaveBeenCalledWith({ announce: undefined })
    // Le message reste quand le paramètre est parti : il ne disparaît pas sous les yeux.
    mockParams = {}
    expect(screen.getByText(containing(changed))).toBeTruthy()
  })

  it('says nothing for any other value', async () => {
    mockParams = { announce: 'somethingElse' }
    await renderWithI18n(<SettingsScreen section="security" />)

    // Témoin : la rubrique est là.
    expect(
      await screen.findByRole('link', { name: fr.t(($) => $.settings.changePassword.title) }),
    ).toBeTruthy()
    expect(screen.queryByText(containing(changed))).toBeNull()
    expect(mockSetParams).not.toHaveBeenCalled()
  })

  it('says nothing without the parameter', async () => {
    await renderWithI18n(<SettingsScreen section="security" />)

    expect(
      await screen.findByRole('link', { name: fr.t(($) => $.settings.changePassword.title) }),
    ).toBeTruthy()
    expect(screen.queryByText(containing(changed))).toBeNull()
  })
})
