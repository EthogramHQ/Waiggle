// Tests de la page « Changer d'adresse e-mail » (tranche « adresse », route /account/email).
// Scénario : docs/scenarios/phase-1.md, dernière section. Le membre saisit sa nouvelle adresse et
// son mot de passe ; un premier lien part vers son adresse ACTUELLE, et la page le lui dit.
// La demande au serveur (changeEmail, accounts/api) est remplacée par un faux.
import { contactEmail } from '@ruche/brand'
import type { Translation } from '@ruche/i18n'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { changeEmail, useSession } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ChangeEmailScreen } from './ChangeEmailScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), changeEmail: jest.fn() }))
// La barre du haut et les états partagés lisent le profil : on le remplace aussi.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/account/email',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: mockDismissTo,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

// Les textes de la page, tirés des traductions françaises (les mêmes que l'écran).
const text = (key: keyof Translation['account']['changeEmail'], params?: Record<string, string>) =>
  fr.t(($) => $.account.changeEmail[key], params)
const newEmailLabel = text('newEmail') // « Nouvelle adresse e-mail »
const passwordLabel = text('password') // « Confirme avec ton mot de passe »
// Pendant l'envoi, le bouton peut garder son nom ou dire « Envoi… » : les deux sont acceptés.
const submitName = new RegExp(`^(${text('submit')}|${text('sending')})$`)

const current = 'lea@example.com' // l'adresse actuelle de Léa (session et profil)
const typed = { newEmail: 'lea.moreau@exemple.fr', password: 'mot-de-passe-de-lea' }

/** Remplit le formulaire (ce qui n'est pas donné reste vide), puis appuie sur « Envoyer le lien ». */
const send = async ({ newEmail = '', password = '' }: { newEmail?: string; password?: string }) => {
  if (newEmail) await fireEvent.changeText(screen.getByLabelText(newEmailLabel), newEmail)
  if (password) await fireEvent.changeText(screen.getByLabelText(passwordLabel), password)
  await fireEvent.press(screen.getByRole('button', { name: submitName }))
}

// Un élément de l'arbre dessiné, tel que le rendent les requêtes de la bibliothèque de test.
type Element = ReturnType<typeof screen.getByText>

/**
 * Vrai si ce texte est annoncé par un lecteur d'écran sans qu'on y aille : lui-même ou un de ses
 * parents est une alerte, un « statut » (role status) ou une région vivante (aria-live, ou
 * accessibilityLiveRegion sur Android). C'est ce qui se lit dans l'arbre, quel que soit le
 * composant choisi pour le montrer.
 */
const announced = (element: Element): boolean => {
  for (let node: Element | null = element; node; node = node.parent) {
    const { role, accessibilityRole, accessibilityLiveRegion } = node.props
    const live: unknown = node.props['aria-live']
    const values: unknown[] = [role, accessibilityRole, live, accessibilityLiveRegion]
    if (
      values.some((value) => ['alert', 'status', 'polite', 'assertive'].includes(String(value)))
    ) {
      return true
    }
  }
  return false
}

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: current } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(changeEmail).mockReset().mockResolvedValue({ ok: true })
  for (const mock of [mockPush, mockReplace, mockNavigate, mockDismissTo]) mock.mockReset()
})

