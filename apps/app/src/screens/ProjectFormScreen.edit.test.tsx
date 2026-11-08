// Tests de la feuille de modification (R6a, scénario « Modifier » et « Supprimer ») : « Enregistrer »
// grisé tant que rien n'a changé, les seuls champs changés envoyés, un projet d'avant R6a sans
// catégorie, les photos enregistrées tout de suite (description comprise), l'abandon des
// changements, la zone « Supprimer ce projet » et sa fenêtre. Les outils et ce que ces tests
// supposent de l'écran : en tête de `ProjectFormScreen.test.tsx` et dans le testkit.
//
// En plus pour la suppression : la fenêtre est `DeleteProjectDialog` (U6a), qui envoie
// DELETE /v1/projects/{id} ; après, la feuille part vers « Mes projets » par `router.dismissTo('/me')`
// (jamais un retour vers la page supprimée, ui-M3) et montre le toast `deleted`.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { lendWebPage } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { suspendedMe } from '../testing/fixtures'
import { projectWithPhotos, recipesProject } from '../testing/projects'
import { containing } from '../testing/text'
import {
  categoryRow,
  choosePrivate,
  chooseStatus,
  deferred,
  destinations,
  focusedLabels,
  forgetFocus,
  type Host,
  layerAround,
  mockNav,
  mockPick,
  mockServer,
  navigations,
  openEditForm,
  openEditSheet,
  picked,
  resetAll,
  shown,
  TEXT,
  textOf,
  textsInOrder,
  tile,
} from './ProjectFormScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockClient.request(...(args as [never, never, never])),
  requestWithoutBody: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockClient.requestWithoutBody(...(args as [never, never])),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../media/pick', () => ({
  ...jest.requireActual('../media/pick'),
  pickVisuals: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockPick.pickVisuals(...(args as [never, never, never])),
  appendImage: async (form: FormData, field: string, image: { uri: string }) => {
    form.append(field, image.uri)
  },
}))
jest.mock(
  'expo-router',
  // Le testkit importe l'écran, qui importe expo-router : il n'est lu qu'au premier appel.
  () => {
    const kit = () =>
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    return {
      useRouter: () => kit().mockNav.router,
      usePathname: () => kit().mockNav.pathname,
      useNavigation: () => kit().mockNav.navigation,
      useLocalSearchParams: () => ({}),
      useGlobalSearchParams: () => ({}),
      useSegments: () => [],
      useFocusEffect: () => {},
    }
  },
)
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

beforeEach(() => resetAll())

const PROJECT_PATH = new RegExp(`^/v1/projects/${recipesProject.id}$`)
/** Les corps des PATCH /v1/projects/{id} reçus (les photos ont leurs propres routes). */
const savedBodies = () => mockServer.received('PATCH', PROJECT_PATH).map((one) => one.body)
const save = () => screen.getByRole('button', { name: TEXT.save })

/** Un projet publié avant R6a, jamais modifié depuis : sans catégorie. */
const oldProject = { ...recipesProject, primaryCategory: null, secondaryCategory: null }

