// Tests de la page « Les mises à jour » d'un projet, la frise (R7a, docs/scenarios/refonte.md, « La
// frise », « L'avant / après », « Supprimer une mise à jour ») : son titre et son nombre, la ligne
// des dates, l'avant / après de la dernière mise à jour qui en a un, la frise par pages de 20 et
// « Première version », la corbeille de l'auteur, et un projet qu'on ne peut pas voir.
//
// Ce que ces tests supposent de l'écran (plan R7a, U4b ; à corriger si le code en décide
// autrement) :
// - `ProjectUpdatesScreen({ id })`, monté par la route `app/projects/[id]/updates.tsx` ;
// - le réseau passe par `api/client` (le faux serveur ci-dessous) : GET /v1/projects/{id}, GET
//   …/updates (puis `?cursor=`), DELETE …/updates/{updateId} ; les vrais hooks de `updates/api`
//   (U0) tournent dessus ;
// - « Suivre ce projet » passe par `useFollow` (faux hook) ;
// - le focus passe par les outils de `ui/focus`, que ces tests espionnent.
import type { Project, ProjectUpdate } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import type { ApiResult } from '../api/errors'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { projectQueryKey } from '../projects/hooks'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectUpdatesScreen } from './ProjectUpdatesScreen'

const { id } = recipesProject
const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })

/** La n-ième mise à jour d'exemple (1 : la plus récente), sans photo. */
const updateNo = (n: number): ProjectUpdate => ({
  id: `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`,
  title: `Mise à jour numéro ${n}`,
  version: null,
  lines: [{ family: 'polish', text: `Une retouche numéro ${n}` }],
  photos: [],
  beforeAfter: false,
  createdAt: new Date(Date.UTC(2026, 9, 30, 12) - n * 3_600_000).toISOString(),
  removal: null,
})

/** Le projet de Léa avec ses trois mises à jour (la fusée en tête). */
const withUpdates: Project = {
  ...recipesProject,
  latestUpdate: rocketUpdate,
  updateCount: 3,
  version: 'v1.2',
}
const threeUpdates = [rocketUpdate, updateNo(2), updateNo(3)]

/** Le faux serveur : le projet et les pages de la frise, par curseur (`undefined` : la première). */
const mockServer = {
  project: withUpdates as Project,
  pages: new Map<string | undefined, ApiResult<unknown>>(),
  sent: [] as { method: string; path: string }[],
  reset() {
    this.project = withUpdates
    this.pages = new Map([[undefined, ok({ items: threeUpdates, nextCursor: null })]])
    this.sent = []
  },
  async respond(path: string, init: RequestInit): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    this.sent.push({ method, path })
    const url = new URL(path, 'http://test')
    if (method === 'GET' && url.pathname === `/v1/projects/${id}`) return ok(this.project)
    if (method === 'GET' && url.pathname === `/v1/projects/${id}/updates`) {
      const cursor = url.searchParams.get('cursor') ?? undefined
      return this.pages.get(cursor) ?? { ok: false, error: 'notFound' }
    }
    if (method === 'DELETE' && url.pathname.startsWith(`/v1/projects/${id}/updates/`)) {
      return ok(null)
    }
    return { ok: false, error: 'notFound' }
  },
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: async (
    path: string,
    init: RequestInit | undefined,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  ) => {
    const result = await mockServer.respond(path, init ?? {})
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
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn(async () => null) }))
// Suivre : un faux hook, dont le test lit les appels (toggle).
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
}
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/projects/abc/updates',
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    useSegments: () => [],
    useIsFocused: () => true,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(() => effect(), [effect])
    },
  }
})

const mockToggle = jest.fn()

beforeEach(() => {
  mockServer.reset()
  for (const fn of Object.values(mockRouter)) fn.mockClear()
  mockToggle.mockReset()
  jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  // Léa, l'autrice ; un test pose Max pour un autre membre (`seenByMax`).
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})

// --- Les textes et les aides ---

const T = {
  title: fr.t(($) => $.project.updates.title),
  count: fr.t(($) => $.project.updates.count, { count: 3 }),
  firstVersion: fr.t(($) => $.project.updates.firstVersion),
  more: fr.t(($) => $.project.updates.more),
  moreError: fr.t(($) => $.project.updates.moreError),
  loadError: fr.t(($) => $.project.updates.loadError),
  compare: fr.t(($) => $.project.updates.compare),
  deleteTitle: fr.t(($) => $.project.updates.deleteTitle),
  confirmDelete: fr.t(($) => $.project.updates.confirmDelete),
  notFound: fr.t(($) => $.project.page.notFoundTitle),
  follow: fr.t(($) => $.follow.project),
  retry: fr.t(($) => $.common.retry),
}
const trashOf = (title: string) => fr.t(($) => $.project.updates.delete, { title })

