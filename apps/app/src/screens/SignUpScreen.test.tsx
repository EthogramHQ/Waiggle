// Tests de l'écran d'inscription. On remplace (« mock ») le module qui parle à l'API par de faux
// appels : on teste l'écran seul, sans réseau, et on décide nous-mêmes de la réponse de l'API.
// Depuis la refonte (tranche R2) : « Créer ton compte » et « Créer mon compte », le choix de la
// langue, « Voir le code » annoncé comme un site externe, le bouton toujours actif (les champs
// incomplets sont signalés à l'envoi, le premier reçoit le focus), l'adresse absente de l'URL de
// « Vérifie ta boîte mail » (jur-9), les onglets sur ordinateur, et « Trop d'essais » à heure fixe.
import { sourceUrl } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { signUp } from '../accounts/api'
import { createI18n } from '../i18n'
import { pathOf, visited } from '../testing/navigation'
import { renderWithI18n, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusWithoutScroll } from '../ui/focus'
import { SignUpScreen } from './SignUpScreen'

// signIn aussi : sur ordinateur, le panneau porte les deux formulaires.
jest.mock('../accounts/api', () => ({ signUp: jest.fn(), signIn: jest.fn() }))
// Sur le web, le premier écran suit la langue de l'appareil : on la fixe au français (code-appli.md).
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
// Où l'écran pose le focus du clavier (web) : le test compte les appels.
jest.mock('../ui/focus', () => ({
  ...jest.requireActual('../ui/focus'),
  focusWithoutScroll: jest.fn(() => true),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSetParams = jest.fn()
// Les paramètres de l'adresse de la page (/sign-up?code=…), modifiables test par test.
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/sign-up',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      setParams: mockSetParams,
      back: jest.fn(),
      canGoBack: () => false,
    }),
    useLocalSearchParams: () => mockParams,
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

// jest.mocked donne le bon type au faux appel pour lui dicter sa réponse.
const signUpMock = jest.mocked(signUp)

// R2 : le bouton dit « Créer mon compte » (l'onglet et l'accueil disent « Créer un compte »).
const submitLabel = fr.t(($) => $.auth.signUp.submit)

const fillForm = async (password = 'correct-horse-battery', inviteCode = 'miel-2026-noel') => {
  await fireEvent.changeText(screen.getByLabelText('Code d’invitation'), inviteCode)
  await fireEvent.changeText(screen.getByLabelText('Nom affiché'), 'Léa')
  await fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'lea@example.com')
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), password)
  await fireEvent.press(screen.getByRole('button', { name: submitLabel }))
}

/** Toutes les adresses demandées au routeur, chemin seul. */
const paths = () => visited(mockPush, mockReplace).map(pathOf)

beforeEach(() => {
  signUpMock.mockReset()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockSetParams.mockReset()
  jest.mocked(focusWithoutScroll).mockClear()
  mockParams = {}
})