describe('ProjectFormScreen, editing', () => {
  it('opens « Modifier le projet », « Enregistrer » inactive until a change, and again once undone', async () => {
    await openEditForm()

    expect(screen.getByLabelText(TEXT.editTitle)).toBeTruthy()
    expect(save()).toBeDisabled()
    expect(shown(TEXT.unchanged)).toBe(true)

    await fireEvent.changeText(screen.getByDisplayValue(recipesProject.title), 'Nouveau titre')
    expect(save()).toBeEnabled()
    expect(shown(TEXT.unchanged)).toBe(false)

    // Le changement défait : plus rien à enregistrer.
    await fireEvent.changeText(screen.getByDisplayValue('Nouveau titre'), recipesProject.title)
    expect(save()).toBeDisabled()
  })

  it("keeps « Enregistrer » reachable by Tab while it is inactive, described by « Rien à enregistrer pour l'instant. » (web)", async () => {
    const restorePage = lendWebPage()
    try {
      await openEditForm()

      const button = save()
      expect(button).toBeDisabled()
      expect(button.props.tabIndex).toBe(0)
      // Décrit par la phrase : `aria-describedby` vise l'élément qui la montre (ou un parent).
      const described = String(button.props['aria-describedby'] ?? '').split(' ')
      const reason = screen.getByText(containing(TEXT.unchanged)) as unknown as Host
      const ids: unknown[] = []
      for (let at: Host | null = reason; at; at = at.parent)
        ids.push(at.props.nativeID, at.props.id)
      expect(described.some((id) => id !== '' && ids.includes(id))).toBe(true)
    } finally {
      restorePage()
      jest.restoreAllMocks()
    }
  })

  it('sends only the changed fields, then opens the page with « Modifications enregistrées. »', async () => {
    await openEditForm()

    await fireEvent.changeText(screen.getByDisplayValue(recipesProject.title), 'Nouveau titre')
    await fireEvent.press(save())

    await waitFor(() => expect(savedBodies()).toEqual([{ title: 'Nouveau titre' }]))
    await waitFor(() => expect(destinations()).toContain(`/projects/${recipesProject.id}`))
    expect(await screen.findByText(containing(TEXT.saved))).toBeTruthy()
  })

  it('keeps ?photos=failed and ?announce= after saving', async () => {
    await openEditForm(recipesProject, { uploadFailed: true })

    // Arrivée après une photo échouée à la création (jur-J11) : la feuille le dit.
    expect(shown(TEXT.uploadFailed)).toBe(true)
    await chooseStatus('done') // il était « Testable »
    await fireEvent.press(save())

    await waitFor(() => expect(savedBodies()).toEqual([{ status: 'done' }]))
    await waitFor(() =>
      expect(destinations()).toContain(`/projects/${recipesProject.id}?announce=done`),
    )
  })

  it('is refused to anyone but the author', async () => {
    await openEditSheet({ ...recipesProject, isMine: false })

    expect(await screen.findByText(TEXT.notMine)).toBeTruthy()
    expect(screen.queryByRole('button', { name: TEXT.save })).toBeNull()
  })

  it('shows why a suspended member cannot edit, never the form first', async () => {
    const profile = deferred<typeof suspendedMe>()
    mockServer.me = profile.promise
    await openEditSheet(recipesProject)
    expect(screen.queryByDisplayValue(recipesProject.title)).toBeNull()

    await act(async () => profile.resolve(suspendedMe))

    expect(await screen.findByText(containing(TEXT.suspended))).toBeTruthy()
    expect(screen.queryByDisplayValue(recipesProject.title)).toBeNull()
    expect(screen.queryByRole('button', { name: TEXT.save })).toBeNull()
  })
})

describe('ProjectFormScreen, an old project without category', () => {
  it('asks for a category before saving another change', async () => {
    await openEditForm(oldProject)

    // La ligne le dit dès l'ouverture.
    expect(
      String(categoryRow().props.accessibilityLabel ?? textOf(categoryRow() as never)),
    ).toMatch(containing(TEXT.chooseCategory))
    await fireEvent.changeText(screen.getByDisplayValue(recipesProject.title), 'Nouveau titre')
    await fireEvent.press(save())

    expect(savedBodies()).toHaveLength(0)
    expect(shown(TEXT.chooseCategory)).toBe(true)
  })

  it('lets an old project without category become private', async () => {
    await openEditForm(oldProject)

    await choosePrivate()
    await fireEvent.press(save())

    // Restreindre l'audience ne demande jamais une donnée nouvelle (jur-J8).
    await waitFor(() => expect(savedBodies()).toEqual([{ visibility: 'private' }]))
  })
})

describe('ProjectFormScreen, photos of an existing project', () => {
  const PHOTO_IDS = projectWithPhotos.visuals.map((visual) => visual.id)

  it('saves a new photo and a removed one at once, and says so', async () => {
    mockPick.next = [picked('d')]
    await openEditForm(projectWithPhotos)

    expect(shown(TEXT.photosSaved)).toBe(true)
    await fireEvent.press(screen.getByRole('button', { name: TEXT.addPhotos }))
    await waitFor(() => expect(mockServer.received('POST', /\/visuals$/)).toHaveLength(1))
    // Trois photos déjà là : le choix en demande trois de plus au plus.
    expect(mockPick.calls[0]?.remaining).toBe(3)

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer la photo 2' }))
    await waitFor(() =>
      expect(mockServer.received('DELETE', new RegExp(`/visuals/${PHOTO_IDS[1]}$`))).toHaveLength(
        1,
      ),
    )
    // « Enregistrer » ne vaut que pour le reste.
    expect(savedBodies()).toHaveLength(0)
    expect(save()).toBeDisabled()
  })

  it('keeps the photo description typed in edit mode when the sheet is closed', async () => {
    await openEditForm(projectWithPhotos)

    await fireEvent.press(tile(1))
    await fireEvent.changeText(
      screen.getByLabelText(TEXT.photoDescription(1)),
      'Le frigo ouvert, vu de face',
    )
    // Fermée tout de suite (la description n'attend pas « Enregistrer ») : elle part quand même.
    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))

    await waitFor(() =>
      expect(
        mockServer
          .received('PATCH', new RegExp(`/visuals/${PHOTO_IDS[0]}$`))
          .map((one) => one.body),
      ).toEqual([{ description: 'Le frigo ouvert, vu de face' }]),
    )
    expect(navigations()).toBeGreaterThan(0)
  })

  it('saves the photo description when leaving the field', async () => {
    await openEditForm(projectWithPhotos)

    await fireEvent.press(tile(2))
    const field = screen.getByLabelText(TEXT.photoDescription(2))
    await fireEvent.changeText(field, 'Le plat du soir')
    await fireEvent(field, 'blur')

    await waitFor(() =>
      expect(
        mockServer
          .received('PATCH', new RegExp(`/visuals/${PHOTO_IDS[1]}$`))
          .map((one) => one.body),
      ).toEqual([{ description: 'Le plat du soir' }]),
    )
  })

  it('says the photos stay saved when abandoning changes after a photo change', async () => {
    await openEditForm(projectWithPhotos)

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer la photo 2' }))
    await fireEvent.changeText(screen.getByDisplayValue(recipesProject.title), 'Nouveau titre')
    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))

    expect(await screen.findByText(containing(TEXT.abandonEdit))).toBeTruthy()
    expect(shown(TEXT.abandonEditBody)).toBe(true)
    expect(navigations()).toBe(0)
  })
})

