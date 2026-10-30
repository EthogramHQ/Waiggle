// Tests de l'écran « Mon profil ». L'API (profile/api) est remplacée par de faux appels.
import type { EmailPreferences } from '@ruche/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { request } from '../api/client'
import type { ApiResult } from '../api/errors'
import { getMe, pickAvatar, updateProfile, uploadAvatar } from '../profile/api'
import { leaEmailPreferences } from '../testing/email'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import * as focusModule from '../ui/focus'
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
// R2 : la feuille du profil se ferme en revenant aux réglages (back, ou replace sans historique).
const mockBack = jest.fn()
let mockCanGoBack = false
// Les paramètres de l'adresse de la page (?section=emails, depuis « Mon compte »), choisis par test.
let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
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

  // Relecture de design du 22/10/2026 : sur grand écran, la barre du haut lit aussi le profil
  // (pour l'avatar). Une panne de GET /v1/me faisait boucler la page entre « Chargement… » et
  // l'erreur, avec une requête de plus à chaque tour, sans jamais montrer l'erreur.
  it('shows the error on a large screen too, without asking for the profile again', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      // La première demande échoue ; une deuxième, s'il y en avait une, resterait sans réponse
      // (sinon la boucle tournerait sans fin et bloquerait le test) : la page resterait alors
      // sur « Chargement… ».
      jest
        .mocked(getMe)
        .mockRejectedValueOnce(new Error('panne'))
        .mockReturnValue(new Promise(() => {}))
      await renderWithProviders(<ProfileScreen />)

      expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeTruthy()
      expect(getMe).toHaveBeenCalledTimes(1)
    } finally {
      restoreWindow()
    }
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

