// Tests de la couverture verticale dans la feuille de publication (R6a, docs/scenarios/refonte.md :
// « Et la couverture verticale du téléphone reste possible : Couverture verticale, facultative ») :
// la ligne est là à la création comme en modification ; choisie à la création, l'image part après
// le projet (et ses photos), dans l'emplacement `portrait` ; un échec compte comme une photo
// échouée ; en modification, la choisir l'envoie et la retirer la supprime tout de suite, sans
// « Enregistrer ».
//
// Les outils communs (faux serveur, faux routeur, photos choisies) sont dans
// `ProjectFormScreen.testkit.tsx`. En plus ici : la couverture se choisit par `pickImage` de
// `media/pick` (forme `portrait`, par `pickVisual` de `projects/api.ts`), remplacé par
// `mockPickImage`.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { PickedImage } from '../media/pick'
import { passTapGuard } from '../testing/dialog'
import { photo, projectWithPhotos } from '../testing/projects'
import { containing, fr } from '../testing/text'
import {
  chooseCategories,
  deferred,
  destinations,
  fillIn,
  mockPick,
  mockServer,
  NEW_ID,
  openEditForm,
  openNewForm,
  picked,
  resetAll,
  type Sent,
  TEXT,
  uploadedImages,
} from './ProjectFormScreen.testkit'

/** Le faux de `pickImage` : l'image du prochain choix (null : le membre annule). */
const mockPickImage = jest.fn<Promise<PickedImage | null>, [string, (() => void)?]>()

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
  pickImage: (shape: string, onChosen?: () => void) => mockPickImage(shape, onChosen),
  appendImage: async (form: FormData, field: string, image: { uri: string }) => {
    form.append(field, image.uri)
  },
}))
jest.mock('expo-router', () => {
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
})
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

const PORTRAIT = {
  heading: fr.t(($) => $.project.visuals.portrait),
  hint: fr.t(($) => $.project.visuals.portraitHint),
  choose: fr.t(($) => $.project.visuals.choosePortrait),
  replace: fr.t(($) => $.project.visuals.replacePortrait),
  remove: fr.t(($) => $.project.visuals.removePortrait),
  image: fr.t(($) => $.project.visuals.portraitLabel),
}

/** Une image choisie au format d'un téléphone tenu droit. */
const tall = (name: string): PickedImage => ({
  uri: `file:///${name}.jpg`,
  width: 1080,
  height: 1920,
})

/** Le champ `name` d'un formulaire multipart envoyé (le FormData de React Native, ou du web). */
const partOf = (body: unknown, name: string): string | undefined => {
  const form = body as {
    getParts?: () => { fieldName: string; string?: string }[]
    getAll?: (field: string) => unknown[]
  }
  const part = form.getParts?.().find((one) => one.fieldName === name)
  if (part) return part.string
  const all = form.getAll?.(name)
  return typeof all?.[0] === 'string' ? all[0] : undefined
}

const VISUALS = /\/visuals$/
/** Les envois de photos, dans l'ordre : l'image et son emplacement (`gallery` ou `portrait`). */
const uploads = () =>
  mockServer
    .received('POST', VISUALS)
    .map((one) => ({ uri: partOf(one.body, 'visual'), slot: partOf(one.body, 'slot') }))

