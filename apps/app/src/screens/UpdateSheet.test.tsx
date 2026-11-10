// Tests de la feuille « Nouvelle mise à jour » (R7a, docs/scenarios/refonte.md, « Publier une mise à
// jour », « Quitter sans publier », « Quand le statut change ») : ce qu'elle montre, les lignes de
// « Ce qui a changé », publier, les photos et l'avant / après, quitter sans publier, et qui peut
// l'ouvrir.
//
// Ce que ces tests supposent de l'écran (plan R7a, « Décisions » et U3a ; à corriger si le code
// en décide autrement) :
// - `UpdateSheet({ id, announce })`, montée par la route `app/projects/[id]/update.tsx`, qui lit
//   `?announce=<statut>` et le passe tel quel ; la feuille s'ouvre par `useRouteSheet` et se ferme
//   par `router.back()` (ou `replace` vers le projet, arrivé par un lien direct) ;
// - le réseau passe par `api/client` (le faux serveur ci-dessous) : GET /v1/me, GET /v1/projects/{id},
//   POST …/visuals (`slot=update`, réponse : la photo en attente), DELETE …/visuals/{id}, POST
//   …/updates ;
// - les photos se choisissent par `pickVisuals` de `media/pick` ;
// - le retour du navigateur : `useLeaveGuard` (un écouteur `beforeRemove` de `useNavigation()`).
// Les titres se cherchent par le rôle « header » (celui que RNTL lit sur un titre de React Native).
import type { Me, Project, ProjectUpdate, ProjectVisual } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import type { ApiResult } from '../api/errors'
import type { PickedImage } from '../media/pick'
import { passTapGuard } from '../testing/dialog'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { photo, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { choiceRole, containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { ToastProvider } from '../ui/theme/toast'
import { UpdateSheet } from './UpdateSheet'

// --- Le faux serveur ---

/** Une demande reçue : sa méthode, son chemin et son corps (JSON lu, ou le formulaire). */
type Sent = { method: string; path: string; body: unknown }
type Answer = ApiResult<unknown> | Promise<ApiResult<unknown>>

const { id } = recipesProject
const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })

/** L'identifiant de la n-ième photo reçue (des UUID valides). */
const uploadedId = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`

/** Le champ `slot` d'un envoi de photo (formulaire multipart). */
const slotOf = (body: unknown) => {
  const form = body as {
    getParts?: () => { fieldName: string; string?: string }[]
    get?: (name: string) => unknown
  }
  return form.getParts?.().find((part) => part.fieldName === 'slot')?.string ?? form.get?.('slot')
}

/**
 * Le faux serveur du fichier : il répond comme l'API et garde chaque demande. Un test change
 * `project` ou `me`, ou impose une réponse (`answer`), qui passe avant les réponses ordinaires.
 */
const mockServer = {
  sent: [] as Sent[],
  me: leaMe as Me,
  project: recipesProject as Project,
  uploads: 0,
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],
  reset() {
    this.sent = []
    this.me = leaMe
    this.project = recipesProject
    this.uploads = 0
    this.overrides = []
  },
  answer(method: string, path: RegExp, answer: (sent: Sent) => Answer) {
    this.overrides.push({ method, path, answer })
  },
  received(method: string, path: RegExp) {
    return this.sent.filter((one) => one.method === method && path.test(one.path))
  },
  async respond(path: string, init: RequestInit): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    const body =
      typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : (init.body ?? null)
    const sent = { method, path, body }
    this.sent.push(sent)
    const forced = this.overrides.find((one) => one.method === method && one.path.test(path))
    if (forced) return forced.answer(sent)
    if (method === 'GET' && path === '/v1/me') return ok(this.me)
    if (method === 'GET' && path === `/v1/projects/${id}`) return ok(this.project)
    if (method === 'POST' && VISUALS.test(path)) {
      this.uploads += 1
      const added: ProjectVisual = photo(uploadedId(this.uploads))
      return ok(added)
    }
    if (method === 'DELETE' && VISUAL.test(path)) return ok(this.project)
    if (method === 'POST' && UPDATES.test(path)) {
      const sentBody = body as { title: string | null; version: string | null }
      const published: ProjectUpdate = {
        ...rocketUpdate,
        id: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
        title: sentBody.title,
        version: sentBody.version,
        photos: [],
        beforeAfter: false,
        createdAt: new Date().toISOString(),
      }
      return ok(published)
    }
    return { ok: false, error: 'notFound' }
  },
}

const VISUALS = /^\/v1\/projects\/[^/]+\/visuals$/
const VISUAL = /^\/v1\/projects\/[^/]+\/visuals\/[^/]+$/
const UPDATES = /^\/v1\/projects\/[^/]+\/updates$/

/** Une promesse dont le test choisit le moment de la fin. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Le faux `pickVisuals` : `onChosen(images)` dès le choix ; le test pose les images avec `next`. */
const mockPick = {
  next: [] as PickedImage[],
  pickVisuals: async (_slot: string, _remaining: number, onChosen: (i: PickedImage[]) => void) => {
    const images = mockPick.next
    mockPick.next = []
    if (images.length > 0) onChosen(images)
    return images
  },
}
const picked = (name: string): PickedImage => ({
  uri: `file:///${name}.jpg`,
  width: 2048,
  height: 1536,
})

