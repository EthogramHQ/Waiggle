// Tests de la feuille de publication (R6a, docs/scenarios/refonte.md, « R6a — La feuille de
// publication ») : ouvrir et fermer la feuille, l'abandon demandé, la catégorie obligatoire, la
// seconde feuille « Catégorie et outils », publier (membres ou privé), les photos d'un nouveau
// projet, le lien, l'aperçu, et le membre suspendu. La modification et la suppression sont dans
// `ProjectFormScreen.edit.test.tsx` ; les outils communs dans `ProjectFormScreen.testkit.tsx`.
//
// Ce que ces tests supposent de l'écran (plan R6a, découpage U5a, U5b, U5c ; à corriger par la
// session si le code en décide autrement) :
// - le réseau passe par `api/client` (le faux serveur du testkit) : POST /v1/projects, puis
//   POST …/visuals par photo dans l'ordre des tuiles, puis PATCH …/visuals/{id} pour une description ;
// - les photos se choisissent par `pickVisuals` de `media/pick` (« Ajouter des photos ») ;
// - fermer la feuille sans rien perdre : `router.back()` ou `dismiss` ; publier pour les membres :
//   `router.dismissTo` vers « /?published=<id> » ; un brouillon privé : la page du projet, et le
//   toast `draftSaved` (`useToast`, montré par la feuille avant de partir) ;
// - le retour du navigateur : un écouteur `beforeRemove` de `useNavigation()` (Expo Router), qui
//   appelle `preventDefault()` quand il y a des changements, puis `navigation.dispatch(action)`
//   après « Abandonner » ;
// - le focus passe par les outils de `ui/focus` (`focusWithoutScroll`, `focusAndReveal`,
//   `moveReaderTo`), que ces tests espionnent.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { setDesktopWindow } from '../testing/render'
import { containing } from '../testing/text'
import {
  categoryBox,
  categoryName,
  categoryRow,
  chooseCategories,
  choosePrivate,
  chooseStatus,
  deferred,
  destinations,
  fillIn,
  focusedLabels,
  forgetFocus,
  type Host,
  hostsOf,
  mockNav,
  mockPick,
  mockServer,
  NEW_ID,
  navigations,
  navigatorRemoves,
  openNewForm,
  openNewSheet,
  picked,
  pressEscape,
  resetAll,
  root,
  secondaryRow,
  shown,
  TEXT,
  tile,
  uploadedId,
  uploadedImages,
} from './ProjectFormScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le réseau : le faux serveur du testkit (voir son en-tête).
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
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La galerie de l'appareil : le faux `pickVisuals` du testkit ; `appendImage` écrit l'adresse du
// fichier dans le formulaire multipart, pour que le faux serveur sache quelle photo il reçoit.
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
// Où l'écran pose le focus : des espions qui appellent les vrais outils.
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

/** Ce que POST /v1/projects a reçu (une seule création attendue). */
const createdBodies = () => mockServer.received('POST', /^\/v1\/projects$/).map((one) => one.body)

