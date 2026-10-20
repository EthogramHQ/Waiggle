// Tests de l'écran « Mon profil ». L'API (profile/api) est remplacée par de faux appels.
import type { EmailPreferences } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import type { ApiResult } from '../api/errors'
import { getMe, pickAvatar, updateProfile, uploadAvatar } from '../profile/api'
import { leaEmailPreferences } from '../testing/email'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { ProfileScreen } from './ProfileScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les réglages d'e-mail (tranche 6c) passent par le client réseau (email/api.ts) : on le remplace
// par un faux serveur, qui rend les réglages de Léa et accepte leurs changements.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: mockPush, replace: mockReplace, canGoBack: () => false }),
}))

const emailPath = '/v1/me/email-preferences'
// Les réglages d'e-mail tels que le faux serveur les garde, et la réponse choisie pour le prochain
// PATCH (sans elle, il accepte et rend l'état complet, comme l'API).
let storedEmails: EmailPreferences
let nextEmailPatch: (() => Promise<ApiResult<EmailPreferences>>) | null
const fakeRequest = async (to: string, init: RequestInit = {}) => {
  if (to !== emailPath) return { ok: false, error: 'notFound' } as const
  if (init.method === 'PATCH') {
    if (nextEmailPatch) return nextEmailPatch()
    storedEmails = { ...storedEmails, ...JSON.parse(String(init.body)) }
    return { ok: true, data: storedEmails } as const
  }
  return { ok: true, data: storedEmails } as const
}
/** Les corps des PATCH des réglages d'e-mail, dans l'ordre. */
const emailPatches = () =>
  jest
    .mocked(request)
    .mock.calls.filter(([to, init]) => to === emailPath && init.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init.body)) as unknown)

let session: ReturnType<typeof mockSession>