describe('ProjectFormScreen, deleting from the sheet', () => {
  const DELETE_PATH = PROJECT_PATH
  const deletions = () => mockServer.received('DELETE', DELETE_PATH)
  const openDeleteWindow = async () => {
    await openEditForm()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.deleteZone }))
    expect(await screen.findByText(containing(TEXT.deleteTitle(recipesProject.title)))).toBeTruthy()
    await passTapGuard()
  }

  it('ends the sheet with the audience sentence, then the delete zone and who can delete', async () => {
    await openEditForm()

    const texts = textsInOrder()
    const audience = texts.findIndex((text) => containing(TEXT.audienceMembersEdit).test(text))
    const zone = texts.indexOf(TEXT.deleteZone)
    const owner = texts.findIndex((text) => containing(TEXT.deleteOwner).test(text))
    expect(audience).toBeGreaterThanOrEqual(0)
    expect(zone).toBeGreaterThan(audience)
    expect(owner).toBeGreaterThan(zone)
  })

  it('asks in a window that names the project and says what disappears', async () => {
    await openDeleteWindow()

    expect(shown(TEXT.deleteConfirm)).toBe(true)
    expect(screen.getByRole('button', { name: TEXT.deleteButton })).toBeTruthy()
    expect(deletions()).toHaveLength(0)
  })

  it('stays open and busy while deleting, and deletes once on a double tap', async () => {
    const deletion = deferred<void>()
    mockServer.answer('DELETE', DELETE_PATH, async () => {
      await deletion.promise
      return { ok: true, data: null }
    })
    await openDeleteWindow()

    await fireEvent.press(screen.getByRole('button', { name: TEXT.deleteButton }))
    await fireEvent.press(screen.getByRole('button', { name: TEXT.deleteButton }))
    // Ni le retour d'Android ni Échap ne la ferment pendant l'envoi.
    await act(() => layerAround(TEXT.deleteTitle(recipesProject.title)).props.onRequestClose())

    expect(deletions()).toHaveLength(1)
    expect(shown(TEXT.deleteTitle(recipesProject.title))).toBe(true)
    await act(async () => deletion.resolve())
  })

  it('goes to « Mes projets » with « Projet supprimé. » once deleted', async () => {
    await openDeleteWindow()

    await fireEvent.press(screen.getByRole('button', { name: TEXT.deleteButton }))

    await waitFor(() => expect(mockNav.router.dismissTo).toHaveBeenCalled())
    expect(destinations()).toContain('/me')
    expect(await screen.findByText(containing(TEXT.deleted))).toBeTruthy()
  })

  it('never lands back on a deleted project', async () => {
    await openDeleteWindow()

    await fireEvent.press(screen.getByRole('button', { name: TEXT.deleteButton }))

    await waitFor(() => expect(destinations()).toContain('/me'))
    // Ni un retour arrière (la page du projet est dessous), ni la page du projet.
    expect(mockNav.router.back).not.toHaveBeenCalled()
    expect(destinations().some((path) => path.startsWith(`/projects/${recipesProject.id}`))).toBe(
      false,
    )
  })

  it('gives the focus back to « Supprimer ce projet » when the window is closed by Escape', async () => {
    await openDeleteWindow()
    forgetFocus()

    // Échap (relâchée) et le retour d'Android arrivent à la couche de la fenêtre.
    await act(() => layerAround(TEXT.deleteTitle(recipesProject.title)).props.onRequestClose())

    await waitFor(() => expect(shown(TEXT.deleteTitle(recipesProject.title))).toBe(false))
    await waitFor(() => expect(focusedLabels().at(-1)).toBe(TEXT.deleteZone))
    expect(deletions()).toHaveLength(0)
    expect(screen.getByLabelText(TEXT.editTitle)).toBeTruthy()
  })
})