/** Le faux serveur range une image envoyée en `portrait` comme couverture verticale. */
const portraitGoesToCover = () =>
  mockServer.answer('POST', VISUALS, (sent: Sent) => {
    if (partOf(sent.body, 'slot') !== 'portrait') {
      mockServer.uploads += 1
      const added = photo(`aaaaaaaa-aaaa-4aaa-8aaa-${String(mockServer.uploads).padStart(12, '0')}`)
      mockServer.project = {
        ...mockServer.project,
        visuals: [...mockServer.project.visuals, added],
      }
    } else {
      mockServer.project = {
        ...mockServer.project,
        portraitCover: photo('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1080, 1920),
      }
    }
    return { ok: true, data: mockServer.project }
  })

beforeEach(() => {
  resetAll()
  mockPickImage.mockReset()
})

describe('ProjectFormScreen, the vertical cover', () => {
  it('offers « Couverture verticale » when publishing a new project, empty', async () => {
    await openNewForm()

    expect(screen.getByText(PORTRAIT.heading)).toBeTruthy()
    expect(screen.getByText(PORTRAIT.hint)).toBeTruthy()
    expect(screen.getByRole('button', { name: PORTRAIT.choose })).toBeTruthy()
    expect(screen.queryByRole('button', { name: PORTRAIT.remove })).toBeNull()
  })

  it('shows the saved vertical cover when editing, with « Remplacer » and « Retirer »', async () => {
    await openEditForm(projectWithPhotos)

    expect(screen.getByText(PORTRAIT.heading)).toBeTruthy()
    expect(screen.getByLabelText(PORTRAIT.image)).toBeTruthy()
    expect(screen.getByRole('button', { name: PORTRAIT.replace })).toBeTruthy()
    expect(screen.getByRole('button', { name: PORTRAIT.remove })).toBeTruthy()
  })

  it('keeps a chosen vertical cover on the device, then sends it after the project and its photos', async () => {
    portraitGoesToCover()
    mockPickImage.mockImplementation(async (_shape, onChosen) => {
      onChosen?.()
      return tall('debout')
    })
    mockPick.next = [picked('a')]
    await openNewForm()
    await fillIn()
    await chooseCategories('science')
    await fireEvent.press(screen.getByRole('button', { name: TEXT.addPhotos }))
    await screen.findByRole('button', { name: /^Photo 1/ })

    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.choose }))
    // Le recadrage d'un téléphone tenu droit est demandé.
    expect(mockPickImage.mock.calls[0]?.[0]).toBe('portrait')
    expect(await screen.findByRole('button', { name: PORTRAIT.replace })).toBeTruthy()
    expect(screen.getByLabelText(PORTRAIT.image)).toBeTruthy()
    // Rien ne part avant la publication.
    expect(mockServer.received('POST', /./)).toHaveLength(0)

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(uploads()).toHaveLength(2))
    // Le projet d'abord, puis la photo de la galerie, puis la couverture verticale.
    const posts = mockServer.received('POST', /./).map((one) => one.path)
    expect(posts[0]).toBe('/v1/projects')
    expect(uploads()).toEqual([
      { uri: picked('a').uri, slot: 'gallery' },
      { uri: tall('debout').uri, slot: 'portrait' },
    ])
    expect(mockServer.received('POST', VISUALS)[1]?.path).toBe(`/v1/projects/${NEW_ID}/visuals`)
    await waitFor(() => expect(destinations()).toContain(`/?published=${NEW_ID}`))
  })

  it('opens the edit sheet, without the dance, when the vertical cover fails after the creation', async () => {
    mockServer.answer('POST', VISUALS, async () => ({ ok: false, error: 'payloadTooLarge' }))
    mockPickImage.mockResolvedValue(tall('debout'))
    await openNewForm()
    await fillIn()
    await chooseCategories('science')
    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.choose }))
    await screen.findByRole('button', { name: PORTRAIT.replace })

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(destinations()).toContain(`/projects/${NEW_ID}/edit?photos=failed`))
    expect(uploads()).toEqual([{ uri: tall('debout').uri, slot: 'portrait' }])
    expect(destinations().some((path) => path.includes('published='))).toBe(false)
  })

  it('forgets a vertical cover removed before publishing, and asks before abandoning one', async () => {
    mockPickImage.mockResolvedValue(tall('debout'))
    await openNewForm()
    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.choose }))
    await screen.findByRole('button', { name: PORTRAIT.remove })

    // Une couverture choisie seule est déjà quelque chose à perdre : fermer demande.
    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))
    expect(await screen.findByText(containing(TEXT.abandonNew))).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.keepEditing }))
    await waitFor(() => expect(screen.queryByText(containing(TEXT.abandonNew))).toBeNull())

    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.remove }))
    expect(screen.getByRole('button', { name: PORTRAIT.choose })).toBeTruthy()
    expect(screen.queryByLabelText(PORTRAIT.image)).toBeNull()

    await fillIn()
    await chooseCategories('science')
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))
    await waitFor(() => expect(destinations()).toContain(`/?published=${NEW_ID}`))
    expect(uploadedImages()).toHaveLength(0)
  })

  it('sends a vertical cover chosen while editing right away, in the portrait slot', async () => {
    portraitGoesToCover()
    mockPickImage.mockResolvedValue(tall('debout'))
    await openEditForm()

    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.choose }))

    await waitFor(() => expect(uploads()).toEqual([{ uri: tall('debout').uri, slot: 'portrait' }]))
    expect(mockServer.received('POST', VISUALS)[0]?.path).toBe(
      `/v1/projects/${mockServer.project.id}/visuals`,
    )
    expect(await screen.findByRole('button', { name: PORTRAIT.remove })).toBeTruthy()
    // Sans « Enregistrer » : rien d'autre ne part.
    expect(mockServer.received('PATCH', /./)).toHaveLength(0)
  })

  it('deletes the vertical cover right away when it is removed while editing', async () => {
    const answer = deferred<{ ok: true; data: typeof projectWithPhotos }>()
    mockServer.answer('DELETE', /\/visuals\//, () => answer.promise)
    await openEditForm(projectWithPhotos)

    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.remove }))

    const portraitId = projectWithPhotos.portraitCover?.id
    expect(mockServer.received('DELETE', /./).map((one) => one.path)).toEqual([
      `/v1/projects/${projectWithPhotos.id}/visuals/${portraitId}`,
    ])
    // Au toucher : la couverture part de l'écran sans attendre la réponse.
    expect(screen.queryByLabelText(PORTRAIT.image)).toBeNull()
    expect(screen.getByRole('button', { name: PORTRAIT.choose })).toBeTruthy()
    await act(async () => {
      answer.resolve({ ok: true, data: { ...projectWithPhotos, portraitCover: null } })
    })
    expect(screen.queryByLabelText(PORTRAIT.image)).toBeNull()
    expect(mockServer.received('PATCH', /./)).toHaveLength(0)
  })

  it('brings the vertical cover back and says why when its removal is refused', async () => {
    mockServer.answer('DELETE', /\/visuals\//, async () => ({ ok: false, error: 'internal' }))
    await openEditForm(projectWithPhotos)

    await fireEvent.press(screen.getByRole('button', { name: PORTRAIT.remove }))

    expect(await screen.findByLabelText(PORTRAIT.image)).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.errors.internal)))).toBeTruthy()
  })
})
