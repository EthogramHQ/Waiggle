// Tests de la partie « Retours réglés » de la feuille « Nouvelle mise à jour » (R7b, planche validée
// « MAJ-Règles » ; juridique J9). Quand des testeurs ont envoyé des retours encore à traiter, l'auteur
// coche ceux que la mise à jour règle : ils partent avec elle (`settledFeedbackIds`), et leurs
// testeurs liront « Réglé dans la v1.3 ». Sans retour à traiter, la partie n'est pas là.
//
// Ce que ces tests supposent du code (plan R7b, « Écrans et modules ») : la feuille lit les retours
// à traiter par `useOpenFeedback` (GET /v1/projects/{id}/feedback/open, `OpenFeedbackList`, le plus
// récent en tête) ; chaque retour est une case (`checkbox`) nommée « Inès · En partie »
// (`settledField.item`) ; la publication envoie les cases cochées dans `settledFeedbackIds` ; l'API
// refuse un retour qui n'est plus à traiter (400 `invalid_feedback`) et ne publie rien.
//
// Fichier à part d'UpdateSheet.test.tsx (875 lignes) : il garde son propre faux serveur.
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
const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }))
const writeLine = () => fireEvent.changeText(screen.getByLabelText(lineName), 'Un mode nuit')
const publishedBodies = () => mockServer.received('POST', UPDATES).map((one) => one.body)

// --- Les tests ---

describe('the part « Retours réglés » of the sheet « Nouvelle mise à jour » (R7b)', () => {
  it('shows « Retours réglés » with one box per open feedback, named by tester and outcome', async () => {
    await openSheet()

    expect(await screen.findByText(T.settledTitle)).toBeTruthy()
    for (const one of [ines, hugo, malik]) expect(box(one)).toBeTruthy()
    // Aucune case cochée au départ : c'est l'auteur qui dit ce que la mise à jour règle.
    expect([ines, hugo, malik].some(checked)).toBe(false)
  })

  it('shows the boxes newest feedback first, as the API gives them', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)

    const names = screen.getAllByRole('checkbox').map((one) => one.props.accessibilityLabel)
    expect(names).toEqual([ines, hugo, malik].map(boxName))
  })

  // Juridique J9 : un ancien testeur ne lira rien ; l'aide le dit, et sa case le montre.
  it('says the settled feedback is shown only to current testers', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)

    expect(shown(T.settledHint)).toBe(true)
    expect(T.settledHint).toMatch(/testent encore/)
  })

  it('marks the feedback of a member who no longer tests « Ne teste plus »', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)

    expect(shown(T.former)).toBe(true)
    // Témoin : seule la case de Hugo le dit, les testeurs actuels non.
    expect(screen.queryAllByText(containing(T.former))).toHaveLength(1)
  })

  it('shows no « Retours réglés » when no feedback is open', async () => {
    mockServer.openFeedback = []
    await openSheet()
    await openFeedbackRead()

    // Témoin : la feuille est là, et elle a bien demandé les retours à traiter.
    expect(screen.getByRole('button', { name: T.publish })).toBeTruthy()
    expect(screen.queryByText(T.settledTitle)).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('checks and unchecks a feedback', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)

    await fireEvent.press(box(ines))
    expect(checked(ines)).toBe(true)
    await fireEvent.press(box(ines))
    expect(checked(ines)).toBe(false)
  })

  it('sends the checked feedback with the update, as settledFeedbackIds', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)
    await writeLine()
    await fireEvent.press(box(ines))
    await fireEvent.press(box(malik))

    await press(T.publish)

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    const sent = publishedBodies()[0] as { settledFeedbackIds?: string[] }
    expect([...(sent.settledFeedbackIds ?? [])].sort()).toEqual([ines.id, malik.id].sort())
    expect(await screen.findByText(T.published)).toBeTruthy()
  })

  it('settles nothing when no box is checked', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)
    await writeLine()

    await press(T.publish)

    await waitFor(() => expect(publishedBodies()).toHaveLength(1))
    const sent = publishedBodies()[0] as { settledFeedbackIds?: string[] }
    expect(sent.settledFeedbackIds ?? []).toEqual([])
  })

  it('asks before closing when only a feedback box was checked', async () => {
    await openSheet()
    await screen.findByText(T.settledTitle)
    await fireEvent.press(box(hugo))

    await press(T.cancel)

    // La case cochée est un changement : la feuille demande avant de l'abandonner.
    expect(await screen.findByRole('header', { name: T.discardTitle })).toBeTruthy()
  })

  it('says a feedback is no longer open on invalid_feedback, and keeps the sheet and its boxes', async () => {
    mockServer.answer('POST', UPDATES, () => ({ ok: false, error: 'invalidFeedback' }))
    await openSheet()
    await screen.findByText(T.settledTitle)
    await writeLine()
    await fireEvent.press(box(ines))

    await press(T.publish)

    expect(await screen.findByText(containing(T.invalidFeedback))).toBeTruthy()
    // Rien n'est publié : la feuille reste, avec la ligne et la case cochée.
    expect(screen.queryByText(T.published)).toBeNull()
    expect(screen.getByLabelText(lineName)).toHaveDisplayValue('Un mode nuit')
    expect(checked(ines)).toBe(true)
    expect(mockNav.router.back).not.toHaveBeenCalled()
  })

  it('lets at most 20 feedback be checked, the other boxes inactive', async () => {
    const many = Array.from({ length: SETTLED_PER_UPDATE_MAX + 1 }, (_, n) =>
      feedback(n + 10, `Testeur ${n + 1}`, 'yes', `Retour ${n + 1}`),
    )
    mockServer.openFeedback = many
    await openSheet()
    await screen.findByText(T.settledTitle)

    for (const one of many.slice(0, SETTLED_PER_UPDATE_MAX)) await fireEvent.press(box(one))

    const last = many.at(-1)
    if (!last) throw new Error('no last feedback')
    expect(box(last)).toBeDisabled()
    expect(shown(T.max)).toBe(true)
    // Témoin : une case cochée se décoche toujours.
    const first = many[0]
    if (!first) throw new Error('no first feedback')
    expect(box(first)).not.toBeDisabled()
  })

  it('does not read the open feedback of a project of another member', async () => {
    mockServer.project = { ...recipesProject, isMine: false }
    await render(<UpdateSheet id={id} />)

    // Témoin : la feuille refuse ce projet, qui n'est pas à Léa.
    expect(await screen.findByText(containing(T.notMine))).toBeTruthy()
    await act(async () => {})
    expect(mockServer.received('GET', OPEN_FEEDBACK)).toEqual([])
    expect(screen.queryByText(T.settledTitle)).toBeNull()
  })
})
