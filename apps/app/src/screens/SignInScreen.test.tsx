// Tests de l'écran de connexion. On remplace (« mock ») le module qui parle à l'API par de faux
// appels : on teste l'écran seul, sans réseau, et on décide nous-mêmes de la réponse de l'API.
// Depuis la refonte (tranche R2) : « Te revoilà », le choix de la langue, « Voir le code » annoncé
// comme un site externe, « Mot de passe oublié ? », l'adresse de contact en lien ; sur ordinateur,
// connexion et inscription sont deux onglets d'un même panneau (AuthPanel) dont l'adresse suit ;
// et « Trop d'essais » bloque le bouton jusqu'à une heure fixe (décision D3 du 29/10/2026).
import { contactEmail, sourceUrl } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { signIn } from '../accounts/api'
import { createI18n } from '../i18n'
import { pathOf, visited } from '../testing/navigation'
import { renderWithI18n, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SignInScreen } from './SignInScreen'

// signUp aussi : sur ordinateur, le panneau porte les deux formulaires.
jest.mock('../accounts/api', () => ({ signIn: jest.fn(), signUp: jest.fn() }))
const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockSetParams = jest.fn()
let mockParams: { next?: string | string[]; code?: string } = {}
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports. Un `Link`
// d'Expo Router devient un simple texte au rôle de lien, qui passe son adresse au faux `push`.
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/sign-in',
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

const signInMock = jest.mocked(signIn)

const submit = async () => {
  await fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'lea@example.com')
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'correct-horse-battery')
  await fireEvent.press(screen.getByRole('button', { name: 'Me connecter' }))
}

/** Toutes les adresses demandées au routeur, chemin seul (« /sign-up », « /out?url=… »). */
const paths = () => visited(mockPush, mockReplace).map(pathOf)

/** Ce que les lecteurs d'écran ajoutent après le nom d'un lien qui quitte l'appli. */
const externalSite = fr.t(($) => $.common.externalSite)

/**
 * Vrai si un lien est annoncé comme externe : par un indice lu après son nom (accessibilityHint,
 * téléphone), par une description (aria-description, web), ou parce que son nom lu le dit.
 */
const announcedExternal = (link: ReturnType<typeof screen.getByRole>) => {
  const { accessibilityHint, accessibilityLabel } = link.props as Record<string, unknown>
  const description = (link.props as Record<string, unknown>)['aria-description']
  return [accessibilityHint, description, accessibilityLabel].some(
    (value) => typeof value === 'string' && value.includes(externalSite),
  )
}

beforeEach(() => {
  signInMock.mockReset()
  mockReplace.mockReset()
  mockPush.mockReset()
  mockSetParams.mockReset()
  mockParams = {}
})

describe('SignInScreen', () => {
  it('goes back home once signed in', async () => {
    signInMock.mockResolvedValue({ ok: true })
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(signInMock).toHaveBeenCalledWith({
      email: 'lea@example.com',
      password: 'correct-horse-battery',
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('returns to the page that asked for a sign-in', async () => {
    signInMock.mockResolvedValue({ ok: true })
    mockParams = { next: '/members/u2' }
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(mockReplace).toHaveBeenCalledWith('/members/u2')
  })

  it('never sends the member to another site, or to the leaving page, after signing in', async () => {
    signInMock.mockResolvedValue({ ok: true })
    for (const next of [
      '//faux.example/connexion',
      'javascript:alert(1)',
      '/out?url=https://faux-waiggle.example',
      // Un paramètre répété : seul le premier compte.
      ['//faux.example', '/members/u2'],
    ]) {
      mockReplace.mockReset()
      mockParams = { next }
      const { unmount } = await renderWithI18n(<SignInScreen />)

      await submit()

      expect(mockReplace).toHaveBeenCalledWith('/')
      await unmount()
    }
  })

  it('says when the email or password is wrong', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'invalidCredentials' })
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(screen.getByText('Adresse e-mail ou mot de passe incorrect.')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('explains that the address must be verified first, in English too', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'emailNotVerified' })
    await renderWithI18n(<SignInScreen />, 'en')

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'lea@example.com')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-battery')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      screen.getByText('Your email is not verified yet: we just sent you the link again.'),
    ).toBeTruthy()
  })
})