beforeEach(() => {
  storedEmails = { ...leaEmailPreferences }
  nextEmailPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  mockPush.mockReset()
  session = mockSession({ user: { name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(updateProfile).mockReset()
  jest.mocked(uploadAvatar).mockReset()
  jest.mocked(pickAvatar).mockReset()
  mockReplace.mockReset()
})

describe('ProfileScreen', () => {
  it('shows the current profile', async () => {
    await renderWithProviders(<ProfileScreen />)

    // findBy… attend que l'élément apparaisse (le profil arrive de l'API de façon asynchrone).
    expect(await screen.findByDisplayValue('Léa')).toBeTruthy()
    expect(screen.getByDisplayValue('Je bricole des agents IA le week-end.')).toBeTruthy()
    // Les outils favoris sont des pastilles, chacune avec son bouton pour la retirer.
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retirer Cursor' })).toBeTruthy()
  })

  it('saves the edited profile', async () => {
    jest
      .mocked(updateProfile)
      .mockResolvedValue({ ok: true, data: { ...leaMe, bio: 'Nouvelle bio' } })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Nouvelle bio')
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Cursor' }))
    await fireEvent.changeText(screen.getByLabelText('Outils favoris'), ' Midjourney , ')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Léa',
      bio: 'Nouvelle bio',
      favoriteTools: ['Claude', 'Midjourney'],
    })
    expect(await screen.findByText('Profil enregistré.')).toBeTruthy()
    // Le nom est aussi dans la session (affiché sur l'accueil) : elle doit être relue.
    expect(session.refetch).toHaveBeenCalled()
  })

  it('explains the problem and sends nothing when the bio is too long', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'a'.repeat(281))
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('La bio doit faire au plus 280 caractères.')).toBeTruthy()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('changes the avatar with a picture chosen on the device', async () => {
    jest.mocked(pickAvatar).mockResolvedValue({ uri: 'file:///photo.jpg' })
    jest.mocked(uploadAvatar).mockResolvedValue({
      ok: true,
      data: { ...leaMe, avatarUrl: 'http://localhost:3000/media/avatars/a.webp' },
    })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(uploadAvatar).toHaveBeenCalledWith({ uri: 'file:///photo.jpg' })
    expect(await screen.findByText('Photo mise à jour.')).toBeTruthy()
  })

  it('says when the picture is refused', async () => {
    jest.mocked(pickAvatar).mockResolvedValue({ uri: 'file:///document.pdf' })
    jest.mocked(uploadAvatar).mockResolvedValue({ ok: false, error: 'unsupportedMediaType' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(await screen.findByText('Choisis une image JPEG, PNG ou WebP.')).toBeTruthy()
  })

  it('says when the picture is too heavy', async () => {
    jest.mocked(pickAvatar).mockResolvedValue({ uri: 'file:///huge.jpg' })
    jest.mocked(uploadAvatar).mockResolvedValue({ ok: false, error: 'payloadTooLarge' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(await screen.findByText('L’image dépasse 5 Mo.')).toBeTruthy()
  })

  it('offers to go back to the account when the profile cannot load', async () => {
    jest.mocked(getMe).mockRejectedValue(new Error('réseau coupé'))
    await renderWithProviders(<ProfileScreen />)

    // Arrivé directement sur la page, sans page précédente : « Revenir » mène au compte.
    await fireEvent.press(await screen.findByRole('button', { name: 'Revenir' }))

    expect(mockReplace).toHaveBeenCalledWith('/account')
  })

  it('asks a visitor to sign in', async () => {
    mockSession(null)
    await renderWithProviders(<ProfileScreen />)

    expect(screen.getByRole('header', { name: 'Réservé aux membres' })).toBeTruthy()
    expect(getMe).not.toHaveBeenCalled()
  })

  // Tranche 6a : le pseudo, unique, modifiable ici. Scénario : docs/scenarios/phase-1.md,
  // « Tranche 6a — Le pseudo ».
  it('shows the current handle, and says who will see it', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    expect(screen.getByLabelText('Pseudo')).toHaveDisplayValue('lea')
    expect(screen.getByText(/^Les membres te voient sous @pseudo sur ta page/)).toBeTruthy()
  })

  it('sends the handle only when it changed, cleaned up, and shows the saved one', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: leaMe })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    // Sans toucher au pseudo : il n'est pas envoyé (garder son pseudo n'est pas un changement).
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(jest.mocked(updateProfile).mock.calls[0]?.[0]).not.toHaveProperty('handle')

    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: { ...leaMe, handle: 'lea_m' } })
    await fireEvent.changeText(screen.getByLabelText('Pseudo'), ' @Lea_M ')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    // Le « @ » et les majuscules sont retirés avant l'envoi, comme le fera l'API.
    expect(jest.mocked(updateProfile).mock.calls[1]?.[0]).toMatchObject({ handle: 'lea_m' })
    expect(
      await screen.findByText('Profil enregistré. @lea te reste réservé 30 jours.'),
    ).toBeTruthy()
    expect(screen.getByLabelText('Pseudo')).toHaveDisplayValue('lea_m')
  })

  it.each([
    ['too short', 'le', 'Le pseudo doit faire au moins 3 caractères.'],
    ['too long', 'l'.repeat(21), 'Le pseudo doit faire au plus 20 caractères.'],
    ['not starting with a letter', '1lea', /^Le pseudo commence par une lettre/],
    ['with an accent', 'léa', /^Le pseudo commence par une lettre/],
    ['reserved', 'admin', 'Ce pseudo est réservé. Choisis-en un autre.'],
  ])('explains a handle %s and sends nothing', async (_case, typed, message) => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), typed)
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText(message)).toBeTruthy()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('says under the field that the handle is already taken, and keeps what was typed', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: false, error: 'handleTaken' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'max')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Ce pseudo est déjà pris. Choisis-en un autre.')).toBeTruthy()
    // Sous le champ, pas dans le message général du formulaire (une alerte).
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Pseudo')).toHaveDisplayValue('max')
  })

  it('does nothing when the member cancels the picture choice', async () => {
    jest.mocked(pickAvatar).mockResolvedValue(null)
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(uploadAvatar).not.toHaveBeenCalled()
  })
})

