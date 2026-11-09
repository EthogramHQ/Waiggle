// Outils partagés des tests de la feuille de publication et de modification (R6a) :
// `ProjectFormScreen.test.tsx` (publier) et `ProjectFormScreen.edit.test.tsx` (modifier, supprimer).
//
// Ces tests ne remplacent pas les fonctions de `projects/api.ts` une à une : ils remplacent le
// réseau lui-même (`api/client`, `request` et `requestWithoutBody`) par un faux serveur, qui répond
// comme l'API et garde chaque demande reçue (méthode, chemin, corps). Ainsi les vrais
// `projects/api.ts`, `projects/usePhotoTiles.ts`, `ProjectFormFields`, `ProjectCategorySheet` et
// `DeleteProjectDialog` tournent ensemble, et un test vérifie ce qui part au serveur, pas le nom de
// la fonction qui l'envoie (code-appli.md, « Hook sur usePostComment : simuler api/client »).
//
// Ce que les fichiers de tests doivent déclarer eux-mêmes (un `jest.mock` ne se partage pas) :
//   jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
//   jest.mock('../api/client', () => mockClient)            … et les autres, voir `ProjectFormScreen.test.tsx`.
import type { Me, Project, ProjectStatus } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ApiResult } from '../api/errors'
import type { PickedImage } from '../media/pick'
import { labelOf } from '../testing/arrivedFocus'
import { categoryList, categoryName as seedName } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { photo, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectFormScreen } from './ProjectFormScreen'

// --- Les textes ---

/**
 * Le nom d'une catégorie (« Sciences et espace »). R6b : les noms viennent de l'API
 * (GET /v1/categories, servi par le faux serveur ci-dessous avec `categoryList`), plus des
 * traductions : on les lit dans les mêmes données.
 */
export const categoryName = (code: Project['primaryCategory'] & string) => seedName(code)

export const TEXT = {
  newTitle: fr.t(($) => $.project.form.newTitle),
  editTitle: fr.t(($) => $.project.form.editTitle),
  publish: fr.t(($) => $.project.form.publish),
  save: fr.t(($) => $.project.form.save),
  cancel: fr.t(($) => $.project.form.cancel),
  unchanged: fr.t(($) => $.project.form.unchanged),
  title: fr.t(($) => $.project.form.title),
  oneLine: fr.t(($) => $.project.form.oneLine),
  demoUrl: fr.t(($) => $.project.form.demoUrl),
  demoValid: fr.t(($) => $.project.form.demoValid),
  demoNotChecked: fr.t(($) => $.project.form.demoNotChecked),
  chooseCategory: fr.t(($) => $.project.form.chooseCategory),
  categoriesAndTools: fr.t(($) => $.project.form.categoriesAndTools),
  ok: fr.t(($) => $.project.form.ok),
  addPhotos: fr.t(($) => $.project.form.addPhotosLabel),
  photosSaved: fr.t(($) => $.project.form.photosSaved),
  uploadFailed: fr.t(($) => $.project.form.uploadFailed),
  privateHint: fr.t(($) => $.project.form.privateHint),
  audienceMembers: fr.t(($) => $.project.form.audienceMembers),
  audienceMembersEdit: fr.t(($) => $.project.form.audienceMembersEdit),
  audiencePrivateNew: fr.t(($) => $.project.form.audiencePrivateNew),
  deleteZone: fr.t(($) => $.project.form.deleteZone),
  deleteOwner: fr.t(($) => $.project.form.deleteOwner),
  abandonNew: fr.t(($) => $.project.form.abandonNew),
  abandonNewBody: fr.t(($) => $.project.form.abandonNewBody),
  abandonEdit: fr.t(($) => $.project.form.abandonEdit),
  abandonEditBody: fr.t(($) => $.project.form.abandonEditBody),
  keepEditing: fr.t(($) => $.project.form.keepEditing),
  abandon: fr.t(($) => $.project.form.abandon),
  draftSaved: fr.t(($) => $.project.form.draftSaved),
  saved: fr.t(($) => $.project.form.saved),
  deleted: fr.t(($) => $.project.form.deleted),
  deleteConfirm: fr.t(($) => $.project.page.deleteConfirm),
  deleteButton: fr.t(($) => $.project.page.deleteConfirmButton),
  preview: fr.t(($) => $.project.form.preview),
  notMine: fr.t(($) => $.project.page.notMine),
  suspended: fr.t(($) => $.suspension.formBody),
  photoDescription: (number: number) => fr.t(($) => $.project.form.photoDescription, { number }),
  deleteTitle: (title: string) => fr.t(($) => $.project.page.deleteTitle, { title }),
}