describe('ProjectFormScreen, opening and closing the sheet', () => {
  it('opens a sheet named « Nouveau projet », with « Annuler » and « Publier »', async () => {
    await openNewForm()

    expect(screen.getByLabelText(TEXT.newTitle)).toBeTruthy()
    expect(screen.getByRole('button', { name: TEXT.cancel })).toBeTruthy()
    expect(screen.getByRole('button', { name: TEXT.publish })).toBeTruthy()
  })

  it('closes at once with no change, and when « Abandonner » is chosen', async () => {
    await openNewForm()

    // Rien d'écrit : « Annuler » ferme tout de suite, sans rien demander.
    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))
    expect(screen.queryByText(containing(TEXT.abandonNew))).toBeNull()
    expect(navigations()).toBe(1)

    // Un titre écrit : « Annuler » demande d'abord, puis « Abandonner » ferme.
    await fireEvent.changeText(screen.getByLabelText(TEXT.title), 'Le ciel de ce soir')
    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))
    expect(await screen.findByText(containing(TEXT.abandonNew))).toBeTruthy()
    expect(navigations()).toBe(1)
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.abandon }))

    expect(navigations()).toBe(2)
    expect(mockServer.received('POST', /./)).toHaveLength(0)
  })

  it('asks « Abandonner ce projet ? » once something is written, and loses nothing on « Continuer »', async () => {
    await openNewForm()

    await fireEvent.changeText(screen.getByLabelText(TEXT.title), 'Le ciel de ce soir')
    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))

    expect(await screen.findByText(containing(TEXT.abandonNew))).toBeTruthy()
    expect(shown(TEXT.abandonNewBody)).toBe(true)
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.keepEditing }))

    await waitFor(() => expect(screen.queryByText(containing(TEXT.abandonNew))).toBeNull())
    expect(screen.getByDisplayValue('Le ciel de ce soir')).toBeTruthy()
    expect(navigations()).toBe(0)
  })

  it('asks before leaving with changes when the navigator removes the screen', async () => {
    await openNewForm()

    // Sans changement, le navigateur part librement (témoin).
    expect((await navigatorRemoves()).preventDefault).not.toHaveBeenCalled()

    await fireEvent.changeText(screen.getByLabelText(TEXT.title), 'Le ciel de ce soir')
    const leaving = await navigatorRemoves()

    expect(leaving.preventDefault).toHaveBeenCalled()
    expect(await screen.findByText(containing(TEXT.abandonNew))).toBeTruthy()
    expect(mockNav.navigation.dispatch).not.toHaveBeenCalled()
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.abandon }))
    // « Abandonner » reprend le départ demandé par le navigateur.
    expect(mockNav.navigation.dispatch).toHaveBeenCalledWith(leaving.data.action)
  })

  it('focuses « Continuer » first in the abandon window, which guards against a double tap', async () => {
    await openNewForm()
    await fireEvent.changeText(screen.getByLabelText(TEXT.title), 'Le ciel de ce soir')
    forgetFocus()

    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))
    await screen.findByText(containing(TEXT.abandonNew))

    await waitFor(() => expect(focusedLabels().at(-1)).toBe(TEXT.keepEditing))
    // La seconde tape d'une double tape tombe sur la fenêtre : elle n'abandonne rien.
    await fireEvent.press(screen.getByRole('button', { name: TEXT.abandon }))
    expect(navigations()).toBe(0)
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.abandon }))
    expect(navigations()).toBe(1)
  })
})

describe('ProjectFormScreen, for a suspended member', () => {
  it('never shows the form before the profile is read, then says why she cannot publish', async () => {
    const profile = deferred<typeof suspendedMe>()
    mockServer.me = profile.promise
    await openNewSheet()

    // Le profil n'est pas encore lu : ni le formulaire ni « Publier » (un texte tapé se perdrait).
    expect(screen.queryByLabelText(TEXT.title)).toBeNull()
    expect(screen.queryByRole('button', { name: TEXT.publish })).toBeNull()

    await act(async () => profile.resolve(suspendedMe))

    expect(await screen.findByText(containing(TEXT.suspended))).toBeTruthy()
    expect(screen.queryByLabelText(TEXT.title)).toBeNull()
    expect(screen.queryByRole('button', { name: TEXT.publish })).toBeNull()
  })

  it('shows the form once the profile of a member who is not suspended is read (témoin)', async () => {
    const profile = deferred<typeof leaMe>()
    mockServer.me = profile.promise
    await openNewSheet()
    expect(screen.queryByLabelText(TEXT.title)).toBeNull()

    await act(async () => profile.resolve(leaMe))

    expect(await screen.findByLabelText(TEXT.title)).toBeTruthy()
    expect(screen.queryByText(containing(TEXT.suspended))).toBeNull()
  })
})