describe('ChangeEmailScreen', () => {
  it('gives the page its title', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    expect(screen.getByRole('header', { name: text('title') })).toBeTruthy()
  })

  it('shows the current address and says that two links must be followed', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    expect(screen.getAllByText(containing(text('current', { email: current }))).length).toBe(1)
    expect(screen.getAllByText(containing(text('intro'))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(text('steps'))).length).toBeGreaterThan(0)
  })

  it('asks for the new address with the e-mail keyboard and autofill', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    const field = screen.getByLabelText(newEmailLabel)
    expect(field).toHaveProp('keyboardType', 'email-address')
    expect(field).toHaveProp('autoComplete', 'email')
  })

  it('asks for the current password, hidden, with password autofill', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    const field = screen.getByLabelText(passwordLabel)
    expect(field).toHaveProp('secureTextEntry', true)
    expect(field).toHaveProp('autoComplete', 'current-password')
  })

  it('offers to retry, not to sign in, when the session cannot be read', async () => {
    // Relecture de design (des-3) : get-session en 500 montrait « Réservé aux membres ».
    const refetch = jest.fn().mockResolvedValue(undefined)
    jest.mocked(useSession).mockReturnValue({
      data: null,
      isPending: false,
      error: new Error('500'),
      refetch,
    } as unknown as ReturnType<typeof useSession>)
    await renderWithProviders(<ChangeEmailScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.states.errorTitle) })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.states.signedOutTitle))).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('opens the contact address in the mail app, without the « leaving » page', async () => {
    // Relecture de design (des-6) : l'adresse de l'aide est un lien mailto:, comme « Nous écrire ».
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await renderWithProviders(<ChangeEmailScreen />)

    await fireEvent.press(screen.getByRole('link', { name: contactEmail }))

    expect(openURL).toHaveBeenCalledWith(`mailto:${contactEmail}`)
    expect(
      visited(mockPush, mockReplace, mockNavigate, mockDismissTo).some((path) =>
        path.startsWith('/out'),
      ),
    ).toBe(false)
    openURL.mockRestore()
  })

  it('helps a member who no longer reaches the current address', async () => {
    // « Plus accès à son adresse actuelle ? » : le changement se fait alors à la main (scénario).
    await renderWithProviders(<ChangeEmailScreen />)

    expect(
      screen.getAllByText(containing(text('noAccess', { contactEmail }))).length,
    ).toBeGreaterThan(0)
  })

  it('sends the new address and the password', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    await send(typed)

    expect(changeEmail).toHaveBeenCalledTimes(1)
    expect(changeEmail).toHaveBeenCalledWith(typed)
  })

  it('sends the new address without the spaces around it', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    await send({ newEmail: `  ${typed.newEmail} `, password: typed.password })

    expect(changeEmail).toHaveBeenCalledWith(typed)
  })

  it('sends nothing without the password', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    await send({ newEmail: typed.newEmail })

    expect(changeEmail).not.toHaveBeenCalled()
  })

  it('refuses an address that is not an e-mail, under its field, without asking the server', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    await send({ newEmail: 'pas-une-adresse', password: typed.password })

    const message = fr.t(($) => $.auth.errors.invalidEmail)
    expect(await screen.findByText(message)).toBeTruthy()
    // L'erreur est reliée à son champ : le lecteur d'écran la lit après le nom du champ.
    expect(screen.getByLabelText(newEmailLabel)).toHaveProp(
      'accessibilityHint',
      expect.stringContaining(message),
    )
    expect(changeEmail).not.toHaveBeenCalled()
  })

  it('refuses the current address, under its field, without asking the server', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    await send({ newEmail: current, password: typed.password })

    const message = fr.t(($) => $.auth.errors.sameEmail) // « C'est déjà ton adresse. »
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByLabelText(newEmailLabel)).toHaveProp(
      'accessibilityHint',
      expect.stringContaining(message),
    )
    expect(changeEmail).not.toHaveBeenCalled()
  })

  it('recognises the current address typed in capitals', async () => {
    // Une adresse e-mail ne tient pas compte des majuscules : « LEA@Example.com » est la même.
    await renderWithProviders(<ChangeEmailScreen />)

    await send({ newEmail: 'LEA@Example.com', password: typed.password })

    expect(await screen.findByText(fr.t(($) => $.auth.errors.sameEmail))).toBeTruthy()
    expect(changeEmail).not.toHaveBeenCalled()
  })

  it('shows the button busy and inactive while sending, and sends only once', async () => {
    // La réponse reste en attente : on regarde le bouton pendant l'envoi (piège de la charte).
    let answer: (result: { ok: true }) => void = () => {}
    jest.mocked(changeEmail).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    await renderWithProviders(<ChangeEmailScreen />)

    await send(typed)

    await waitFor(() => expect(screen.getByRole('button', { name: submitName })).toBeBusy())
    expect(screen.getByRole('button', { name: submitName })).toBeDisabled()
    // Un second appui pendant l'envoi ne renvoie rien.
    await fireEvent.press(screen.getByRole('button', { name: submitName }))
    expect(changeEmail).toHaveBeenCalledTimes(1)
    answer({ ok: true })
    expect(await screen.findByText(containing(text('sentTitle')))).toBeTruthy()
  })

  it('says the password is wrong, under the password field, and sends no link', async () => {
    jest.mocked(changeEmail).mockResolvedValue({ ok: false, error: 'wrongPassword' })
    await renderWithProviders(<ChangeEmailScreen />)

    await send(typed)

    const message = fr.t(($) => $.auth.errors.wrongPassword) // « Mot de passe incorrect. »
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByLabelText(passwordLabel)).toHaveProp(
      'accessibilityHint',
      expect.stringContaining(message),
    )
    // Le formulaire reste là, pour corriger ; l'état « envoyé » n'apparaît pas.
    expect(screen.queryByText(containing(text('sentTitle')))).toBeNull()
  })

  it('says the address is already the current one when the server says so', async () => {
    // L'appli ne connaît que l'adresse de sa session ; le serveur a le dernier mot.
    jest.mocked(changeEmail).mockResolvedValue({ ok: false, error: 'sameEmail' })
    await renderWithProviders(<ChangeEmailScreen />)

    await send(typed)

    const message = fr.t(($) => $.auth.errors.sameEmail)
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByLabelText(newEmailLabel)).toHaveProp(
      'accessibilityHint',
      expect.stringContaining(message),
    )
  })

  it('says when there were too many attempts', async () => {
    jest.mocked(changeEmail).mockResolvedValue({ ok: false, error: 'tooManyAttempts' })
    await renderWithProviders(<ChangeEmailScreen />)

    await send(typed)

    expect(
      (await screen.findAllByText(containing(fr.t(($) => $.auth.errors.tooManyAttempts)))).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(containing(text('sentTitle')))).toBeNull()
  })

  it('says that a link left for the CURRENT address, and announces it', async () => {
    await renderWithProviders(<ChangeEmailScreen />)

    await send(typed)

    const title = await screen.findByText(containing(text('sentTitle')))
    // « Un lien vient de partir vers lea@example.com » : l'adresse actuelle, pas la nouvelle.
    const body = screen.getByText(containing(text('sentBody', { email: current })))
    expect(screen.getAllByText(containing(text('sentNext'))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(text('sentNone'))).length).toBeGreaterThan(0)
    // Le lecteur d'écran l'annonce sans qu'on cherche : le formulaire a disparu sous le doigt.
    expect(announced(title) || announced(body)).toBe(true)
    // Le formulaire est parti : on ne renvoie pas une seconde demande par mégarde.
    expect(screen.queryByLabelText(newEmailLabel)).toBeNull()
    expect(screen.queryByLabelText(passwordLabel)).toBeNull()
  })

  // R2 : « Mon compte » devient la rubrique Compte des réglages (/settings/account).
  it('leads back to the account settings once the link is sent', async () => {
    await renderWithProviders(<ChangeEmailScreen />)
    await send(typed)

    await fireEvent.press(await screen.findByRole('button', { name: text('back') }))

    expect(visited(mockPush, mockReplace, mockNavigate, mockDismissTo)).toContain(
      '/settings/account',
    )
  })

  it('asks a visitor to sign in, without the form', async () => {
    mockSession(null)
    await renderWithProviders(<ChangeEmailScreen />)

    expect(screen.getAllByText(fr.t(($) => $.states.signedOutTitle)).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText(newEmailLabel)).toBeNull()
  })
})