// --- La navigation ---

type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

/** Le faux routeur et le faux `useNavigation()` (ses écouteurs `beforeRemove`). */
const mockNav = {
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  },
  listeners: new Set<(event: BeforeRemove) => void>(),
  navigation: {
    addListener: jest.fn((_type: string, listener: (event: BeforeRemove) => void) => {
      mockNav.listeners.add(listener)
      return () => mockNav.listeners.delete(listener)
    }),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  params: {} as Record<string, string>,
  // L'adresse de la feuille : `useRouteSheet` ne l'ouvre que sur sa propre adresse.
  pathname: `/projects/${recipesProject.id}/update`,
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: async (
    path: string,
    init: RequestInit,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  ) => {
    const result = await mockServer.respond(path, init)
    if (!result.ok) return result
    const parsed = schema.safeParse(result.data)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
  },
  requestWithoutBody: async (path: string, init: RequestInit) => {
    const result = await mockServer.respond(path, init)
    return result.ok ? { ok: true, data: null } : result
  },
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../media/pick', () => ({
  ...jest.requireActual('../media/pick'),
  pickVisuals: (...args: [string, number, (images: PickedImage[]) => void]) =>
    mockPick.pickVisuals(...args),
  appendImage: async (form: FormData, field: string, image: { uri: string }) => {
    form.append(field, image.uri)
  },
}))
jest.mock('expo-router', () => ({
  useRouter: () => mockNav.router,
  usePathname: () => mockNav.pathname,
  useNavigation: () => mockNav.navigation,
  useLocalSearchParams: () => mockNav.params,
  useGlobalSearchParams: () => mockNav.params,
  useSegments: () => [],
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))

beforeEach(() => {
  mockServer.reset()
  mockPick.next = []
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockNav.router.canGoBack.mockImplementation(() => true)
  mockNav.listeners.clear()
  mockNav.navigation.dispatch.mockClear()
  mockNav.params = { id }
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
})

// --- Les textes ---

const T = {
  sheetTitle: fr.t(($) => $.project.updates.sheetTitle),
  cancel: fr.t(($) => $.project.updates.cancel),
  publish: fr.t(($) => $.project.updates.publish),
  firstUpdate: fr.t(($) => $.project.updates.firstUpdate),
  titleField: fr.t(($) => $.project.updates.titleField),
  versionField: fr.t(($) => $.project.updates.versionField),
  addLine: fr.t(($) => $.project.updates.addLine),
  linesHint: fr.t(($) => $.project.updates.linesHint),
  hintPublic: fr.t(($) => $.project.updates.hintPublic),
  hintPrivate: fr.t(($) => $.project.updates.hintPrivate),
  required: fr.t(($) => $.project.updates.required),
  uploading: fr.t(($) => $.project.updates.photosUploading),
  photosFull: fr.t(($) => $.project.updates.photosFull),
  published: fr.t(($) => $.project.updates.published),
  error: fr.t(($) => $.project.updates.error),
  limited: fr.t(($) => $.project.updates.limited),
  expired: fr.t(($) => $.errors.unauthorized),
  invalidPhotos: fr.t(($) => $.errors.invalidPhotos),
  discardTitle: fr.t(($) => $.project.updates.discardTitle),
  // Les boutons de la fenêtre « Abandonner » viennent de `common` (DiscardDialog).
  keepEditing: fr.t(($) => $.common.keepEditing),
  discard: fr.t(($) => $.common.discard),
  beforeAfter: fr.t(($) => $.project.updates.beforeAfterSwitch),
  notMine: fr.t(($) => $.states.notMineTitle),
  notFound: fr.t(($) => $.project.page.notFoundTitle),
  suspended: fr.t(($) => $.suspension.formBody),
}
const family = (code: 'new' | 'fixed' | 'polish') => fr.t(($) => $.update.family[code])
/** Le nom d'un champ de ligne : « Changement 2 sur 3, Réparé ». */
const lineName = (number: number, total: number, code: 'new' | 'fixed' | 'polish' = 'new') =>
  fr.t(($) => $.project.updates.lineLabel, { number, total, family: family(code) })
const counter = (count: number) => fr.t(($) => $.project.updates.counter, { count, max: 5 })
const announcedLine = fr.t(($) => $.project.updates.statusPrefill, {
  status: fr.t(($) => $.project.status.testable),
})

// --- Ouvrir la feuille et les gestes ---

const render = (ui: ReactElement) => renderWithProviders(<ToastProvider>{ui}</ToastProvider>)

/** Ouvre la feuille de `project` et attend le formulaire, puis la fin de la garde des tapes. */
const openSheet = async (project: Project = recipesProject, announce?: string) => {
  mockServer.project = project
  if (announce !== undefined) mockNav.params = { id, announce }
  await render(<UpdateSheet id={id} {...(announce !== undefined ? { announce } : {})} />)
  await screen.findByLabelText(T.titleField)
  // « Annuler », « Publier » et le voile ignorent les tapes juste après l'ouverture (`guardTaps`).
  await passTapGuard()
}

/** Le champ de la ligne `number` (sur `total`). */
const lineField = (number: number, total: number, code: 'new' | 'fixed' | 'polish' = 'new') =>
  screen.getByLabelText(lineName(number, total, code))

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }))
const publish = () => press(T.publish)
const cancel = () => press(T.cancel)