describe('ProjectFormScreen, the category', () => {
  it('refuses to publish without a category, says it under the row and moves the focus there', async () => {
    await openNewForm()
    await fillIn()
    forgetFocus()

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    expect(createdBodies()).toHaveLength(0)
    expect(await screen.findByText(containing(TEXT.chooseCategory))).toBeTruthy()
    // Sur téléphone, la phrase est lue avec la ligne (son indice), et le focus y arrive.
    expect(String(categoryRow().props.accessibilityHint ?? '')).toContain(TEXT.chooseCategory)
    await waitFor(() => expect(focusedLabels().at(-1)).toMatch(/^Catégorie/))
  })

  it('names the category row with its value and moves the focus there with its error', async () => {
    await openNewForm()
    await fillIn()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))
    await waitFor(() => expect(focusedLabels().at(-1)).toMatch(/^Catégorie/))

    await chooseCategories('science', 'learning')

    // La ligne dit sa valeur dans son nom ; l'erreur est partie.
    expect(
      screen.getByRole('button', { name: new RegExp(`^Catégorie.*${categoryName('science')}`) }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: new RegExp(`^Seconde.*${categoryName('learning')}`) }),
    ).toBeTruthy()
    expect(String(categoryRow().props.accessibilityHint ?? '')).not.toContain(TEXT.chooseCategory)
  })

  it('opens « Catégorie et outils » above the form, and « OK » brings the choice back', async () => {
    await openNewForm()

    await fireEvent.press(categoryRow())
    expect(await screen.findByLabelText(TEXT.categoriesAndTools)).toBeTruthy()
    await fireEvent.press(categoryBox('science'))
    await fireEvent.press(categoryBox('learning'))
    // Les rangs se lisent dans le nom des cases (CategoryPicker).
    expect(
      screen.getByRole('checkbox', {
        name: `${categoryName('science')}, catégorie principale`,
        checked: true,
      }),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: TEXT.ok }))

    await waitFor(() => expect(screen.queryByLabelText(TEXT.categoriesAndTools)).toBeNull())
    expect(screen.getByLabelText(TEXT.newTitle)).toBeTruthy()
    expect(categoryRow().props.accessibilityLabel ?? '').toMatch(categoryName('science'))
    expect(secondaryRow().props.accessibilityLabel ?? '').toMatch(categoryName('learning'))
  })

  it('keeps the categories chosen when the second sheet is closed by Escape', async () => {
    await openNewForm()
    await fireEvent.press(categoryRow())
    await screen.findByLabelText(TEXT.categoriesAndTools)
    await fireEvent.press(categoryBox('science'))
    await fireEvent.press(categoryBox('learning'))
    forgetFocus()

    await pressEscape(categoryBox('learning'))

    // Seule la seconde feuille se ferme : la première reste, sans demander d'abandon.
    await waitFor(() => expect(screen.queryByLabelText(TEXT.categoriesAndTools)).toBeNull())
    expect(screen.getByLabelText(TEXT.newTitle)).toBeTruthy()
    expect(screen.queryByText(containing(TEXT.abandonNew))).toBeNull()
    expect(categoryRow().props.accessibilityLabel ?? '').toMatch(categoryName('science'))
    expect(secondaryRow().props.accessibilityLabel ?? '').toMatch(categoryName('learning'))
    // Le focus revient à la ligne qui l'a ouverte (ui-I10).
    await waitFor(() => expect(focusedLabels().at(-1)).toMatch(/^Catégorie/))
  })
})

