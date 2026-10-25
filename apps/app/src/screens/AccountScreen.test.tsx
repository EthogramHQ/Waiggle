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

// --- Tranche 7b : les membres bloqués, une page de « Mon compte » ---

describe('the members I blocked, from my account', () => {
  it('leads every member to « Membres bloqués »', async () => {
    // Léa n'est pas administratrice : la ligne est pour tous, pas seulement pour la modération.
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: /^Membres bloqués/ }))

    // La page de la liste (app/blocks.tsx, plan de la tranche 7b).
    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toContain('/blocks')
  })

  it('puts « Membres bloqués » under a « Sécurité » heading, after « Mes données »', async () => {
    // Relecture de design 7b : sans titre, au-dessus de « Langue », la ligne ne disait pas de quoi
    // elle relevait.
    await renderWithI18n(<AccountScreen />)

    await screen.findByRole('button', { name: /^Membres bloqués/ })
    // Un titre de section (« header » en natif, h2 sur le web).
    expect(screen.getByRole('header', { name: fr.t('account.safety.title') })).toBeTruthy()
    // Dans l'ordre de la page : « Mes données », puis « Sécurité » et sa ligne, puis « Compte ».
    const order = screen
      .getAllByText(
        new RegExp(
          `^(${fr.t('account.data.title')}|${fr.t('account.safety.title')}|Membres bloqués|${fr.t('account.section.title')})$`,
        ),
      )
      .map((element) => element.props.children)
    expect(order).toEqual([
      fr.t('account.data.title'),
      fr.t('account.safety.title'),
      'Membres bloqués',
      fr.t('account.section.title'),
    ])
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

// --- Tranche « adresse » : changer son adresse e-mail depuis « Mon compte » ---

describe('changing my address from my account', () => {
  it('leads to the page that changes the address, from a row named after the action', async () => {
    await renderWithI18n(<AccountScreen />)

    // Le nom lu par le lecteur d'écran dit ce que fait la ligne (« Changer d'adresse e-mail »),
    // pas seulement ce qu'elle montre (relecture juridique du plan, J9).
    await fireEvent.press(
      await screen.findByRole('button', {
        name: new RegExp(`^${fr.t('account.email.change')}`),
      }),
    )

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/account/email'])
  })

  it('still shows the current address on that row, and no longer says « modifiable bientôt »', async () => {
    await renderWithI18n(<AccountScreen />)

    // Témoin : la ligne de l'adresse est là, avec l'adresse actuelle.
    expect(
      await screen.findByRole('button', { name: new RegExp(`^${fr.t('account.email.change')}`) }),
    ).toBeTruthy()
    expect(screen.getByText('lea@example.com')).toBeTruthy()
    expect(screen.queryByText('modifiable bientôt')).toBeNull()
  })

  // Point « À reprendre » du plan : en panne de réseau, le profil ne venait pas, et la page ne
  // disait rien. Elle le dit maintenant, dans un message d'erreur.
  it('says so when the profile cannot be loaded', async () => {
    jest.mocked(getMe).mockRejectedValue(new TypeError('Network request failed'))
    await renderWithI18n(<AccountScreen />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    // Le reste de la page reste utilisable : on peut toujours se déconnecter.
    expect(screen.getByRole('button', { name: 'Me déconnecter' })).toBeTruthy()
  })

  it('shows no error once the profile has arrived', async () => {
    await renderWithI18n(<AccountScreen />)

    // Témoin du test précédent : le profil arrivé, aucune alerte.
    await screen.findByRole('button', { name: /^Nous écrire/ })
    expect(jest.mocked(getMe)).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
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