/** Ce que POST …/updates a reçu. */
const publishedBodies = () => mockServer.received('POST', UPDATES).map((one) => one.body)

/** Toutes les fois où la feuille a demandé à partir (retour, remplacement, autre page). */
const navigations = () =>
  ['push', 'replace', 'navigate', 'back', 'dismiss', 'dismissTo'].reduce(
    (count, name) => count + mockNav.router[name as 'back'].mock.calls.length,
    0,
  )

/** Rejoue un `beforeRemove` (le retour du navigateur, le geste de retour) ; rend l'événement. */
const navigatorRemoves = async (): Promise<BeforeRemove> => {
  const event: BeforeRemove = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }
  await act(async () => {
    for (const listener of mockNav.listeners) listener(event)
  })
  return event
}

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Échap relâchée (web) ou retour d'Android : la couche du Modal de la feuille, la plus profonde. */
const pressEscape = async () => {
  const layers = hostsOf(screen.root as unknown as Host).filter(
    (node) =>
      typeof node.props.onRequestClose === 'function' && textOf(node).includes(T.sheetTitle),
  )
  const layer = layers.at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
  if (!layer) throw new Error('no layer around the sheet')
  await act(() => layer.props.onRequestClose())
}

/** Le voile de la feuille : caché aux lecteurs d'écran, il se trouve par ce qui le cache. */
const pressScrim = async () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim')
  await fireEvent.press(found as never)
}

/** Vrai tant que la fenêtre « Abandonner cette mise à jour ? » est ouverte. */
const asking = () => screen.queryByRole('header', { name: T.discardTitle }) !== null

/** Ajoute des photos par « Ajouter » et attend leur envoi. */
const addPhotos = async (...names: string[]) => {
  const before = mockServer.received('POST', VISUALS).length
  mockPick.next = names.map(picked)
  await press(/^Ajouter( des photos)?$/)
  await waitFor(() =>
    expect(mockServer.received('POST', VISUALS)).toHaveLength(before + names.length),
  )
}