describe('ProjectFormScreen, publishing', () => {
  it('publishes a project seen by members, then goes to the feed with ?published=', async () => {
    await openNewForm()
    await fillIn()
    await chooseStatus('testable')
    await chooseCategories('science', 'learning')

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(createdBodies()).toHaveLength(1))
    expect(createdBodies()[0]).toEqual(
      expect.objectContaining({
        title: 'Le ciel de ce soir',
        pitch: 'Les étoiles à voir ce soir.',
        status: 'testable',
        visibility: 'public',
        primaryCategory: 'science',
        secondaryCategory: 'learning',
      }),
    )
    // Plus de temps passé (F-Pr14).
    expect(createdBodies()[0]).not.toHaveProperty('timeSpent')
    await waitFor(() => expect(destinations()).toContain(`/?published=${NEW_ID}`))
    expect(mockNav.router.dismissTo).toHaveBeenCalled()
  })

  it('creates the project once on a double tap, « Publier » busy meanwhile', async () => {
    const creation = deferred<void>()
    mockServer.answer('POST', /^\/v1\/projects$/, async () => {
      await creation.promise
      return { ok: true, data: { ...mockServer.project, id: NEW_ID } }
    })
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    expect(createdBodies()).toHaveLength(1)
    expect(screen.getByRole('button', { name: TEXT.publish })).toBeDisabled()
    await act(async () => creation.resolve())
  })

  it('says the draft is seen by no other member', async () => {
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await choosePrivate()
    // Le choix et la phrase du bas (textes du juridique, jur-J6).
    expect(shown(TEXT.privateHint)).toBe(true)
    expect(shown(TEXT.audiencePrivateNew)).toBe(true)
    expect(shown(TEXT.audienceMembers)).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(createdBodies()).toHaveLength(1))
    expect(createdBodies()[0]).toEqual(expect.objectContaining({ visibility: 'private' }))
    // Un brouillon ne danse pas : la page du projet, et l'avis « Brouillon enregistré… ».
    await waitFor(() => expect(destinations()).toContain(`/projects/${NEW_ID}`))
    expect(destinations().some((path) => path.includes('published='))).toBe(false)
    expect(await screen.findByText(containing(TEXT.draftSaved))).toBeTruthy()
  })

  it('shows the members sentence at the end of a new project seen by members (témoin)', async () => {
    await openNewForm()

    expect(shown(TEXT.audienceMembers)).toBe(true)
    expect(shown(TEXT.audiencePrivateNew)).toBe(false)
  })

  it('shows the error of the API at the top, keeps everything, and sends again', async () => {
    let refusals = 1
    mockServer.answer('POST', /^\/v1\/projects$/, async () => {
      if (refusals-- > 0) return { ok: false, error: 'rateLimited' }
      return { ok: true, data: { ...mockServer.project, id: NEW_ID } }
    })
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    expect(
      await screen.findByText('Trop de demandes. Réessaie dans quelques minutes.'),
    ).toBeTruthy()
    expect(screen.getByDisplayValue('Le ciel de ce soir')).toBeTruthy()
    expect(navigations()).toBe(0)
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))
    await waitFor(() => expect(createdBodies()).toHaveLength(2))
  })
})

describe('ProjectFormScreen, photos of a new project', () => {
  it('sends the chosen photos in order after the creation, then the description typed', async () => {
    mockPick.next = [picked('a'), picked('b'), picked('c')]
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(screen.getByRole('button', { name: TEXT.addPhotos }))
    expect(await screen.findByRole('button', { name: /^Photo 3/ })).toBeTruthy()
    // Jusqu'à compléter les 6 : le choix en demande au plus 6.
    expect(mockPick.calls[0]?.remaining).toBe(6)
    await fireEvent.press(tile(1))
    await fireEvent.changeText(
      screen.getByLabelText(TEXT.photoDescription(1)),
      'La Lune au-dessus du toit',
    )
    // Rien ne part avant la publication.
    expect(mockServer.received('POST', /./)).toHaveLength(0)
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(uploadedImages()).toHaveLength(3))
    expect(uploadedImages()).toEqual([picked('a').uri, picked('b').uri, picked('c').uri])
    await waitFor(() =>
      expect(
        mockServer
          .received('PATCH', new RegExp(`/visuals/${uploadedId(1)}$`))
          .map((one) => one.body),
      ).toEqual([{ description: 'La Lune au-dessus du toit' }]),
    )
    await waitFor(() => expect(destinations()).toContain(`/?published=${NEW_ID}`))
  })

  it('opens the edit sheet, without the dance, when a photo fails after the creation', async () => {
    mockServer.answer('POST', /\/visuals$/, async () => ({
      ok: false,
      error: 'unsupportedMediaType',
    }))
    mockPick.next = [picked('a')]
    await openNewForm()
    await fillIn()
    await chooseCategories('science')
    await fireEvent.press(screen.getByRole('button', { name: TEXT.addPhotos }))
    await screen.findByRole('button', { name: /^Photo 1/ })

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(destinations()).toContain(`/projects/${NEW_ID}/edit?photos=failed`))
    expect(destinations().some((path) => path.includes('published='))).toBe(false)
  })
})

