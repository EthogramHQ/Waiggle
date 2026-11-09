// Tests de l'écran « Mon profil ». L'API (profile/api) est remplacée par de faux appels.
import { FAVORITE_TOOLS_MAX, type ToolList } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { request } from '../api/client'
import { getMe, pickAvatar, updateProfile, uploadAvatar } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProfileScreen } from './ProfileScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le client réseau, remplacé : les réglages d'e-mail (tranche 6c), qui le lisaient, ont quitté
// cette page en R2 (leurs tests : settings/EmailSettings.test.tsx) ; rien ne part sur le réseau.
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
// Les paramètres de l'adresse de la page, choisis par test (aucun depuis que ?section=emails mène
// aux notifications, R2 jur-B5).
const mockParams: Record<string, string | undefined> = {}
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

let session: ReturnType<typeof mockSession>

/**
 * Le catalogue des outils (R6b), tel que GET /v1/tools le rend : les favoris du profil s'y
 * choisissent. « Chat GPT » est un autre nom (alias) de ChatGPT.
 */
const catalogue: ToolList = {
  tools: [
    { slug: 'claude', name: 'Claude', family: 'assistant', aliases: [], projectCount: 41 },
    {
      slug: 'chatgpt',
      name: 'ChatGPT',
      family: 'assistant',
      aliases: ['Chat GPT'],
      projectCount: 20,
    },
    { slug: 'cursor', name: 'Cursor', family: 'development', aliases: [], projectCount: 7 },
    { slug: 'lovable', name: 'Lovable', family: 'no-code', aliases: [], projectCount: 9 },
  ],
  others: [],
}

/** Le champ des outils favoris : une liste à choix (combobox), nommée « Outils favoris ». */
const toolField = () => screen.getByRole('combobox', { name: fr.t(($) => $.profile.fields.tools) })