/** Le texte, cherché n'importe où (blancs de la typographie française compris). */
const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0

// --- Ce que la feuille montre ---

describe('the sheet « Nouvelle mise à jour »', () => {
  it('opens with « Annuler » and « Publier »', async () => {
    await openSheet()

    expect(screen.getByRole('header', { name: T.sheetTitle })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.cancel })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.publish })).toBeTruthy()
  })

  it('shows the project and its last version at the top', async () => {
    await openSheet({
      ...recipesProject,
      latestUpdate: rocketUpdate,
      updateCount: 1,
      version: 'v1.2',
    })

    expect(shown(recipesProject.title)).toBe(true)
    expect(screen.getAllByText(/Dernière version\s:\sv1\.2,/).length).toBeGreaterThan(0)
  })

  it('says « Dernière mise à jour » when the updates have no version', async () => {
    await openSheet({
      ...recipesProject,
      latestUpdate: { ...rocketUpdate, version: null },
      updateCount: 1,
      version: null,
    })

    expect(screen.getAllByText(/Dernière mise à jour\s:/).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/Dernière version/)).toHaveLength(0)
  })

  it('says « Première mise à jour » for a project with no update', async () => {
    await openSheet()

    expect(shown(T.firstUpdate)).toBe(true)
  })

  it('starts with one empty line of the family « Nouveau », counted « 1 / 5 »', async () => {
    await openSheet()

    expect(lineField(1, 1)).toHaveDisplayValue('')
    expect(screen.getByRole('button', { name: /^Famille\s:\sNouveau$/ })).toBeTruthy()
    expect(shown(counter(1))).toBe(true)
    expect(shown(T.linesHint)).toBe(true)
  })

  it('offers a title field and a version field, both optional', async () => {
    await openSheet()

    expect(screen.getByLabelText(T.titleField)).toHaveDisplayValue('')
    expect(screen.getByLabelText(T.versionField)).toHaveDisplayValue('')
  })

  it('tells who will read the update of a public project', async () => {
    await openSheet()

    expect(shown(T.hintPublic)).toBe(true)
    expect(shown(T.hintPrivate)).toBe(false)
  })

  it('tells that nobody else will see the update of a private project', async () => {
    await openSheet({ ...recipesProject, visibility: 'private' })

    expect(shown(T.hintPrivate)).toBe(true)
    expect(shown(T.hintPublic)).toBe(false)
  })
})

describe('the lines of « Ce qui a changé »', () => {
  it('adds an empty line of the family « Nouveau », counted « 2 / 5 »', async () => {
    await openSheet()

    await press(T.addLine)

    expect(lineField(2, 2)).toHaveDisplayValue('')
    expect(shown(counter(2))).toBe(true)
  })

  it('hides « Ajouter une ligne » at five lines', async () => {
    await openSheet()

    for (let i = 0; i < 4; i += 1) await press(T.addLine)

    expect(lineField(5, 5)).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.addLine })).toBeNull()
  })

  it('offers « Retirer cette ligne » on each line, except when only one is left', async () => {
    await openSheet()
    const remove = (number: number) => fr.t(($) => $.project.updates.removeLineLabel, { number })

    expect(screen.queryByRole('button', { name: remove(1) })).toBeNull()
    await press(T.addLine)
    expect(screen.getByRole('button', { name: remove(1) })).toBeTruthy()
    expect(screen.getByRole('button', { name: remove(2) })).toBeTruthy()
  })

  it('gives a line the family chosen in the menu of its badge', async () => {
    await openSheet()

    await press(/^Famille\s:\sNouveau$/)
    await fireEvent.press(screen.getByRole(choiceRole(), { name: family('fixed') }))

    expect(lineField(1, 1, 'fixed')).toBeTruthy()
  })
})

// --- Publier ---