describe('ProjectFormScreen, the demo link', () => {
  it('reads the not-checked sentence with the valid link state', async () => {
    await openNewForm()

    await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), 'http://ciel-du-soir.fr')
    // Une adresse en http est refusée : ni coche, ni « Lien valide », ni la phrase (témoin).
    expect(shown(TEXT.demoValid)).toBe(false)
    expect(shown(TEXT.demoNotChecked)).toBe(false)

    await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), 'https://ciel-du-soir.fr')

    expect(shown(TEXT.demoValid)).toBe(true)
    expect(shown(TEXT.demoNotChecked)).toBe(true)
    // La phrase est lue avec l'état « Lien valide » : dans le même élément lu, ou juste après.
    const reads = textsInReadingOrder()
    const valid = reads.findIndex((text) => text.includes(TEXT.demoValid))
    expect(valid).toBeGreaterThanOrEqual(0)
    expect(`${reads[valid]} ${reads[valid + 1] ?? ''}`).toMatch(containing(TEXT.demoNotChecked))
  })
})

describe('ProjectFormScreen, the preview on a computer', () => {
  // Une fenêtre d'ordinateur, rendue par les composants natifs de Jest : sous `Platform.OS = 'web'`,
  // les champs de l'écran ne se trouvent plus par leur nom dans Jest (essai du 9/11/2026, ancien
  // écran). `inert` lui-même (web) est vérifié par `ui/CardPreview.test.tsx` ; ici, que l'écran pose
  // bien la carte dans `CardPreview`, cachée et sans rien d'atteignable.
  it('makes nothing in the preview reachable (web)', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      await openNewForm()
      await fillIn()
      await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), 'https://ciel-du-soir.fr')

      expect(shown(TEXT.preview)).toBe(true)
      // La carte de l'aperçu montre le titre tapé ; elle est cachée aux lecteurs d'écran et au
      // clavier (`CardPreview`) : aucun lien ni bouton n'y est atteignable.
      const inPreview = screen.getAllByText('Le ciel de ce soir', { includeHiddenElements: true })
      expect(inPreview.length).toBeGreaterThan(0)
      expect(screen.queryAllByText('Le ciel de ce soir')).toHaveLength(0)
      const hidden = ancestors(inPreview[0] as unknown as Host).find(
        (node) => node.props['aria-hidden'] === true,
      )
      expect(hidden).toBeDefined()
      const reachable = hostsOf(hidden as Host).filter(
        (node) =>
          (typeof node.props.tabIndex === 'number' && node.props.tabIndex >= 0) ||
          node.props.focusable === true,
      )
      expect(reachable).toHaveLength(0)
    } finally {
      restoreWindow()
    }
  })
})

/** Les ancêtres d'un élément, du plus proche au plus lointain. */
const ancestors = (node: Host): Host[] => {
  const found: Host[] = []
  for (let at = node.parent; at; at = at.parent) found.push(at)
  return found
}

/**
 * Ce qu'un lecteur d'écran lit, élément par élément : le nom des éléments nommés, le texte des
 * autres (sans descendre dans un élément déjà lu par son nom).
 */
const textsInReadingOrder = (): string[] => {
  const read = (node: Host): string[] => {
    if (typeof node.props.accessibilityLabel === 'string') return [node.props.accessibilityLabel]
    return node.children.flatMap((child) =>
      typeof child === 'string' ? [child.replace(/\s+/g, ' ')] : read(child),
    )
  }
  return read(root())
}
