import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { signOut } from '../accounts/api'
import { getMe } from '../profile/api'
import { adminMe, leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { AccountScreen } from './AccountScreen'

// Le choix de la langue enregistre la langue sur le compte : on remplace aussi ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  downloadMyData: jest.fn(),
}))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

const lea = { user: { name: 'Léa', email: 'lea@example.com' } }

beforeEach(() => {
  mockSession(lea)
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(signOut).mockReset()
  mockReplace.mockReset()
  mockPush.mockReset()
})

describe('AccountScreen', () => {
  it('shows who is signed in', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByText('lea@example.com')).toBeTruthy()
  })

  it('leads to the profile page', async () => {
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Modifier mon profil' }))

    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('offers to choose the language', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
    expect(screen.getByText('Tes e-mails te sont aussi envoyés dans cette langue.')).toBeTruthy()
  })

  it('signs out and goes back home', async () => {
    jest.mocked(signOut).mockResolvedValue(undefined)
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Me déconnecter' }))

    expect(signOut).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('lets the member choose the appearance of this device', async () => {
    await renderWithI18n(<AccountScreen />)
    expect(screen.getByRole('radio', { name: 'Automatique', checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: 'Nuit' }))

    expect(screen.getByRole('radio', { name: 'Nuit', checked: true })).toBeTruthy()
  })

  it('leads to the page that deletes the account', async () => {
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer mon compte' }))

    expect(mockPush).toHaveBeenCalledWith('/account/delete')
  })
})

// --- Tranche 7a : la modération (administrateur seulement) et l'adresse de contact ---

describe('moderation in my account', () => {
  it('leads an administrator to the moderation page', async () => {
    jest.mocked(getMe).mockResolvedValue(adminMe)
    await renderWithI18n(<AccountScreen />)

    // Le profil arrive après l'affichage : la ligne apparaît quand on sait qu'il est administrateur.
    await fireEvent.press(await screen.findByRole('button', { name: /^Modération/ }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toContain('/moderation')
  })

  it('shows no moderation to a member who is not an administrator', async () => {
    // Léa (leaMe) : isAdmin est faux.
    await renderWithI18n(<AccountScreen />)

    // Témoin : le profil est arrivé (la ligne « Nous écrire » ne dépend pas de lui, l'avatar oui).
    expect(await screen.findByRole('button', { name: /^Nous écrire/ })).toBeTruthy()
    expect(jest.mocked(getMe)).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Modération/ })).toBeNull()
    expect(screen.queryByText('Modération')).toBeNull()
  })
})

describe('writing to us from my account', () => {
  it('shows the contact address, in French or in English', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(screen.getAllByText(containing(contactEmail)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/En français ou en anglais/).length).toBeGreaterThan(0)
  })

  // Test changé après la relecture de design de 4966555 : « Nous écrire » passait par la page « Tu
  // quittes Waiggle », dont les textes parlent d'un site tiers. Notre propre adresse s'ouvre
  // directement dans la messagerie, sans avertissement.
  it('opens an e-mail to the contact address directly, without the leaving page', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      await renderWithI18n(<AccountScreen />)

      await fireEvent.press(screen.getByRole('button', { name: /^Nous écrire/ }))

      // L'adresse vient de packages/brand, seul endroit où elle est écrite.
      expect(openURL).toHaveBeenCalledWith(`mailto:${contactEmail}`)
      expect(visited(mockPush).filter((href) => href.startsWith('/out'))).toEqual([])
    } finally {
      openURL.mockRestore()
    }
  })

  it('says the contact address in the spoken name of the row', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(
      screen.getByRole('button', {
        name: fr.t('account.contact.spoken', { contactEmail }),
      }),
    ).toBeTruthy()
  })
})

// Relecture de design globale du 22/10/2026 : « Mon compte » parlait de la langue des e-mails sans
// mener aux réglages d'e-mail, qui sont au bas de « Mon profil ».
describe('the e-mail settings from my account', () => {
  it('leads to the e-mail section of the profile', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(screen.getByRole('header', { name: 'E-mails' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Choisir les e-mails reçus' }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/profile?section=emails'])
  })

  it('puts the e-mails right after the appearance', async () => {
    await renderWithI18n(<AccountScreen />)

    // Les titres dans l'ordre de la page : celui des e-mails suit celui de l'apparence.
    const titles = screen.getAllByRole('header')
    const appearance = titles.indexOf(screen.getByRole('header', { name: 'Apparence' }))
    expect(appearance).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf(screen.getByRole('header', { name: 'E-mails' }))).toBe(appearance + 1)
  })
})