describe('publishing an update', () => {
  it('sends the title, the version and the written lines, skipping the empty ones', async () => {
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(T.titleField), 'Le décompte de la fusée')
    await fireEvent.changeText(screen.getByLabelText(T.versionField), 'v1.3')
    await fireEvent.changeText(lineField(1, 1), 'Un compte à rebours avant chaque question')
    await press(T.addLine)
    await press(T.addLine)
    await publish()

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toEqual({
      title: 'Le décompte de la fusée',
      version: 'v1.3',
      lines: [{ family: 'new', text: 'Un compte à rebours avant chaque question' }],
      photos: [],
      beforeAfter: false,
    })
  })

  it('keeps the family of each line in what it sends', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un compte à rebours avant chaque question')
    await press(T.addLine)
    const [, second] = screen.getAllByRole('button', { name: /^Famille\s:\sNouveau$/ })
    if (!second) throw new Error('two family badges expected')
    await fireEvent.press(second)
    await fireEvent.press(screen.getByRole(choiceRole(), { name: family('fixed') }))
    await fireEvent.changeText(lineField(2, 2, 'fixed'), 'Le score ne repart plus à zéro')
    await publish()

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toMatchObject({
      lines: [
        { family: 'new', text: 'Un compte à rebours avant chaque question' },
        { family: 'fixed', text: 'Le score ne repart plus à zéro' },
      ],
    })
  })

  it('sends no title and no version when both are left empty', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toMatchObject({ title: null, version: null })
  })

  it('closes once published and says « Mise à jour publiée. »', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    expect(await screen.findByText(T.published)).toBeTruthy()
    expect(navigations()).toBe(1)
  })

  it('never greys « Publier »: with no line written, it says so on the first line', async () => {
    await openSheet()

    expect(screen.getByRole('button', { name: T.publish })).not.toBeDisabled()
    await publish()

    expect(await screen.findAllByText(containing(T.required))).not.toHaveLength(0)
    expect(publishedBodies()).toEqual([])
    expect(navigations()).toBe(0)
  })

  it('sends one update on a double tap on « Publier »', async () => {
    const answer = deferred<ApiResult<unknown>>()
    mockServer.answer('POST', UPDATES, () => answer.promise)
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')

    await publish()
    await publish()

    expect(publishedBodies()).toHaveLength(1)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('keeps the sheet open and the text untouchable while publishing', async () => {
    const answer = deferred<ApiResult<unknown>>()
    mockServer.answer('POST', UPDATES, () => answer.promise)
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(T.titleField), 'Le mode nuit')
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    // Rien de tapé pendant l'envoi ne se perdrait à la fermeture : les champs sont en lecture seule.
    expect(screen.getByLabelText(T.titleField)).toHaveProp('editable', false)
    expect(lineField(1, 1)).toHaveProp('editable', false)
    expect(navigations()).toBe(0)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('refuses Escape, the scrim and « Annuler » while publishing', async () => {
    const answer = deferred<ApiResult<unknown>>()
    mockServer.answer('POST', UPDATES, () => answer.promise)
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    await pressEscape()
    expect(screen.getByRole('header', { name: T.sheetTitle })).toBeTruthy()
    await cancel()
    expect(screen.getByRole('header', { name: T.sheetTitle })).toBeTruthy()
    await pressScrim()
    expect(screen.getByRole('header', { name: T.sheetTitle })).toBeTruthy()
    expect(navigations()).toBe(0)
    expect(asking()).toBe(false)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('says the update could not be published, and keeps everything written', async () => {
    mockServer.answer('POST', UPDATES, () => ({ ok: false, error: 'internal' }))
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(T.titleField), 'Le mode nuit')
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    expect(await screen.findByText(containing(T.error))).toBeTruthy()
    expect(screen.getByLabelText(T.titleField)).toHaveDisplayValue('Le mode nuit')
    expect(lineField(1, 1)).toHaveDisplayValue('Un mode nuit')
    expect(navigations()).toBe(0)
  })

  it('says that the ten updates of the day are used up', async () => {
    mockServer.answer('POST', UPDATES, () => ({ ok: false, error: 'rateLimited' }))
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    expect(await screen.findByText(containing(T.limited))).toBeTruthy()
  })

  it('says that the session expired, and offers to sign in again', async () => {
    mockServer.answer('POST', UPDATES, () => ({ ok: false, error: 'unauthorized' }))
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    expect(await screen.findByText(containing(T.expired))).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Me reconnecter' })).toBeTruthy()
  })

  it('says that a photo is no longer available', async () => {
    mockServer.answer('POST', UPDATES, () => ({ ok: false, error: 'invalidPhotos' }))
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    expect(await screen.findByText(containing(T.invalidPhotos))).toBeTruthy()
  })
})

// --- Les photos et l'avant / après ---

describe('the photos of an update', () => {
  it('sends each photo for the update, then cites them in the update', async () => {
    await openSheet()
    await addPhotos('jour', 'nuit')
    expect(mockServer.received('POST', VISUALS).map((one) => slotOf(one.body))).toEqual([
      'update',
      'update',
    ])
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toMatchObject({
      photos: [
        { id: uploadedId(1), description: null },
        { id: uploadedId(2), description: null },
      ],
      beforeAfter: false,
    })
  })

  it('offers « Avant / après » from two photos only', async () => {
    await openSheet()
    await addPhotos('jour')
    expect(screen.queryByRole('switch', { name: T.beforeAfter })).toBeNull()

    await addPhotos('nuit')

    expect(screen.getByRole('switch', { name: T.beforeAfter })).toBeTruthy()
  })

  it('labels the first two photos « Avant » and « Après », and sends the before / after', async () => {
    await openSheet()
    await addPhotos('jour', 'nuit')
    await fireEvent.press(screen.getByRole('switch', { name: T.beforeAfter }))

    expect(screen.getByRole('button', { name: /^Photo 1\b.*Avant/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Photo 2\b.*Après/ })).toBeTruthy()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toMatchObject({ beforeAfter: true })
  })

  it('turns « Avant / après » off when only one photo is left', async () => {
    await openSheet()
    await addPhotos('jour', 'nuit')
    await fireEvent.press(screen.getByRole('switch', { name: T.beforeAfter }))
    await press(/^Retirer la photo 2/)

    expect(screen.queryByRole('switch', { name: T.beforeAfter })).toBeNull()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()
    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toMatchObject({ beforeAfter: false })
  })

  it('does not publish while a photo is still uploading', async () => {
    const upload = deferred<ApiResult<unknown>>()
    mockServer.answer('POST', VISUALS, () => upload.promise)
    await openSheet()
    mockPick.next = [picked('jour')]
    await press(/^Ajouter( des photos)?$/)
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await publish()

    expect(await screen.findByText(containing(T.uploading))).toBeTruthy()
    expect(publishedBodies()).toEqual([])
    await act(async () => upload.resolve(ok(photo(uploadedId(1)))))
  })

  it('says that the project has reached 100 update photos', async () => {
    mockServer.answer('POST', VISUALS, () => ({ ok: false, error: 'updatePhotosFull' }))
    await openSheet()
    mockPick.next = [picked('jour')]
    await press(/^Ajouter( des photos)?$/)

    expect(await screen.findByText(containing(T.photosFull))).toBeTruthy()
  })
})

// --- Quitter sans publier ---

describe('leaving the sheet without publishing', () => {
  it('closes at once on Back, Escape, the scrim or « Annuler » when nothing changed', async () => {
    await openSheet()

    const back = await navigatorRemoves()
    expect(back.preventDefault).not.toHaveBeenCalled()
    await pressEscape()
    expect(navigations()).toBe(1)
    await cancel()
    expect(navigations()).toBe(2)
    // Le voile en dernier : il fait ignorer les tapes de la page un moment.
    await pressScrim()
    expect(navigations()).toBe(3)
    expect(asking()).toBe(false)
  })

  it('asks « Abandonner cette mise à jour ? » when the browser Back leaves a changed sheet', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')

    const back = await navigatorRemoves()

    expect(back.preventDefault).toHaveBeenCalled()
    expect(await screen.findByRole('header', { name: T.discardTitle })).toBeTruthy()
  })

  it('asks before closing a changed sheet on « Annuler », and stays on « Continuer »', async () => {
    await openSheet()
    await fireEvent.changeText(screen.getByLabelText(T.titleField), 'Le mode nuit')

    await cancel()
    expect(asking()).toBe(true)
    expect(screen.getByRole('button', { name: T.keepEditing })).toBeTruthy()
    await passTapGuard()
    await press(T.keepEditing)

    expect(asking()).toBe(false)
    expect(navigations()).toBe(0)
    expect(screen.getByLabelText(T.titleField)).toHaveDisplayValue('Le mode nuit')
  })

  it('asks before closing a changed sheet on Escape', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')

    await pressEscape()

    expect(asking()).toBe(true)
    expect(navigations()).toBe(0)
  })

  it('asks before closing a changed sheet on the scrim', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')

    await pressScrim()

    expect(asking()).toBe(true)
    expect(navigations()).toBe(0)
  })

  it('asks before closing a sheet with only a photo added', async () => {
    await openSheet()
    await addPhotos('jour')

    await cancel()

    expect(asking()).toBe(true)
  })

  it('closes after « Abandonner »', async () => {
    await openSheet()
    await fireEvent.changeText(lineField(1, 1), 'Un mode nuit')
    await cancel()
    await passTapGuard()

    await press(T.discard)

    await waitFor(() => expect(navigations()).toBe(1))
    expect(publishedBodies()).toEqual([])
  })

  it('erases the photos already sent when « Abandonner » is chosen', async () => {
    await openSheet()
    await addPhotos('jour', 'nuit')
    await cancel()
    await passTapGuard()

    await press(T.discard)

    await waitFor(() =>
      expect(mockServer.received('DELETE', VISUAL).map((one) => one.path)).toEqual([
        `/v1/projects/${id}/visuals/${uploadedId(1)}`,
        `/v1/projects/${id}/visuals/${uploadedId(2)}`,
      ]),
    )
  })

  it('closes a sheet prefilled by the status change on « Annuler » without asking', async () => {
    await openSheet(recipesProject, 'testable')
    expect(lineField(1, 1)).toHaveDisplayValue(announcedLine) // témoin : la ligne préremplie

    await cancel()

    expect(asking()).toBe(false)
    expect(navigations()).toBe(1)
  })
})