// --- Tranche 7a : l'adresse de contact, lisible sans compte (règle 23 de la relecture du plan) ---

describe('the contact address on the sign-in page', () => {
  it('gives the contact address, in French or in English, to someone without an account', async () => {
    // Une personne photographiée ou une autorité n'a pas de compte : elle doit pouvoir écrire.
    await renderWithI18n(<SignInScreen />)

    expect(screen.getAllByText(containing(fr.t(($) => $.auth.contact))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(contactEmail)).length).toBeGreaterThan(0)
  })

  it('gives it in English too', async () => {
    await renderWithI18n(<SignInScreen />, 'en')

    expect(
      screen.getAllByText(containing(createI18n('en').t(($) => $.auth.contact))).length,
    ).toBeGreaterThan(0)
  })

  // R2, liste « design à reprendre » : l'adresse n'était un lien nulle part. Ici, elle ouvre la
  // messagerie directement (notre propre adresse : pas de page « Tu quittes… »).
  it('makes the address a link that opens the mail app (R2)', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    try {
      await renderWithI18n(<SignInScreen />)

      const link = screen.getByRole('link', { name: containing(contactEmail) })
      await fireEvent.press(link)

      const href = (link.props as Record<string, unknown>).href
      expect(openURL.mock.calls.length > 0 || href === `mailto:${contactEmail}`).toBe(true)
      if (openURL.mock.calls.length > 0) {
        expect(openURL).toHaveBeenCalledWith(`mailto:${contactEmail}`)
      }
      expect(paths().filter((path) => path.startsWith('/out'))).toEqual([])
    } finally {
      openURL.mockRestore()
    }
  })
})

// --- Tranche R2 : les textes de la maquette, la langue, le code source, le mot de passe oublié ---

describe('the sign-in page after the redesign (R2)', () => {
  it('is titled « Te revoilà », with its subtitle', async () => {
    await renderWithI18n(<SignInScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.auth.signIn.title) })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.signIn.subtitle))).toBeTruthy()
  })

  it('lets the visitor choose the language on this page', async () => {
    await renderWithI18n(<SignInScreen />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(screen.getByRole('radio', { name: 'English', checked: true })).toBeTruthy()
    expect(
      screen.getByRole('header', { name: createI18n('en').t(($) => $.auth.signIn.title) }),
    ).toBeTruthy()
  })

  it('announces « Voir le code » as a link to an external site, and still opens it through the warning page', async () => {
    await renderWithI18n(<SignInScreen />)

    const link = screen.getByRole('link', { name: containing(fr.t(($) => $.home.seeCode)) })
    expect(announcedExternal(link)).toBe(true)

    await fireEvent.press(link)

    // Un site tiers passe toujours par « Tu quittes… », qui montre l'adresse réelle avant d'y aller.
    expect(paths().some((path) => path.startsWith('/out') && path.includes(sourceUrl))).toBe(true)
  })

  it('leads to « Mot de passe oublié ? »', async () => {
    await renderWithI18n(<SignInScreen />)

    await fireEvent.press(
      screen.getByRole('link', { name: fr.t(($) => $.auth.signIn.forgotPassword) }),
    )

    expect(paths()).toContain('/forgot-password')
  })

  it('has no tabs on a phone: « Créer un compte » is a link to the sign-up page', async () => {
    await renderWithI18n(<SignInScreen />)

    expect(screen.queryByRole('tab')).toBeNull()
    await fireEvent.press(screen.getByRole('link', { name: fr.t(($) => $.auth.signIn.createOne) }))

    expect(paths()).toContain('/sign-up')
  })
})