// --- Le faux serveur ---

/** Une demande reçue par le faux serveur : sa méthode, son chemin et son corps (JSON lu). */
export type Sent = { method: string; path: string; body: unknown }

type Answer = ApiResult<unknown> | Promise<ApiResult<unknown>>
type Override = { method: string; path: RegExp; answer: (sent: Sent) => Answer }

/** L'identifiant donné au projet créé par POST /v1/projects. */
export const NEW_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'

/** L'identifiant de la n-ième photo reçue par le faux serveur (des UUID valides). */
export const uploadedId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })

/** Une promesse dont le test choisit le moment de la fin. */
export const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Le chemin d'un projet (`/v1/projects/<id>`), et de ses photos. */
const PROJECT = /^\/v1\/projects\/([^/]+)$/
const VISUALS = /^\/v1\/projects\/([^/]+)\/visuals$/
const VISUAL = /^\/v1\/projects\/([^/]+)\/visuals\/([^/]+)$/

/** L'image passée à `appendImage` (faux de `media/pick`), lue dans le formulaire multipart. */
const uploadedUri = (body: unknown): string | undefined => {
  const form = body as {
    getParts?: () => { fieldName: string; string?: string }[]
    getAll?: (name: string) => unknown[]
  }
  const part = form.getParts?.().find((one) => one.fieldName === 'visual')
  if (part) return part.string
  const all = form.getAll?.('visual')
  return typeof all?.[0] === 'string' ? all[0] : undefined
}

/** Les champs écrits par l'appli (corps d'un POST ou d'un PATCH), posés sur le projet rendu. */
const applyChanges = (project: Project, body: Record<string, unknown>): Project => {
  const next = { ...project, ...body } as Project & { visualOrder?: string[] }
  if (Array.isArray(body.tools)) {
    // R6b : le faux serveur ne connaît pas le catalogue ; chaque outil y est rangé comme l'API
    // range un nom du catalogue (une page, un lien).
    next.tools = (body.tools as string[]).map((label) => ({
      label,
      slug: label.toLowerCase().replace(/\s+/g, '-'),
      inCatalogue: true,
    }))
  }
  if (Array.isArray(body.visualOrder)) {
    const order = body.visualOrder as string[]
    next.visuals = order
      .map((id) => project.visuals.find((visual) => visual.id === id))
      .filter((visual) => visual !== undefined)
  }
  delete next.visualOrder
  return next
}

/**
 * Le faux serveur, commun aux deux fichiers. `reset()` en `beforeEach` ; un test change `me` (un
 * profil lent, un compte suspendu), `project` (le projet relu) ou ajoute une réponse imposée
 * (`answer`), qui passe avant les réponses ordinaires.
 */