beforeEach(() => {
  // Une seule lecture réseau attendue (R6b) : le catalogue des outils, GET /v1/tools. Une requête
  // égarée reçoit « introuvable », jamais le réseau.
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(async (path: string) =>
      path === '/v1/tools' ? { ok: true, data: catalogue } : { ok: false, error: 'notFound' },
    )
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

  // R3 (relecture juridique, jur-J3) : la recherche trouve les membres par leur nom et leur pseudo ;
  // la rubrique le dit sous le champ du nom, là où on le choisit.
  it('says under the name that signed-in members can find you by search', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    expect(
      screen.getByText(
        'Les membres connectés peuvent te trouver par ton nom ou ton pseudo, dans la recherche et après « @ » dans un commentaire.',
      ),
    ).toBeTruthy()
  })

  it('saves the edited profile', async () => {
    jest
      .mocked(updateProfile)
      .mockResolvedValue({ ok: true, data: { ...leaMe, bio: 'Nouvelle bio' } })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Nouvelle bio')
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Cursor' }))
    // R6b : les favoris se choisissent dans le catalogue, comme les outils d'un projet.
    await fireEvent.changeText(toolField(), 'lova')
    await fireEvent.press(screen.getByRole('option', { name: /^Lovable, / }))
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Léa',
      bio: 'Nouvelle bio',
      favoriteTools: ['Claude', 'Lovable'],
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

// --- Tranche 7c : un compte suspendu (docs/scenarios/phase-1.md, « Un compte suspendu ») ---
//
// Pendant une suspension, le profil ne se modifie plus : ni le nom, ni le pseudo, ni la bio, ni
// les outils, ni la photo (l'API refuserait tout PATCH /v1/me autre que la langue). Les réglages
// d'e-mail, eux, restent (« régler ses e-mails ») : depuis R2, dans la rubrique « Notifications ».
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

// Relecture de l'interface (R2, C9) : le message posé au-dessus d'« Enregistrer » ne disparaît pas
// pendant l'envoi suivant ; sinon le bouton bouge sous le doigt (charte, 6c). La réponse le remplace.
describe('ProfileScreen, the message above « Enregistrer »', () => {
  it('keeps the last message while the next save is on its way, then replaces it', async () => {
    jest.mocked(updateProfile).mockResolvedValueOnce({ ok: true, data: leaMe })
    let answer: (value: { ok: false; error: 'internal' }) => void = () => {}
    jest.mocked(updateProfile).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Profil enregistré.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Une autre bio')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    // Pendant l'envoi : le message d'avant reste à sa place.
    expect(screen.getByText('Profil enregistré.')).toBeTruthy()

    await act(async () => answer({ ok: false, error: 'internal' }))
    expect(await screen.findByText(fr.t(($) => $.errors.internal))).toBeTruthy()
    expect(screen.queryByText('Profil enregistré.')).toBeNull()
  })
})

// --- Tranche R6b : les outils favoris se choisissent dans le catalogue (docs/scenarios/refonte.md,
// « Choisir ses outils ») ---
//
// Le profil n'a plus de champ de texte séparé par des virgules (décision de Louis du 9/11/2026) : le
// même champ que la feuille d'un projet (`ToolField`), qui propose les outils du catalogue (nom ou
// autre nom, sans accents ni majuscules), et ajoute un nom absent « comme autre outil » ; 10 au plus.
describe('ProfileScreen, favourite tools from the catalogue (R6b)', () => {
  const addOther = (name: string) => fr.t(($) => $.project.form.addOtherTool, { name })

  it('offers the catalogue tools as favourites and adds the touched one as a chip', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(toolField(), 'lova')
    await fireEvent.press(await screen.findByRole('option', { name: /^Lovable, / }))

    expect(screen.getByRole('button', { name: 'Retirer Lovable' })).toBeTruthy()
    // Le catalogue a été lu (GET /v1/tools).
    expect(jest.mocked(request).mock.calls.map(([path]) => path)).toContain('/v1/tools')
  })

  it('adds a name absent from the catalogue as an other tool, and saves it', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: leaMe })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(toolField(), 'Teachable Machine')
    await fireEvent.press(
      await screen.findByRole('option', { name: addOther('Teachable Machine') }),
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(jest.mocked(updateProfile).mock.calls[0]?.[0]).toMatchObject({
      favoriteTools: ['Claude', 'Cursor', 'Teachable Machine'],
    })
  })

  it('chooses the catalogue tool when another name of it is typed, never an other tool', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(toolField(), 'chat gpt')

    expect(await screen.findByRole('option', { name: /^ChatGPT, / })).toBeTruthy()
    expect(screen.queryByRole('option', { name: addOther('chat gpt') })).toBeNull()
  })

  it('saves no tool that was only typed: no list split by commas any more', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: leaMe })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    // Témoin : c'est bien le champ à choix (une combobox), plus un champ de texte libre.
    await fireEvent.changeText(toolField(), 'Midjourney, Lovable')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(jest.mocked(updateProfile).mock.calls[0]?.[0]).toMatchObject({
      favoriteTools: ['Claude', 'Cursor'],
    })
  })

  it('proposes nothing more once 10 favourite tools are chosen', async () => {
    const ten = Array.from({ length: FAVORITE_TOOLS_MAX }, (_, index) => `Outil ${index + 1}`)
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, favoriteTools: ten })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    expect(
      screen.getByText(fr.t(($) => $.project.form.toolsCount, { count: 10, max: 10 })),
    ).toBeTruthy()
    await fireEvent.changeText(toolField(), 'lova')
    await act(async () => {})

    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('still proposes a tool with 9 favourites chosen (witness of the limit)', async () => {
    const nine = Array.from({ length: FAVORITE_TOOLS_MAX - 1 }, (_, index) => `Outil ${index + 1}`)
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, favoriteTools: nine })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(toolField(), 'lova')

    expect(await screen.findByRole('option', { name: /^Lovable, / })).toBeTruthy()
  })
})

// --- Tranche R6b, restes de R5b (« fais tout », Louis, 8/11/2026) : la feuille du profil ---
describe('ProfileScreen, leftovers of R5b', () => {
  /** Attend `ms` vraies millisecondes, dans `act` (les réponses arrivent pendant ce temps). */
  const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  it('saves once when « Enregistrer » is pressed twice 60 ms apart and the API answers in 10 ms', async () => {
    jest.mocked(updateProfile).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, data: leaMe }), 10)
        }),
    )
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    await wait(60)
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))
    await wait(60)

    expect(await screen.findByText('Profil enregistré.')).toBeTruthy()
    expect(updateProfile).toHaveBeenCalledTimes(1)
  })

  it('shows an error with « Réessayer » when the profile cannot load, then the profile after a retry', async () => {
    jest.mocked(getMe).mockRejectedValueOnce(new Error('réseau coupé'))
    await renderWithProviders(<ProfileScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.common.retry) }))

    expect(await screen.findByDisplayValue('Léa')).toBeTruthy()
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(2))
  })
})