// Tranche 6a, après les relectures : le champ du pseudo et l'enregistrement.
describe('ProfileScreen, the handle field', () => {
  it('shows the limits of a handle and counts its characters', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    expect(screen.getByText(/3 à 20 caractères : lettres sans accent/)).toBeTruthy()
    expect(screen.getByText('3 / 20')).toBeTruthy()
  })

  it('recalls that the former handle stays reserved after a change', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: { ...leaMe, handle: 'lea_m' } })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'lea_m')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(
      await screen.findByText('Profil enregistré. @lea te reste réservé 30 jours.'),
    ).toBeTruthy()
  })

  it('keeps what is typed while the profile is being saved', async () => {
    // Une réponse lente : le test décide quand elle arrive.
    let answer: (value: Awaited<ReturnType<typeof updateProfile>>) => void = () => {}
    jest.mocked(updateProfile).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'lea_m')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    // Pendant l'envoi, le membre se ravise et retouche son pseudo.
    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'lea_mo')
    answer({ ok: true, data: { ...leaMe, handle: 'lea_m' } })

    expect(await screen.findByText(/^Profil enregistré\./)).toBeTruthy()
    expect(screen.getByLabelText('Pseudo')).toHaveDisplayValue('lea_mo')
  })

  it('clears the error of the handle as soon as it is retouched', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: false, error: 'handleTaken' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'max')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Ce pseudo est déjà pris. Choisis-en un autre.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'max_')

    expect(screen.queryByText('Ce pseudo est déjà pris. Choisis-en un autre.')).toBeNull()
  })

  it('says under the field that the handle changed too often today', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: false, error: 'handleChangeLimit' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Pseudo'), 'lea_six')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(
      await screen.findByText(
        'Tu as changé de pseudo plusieurs fois aujourd’hui. Réessaie demain.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('saves once on Enter in a one-line field, even pressed again while saving', async () => {
    let answer: (value: Awaited<ReturnType<typeof updateProfile>>) => void = () => {}
    jest.mocked(updateProfile).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    const handle = screen.getByLabelText('Pseudo')
    await fireEvent(handle, 'submitEditing')
    // La réponse n'est pas encore là : Entrée, puis « Enregistrer », n'envoient rien de plus.
    await fireEvent(handle, 'submitEditing')
    await fireEvent(screen.getByLabelText('Nom affiché'), 'submitEditing')
    answer({ ok: true, data: leaMe })

    expect(await screen.findByText('Profil enregistré.')).toBeTruthy()
    expect(updateProfile).toHaveBeenCalledTimes(1)
  })
})

// Tranche 6c : la section « E-mails ». Deux réglages, chacun enregistré dès qu'on le touche, sans
// passer par « Enregistrer ». Scénario : docs/scenarios/phase-1.md, « Précisions (tranche 6c) ».
describe('ProfileScreen, the e-mail settings', () => {
  const recap = () => screen.findByRole('switch', { name: 'Le récap de la semaine' })
  const mentions = () =>
    screen.findByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' })

  it('shows the two settings, the weekly recap on and the mention e-mails off', async () => {
    await renderWithProviders(<ProfileScreen />)

    expect(await screen.findByRole('header', { name: 'E-mails' })).toBeTruthy()
    expect(await recap()).toBeChecked()
    expect(await mentions()).not.toBeChecked()
    expect(screen.getByText('Le lundi matin, seulement s’il y a du nouveau.')).toBeTruthy()
    // Les e-mails du compte ne dépendent pas de ces réglages : la section le dit.
    expect(
      screen.getByText(
        'Les e-mails liés à ton compte, comme la vérification de ton adresse, arrivent toujours.',
      ),
    ).toBeTruthy()
  })

  it('shows the settings saved by the member', async () => {
    storedEmails = { weeklyRecap: false, mentionEmails: true }
    await renderWithProviders(<ProfileScreen />)

    // Le temps que les réglages arrivent de l'API (s'ils s'affichent d'abord avec d'autres valeurs).
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' }),
      ).toBeChecked(),
    )
    expect(await recap()).not.toBeChecked()
  })

  it('saves a setting as soon as it is touched, without « Enregistrer »', async () => {
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await recap())

    expect(await recap()).not.toBeChecked()
    await waitFor(() => expect(emailPatches()).toEqual([{ weeklyRecap: false }]))
    expect(await screen.findByText('Réglage enregistré.')).toBeTruthy()
    // Le formulaire du profil n'est pas envoyé pour autant.
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('turns the mention e-mails on', async () => {
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await mentions())

    expect(await mentions()).toBeChecked()
    await waitFor(() => expect(emailPatches()).toEqual([{ mentionEmails: true }]))
  })

  it('puts the setting back, and says so, when it could not be saved', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'network' })
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await recap())

    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Le récap de la semaine' })).toBeChecked(),
    )
    expect(screen.queryByText('Réglage enregistré.')).toBeNull()
  })

  it('says to sign in again, with a link back to this page, when the session expired', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'unauthorized' })
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await recap())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    expect(visited(mockPush)).toEqual(['/sign-in?next=/page/actuelle'])
  })
})