// Tranche 6c, après les relectures de l'interface et du design (commit 9b4172b).
describe('ProfileScreen, the e-mail settings after the reviews', () => {
  const recapName = 'Le récap de la semaine'
  const loadError = 'Tes réglages d’e-mail n’ont pas pu se charger.'

  /** La première lecture des réglages échoue (`error`), les suivantes passent par le faux serveur. */
  const failFirstRead = (error: 'network' | 'unauthorized') => {
    let failed = false
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (to === emailPath && init.method === 'GET' && !failed) {
        failed = true
        return { ok: false, error }
      }
      return fakeRequest(to, init)
    }) as typeof request)
  }

  /** Le rang de chaque élément dans l'ordre de lecture de la page (de haut en bas). */
  const readingOrder = (...elements: ReturnType<typeof screen.getByRole>[]) => {
    const all: unknown[] = []
    const walk = (node: ReturnType<typeof screen.getByRole>) => {
      all.push(node)
      for (const child of node.children) if (typeof child !== 'string') walk(child)
    }
    walk(screen.root as ReturnType<typeof screen.getByRole>)
    return elements.map((element) => all.indexOf(element))
  }

  it('says that each setting is saved as soon as it is touched, under the group', async () => {
    await renderWithProviders(<ProfileScreen />)

    await screen.findByRole('switch', { name: recapName })
    expect(screen.getByText('Chaque réglage s’enregistre dès que tu le touches.')).toBeTruthy()
  })

  // Sur téléphone, le groupe est en bas de la page : sous lui, le message sortait de l'écran.
  it('shows a refused change between the title and the switches', async () => {
    nextEmailPatch = async () => ({ ok: false, error: 'unauthorized' })
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await screen.findByRole('switch', { name: recapName }))

    const alert = await screen.findByRole('alert')
    const [title, message, toggle] = readingOrder(
      screen.getByRole('header', { name: 'E-mails' }),
      alert,
      screen.getByRole('switch', { name: recapName }),
    )
    expect(title).toBeLessThan(message as number)
    expect(message).toBeLessThan(toggle as number)
    expect(screen.getByRole('link', { name: 'Me reconnecter' })).toBeTruthy()
  })

  it('shows the confirmation between the title and the switches too', async () => {
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await screen.findByRole('switch', { name: recapName }))

    const [message, toggle] = readingOrder(
      await screen.findByRole('status'),
      screen.getByRole('switch', { name: recapName }),
    )
    expect(message).toBeLessThan(toggle as number)
  })

  // Le message reste en place pendant le changement suivant : sans cela, il disparaissait le
  // temps de l'envoi puis revenait, et les interrupteurs sautaient deux fois sous le doigt.
  it('keeps the confirmation in place while the next change is on its way', async () => {
    await renderWithProviders(<ProfileScreen />)
    await fireEvent.press(await screen.findByRole('switch', { name: recapName }))
    expect(await screen.findByText('Réglage enregistré.')).toBeTruthy()

    let answer: (result: ApiResult<EmailPreferences>) => void = () => {}
    nextEmailPatch = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    await fireEvent.press(
      screen.getByRole('switch', { name: 'Un e-mail quand on me mentionne ou me répond' }),
    )

    expect(screen.getByText('Réglage enregistré.')).toBeTruthy()
    answer({ ok: true, data: { weeklyRecap: false, mentionEmails: true } })
    await waitFor(() => expect(emailPatches()).toHaveLength(2))
  })

  it('announces the line that waits for the settings as busy', async () => {
    jest.mocked(request).mockImplementation((() => new Promise(() => {})) as typeof request)
    await renderWithProviders(<ProfileScreen />)

    expect(await screen.findByRole('progressbar', { name: 'Chargement…' })).toBeBusy()
  })

  it('says what could not be loaded, then offers to try again', async () => {
    failFirstRead('network')
    await renderWithProviders(<ProfileScreen />)

    expect(await screen.findByText(loadError)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows « Réessayer » as busy and inactive while the settings are read again', async () => {
    let answer: (result: ApiResult<EmailPreferences>) => void = () => {}
    let reads = 0
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (init.method !== 'GET') return fakeRequest(to, init)
      reads += 1
      if (reads === 1) return { ok: false, error: 'network' }
      return new Promise<ApiResult<EmailPreferences>>((resolve) => {
        answer = resolve
      })
    }) as typeof request)
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).toBeBusy())
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDisabled()
    // Un second appui pendant la lecture ne relance rien.
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(reads).toBe(2)
    answer({ ok: true, data: leaEmailPreferences })
    expect(await screen.findByRole('switch', { name: recapName })).toBeChecked()
  })

  it('gives the keyboard focus to the first switch once « Réessayer » worked', async () => {
    const focus = jest.spyOn(focusModule, 'focusWithoutScroll').mockReturnValue(true)
    try {
      failFirstRead('network')
      await renderWithProviders(<ProfileScreen />)
      await screen.findByText(loadError)
      expect(focus).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

      await screen.findByRole('switch', { name: recapName })
      await waitFor(() => expect(focus).toHaveBeenCalledTimes(1))
      expect(focus.mock.calls[0]?.[0]).toBeTruthy()
    } finally {
      focus.mockRestore()
    }
  })

  // Relecture de e414e88 : après un « Réessayer » qui échoue encore, le focus reste sur le bouton,
  // et le lecteur d'écran n'entendait que la fin de l'attente. La raison de l'échec est une alerte,
  // posée au-dessus du groupe dès le premier échec (rien ne bouge sous le doigt au suivant) ; chaque
  // nouvel échec la pose à neuf, et une alerte posée à neuf est lue.
  it('says why the settings could not be loaded, and says it again when « Réessayer » fails again', async () => {
    let reads = 0
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (to === emailPath && init.method === 'GET') {
        reads += 1
        return { ok: false, error: 'network' }
      }
      return fakeRequest(to, init)
    }) as typeof request)
    await renderWithProviders(<ProfileScreen />)

    const first = await screen.findByRole('alert')
    expect(first).toHaveTextContent(/Vérifie ta connexion et réessaie\./)

    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

    await waitFor(() => expect(reads).toBe(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).not.toBeBusy())
    const again = screen.getByRole('alert')
    expect(again).toHaveTextContent(/Vérifie ta connexion et réessaie\./)
    // Une alerte neuve, pas la même restée en place (des valeurs simples : voir la charte).
    expect(again === first).toBe(false)
  })

  it('does not move the focus when the settings arrive without « Réessayer »', async () => {
    const focus = jest.spyOn(focusModule, 'focusWithoutScroll').mockReturnValue(true)
    try {
      await renderWithProviders(<ProfileScreen />)

      await screen.findByRole('switch', { name: recapName })
      expect(focus).not.toHaveBeenCalled()
    } finally {
      focus.mockRestore()
    }
  })

  it('offers to sign in again, and no « Réessayer », when the session expired', async () => {
    failFirstRead('unauthorized')
    await renderWithProviders(<ProfileScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
    expect(screen.getByRole('link', { name: 'Me reconnecter' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })
})

// Relecture de design globale du 22/10/2026.
describe('ProfileScreen, the e-mail settings after the global design review', () => {
  const loadError = 'Tes réglages d’e-mail n’ont pas pu se charger.'

  beforeEach(() => {
    mockParams = {}
  })

  // Une alerte rouge au-dessus du groupe redisait ce que dit la ligne « n'ont pas pu se charger » :
  // la ligne seule dit ce qui manque et pourquoi, une seule fois.
  it('announces a failed read once, in the line that says what is missing', async () => {
    jest.mocked(request).mockImplementation((async (to: string, init: RequestInit = {}) => {
      if (to === emailPath && init.method === 'GET') return { ok: false, error: 'network' }
      return fakeRequest(to, init)
    }) as typeof request)
    await renderWithProviders(<ProfileScreen />)

    expect(await screen.findByText(loadError)).toBeTruthy()
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(/Vérifie ta connexion et réessaie\./)
    // L'alerte est dans la ligne, sous « n'ont pas pu se charger », et non plus au-dessus du groupe.
    const order: unknown[] = []
    const walk = (node: ReturnType<typeof screen.getByRole>) => {
      order.push(node)
      for (const child of node.children) if (typeof child !== 'string') walk(child)
    }
    walk(screen.root as ReturnType<typeof screen.getByRole>)
    expect(order.indexOf(screen.getByText(loadError))).toBeLessThan(order.indexOf(alerts[0]))
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
  })

  it('brings the e-mail section into view when « Mon compte » leads there', async () => {
    const reveal = jest.spyOn(focusModule, 'revealWithoutJump').mockImplementation(() => {})
    try {
      mockParams = { section: 'emails' }
      await renderWithProviders(<ProfileScreen />)

      await screen.findByRole('switch', { name: 'Le récap de la semaine' })
      await waitFor(() => expect(reveal).toHaveBeenCalledTimes(1))
      expect(reveal.mock.calls[0]?.[0]).toBeTruthy()
    } finally {
      reveal.mockRestore()
    }
  })

  it('leaves the page at its top without the parameter', async () => {
    const reveal = jest.spyOn(focusModule, 'revealWithoutJump').mockImplementation(() => {})
    try {
      await renderWithProviders(<ProfileScreen />)

      await screen.findByRole('switch', { name: 'Le récap de la semaine' })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(reveal).not.toHaveBeenCalled()
    } finally {
      reveal.mockRestore()
    }
  })
})

// --- Tranche 7c : un compte suspendu (docs/scenarios/phase-1.md, « Un compte suspendu ») ---
//
// Pendant une suspension, le profil ne se modifie plus : ni le nom, ni le pseudo, ni la bio, ni
// les outils, ni la photo (l'API refuserait tout PATCH /v1/me autre que la langue). Les réglages
// d'e-mail, eux, restent (« régler ses e-mails »).
describe('ProfileScreen, for a suspended member', () => {
  /** Vrai si ce champ est à l'écran et modifiable : absent ou en lecture seule, il ne compte pas. */
  const editable = (label: string) => {
    const field = screen.queryByLabelText(label)
    return field !== null && field.props.editable !== false
  }

  it('says the profile cannot be changed during the suspension', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<ProfileScreen />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.suspension.profileLocked))),
    ).toBeTruthy()
  })

  it('offers no field to edit, no photo to change and nothing to save', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<ProfileScreen />)

    await screen.findByText(containing(fr.t(($) => $.suspension.profileLocked)))
    for (const label of ['Nom affiché', 'Pseudo', 'Bio', 'Outils favoris']) {
      expect({ label, editable: editable(label) }).toEqual({ label, editable: false })
    }
    expect(screen.queryByRole('button', { name: 'Retirer Cursor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Changer la photo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('still lets a suspended member set her e-mails', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<ProfileScreen />)

    await screen.findByText(containing(fr.t(($) => $.suspension.profileLocked)))
    const recap = await screen.findByRole('switch', { name: 'Le récap de la semaine' })
    await fireEvent.press(recap)

    await waitFor(() => expect(emailPatches()).toEqual([{ weeklyRecap: false }]))
  })

  it('keeps every field for a member who is not suspended', async () => {
    // Témoin : Léa, pas suspendue (beforeEach), peut tout modifier.
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    for (const label of ['Nom affiché', 'Pseudo', 'Bio', 'Outils favoris']) {
      expect({ label, editable: editable(label) }).toEqual({ label, editable: true })
    }
    expect(screen.getByRole('button', { name: 'Changer la photo' })).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.suspension.profileLocked)))).toBeNull()
  })
})

