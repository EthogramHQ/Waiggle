// Tests de la partie « Retours réglés » quand la liste des retours à traiter ne se lit pas, ou
// change (R7b) : la panne se dit à la place de la partie, avec « Réessayer » (décision du
// 11/11/2026 : jamais tue) ; un coin fermé (409 `corner_closed`) ne montre ni partie ni panne ; après
// un refus `invalid_feedback`, la feuille relit la liste, et la case d'un retour qui n'est plus à
// traiter s'en va, sans partir avec la publication suivante.
//
// Le faux serveur et les aides sont repris d'UpdateSheet.settled.test.tsx (un `jest.mock` par
// fichier).
import type { Me, OpenFeedback, Project, ProjectUpdate } from '@ruche/contracts'
import { SETTLED_PER_UPDATE_MAX } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import type { ApiResult } from '../api/errors'
import type { PickedImage } from '../media/pick'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { ToastProvider } from '../ui/theme/toast'
import { UpdateSheet } from './UpdateSheet'

// --- Le faux serveur ---

type Sent = { method: string; path: string; body: unknown }
type Answer = ApiResult<unknown> | Promise<ApiResult<unknown>>

const { id } = recipesProject
const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })

const UPDATES = /^\/v1\/projects\/[^/]+\/updates$/
const OPEN_FEEDBACK = /^\/v1\/projects\/[^/]+\/feedback\/open$/

/** Un retour à traiter : son testeur, son issue, son extrait. */
const feedback = (
  n: number,
  name: string,
  outcome: OpenFeedback['outcome'],
  excerpt: string | null,
  current = true,
): OpenFeedback => ({
  id: `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`,
  tester: { name, current },
  outcome,
  excerpt,
  createdAt: `2026-11-${String(10 - (n % 9)).padStart(2, '0')}T09:00:00.000Z`,
})

/** Les retours à traiter du projet de Léa : Inès, Hugo (qui ne teste plus), Malik. */
const ines = feedback(1, 'Inès', 'partly', 'Le score repart à zéro au niveau 3')
const hugo = feedback(2, 'Hugo', 'no', 'Rien ne s’affiche sur ma tablette', false)
const malik = feedback(3, 'Malik', 'yes', null)

const mockServer = {
  sent: [] as Sent[],
  me: leaMe as Me,
  project: recipesProject as Project,
  openFeedback: [ines, hugo, malik] as OpenFeedback[],
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],
  reset() {
    this.sent = []
    this.me = leaMe
    this.project = recipesProject
    this.openFeedback = [ines, hugo, malik]
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
    if (method === 'GET' && OPEN_FEEDBACK.test(path)) return ok(this.openFeedback)
    if (method === 'POST' && UPDATES.test(path)) {
      const published: ProjectUpdate = {
        ...rocketUpdate,
        id: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
        photos: [],
        beforeAfter: false,
        createdAt: new Date().toISOString(),
      }
      return ok(published)
    }
    return { ok: false, error: 'notFound' }
  },
}

// --- La navigation ---

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
  navigation: {
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  params: {} as Record<string, string>,
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
  pickVisuals: async (
    _slot: string,
    _remaining: number,
    _onChosen: (i: PickedImage[]) => void,
  ) => [],
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
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockNav.router.canGoBack.mockImplementation(() => true)
  mockNav.params = { id }
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
})

// --- Les textes ---

const T = {
  titleField: fr.t(($) => $.project.updates.titleField),
  cancel: fr.t(($) => $.project.updates.cancel),
  publish: fr.t(($) => $.project.updates.publish),
  published: fr.t(($) => $.project.updates.published),
  discardTitle: fr.t(($) => $.project.updates.discardTitle),
  notMine: fr.t(($) => $.states.notMineTitle),
  settledTitle: fr.t(($) => $.project.testers.settledField.title),
  settledHint: fr.t(($) => $.project.testers.settledField.hint),
  former: fr.t(($) => $.project.testers.settledField.former),
  max: fr.t(($) => $.project.testers.settledField.max, { max: SETTLED_PER_UPDATE_MAX }),
  invalidFeedback: fr.t(($) => $.errors.invalidFeedback),
}
/** Le nom d'une case : « Inès · En partie ». */
const boxName = (one: OpenFeedback) =>
  fr.t(($) => $.project.testers.settledField.item, {
    name: one.tester.name,
    outcome: fr.t(($) => $.project.testers.feedback.outcomes[one.outcome]),
  })