/** Le projet vu par Max, un autre membre. */
const seenByMax = (project: Project = withUpdates) => {
  mockServer.project = { ...project, isMine: false }
  mockSession({ user: { id: 'u2', name: 'Max' } })
}

/** Ouvre la page et attend la frise (la première mise à jour). */
const openPage = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <ProjectUpdatesScreen id={id} />
    </ToastProvider>,
  )
  await screen.findByText(rocketUpdate.title ?? '')
  return view
}

/** Vrai si la page montre ce texte (blancs de la typographie française compris), ou le lit. */
const shown = (text: string) =>
  screen.queryAllByText(containing(text)).length > 0 ||
  screen.queryAllByLabelText(containing(text)).length > 0

/** Une ligne lue avec sa famille : « Plus joli : Une retouche numéro 2 » (interface B4). */
const readLine = (code: 'new' | 'fixed' | 'polish', text: string) =>
  fr.t(($) => $.update.lineRead, { family: fr.t(($) => $.update.family[code]), text })

/** Le lien ou bouton de ce nom. */
const control = (name: string) =>
  screen.queryByRole('button', { name }) ?? screen.getByRole('link', { name })

/** Le curseur de l'avant / après : `adjustable` sur téléphone, `slider` sur le web. */
const slider = () =>
  screen.queryByRole('adjustable', { name: T.compare }) ??
  screen.getByRole('slider', { name: T.compare })

/** Une page pleine de 20 mises à jour (2 à 21), et une suite (22). */
const twoPages = () => {
  const first = [rocketUpdate, ...Array.from({ length: 19 }, (_, i) => updateNo(i + 2))]
  mockServer.pages = new Map<string | undefined, ApiResult<unknown>>([
    [undefined, ok({ items: first, nextCursor: 'page2' })],
    ['page2', ok({ items: [updateNo(21)], nextCursor: null })],
  ])
  mockServer.project = { ...withUpdates, updateCount: 21 }
}

/** Les noms (ou premiers textes) des vues qui ont reçu le focus par `ui/focus`, dans l'ordre. */
const focusedLabels = () =>
  [focusWithoutScroll, focusAndReveal, moveReaderTo]
    .flatMap((fn) =>
      jest.mocked(fn).mock.calls.map((call, i) => ({
        node: call[0],
        order: jest.mocked(fn).mock.invocationCallOrder[i] ?? 0,
      })),
    )
    .sort((a, b) => a.order - b.order)
    .map(({ node }) => labelOf(node) ?? '')

type TreeNode = { children: (TreeNode | string)[] }
/** La place de chaque élément dans l'ordre de lecture (l'arbre, en profondeur d'abord). */
const readingOrder = (...elements: unknown[]) => {
  const order: unknown[] = []
  const walk = (node: TreeNode) => {
    order.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => order.indexOf(element))
}

// --- La page ---

