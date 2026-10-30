// Tests des redirections vers la page « Réglages » (tranche R2, jur-B5). Elle remplace « Mon
// compte » et « Mon profil » : les anciennes adresses, gardées dans les e-mails déjà envoyés
// (« Gérer mes e-mails » → /profile?section=emails) et dans les favoris, mènent à la bonne rubrique.
// Chaque fichier du dossier app/ est une page d'Expo Router : on l'affiche et on lit où il envoie,
// qu'il passe par <Redirect href> ou par router.replace.
import { screen } from '@testing-library/react-native'
import AccountRoute from '../../app/account'
import DeleteAccountRoute from '../../app/account/delete'
import ChangeEmailRoute from '../../app/account/email'
import ProfileRoute from '../../app/profile'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
const mockRedirect = jest.fn()
const mockReplace = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  // <Redirect href="…"> : le composant d'Expo Router qui change de page dès qu'il s'affiche.
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirect(href)
    return null
  },
  usePathname: () => '/ancienne-adresse',
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}))

/** Les adresses où la page a envoyé, par <Redirect> ou par router.replace. */
const redirectedTo = () => visited(mockRedirect, mockReplace)

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockRedirect.mockReset()
  mockReplace.mockReset()
  mockParams = {}
})

describe('the old addresses of the account', () => {
  it('sends /account to /settings', async () => {
    await renderWithProviders(<AccountRoute />)

    expect(redirectedTo()).toEqual(['/settings'])
  })

  it('sends /profile to the profile section of the settings', async () => {
    await renderWithProviders(<ProfileRoute />)

    expect(redirectedTo()).toEqual(['/settings/profile'])
  })

  it('sends « Gérer mes e-mails » (/profile?section=emails) to the notifications (jur-B5)', async () => {
    mockParams = { section: 'emails' }
    await renderWithProviders(<ProfileRoute />)

    expect(redirectedTo()).toEqual(['/settings/notifications'])
  })

  it('sends /account/email to the account section', async () => {
    await renderWithProviders(<ChangeEmailRoute />)

    expect(redirectedTo()).toEqual(['/settings/account/email'])
  })

  it('sends /account/delete to the account section', async () => {
    await renderWithProviders(<DeleteAccountRoute />)

    expect(redirectedTo()).toEqual(['/settings/account/delete'])
  })

  it('shows nothing of the old page while redirecting', async () => {
    await renderWithProviders(<AccountRoute />)

    // L'ancienne page « Mon compte » n'est plus dessinée : aucun de ses boutons.
    expect(screen.queryByRole('button', { name: 'Me déconnecter' })).toBeNull()
  })
})