const lineName = fr.t(($) => $.project.updates.lineLabel, {
  number: 1,
  total: 1,
  family: fr.t(($) => $.update.family.new),
})

// --- Ouvrir la feuille et les gestes ---

const render = (ui: ReactElement) => renderWithProviders(<ToastProvider>{ui}</ToastProvider>)

/** Ouvre la feuille, attend le formulaire, puis la fin de la garde des tapes. */
const openSheet = async () => {
  await render(<UpdateSheet id={id} />)
  await screen.findByLabelText(T.titleField)
  await passTapGuard()
}

/** Attend que la feuille ait lu les retours à traiter, puis que l'écran l'ait affiché. */
const openFeedbackRead = async () => {
  await waitFor(() => expect(mockServer.received('GET', OPEN_FEEDBACK).length).toBeGreaterThan(0))
  await act(async () => {})
}

const box = (one: OpenFeedback) => screen.getByRole('checkbox', { name: boxName(one) })
const checked = (one: OpenFeedback) => box(one).props.accessibilityState?.checked === true
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }))
const writeLine = () => fireEvent.changeText(screen.getByLabelText(lineName), 'Un mode nuit')
const publishedBodies = () => mockServer.received('POST', UPDATES).map((one) => one.body)

const loadError = fr.t(($) => $.project.testers.settledField.loadError)
const retry = fr.t(($) => $.common.retry)

describe('the part « Retours réglés » when the open feedback fails or changes (R7b)', () => {
  it('says the open feedback could not load, then shows the boxes after « Réessayer »', async () => {
    let fails = true
    mockServer.answer('GET', OPEN_FEEDBACK, () =>
      fails ? { ok: false, error: 'internal' } : ok(mockServer.openFeedback),
    )
    await openSheet()

    expect(await screen.findByText(containing(loadError))).toBeTruthy()
    expect(screen.queryByText(T.settledTitle)).toBeNull()

    fails = false
    await press(retry)

    expect(await screen.findByText(T.settledTitle)).toBeTruthy()
    expect(box(ines)).toBeTruthy()
    expect(screen.queryByText(containing(loadError))).toBeNull()
  })

  it('shows neither the part nor an error when the corner is closed', async () => {
    mockServer.answer('GET', OPEN_FEEDBACK, () => ({ ok: false, error: 'cornerClosed' }))
    await openSheet()
    await openFeedbackRead()

    // Témoin : la feuille est là, et elle a demandé les retours à traiter.
    expect(screen.getByRole('button', { name: T.publish })).toBeTruthy()
    expect(screen.queryByText(T.settledTitle)).toBeNull()
    expect(screen.queryByText(containing(loadError))).toBeNull()
  })

  it('reads the list again on invalid_feedback and drops the box of a feedback no longer open', async () => {
    mockServer.answer('POST', UPDATES, () => ({ ok: false, error: 'invalidFeedback' }))
    await openSheet()
    await screen.findByText(T.settledTitle)
    await writeLine()
    await fireEvent.press(box(ines))
    await fireEvent.press(box(malik))
    const readsBefore = mockServer.received('GET', OPEN_FEEDBACK).length

    // Pendant ce temps, Inès a supprimé son retour : il n'est plus à traiter.
    mockServer.openFeedback = [hugo, malik]
    await press(T.publish)

    expect(await screen.findByText(containing(T.invalidFeedback))).toBeTruthy()
    await waitFor(() =>
      expect(mockServer.received('GET', OPEN_FEEDBACK).length).toBeGreaterThan(readsBefore),
    )
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: boxName(ines) })).toBeNull())
    // La case de Malik reste cochée : rien de ce que l'auteur a choisi d'autre ne se perd.
    expect(checked(malik)).toBe(true)

    // Le serveur publie, cette fois (sa réponse ordinaire).
    mockServer.overrides = []
    await press(T.publish)

    await waitFor(() => expect(publishedBodies()).toHaveLength(2))
    const sent = publishedBodies()[1] as { settledFeedbackIds?: string[] }
    expect(sent.settledFeedbackIds).toEqual([malik.id])
  })
})