export const mockServer = {
  sent: [] as Sent[],
  me: leaMe as Me | Promise<Me>,
  project: recipesProject as Project,
  uploads: 0,
  overrides: [] as Override[],

  reset() {
    this.sent = []
    this.me = leaMe
    this.project = recipesProject
    this.uploads = 0
    this.overrides = []
  },

  /** Impose la réponse des demandes `method` dont le chemin correspond à `path`. */
  answer(method: string, path: RegExp, answer: (sent: Sent) => Answer) {
    this.overrides.push({ method, path, answer })
  },

  /** Les demandes reçues de cette méthode, au chemin qui correspond. */
  received(method: string, path: RegExp): Sent[] {
    return this.sent.filter((one) => one.method === method && path.test(one.path))
  },

  async respond(path: string, init: RequestInit): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    const body =
      typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : (init.body ?? null)
    const sent: Sent = { method, path, body }
    this.sent.push(sent)

    const forced = this.overrides.find((one) => one.method === method && one.path.test(path))
    if (forced) return forced.answer(sent)

    if (method === 'GET' && path === '/v1/me') return ok(await this.me)
    // R6b : le catalogue des outils (vide) et les seize catégories de départ.
    if (method === 'GET' && path === '/v1/tools') return ok({ tools: [], others: [] })
    if (method === 'GET' && path === '/v1/categories') return ok(categoryList('fr'))
    if (method === 'POST' && path === '/v1/projects') {
      const created = applyChanges(
        { ...recipesProject, id: NEW_ID, visuals: [], portraitCover: null, prompts: [] },
        body as Record<string, unknown>,
      )
      this.project = created
      return ok(created)
    }
    const visual = VISUAL.exec(path)
    if (visual) {
      const [, , visualId] = visual
      if (method === 'DELETE') {
        this.project = {
          ...this.project,
          visuals: this.project.visuals.filter((one) => one.id !== visualId),
          portraitCover:
            this.project.portraitCover?.id === visualId ? null : this.project.portraitCover,
        }
      }
      if (method === 'PATCH') {
        const { description } = body as { description: string | null }
        this.project = {
          ...this.project,
          visuals: this.project.visuals.map((one) =>
            one.id === visualId ? { ...one, description } : one,
          ),
        }
      }
      return ok(this.project)
    }
    if (method === 'POST' && VISUALS.test(path)) {
      this.uploads += 1
      const added = photo(uploadedId(this.uploads))
      this.project = { ...this.project, visuals: [...this.project.visuals, added] }
      return ok(this.project)
    }
    const project = PROJECT.exec(path)
    if (project) {
      if (method === 'GET') {
        return project[1] === this.project.id ? ok(this.project) : { ok: false, error: 'notFound' }
      }
      if (method === 'PATCH') {
        this.project = applyChanges(this.project, body as Record<string, unknown>)
        return ok(this.project)
      }
      if (method === 'DELETE') return ok(null)
    }
    throw new Error(`faux serveur : demande inattendue ${method} ${path}`)
  },
}

/** Les images envoyées par POST …/visuals, dans l'ordre (l'adresse du fichier choisi). */
export const uploadedImages = () =>
  mockServer.received('POST', VISUALS).map((one) => uploadedUri(one.body))

/**
 * Le faux `api/client` : `request` lit la réponse avec le schéma du contrat, comme le vrai (un
 * champ manquant donne « internal ») ; `requestWithoutBody` rend `null` (une suppression).
 */
export const mockClient = {
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
  apiFetch: async () => {
    throw new Error('faux serveur : apiFetch ne doit pas être appelé')
  },
}

// --- Les photos choisies ---

/** Une photo choisie dans la galerie de l'appareil, déjà préparée. */
export const picked = (name: string): PickedImage => ({
  uri: `file:///${name}.jpg`,
  width: 2048,
  height: 1536,
})

/**
 * Le faux de `pickVisuals` (plan R6a, U1) : `onChosen(images)` dès le choix, puis la promesse rend
 * les images préparées. Un test pose les images du prochain choix avec `mockPick.next`.
 */
export const mockPick = {
  next: [] as PickedImage[],
  calls: [] as { slot: string; remaining: number }[],
  pickVisuals: async (
    slot: string,
    remaining: number,
    onChosen: (images: PickedImage[]) => void,
  ): Promise<PickedImage[]> => {
    mockPick.calls.push({ slot, remaining })
    const images = mockPick.next
    mockPick.next = []
    if (images.length > 0) onChosen(images)
    return images
  },
}

// --- La navigation ---

/** Un `beforeRemove` du navigateur (retour du navigateur, geste de retour d'iOS). */
type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

/**
 * Le faux routeur d'Expo Router (`useRouter()`), et le faux `useNavigation()` (ses écouteurs
 * `beforeRemove`). Le `jest.mock('expo-router')` de chaque fichier de tests les lit ici, au premier
 * appel seulement : ce fichier importe l'écran, qui importe expo-router.
 */
export const mockNav = {
  pathname: '/projects/new',
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  },
  listeners: new Map<string, Set<(event: BeforeRemove) => void>>(),
  navigation: {
    addListener: jest.fn((type: string, listener: (event: BeforeRemove) => void) => {
      const set = mockNav.listeners.get(type) ?? new Set()
      set.add(listener)
      mockNav.listeners.set(type, set)
      return () => set.delete(listener)
    }),
    removeListener: jest.fn((type: string, listener: (event: BeforeRemove) => void) => {
      mockNav.listeners.get(type)?.delete(listener)
    }),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  reset() {
    this.pathname = '/projects/new'
    for (const fn of Object.values(this.router)) fn.mockClear()
    this.router.canGoBack.mockImplementation(() => true)
    this.router.canDismiss.mockImplementation(() => true)
    this.listeners.clear()
    this.navigation.dispatch.mockClear()
  },
}