describe('the sign-in page on a computer: two tabs of one panel', () => {
  let restore: () => void
  beforeEach(() => {
    restore = setDesktopWindow()
  })
  afterEach(() => restore())

  it('shows « Se connecter » and « Créer un compte » as tabs, sign-in selected', async () => {
    await renderWithI18n(<SignInScreen />)

    expect(
      screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signIn), selected: true }),
    ).toBeTruthy()
    expect(
      screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signUp), selected: false }),
    ).toBeTruthy()
    expect(screen.getByRole('header', { name: fr.t(($) => $.auth.signIn.title) })).toBeTruthy()
    // Un seul formulaire à la fois : celui de l'inscription attend derrière son onglet.
    expect(screen.queryByRole('header', { name: fr.t(($) => $.auth.signUp.title) })).toBeNull()
    expect(screen.queryByLabelText('Code d’invitation')).toBeNull()
  })

  it('switches to the sign-up form without leaving the page, and the address follows', async () => {
    await renderWithI18n(<SignInScreen />)

    await fireEvent.press(screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signUp) }))

    expect(
      screen.getByRole('tab', { name: fr.t(($) => $.auth.tabs.signUp), selected: true }),
    ).toBeTruthy()
    expect(screen.getByRole('header', { name: fr.t(($) => $.auth.signUp.title) })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: fr.t(($) => $.auth.signUp.submit) }),
    ).not.toBeDisabled()
    // L'adresse de la page devient /sign-up : un lien copié ouvre le bon onglet.
    expect(paths()).toContain('/sign-up')
  })

  it('keeps the language choice on the panel', async () => {
    await renderWithI18n(<SignInScreen />)

    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
  })
})

// --- Tranche R2, « Trop d'essais » : une heure fixe, rien qui défile (décisions D3 et jur-14) ---

describe('too many sign-in attempts', () => {
  // Il est 21 h 32 ; l'API dit d'attendre 15 minutes (Retry-After : 900 s) : « à 21 h 47 ».
  const NOW = new Date(2026, 9, 30, 21, 32, 0)
  const FIFTEEN_MINUTES = 15 * 60

  /** Le texte lu du statut, tous les blancs ramenés à une espace (getByText fait pareil). */
  const statusText = () => {
    const collect = (node: unknown): string => {
      if (typeof node === 'string') return node
      if (!node || typeof node !== 'object') return ''
      return (node as { children: unknown[] }).children.map(collect).join('')
    }
    return collect(screen.getByRole('status')).replace(/\s+/g, ' ').trim()
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
    signInMock.mockResolvedValue({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: FIFTEEN_MINUTES,
    })
  })
  afterEach(() => jest.useRealTimers())

  it('says « Trop d’essais pour l’instant » and the fixed hour of the next try, without « tu »', async () => {
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(screen.getByText(fr.t(($) => $.auth.errors.tooManyAttempts))).toBeTruthy()
    // L'heure, dans un statut lu une fois (RetryAt) : « 21 h 47 » ou « 21:47 », sans secondes.
    expect(statusText()).toContain(
      fr
        .t(($) => $.auth.retryAt, { time: '' })
        .replace(/\s+/g, ' ')
        .trim(),
    )
    expect(statusText()).toMatch(/21\s*(h|:)\s*47/)
    // Rien ne défile : ni les minutes qui restent, ni les secondes.
    expect(statusText()).not.toMatch(/\b(15|14|900)\b/)
    // jur-14 : l'adresse IP est partagée par toute une famille, le texte ne dit pas « tu ».
    const said = `${fr.t(($) => $.auth.errors.tooManyAttempts)} ${statusText()}`
    expect(said).not.toMatch(/\b(tu|t’|ton|tes|toi)\b/i)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('blocks the button, which says why, and offers to choose a new password instead', async () => {
    await renderWithI18n(<SignInScreen />)

    await submit()

    const button = screen.getByRole('button', { name: 'Me connecter' })
    expect(button).toBeDisabled()
    // jur-13 : désactivé, le bouton dit pourquoi (un indice lu, ou une description sur le web).
    const { accessibilityHint } = button.props as Record<string, unknown>
    const describedBy = (button.props as Record<string, unknown>)['aria-describedby']
    expect(Boolean(accessibilityHint) || Boolean(describedBy)).toBe(true)

    await fireEvent.press(screen.getByRole('link', { name: fr.t(($) => $.auth.chooseNewPassword) }))
    expect(paths()).toContain('/forgot-password')
  })

  it('unblocks the button by itself once the hour has come', async () => {
    await renderWithI18n(<SignInScreen />)
    await submit()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeDisabled() // témoin

    await act(() => jest.advanceTimersByTime(FIFTEEN_MINUTES * 1000 - 1000))
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeDisabled()

    await act(() => jest.advanceTimersByTime(1000))
    expect(screen.getByRole('button', { name: 'Me connecter' })).not.toBeDisabled()
  })
})