describe('SignUpScreen', () => {
  it('counts down the characters the password still needs, once typing has started', async () => {
    await renderWithI18n(<SignUpScreen />)
    // Avant la première lettre : une simple consigne, pas encore un décompte.
    expect(screen.getByLabelText('Au moins 12 caractères.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'a')
    expect(screen.getByLabelText('Encore 11 caractères')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'abeilles-d')
    expect(screen.getByLabelText('Encore 2 caractères')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'abeilles-dor')
    expect(screen.getByLabelText('C’est bon, ton mot de passe est assez long.')).toBeTruthy()
  })

  it('shows the password on request, then hides it again', async () => {
    await renderWithI18n(<SignUpScreen />)
    const field = screen.getByLabelText('Mot de passe')
    expect(field.props.secureTextEntry).toBe(true)

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    const shown = screen.getByLabelText('Mot de passe')
    expect(shown.props.secureTextEntry).toBe(false)
    // Même affiché, il ne part ni au correcteur orthographique ni au dictionnaire du clavier.
    expect(shown.props.autoCorrect).toBe(false)
    expect(shown.props.spellCheck).toBe(false)

    await fireEvent.press(screen.getByRole('button', { name: 'Masquer le mot de passe' }))
    expect(screen.getByLabelText('Mot de passe').props.secureTextEntry).toBe(true)
  })

  it('explains the problem and sends nothing when the password is too short', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fillForm('short')

    expect(screen.getByText('Le mot de passe doit faire au moins 12 caractères.')).toBeTruthy()
    expect(signUpMock).not.toHaveBeenCalled()
  })

  // R2 (jur-9) : l'adresse ne voyage plus dans l'URL de « Vérifie ta boîte mail » (elle resterait
  // dans l'historique du navigateur et les journaux) : la page la reçoit par l'état de navigation.
  it('creates the account in the member language, then asks to check the inbox, without the address in the URL', async () => {
    signUpMock.mockResolvedValue({ ok: true })
    await renderWithI18n(<SignUpScreen />)

    await fillForm()

    expect(signUpMock).toHaveBeenCalledWith({
      name: 'Léa',
      email: 'lea@example.com',
      password: 'correct-horse-battery',
      inviteCode: 'miel-2026-noel',
      language: 'fr',
    })
    expect(paths()).toContain('/check-email')
    expect(JSON.stringify(visited(mockPush, mockReplace))).not.toContain('lea@example.com')
  })

  it('asks for the invite code before sending anything', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fillForm('correct-horse-battery', '   ')

    expect(screen.getByText('Indique le code d’invitation que tu as reçu.')).toBeTruthy()
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('explains that the invite code was refused', async () => {
    signUpMock.mockResolvedValue({ ok: false, error: 'inviteInvalid' })
    await renderWithI18n(<SignUpScreen />)

    await fillForm()

    expect(
      screen.getByText(
        'Ce code d’invitation n’est pas valide. Demande-le à la personne qui t’a invité·e.',
      ),
    ).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('fills in the code from an invitation link', async () => {
    mockParams = { code: 'Miel-2026-Noel' }
    await renderWithI18n(<SignUpScreen />)

    expect(screen.getByLabelText('Code d’invitation').props.value).toBe('Miel-2026-Noel')
    // Le code ne reste pas dans l'adresse de la page.
    expect(mockSetParams).toHaveBeenCalledWith({ code: undefined })
  })

  it('ignores a code in the link that could not be a real one', async () => {
    mockParams = { code: 'a'.repeat(101) }
    await renderWithI18n(<SignUpScreen />)

    expect(screen.getByLabelText('Code d’invitation').props.value).toBe('')
  })
})

// --- Tranche R2 : les textes de la maquette, la langue, le code source, les champs incomplets ---

describe('the sign-up page after the redesign (R2)', () => {
  it('is titled « Créer ton compte », with its subtitle, and the button says « Créer mon compte »', async () => {
    await renderWithI18n(<SignUpScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.auth.signUp.title) })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.signUp.subtitle))).toBeTruthy()
    expect(screen.getByRole('button', { name: submitLabel })).toBeTruthy()
  })

  it('lets the visitor choose the language on this page', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(
      screen.getByRole('header', { name: createI18n('en').t(($) => $.auth.signUp.title) }),
    ).toBeTruthy()
  })

  it('announces « Voir le code » as a link to an external site', async () => {
    await renderWithI18n(<SignUpScreen />)

    const link = screen.getByRole('link', { name: containing(fr.t(($) => $.home.seeCode)) })
    const external = fr.t(($) => $.common.externalSite)
    const props = link.props as Record<string, unknown>
    expect(
      [props.accessibilityHint, props['aria-description'], props.accessibilityLabel].some(
        (value) => typeof value === 'string' && value.includes(external),
      ),
    ).toBe(true)

    await fireEvent.press(link)
    expect(paths().some((path) => path.startsWith('/out') && path.includes(sourceUrl))).toBe(true)
  })

  it('keeps « Créer mon compte » active while the form is empty, and sends nothing on submit', async () => {
    await renderWithI18n(<SignUpScreen />)

    const button = screen.getByRole('button', { name: submitLabel })
    expect(button).not.toBeDisabled()

    await fireEvent.press(button)

    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('says, under each empty field, what it needs', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

    expect(screen.getByText(fr.t(($) => $.auth.errors.inviteRequired))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.errors.nameRequired))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.errors.emailRequired))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.errors.passwordRequired))).toBeTruthy()
  })

  it('reports only the fields still incomplete', async () => {
    await renderWithI18n(<SignUpScreen />)
    await fireEvent.changeText(screen.getByLabelText('Code d’invitation'), 'miel-2026-noel')
    await fireEvent.changeText(screen.getByLabelText('Nom affiché'), 'Léa')

    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

    expect(screen.queryByText(fr.t(($) => $.auth.errors.inviteRequired))).toBeNull()
    expect(screen.queryByText(fr.t(($) => $.auth.errors.nameRequired))).toBeNull()
    expect(screen.getByText(fr.t(($) => $.auth.errors.emailRequired))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.errors.passwordRequired))).toBeTruthy()
  })

  it('gives the keyboard focus to the first incomplete field, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithI18n(<SignUpScreen />)
      // Le code et le nom sont là : le premier champ incomplet est l'adresse.
      await fireEvent.changeText(screen.getByLabelText('Code d’invitation'), 'miel-2026-noel')
      await fireEvent.changeText(screen.getByLabelText('Nom affiché'), 'Léa')

      await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

      // Un seul focus posé : sur le premier champ en erreur (le second attend son tour).
      expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
      expect(screen.getByText(fr.t(($) => $.auth.errors.emailRequired))).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('shows « Trop d’essais pour l’instant » and the fixed hour of the next try, button blocked', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 9, 30, 21, 32, 0))
    try {
      signUpMock.mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 900 })
      await renderWithI18n(<SignUpScreen />)

      await fillForm()

      expect(screen.getByText(fr.t(($) => $.auth.errors.tooManyAttempts))).toBeTruthy()
      // L'ancien texte (« Réessaie dans quelques minutes ») disait « tu » et ne donnait pas d'heure.
      expect(screen.queryByText(/Trop de tentatives/)).toBeNull()
      const status = screen.getByRole('status')
      expect(JSON.stringify(status.props.children ?? status.children)).toMatch(/21\s*(h|:)\s*47/)
      expect(screen.getByRole('button', { name: submitLabel })).toBeDisabled()
      expect(mockPush).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('the sign-up page on a computer: two tabs of one panel', () => {
  let restore: () => void
  beforeEach(() => {
    restore = setDesktopWindow()
  })
  afterEach(() => restore())

  it('opens on the « Créer un compte » tab', async () => {
    await renderWithI18n(<SignUpScreen />)

    expect(
      screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signUp), selected: true }),
    ).toBeTruthy()
    expect(screen.getByRole('header', { name: fr.t(($) => $.auth.signUp.title) })).toBeTruthy()
    expect(screen.queryByRole('header', { name: fr.t(($) => $.auth.signIn.title) })).toBeNull()
  })

  it('switches to the sign-in form without leaving the page, and the address follows', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fireEvent.press(screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signIn) }))

    expect(screen.getByRole('header', { name: fr.t(($) => $.auth.signIn.title) })).toBeTruthy()
    expect(screen.getByRole('button', { name: fr.t(($) => $.auth.signIn.submit) })).toBeTruthy()
    expect(paths()).toContain('/sign-in')
  })

  it('keeps the invitation code of the link when the tabs change', async () => {
    mockParams = { code: 'Miel-2026-Noel' }
    await renderWithI18n(<SignUpScreen />)

    await fireEvent.press(screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signIn) }))
    await fireEvent.press(screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signUp) }))

    expect(screen.getByLabelText('Code d’invitation').props.value).toBe('Miel-2026-Noel')
  })
})