/** Rejoue un `beforeRemove` du navigateur ; rend l'événement, pour lire `preventDefault`. */
export const navigatorRemoves = async (): Promise<BeforeRemove> => {
  const event: BeforeRemove = {
    preventDefault: jest.fn(),
    data: { action: { type: 'GO_BACK' } },
  }
  await act(async () => {
    for (const listener of mockNav.listeners.get('beforeRemove') ?? []) listener(event)
  })
  return event
}

/** Toutes les fois où la feuille a demandé à partir (retour, fermeture, autre page). */
export const navigations = () =>
  Object.entries(mockNav.router)
    .filter(([name]) => !name.startsWith('can') && name !== 'setParams')
    .reduce((count, [, fn]) => count + fn.mock.calls.length, 0)

/** Les adresses demandées (push, replace, navigate, dismissTo), en texte : « /projects/abc?x=1 ». */
export const destinations = () =>
  [mockNav.router.push, mockNav.router.replace, mockNav.router.navigate, mockNav.router.dismissTo]
    .flatMap((fn) => fn.mock.calls)
    .map(([href]) => pathOf(href))

// --- Le focus ---

/**
 * Le nom (ou le premier texte) de chaque vue qui a reçu le focus par les outils de `ui/focus`
 * (`focusWithoutScroll`, `focusAndReveal`, `moveReaderTo`), dans l'ordre. Le fichier de tests
 * remplace `ui/focus` par des espions qui appellent les vrais.
 */
export const focusedLabels = (): (string | undefined)[] => {
  const calls = [
    ...jest.mocked(focusWithoutScroll).mock.calls.map((call, i) => ({
      node: call[0],
      order: jest.mocked(focusWithoutScroll).mock.invocationCallOrder[i] ?? 0,
    })),
    ...jest.mocked(focusAndReveal).mock.calls.map((call, i) => ({
      node: call[0],
      order: jest.mocked(focusAndReveal).mock.invocationCallOrder[i] ?? 0,
    })),
    ...jest.mocked(moveReaderTo).mock.calls.map((call, i) => ({
      node: call[0],
      order: jest.mocked(moveReaderTo).mock.invocationCallOrder[i] ?? 0,
    })),
  ]
  return calls.sort((a, b) => a.order - b.order).map(({ node }) => labelOf(node))
}

/** Oublie les focus passés (avant le geste dont on veut lire l'effet). */
export const forgetFocus = () => {
  jest.mocked(focusWithoutScroll).mockClear()
  jest.mocked(focusAndReveal).mockClear()
  jest.mocked(moveReaderTo).mockClear()
}

// --- L'arbre rendu ---

export type Host = {
  props: Record<string, unknown>
  parent: Host | null
  children: ReadonlyArray<Host | string>
}

export const root = () => screen.root as unknown as Host

/** Tous les éléments de l'arbre, en profondeur, dans l'ordre de lecture. */
export const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Les textes de l'arbre, dans l'ordre de lecture, blancs ramenés à des espaces simples. */
export const textsInOrder = (): string[] =>
  hostsOf(root()).flatMap((node) =>
    node.children
      .filter((child): child is string => typeof child === 'string')
      .map((text) => text.replace(/\s+/g, ' ')),
  )

/** Le texte d'un élément et de ses enfants. */
export const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/**
 * La couche d'un `Modal` (celle qui reçoit le retour d'Android et l'Échap relâchée) qui contient ce
 * texte ; la plus profonde, si une couche en contient une autre.
 */
export const layerAround = (text: string) => {
  const wanted = text.replace(/\s+/g, ' ')
  const layers = hostsOf(root()).filter(
    (node) =>
      typeof node.props.onRequestClose === 'function' &&
      textOf(node).replace(/\s+/g, ' ').includes(wanted),
  )
  const found = layers.at(-1)
  if (!found) throw new Error(`aucune couche autour de « ${text} »`)
  return found as Host & { props: { onRequestClose: () => void } }
}

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
export const key = (name: string) => ({
  key: name,
  shiftKey: false,
  repeat: false,
  preventDefault: jest.fn(),
})