describe('the page « Les mises à jour »', () => {
  it('titles the page « Les mises à jour », with the number of updates', async () => {
    await openPage()

    expect(screen.getByRole('header', { name: new RegExp(`^${T.title}`) })).toBeTruthy()
    expect(shown(T.count)).toBe(true)
  })

  it('names the project and its author, to go back to it', async () => {
    await openPage()

    expect(shown(recipesProject.title)).toBe(true)
    expect(shown(recipesProject.author.name)).toBe(true)
  })

  it('shows the updates from the newest to the oldest, each line read with its family', async () => {
    await openPage()

    const titles = screen
      .getAllByText(/^(Le décompte de la fusée|Mise à jour numéro \d+)$/)
      .map((node) => node.props.children)
    expect(titles).toEqual([
      'Le décompte de la fusée',
      'Mise à jour numéro 2',
      'Mise à jour numéro 3',
    ])
    expect(shown(readLine('fixed', 'Le score ne repart plus à zéro au niveau 3'))).toBe(true)
    expect(shown(readLine('polish', 'Une retouche numéro 2'))).toBe(true)
  })

  it('shows the dates line « Publié le … · Mis à jour … · v1.2 »', async () => {
    await openPage()

    expect(shown('Publié le')).toBe(true)
    expect(shown('Mis à jour')).toBe(true)
    expect(screen.getAllByText(containing('v1.2')).length).toBeGreaterThan(0)
  })

  it('shows at the top the before / after of the latest update that has one', async () => {
    // La plus récente n'a pas d'avant / après : c'est celle de la fusée, plus ancienne, qui paraît.
    mockServer.pages = new Map([
      [undefined, ok({ items: [updateNo(1), rocketUpdate], nextCursor: null })],
    ])
    await openPage()

    expect(slider()).toBeTruthy()
    expect(screen.getByLabelText(containing('Avant : La fusée de jour'))).toBeTruthy()
  })

  it('reads the page heading before the comparison slider', async () => {
    await openPage()

    const [heading, compare] = readingOrder(
      screen.getByRole('header', { name: new RegExp(`^${T.title}`) }),
      slider(),
    )
    expect(heading).toBeGreaterThanOrEqual(0)
    expect(heading).toBeLessThan(compare ?? -1)
  })

  it('offers « Suivre ce projet » to another member', async () => {
    seenByMax()
    await openPage()

    await fireEvent.press(await screen.findByRole('switch', { name: T.follow }))

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('shows the page « Ce projet est introuvable » for a project one cannot see', async () => {
    mockServer.project = withUpdates
    const respond = mockServer.respond.bind(mockServer)
    const spy = jest
      .spyOn(mockServer, 'respond')
      .mockImplementation(async (path, init) =>
        path === `/v1/projects/${id}` ? { ok: false, error: 'notFound' } : respond(path, init),
      )
    try {
      await renderWithProviders(<ProjectUpdatesScreen id={id} />)

      expect(await screen.findByText(containing(T.notFound))).toBeTruthy()
      expect(screen.queryByText(rocketUpdate.title ?? '')).toBeNull()
    } finally {
      // `apps/app` n'a pas `restoreMocks` : sans cela, les tests suivants verraient « introuvable ».
      spy.mockRestore()
    }
  })

  it('says the updates could not load, and offers to try again', async () => {
    mockServer.pages = new Map([[undefined, { ok: false, error: 'internal' }]])
    await renderWithProviders(<ProjectUpdatesScreen id={id} />)

    expect(await screen.findByText(containing(T.loadError))).toBeTruthy()
    mockServer.pages = new Map([[undefined, ok({ items: threeUpdates, nextCursor: null })]])
    await fireEvent.press(control(T.retry))
    expect(await screen.findByText(rocketUpdate.title ?? '')).toBeTruthy()
  })
})

// --- La frise par pages ---

describe('the timeline, page by page', () => {
  it('shows « Première version » at the end of a timeline read to the end', async () => {
    await openPage()

    expect(shown(T.firstVersion)).toBe(true)
    expect(screen.queryByRole('button', { name: T.more })).toBeNull()
  })

  it('shows « Première version » only at the end of the timeline', async () => {
    twoPages()
    await openPage()

    // 20 mises à jour, puis « Afficher la suite » : la première version n'est pas encore là.
    expect(shown(T.firstVersion)).toBe(false)
    await fireEvent.press(control(T.more))

    expect(await screen.findByText('Mise à jour numéro 21')).toBeTruthy()
    expect(shown(T.firstVersion)).toBe(true)
  })

  it('reads the next page with its cursor after « Afficher la suite »', async () => {
    twoPages()
    await openPage()
    expect(screen.queryByText('Mise à jour numéro 21')).toBeNull()

    await fireEvent.press(control(T.more))

    expect(await screen.findByText('Mise à jour numéro 21')).toBeTruthy()
    expect(mockServer.sent.map((one) => one.path)).toContain(
      `/v1/projects/${id}/updates?cursor=page2`,
    )
  })

  it('keeps the shown updates and offers to retry when the next page fails', async () => {
    twoPages()
    mockServer.pages.set('page2', { ok: false, error: 'internal' })
    await openPage()

    await fireEvent.press(control(T.more))

    expect(await screen.findByText(containing(T.moreError))).toBeTruthy()
    expect(screen.getByText('Mise à jour numéro 20')).toBeTruthy()
    mockServer.pages.set('page2', ok({ items: [updateNo(21)], nextCursor: null }))
    await fireEvent.press(control(T.retry))
    expect(await screen.findByText('Mise à jour numéro 21')).toBeTruthy()
  })

  it('moves focus to the first arrived update after « Afficher la suite »', async () => {
    twoPages()
    await openPage()

    await fireEvent.press(control(T.more))
    await screen.findByText('Mise à jour numéro 21')

    await waitFor(() =>
      expect(focusedLabels().some((label) => label.includes('Mise à jour numéro 21'))).toBe(true),
    )
  })
})

// --- La corbeille de l'auteur ---

describe('deleting an update from the timeline', () => {
  it('offers the author a trash on each update, and deletes one once confirmed', async () => {
    await openPage()
    expect(screen.getByRole('button', { name: trashOf('Mise à jour numéro 3') })).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: trashOf('Mise à jour numéro 2') }))
    await passTapGuard()
    const dialog = screen.getByRole('header', { name: T.deleteTitle }).parent
    if (!dialog) throw new Error('no window to confirm')
    let node: typeof dialog | null = dialog
    while (node && within(node).queryAllByRole('button', { name: T.confirmDelete }).length === 0) {
      node = node.parent
    }
    if (!node) throw new Error('no « Supprimer » in the window')
    await fireEvent.press(within(node).getByRole('button', { name: T.confirmDelete }))

    await waitFor(() =>
      expect(mockServer.sent).toContainEqual({
        method: 'DELETE',
        path: `/v1/projects/${id}/updates/${updateNo(2).id}`,
      }),
    )
    await waitFor(() => expect(screen.queryByText('Mise à jour numéro 2')).toBeNull())
  })

  it('moves focus to the next update after a deletion', async () => {
    await openPage()

    await fireEvent.press(screen.getByRole('button', { name: trashOf('Mise à jour numéro 2') }))
    await passTapGuard()
    const confirm = screen
      .getAllByRole('button', { name: T.confirmDelete })
      .filter((button) => !String(button.props.accessibilityLabel ?? '').startsWith('Supprimer la'))
      .at(-1)
    if (!confirm) throw new Error('no « Supprimer » in the window')
    for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
    await fireEvent.press(confirm)

    await waitFor(() => expect(screen.queryByText('Mise à jour numéro 2')).toBeNull())
    await act(async () => {})
    await waitFor(() =>
      expect(focusedLabels().some((label) => label.includes('Mise à jour numéro 3'))).toBe(true),
    )
  })

  it('offers another member no trash', async () => {
    seenByMax()
    await openPage()

    // Témoin : la frise est là.
    expect(screen.getByText('Mise à jour numéro 2')).toBeTruthy()
    expect(screen.queryByRole('button', { name: trashOf('Mise à jour numéro 2') })).toBeNull()
    expect(screen.queryByRole('button', { name: trashOf(rocketUpdate.title ?? '') })).toBeNull()
  })
})

