// Tests de « Vérifie ta boîte mail » (tranche 1, complétée en R2).
// Scénario : docs/scenarios/refonte.md, « Vérifie ta boîte mail ». L'adresse n'est plus dans
// l'adresse de la page (jur-9) : l'inscription la confie à l'état de navigation
// (accounts/pendingVerification), que la page lit. « Renvoyer l'e-mail » renvoie le lien puis attend
// une minute ; au-delà du quota, il dit à quelle heure réessayer (heure fixe, D3). « Changer
// d'adresse » corrige une faute de frappe avec le mot de passe (D4), « Ouvrir ma messagerie » n'est là
// que si l'adresse est d'un service connu (sur ordinateur).
import type { Translation } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { Platform } from 'react-native'
import { changeUnverifiedEmail, resendVerification } from '../accounts/api'
import { setPendingEmail } from '../accounts/pendingVerification'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { CheckEmailScreen } from './CheckEmailScreen'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  resendVerification: jest.fn(),
  changeUnverifiedEmail: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/check-email',
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: jest.fn(),
}))
// Sur le web, le premier écran prend la langue de l'appareil : le français, comme sur ce PC.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))

// Les textes de la page (sans le groupe `change`, qui est un objet : il a sa propre aide).
const text = (key: Exclude<keyof Translation['auth']['checkEmail'], 'change'>) =>
  fr.t(($) => $.auth.checkEmail[key])
const change = (key: keyof Translation['auth']['checkEmail']['change']) =>
  fr.t(($) => $.auth.checkEmail.change[key])
const retryAtPrefix = fr.t(($) => $.auth.retryAt, { time: '' }).trim()

const email = 'ines.haddad@exemple.fr'
const now = new Date(2026, 9, 30, 19, 37)
const hourAfter = (seconds: number) => {
  const then = new Date(now.getTime() + seconds * 1000)
  return new RegExp(`${then.getHours()}\\D{1,3}${String(then.getMinutes()).padStart(2, '0')}`)
}

beforeEach(() => {
  setPendingEmail(email)
  jest.mocked(useLocalSearchParams).mockReturnValue({})
  jest.mocked(resendVerification).mockReset().mockResolvedValue({ ok: true })
  jest
    .mocked(changeUnverifiedEmail)
    .mockReset()
    .mockResolvedValue({ ok: true, sentTo: 'ines.haddad@example.fr' })
})

afterEach(() => {
  setPendingEmail(null)
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('CheckEmailScreen', () => {
  it('reminds the member where the link was sent', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    expect(screen.getByText(containing(email))).toBeTruthy()
  })

  it('reads the address from the navigation state, never from the page address (jur-9)', async () => {
    // Un lien fabriqué : l'adresse de la page porte un texte, l'état de navigation est vide.
    setPendingEmail(null)
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ email: 'Ton compte est bloqué, appelle le 01 23 45 67 89' })
    await renderWithProviders(<CheckEmailScreen />)

    expect(screen.queryByText(/appelle/)).toBeNull()
    expect(screen.getByText(text('bodyNoEmail'))).toBeTruthy()
  })

  it('ignores an address slipped into the page address even when it looks like one', async () => {
    setPendingEmail(null)
    jest.mocked(useLocalSearchParams).mockReturnValue({ email: 'pirate@exemple.fr' })
    await renderWithProviders(<CheckEmailScreen />)

    expect(screen.queryByText(/pirate@exemple\.fr/)).toBeNull()
  })

  // Tranche 6c : la purge de nuit efface les inscriptions jamais vérifiées au bout de 30 jours
  // (UNVERIFIED_ACCOUNT_DAYS) ; la page le dit.
  it('says that a sign-up never verified is deleted after 30 days', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    expect(
      screen.getByText(
        'Sans vérification dans les 30 jours qui suivent l’inscription, elle est effacée.',
      ),
    ).toBeTruthy()
  })
})

describe('sending the email again', () => {
  it('sends the link again, says so, then waits a minute before serving again', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    await renderWithProviders(<CheckEmailScreen />)

    await fireEvent.press(screen.getByRole('button', { name: text('resend') }))

    expect(resendVerification).toHaveBeenCalledWith({ email })
    // La même phrase que l'adresse ait un compte ou non : le serveur ne le dit pas.
    expect(await screen.findByText(containing(text('resent')))).toBeTruthy()
    // Une minute d'attente, dite par une heure fixe (D3), le bouton bloqué.
    const button = screen.getByRole('button', { name: text('resend') })
    expect(button).toBeDisabled()
    expect(screen.getByText(containing(retryAtPrefix))).toHaveTextContent(hourAfter(60))

    await act(() => jest.advanceTimersByTime(61_000))

    expect(screen.getByRole('button', { name: text('resend') })).toBeEnabled()
  })

  it('tells at what fixed time to try again when the quota of the address is reached', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    jest
      .mocked(resendVerification)
      .mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 1800 })
    await renderWithProviders(<CheckEmailScreen />)

    await fireEvent.press(screen.getByRole('button', { name: text('resend') }))

    expect(
      await screen.findByText(containing(fr.t(($) => $.auth.errors.tooManyAttempts))),
    ).toBeTruthy()
    expect(screen.getByText(containing(retryAtPrefix))).toHaveTextContent(hourAfter(1800))
    expect(screen.getByRole('button', { name: text('resend') })).toBeDisabled()
    // Rien qui défile à la seconde.
    expect(screen.queryByText(/\b\d{1,2}:\d{2}\b/)).toBeNull()
  })
})