/** Échap tapée sur un élément (elle remonte à la feuille la plus proche qui l'écoute). */
export const pressEscape = (element: unknown) =>
  fireEvent(element as never, 'keyDown', key('Escape'))

// --- Ouvrir la feuille ---

const renderSheet = (ui: React.ReactElement) =>
  renderWithProviders(<ToastProvider>{ui}</ToastProvider>)

/** Prépare un test : faux serveur, navigation, photos, focus et session de Léa remis à zéro. */
export const resetAll = () => {
  mockServer.reset()
  mockNav.reset()
  mockPick.next = []
  mockPick.calls = []
  forgetFocus()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
}

/** Ouvre la feuille « Nouveau projet » (l'adresse /projects/new), sans attendre le profil. */
export const openNewSheet = () => {
  mockNav.pathname = '/projects/new'
  return renderSheet(<ProjectFormScreen />)
}

/** Ouvre la feuille « Nouveau projet » et attend le formulaire (le profil lu). */
export const openNewForm = async () => {
  const view = await openNewSheet()
  await screen.findByLabelText(TEXT.title)
  return view
}

/** Ouvre la feuille de modification de `project` (/projects/<id>/edit), sans rien attendre. */
export const openEditSheet = (
  project: Project = mockServer.project,
  options: { uploadFailed?: boolean } = {},
) => {
  mockServer.project = project
  mockNav.pathname = `/projects/${project.id}/edit`
  return renderSheet(
    <ProjectFormScreen id={project.id} {...(options.uploadFailed ? { uploadFailed: true } : {})} />,
  )
}

/** Ouvre la feuille « Modifier le projet » de `project` et attend le formulaire rempli. */
export const openEditForm = async (
  project: Project = mockServer.project,
  options: { uploadFailed?: boolean } = {},
) => {
  const view = await openEditSheet(project, options)
  await screen.findByDisplayValue(project.title)
  return view
}

// --- Les gestes ---

/** Écrit le titre et la phrase. */
export const fillIn = async (
  title = 'Le ciel de ce soir',
  pitch = 'Les étoiles à voir ce soir.',
) => {
  await fireEvent.changeText(screen.getByLabelText(TEXT.title), title)
  await fireEvent.changeText(screen.getByLabelText(TEXT.oneLine), pitch)
}

/** La ligne « Catégorie » de la feuille (un bouton nommé « Catégorie… »). */
export const categoryRow = () => screen.getByRole('button', { name: /^Catégorie(?! et outils)/ })

/** La ligne « Seconde, facultative ». */
export const secondaryRow = () => screen.getByRole('button', { name: /^Seconde/ })

/** La case d'une catégorie dans la seconde feuille (nommée par la catégorie, puis son rang). */
export const categoryBox = (code: Project['primaryCategory'] & string) =>
  screen.getByRole('checkbox', { name: new RegExp(`^${categoryName(code)}`) })

/** Ouvre « Catégorie et outils », coche ces catégories dans l'ordre, puis « OK ». */
export const chooseCategories = async (...codes: (Project['primaryCategory'] & string)[]) => {
  await fireEvent.press(categoryRow())
  await screen.findByLabelText(TEXT.categoriesAndTools)
  for (const code of codes) await fireEvent.press(categoryBox(code))
  await fireEvent.press(screen.getByRole('button', { name: TEXT.ok }))
}

/** Choisit « Privé » dans « Qui peut le voir ? ». */
export const choosePrivate = () => fireEvent.press(screen.getByRole('radio', { name: /^Privé/ }))

/** Choisit un statut dans « Où en est le projet ? ». */
export const chooseStatus = (status: ProjectStatus) =>
  fireEvent.press(screen.getByRole('radio', { name: fr.t(($) => $.project.status[status]) }))

/** Le bouton d'une tuile de photo (« Photo 1, couverture », « Photo 2 »…). */
export const tile = (number: number) =>
  screen.getByRole('button', { name: new RegExp(`^Photo ${number}(,|$| :)`) })

/** Le texte, cherché n'importe où (blancs de la typographie française compris). */
export const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0

export { recipesProject }