// Relecture de l'interface de R7a (C3) : la frise a sa propre pastille « Suivre ce projet », qui doit
// suivre les mêmes règles que celle de la page du projet (tranche 7c, décision du 26/10/2026) : un
// compte suspendu peut retirer un abonnement, jamais en ajouter ; une fois retiré, la pastille reste
// à sa place, inactive.
describe('« Suivre ce projet » on the timeline of a suspended member', () => {
  const following = fr.t(($) => $.follow.projectFollowing)

  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
  })
  afterEach(() => {
    // Comme le faux du haut du fichier : pas de profil.
    jest.mocked(getMe).mockResolvedValue(null as never)
  })

  it('lets her stop following a project she follows', async () => {
    seenByMax({ ...withUpdates, isFollowed: true })
    await openPage()
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    await fireEvent.press(screen.getByRole('switch', { name: following }))

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('keeps it in place but inactive once she stopped following', async () => {
    seenByMax({ ...withUpdates, isFollowed: true })
    const { queryClient } = await openPage()
    // Le faux hook fait ce que fait le vrai au toucher : le projet n'est plus suivi, dans le cache.
    mockToggle.mockImplementation(() =>
      queryClient.setQueryData<Project>(projectQueryKey(id), (project) =>
        project ? { ...project, isFollowed: false } : project,
      ),
    )
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    await fireEvent.press(screen.getByRole('switch', { name: following }))

    const follow = await screen.findByRole('switch', { name: T.follow })
    expect(follow).toBeDisabled()
    await fireEvent.press(follow)
    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('offers no pastille at all for a project she does not follow', async () => {
    seenByMax()
    await openPage()
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    expect(screen.queryByRole('switch', { name: T.follow })).toBeNull()
  })
})