describe('changing the address before it is verified', () => {
  /** Ouvre la feuille « Changer d'adresse », remplit et envoie. */
  const correct = async ({ newEmail, password }: { newEmail: string; password: string }) => {
    await fireEvent.press(screen.getByRole('button', { name: change('title') }))
    await fireEvent.changeText(await screen.findByLabelText(change('newEmail')), newEmail)
    await fireEvent.changeText(screen.getByLabelText(change('password')), password)
    await fireEvent.press(screen.getByRole('button', { name: change('submit') }))
  }

  it('opens a sheet that asks for the right address and the password (D4)', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    await fireEvent.press(screen.getByRole('button', { name: change('title') }))

    expect(await screen.findByText(containing(change('intro')))).toBeTruthy()
    const newField = screen.getByLabelText(change('newEmail'))
    expect(newField).toHaveProp('keyboardType', 'email-address')
    const passwordField = screen.getByLabelText(change('password'))
    expect(passwordField).toHaveProp('secureTextEntry', true)
    // La feuille se ferme par un bouton nommé (jur-15), pas seulement par un geste.
    expect(screen.getByRole('button', { name: fr.t(($) => $.common.close) })).toBeTruthy()
  })

  it('sends the correction with the current address and says the same thing whether the new one is free or taken', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    await correct({ newEmail: 'ines.haddad@example.fr', password: 'mot-de-passe-d-ines' })

    expect(changeUnverifiedEmail).toHaveBeenCalledWith({
      email,
      password: 'mot-de-passe-d-ines',
      newEmail: 'ines.haddad@example.fr',
    })
    expect(await screen.findByText(containing(change('sent')))).toBeTruthy()
    // La page parle désormais de la nouvelle adresse, celle que le serveur a renvoyée.
    expect(screen.getByText(containing('ines.haddad@example.fr'))).toBeTruthy()
    expect(screen.queryByText(containing(email))).toBeNull()
  })

  it('says that the address or the password is wrong, without telling which', async () => {
    jest.mocked(changeUnverifiedEmail).mockResolvedValue({ ok: false, error: 'invalidCredentials' })
    await renderWithProviders(<CheckEmailScreen />)

    await correct({ newEmail: 'ines.haddad@example.fr', password: 'faux' })

    expect(
      await screen.findByText(containing(fr.t(($) => $.auth.errors.invalidCredentials))),
    ).toBeTruthy()
    expect(screen.queryByText(containing(change('sent')))).toBeNull()
  })

  it('says to simply sign in when the account is already verified', async () => {
    jest.mocked(changeUnverifiedEmail).mockResolvedValue({ ok: false, error: 'alreadyVerified' })
    await renderWithProviders(<CheckEmailScreen />)

    await correct({ newEmail: 'ines.haddad@example.fr', password: 'mot-de-passe-d-ines' })

    expect(await screen.findByText(containing(change('alreadyVerified')))).toBeTruthy()
  })

  it('offers « Mot de passe oublié ? » in the sheet (jur-12)', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    await fireEvent.press(screen.getByRole('button', { name: change('title') }))

    expect(
      await screen.findByRole('button', { name: fr.t(($) => $.auth.signIn.forgotPassword) }),
    ).toBeTruthy()
  })

  // Relecture juridique R2 (B1, D4, jur-B3) : la nouvelle adresse peut être déjà prise, et rien ne
  // part alors ; le serveur ne le dit pas. Aucun texte de la page ne doit affirmer l'envoi sans
  // condition, ni le corps, ni la confirmation d'un renvoi.
  const sentence = /part vers|vient de partir|vient d’y partir/
  /** Les textes de la page qui parlent d'un envoi. */
  const sendingTexts = () =>
    screen.getAllByText(sentence).map((node) => String(node.props.children).replace(/\s+/g, ' '))

  it('never claims without condition that a link left after a correction', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    await correct({ newEmail: 'ines.haddad@example.fr', password: 'mot-de-passe-d-ines' })

    expect(await screen.findByText(containing(change('sent')))).toBeTruthy()
    expect(
      screen.getByText(
        containing(fr.t(($) => $.auth.checkEmail.bodyChanged, { email: 'ines.haddad@example.fr' })),
      ),
    ).toBeTruthy()
    expect(
      screen.queryByText(
        containing(fr.t(($) => $.auth.checkEmail.body, { email: 'ines.haddad@example.fr' })),
      ),
    ).toBeNull()
    for (const said of sendingTexts()) expect(said).toMatch(/^Si /)
  })

  it('keeps every sentence conditional when the link is sent again after a correction', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    await renderWithProviders(<CheckEmailScreen />)
    await correct({ newEmail: 'ines.haddad@example.fr', password: 'mot-de-passe-d-ines' })
    await screen.findByText(containing(change('sent')))

    await fireEvent.press(screen.getByRole('button', { name: text('resend') }))

    expect(resendVerification).toHaveBeenCalledWith({ email: 'ines.haddad@example.fr' })
    expect(await screen.findByText(containing(text('resent')))).toBeTruthy()
    for (const said of sendingTexts()) expect(said).toMatch(/^Si /)
  })
})

describe('opening the mailbox', () => {
  it('offers to open the mailbox on a phone, whatever the address', async () => {
    await renderWithProviders(<CheckEmailScreen />)

    expect(screen.getByRole('button', { name: text('openMailbox') })).toBeTruthy()
  })

  it('offers the webmail on a computer for a known service', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setPendingEmail('ines.haddad@gmail.com')
    await renderWithProviders(<CheckEmailScreen />)

    expect(screen.getByRole('button', { name: text('openMailbox') })).toBeTruthy()
  })

  it('shows no mailbox button on a computer when the service is unknown', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(<CheckEmailScreen />)

    // Témoin : la page est bien là, avec l'adresse.
    expect(screen.getByText(containing(email))).toBeTruthy()
    expect(screen.queryByRole('button', { name: text('openMailbox') })).toBeNull()
  })
})