// --- Quand le statut change ---

describe('the update suggested after a change of status', () => {
  it('prefills a line « Nouveau » with the new status, and says why the sheet opened', async () => {
    await openSheet(recipesProject, 'testable')

    expect(lineField(1, 1)).toHaveDisplayValue(announcedLine)
    expect(screen.getAllByText(/Ton projet est passé en «\sTestable\s»\s: annonce-le/).length).toBe(
      1,
    )
    await publish()

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    expect(publishedBodies()[0]).toMatchObject({ lines: [{ family: 'new', text: announcedLine }] })
  })

  it('says on a private project that nobody will be told', async () => {
    await openSheet({ ...recipesProject, visibility: 'private' }, 'testable')

    expect(
      shown(
        fr.t(($) => $.project.updates.hintAnnouncePrivate, {
          status: fr.t(($) => $.project.status.testable),
        }),
      ),
    ).toBe(true)
  })

  it('prefills nothing for a status that does not exist', async () => {
    // Une adresse fabriquée à la main ne doit rien glisser dans la feuille de l'auteur.
    await openSheet(recipesProject, 'piratage')

    expect(lineField(1, 1)).toHaveDisplayValue('')
  })
})

// --- Qui peut l'ouvrir ---

describe('who can open the sheet', () => {
  it('offers no form on the project of another member', async () => {
    mockServer.project = { ...recipesProject, isMine: false }
    await render(<UpdateSheet id={id} />)

    expect(await screen.findByText(containing(T.notMine))).toBeTruthy()
    expect(screen.queryByLabelText(T.titleField)).toBeNull()
  })

  it('says the project cannot be found when it is private to another member', async () => {
    mockServer.answer('GET', /^\/v1\/projects\/[^/]+$/, () => ({ ok: false, error: 'notFound' }))
    await render(<UpdateSheet id={id} />)

    expect(await screen.findByText(containing(T.notFound))).toBeTruthy()
    expect(screen.queryByLabelText(T.titleField)).toBeNull()
  })

  it('offers no form to a suspended author', async () => {
    mockServer.me = suspendedMe
    await render(<UpdateSheet id={id} />)

    expect(await screen.findByText(containing(T.suspended))).toBeTruthy()
    expect(screen.queryByLabelText(T.titleField)).toBeNull()
  })
})