// --- Tranche R2 : le profil se modifie dans une feuille posée sur les réglages ---
// Ce que Jest ne mesure pas : la photo floutée derrière, l'anneau de verre, « Changer la photo » qui
// chevauche la photo. C'est l'affaire des captures et de la relecture de design. Les règles du
// profil (longueurs, pseudo, photo ré-encodée) ne changent pas : les tests ci-dessus les gardent.

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole
/** La feuille : l'élément nommé par son titre « Mon profil » (comme dans Sheet.test.tsx). */
const sheet = () => screen.getByLabelText(fr.t(($) => $.profile.title))

describe('ProfileScreen in a sheet (R2)', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockCanGoBack = true
  })

  it('opens as a modal dialog named « Mon profil », with « Changer la photo » and the fields inside', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    expect(roleOf(sheet().props)).toBe('dialog')
    expect(
      sheet().props['aria-modal'] === true || sheet().props.accessibilityViewIsModal === true,
    ).toBe(true)
    const inside = within(sheet())
    expect(inside.getByRole('button', { name: fr.t(($) => $.profile.avatar.change) })).toBeTruthy()
    expect(inside.getByLabelText('Nom affiché')).toBeTruthy()
    expect(inside.getByRole('button', { name: fr.t(($) => $.profile.save) })).toBeTruthy()
  })

  it('closes through « Fermer » (jur-15), back to the settings, without saving', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')
    await fireEvent.changeText(screen.getByLabelText('Nom affiché'), 'Léa Moreau')

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))

    expect(updateProfile).not.toHaveBeenCalled()
    const left =
      mockBack.mock.calls.length > 0 || visited(mockReplace, mockPush).includes('/settings')
    expect(left).toBe(true)
  })

  it('closes through « Fermer » even without a page to go back to', async () => {
    mockCanGoBack = false
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))

    expect(visited(mockReplace, mockPush)).toContain('/settings')
  })

  it('updates the preview of the page while the name is typed, on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProfileScreen />)
      await screen.findByDisplayValue('Léa')
      // Témoin : l'aperçu (MemberHeader) montre le nom actuel, en titre, comme sur sa page.
      expect(screen.getByRole('header', { name: 'Léa' })).toBeTruthy()

      await fireEvent.changeText(screen.getByLabelText('Nom affiché'), 'Léa Moreau')

      expect(screen.getByRole('header', { name: 'Léa Moreau' })).toBeTruthy()
      // Rien n'est envoyé pour autant : l'aperçu est local, « Enregistrer » reste à faire.
      expect(updateProfile).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('updates the preview of the bio too', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProfileScreen />)
      await screen.findByDisplayValue('Léa')

      await fireEvent.changeText(screen.getByLabelText('Bio'), 'Je fabrique des robots en carton.')

      // La bio tapée se lit deux fois : dans le champ, et dans l'aperçu.
      expect(screen.getAllByText('Je fabrique des robots en carton.').length).toBeGreaterThan(0)
    } finally {
      restore()
    }
  })
})
