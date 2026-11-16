// Tests de « Mes retours envoyés » (tranche R11, planche R11-Mes-Retours), ouverte depuis Réglages,
// « Mes données » (/settings/data/feedback). Scénario : docs/scenarios/refonte.md, « R11 — La
// conformité », « Mes retours envoyés » : ses retours et messages du coin des testeurs, groupés par
// projet (ou « Projet qui n'est plus visible »), du plus récent au plus ancien, avec leur capture ;
// un coin fermé se relit ici en lecture seule (« Seuls tes messages restent ici. ») ; chaque
// message a « Supprimer » (sa capture part avec lui), comme dans le coin.
//
// Ce que ces tests supposent de l'écran (plan de R11, UI-F ; relecture de l'interface, U5) :
// - `MyTesterMessagesScreen`, sans props (`screens/MyTesterMessagesScreen.tsx`), page par défaut de
//   `app/settings/data/feedback.tsx` ;
// - il lit GET /v1/me/tester-messages (puis `?cursor=…`) (`useMyTesterMessages` de
//   `testers/corner-api.ts`) et supprime par la route du coin, DELETE
//   /v1/projects/{projectId}/messages/{messageId} : ces tests remplacent seulement le client réseau ;
// - les messages d'un même projet se suivent sous un seul titre de groupe (le titre du projet, ou
//   `myFeedback.projectGone`), les groupes dans l'ordre de leur message le plus récent ;
// - un coin ouvert a un lien `myFeedback.openCornerNamed` vers « /projects/<id>/testers » ; un coin
//   fermé dit `myFeedback.closed` et `closedNote`, sans ce lien ;
// - chaque « Supprimer » est nommé `myFeedback.deleteNamed` (son extrait) ; la fenêtre reprend les
//   textes du coin (`project.testers.thread.deleteTitle`, `deleteBody` ou `deleteBodyRemoved` avec le
//   nom de l'auteur du projet, `deleteConfirm`) ; pour un projet qu'on ne voit plus, `deleteBody` de
//   `myFeedback`, qui ne nomme personne.
import type { MyTesterMessage, MyTesterMessagesPage } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import MyFeedbackRoute from '../../app/settings/data/feedback'
import { request, requestWithoutBody } from '../api/client'
import type { ApiResult } from '../api/errors'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { MyTesterMessagesScreen } from './MyTesterMessagesScreen'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => Promise.resolve(null)) }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockBack = jest.fn()
let mockCanGoBack = true
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/data/feedback',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: mockBack,
    dismissTo: mockReplace,
    canGoBack: () => mockCanGoBack,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

// --- Les textes ----------------------------------------------------------------------------------

const T = {
  title: fr.t(($) => $.myFeedback.title),
  empty: fr.t(($) => $.myFeedback.empty),
  projectGone: fr.t(($) => $.myFeedback.projectGone),
  closed: fr.t(($) => $.myFeedback.closed),
  closedNote: fr.t(($) => $.myFeedback.closedNote),
  goneBody: fr.t(($) => $.myFeedback.deleteBody),
  goneBodyRemoved: fr.t(($) => $.myFeedback.deleteBodyRemoved),
  more: fr.t(($) => $.myFeedback.more),
  loadError: fr.t(($) => $.myFeedback.loadError),
  deleteTitle: fr.t(($) => $.project.testers.thread.deleteTitle),
  deleteConfirm: fr.t(($) => $.project.testers.thread.deleteConfirm),
  deleteError: fr.t(($) => $.project.testers.thread.deleteError),
  capture: fr.t(($) => $.project.testers.feedback.captureNameMine),
  back: fr.t(($) => $.common.back),
}
const cornerName = (title: string) => fr.t(($) => $.myFeedback.openCornerNamed, { title })
const deleteName = (excerpt: string) => fr.t(($) => $.myFeedback.deleteNamed, { excerpt })
const cornerBody = (name: string) => fr.t(($) => $.project.testers.thread.deleteBody, { name })
const removedBody = (name: string) =>
  fr.t(($) => $.project.testers.thread.deleteBodyRemoved, { name })

const named = (text: string) => new RegExp(`^${containing(text).source}$`)
const control = (name: string) =>
  screen.queryByRole('link', { name: named(name) }) ??
  screen.getByRole('button', { name: named(name) })

// --- Les données : Max, testeur de trois projets ---------------------------------------------------

const jardin = {
  id: '5d2c9e41-7a0b-4e6f-8c3d-1b9a00000001',
  title: 'Le jardin qui parle',
  cover: null,
  author: { name: 'Papi Jean' },
}
const recettes = {
  id: '5d2c9e41-7a0b-4e6f-8c3d-1b9a00000002',
  title: 'Mes recettes du dimanche',
  cover: null,
  author: { name: 'Hugo Lefèvre' },
}
const goneProjectId = '5d2c9e41-7a0b-4e6f-8c3d-1b9a00000003'

const capture = {
  id: '9e7d6c5b-4a39-4281-9f0e-000000000001',
  url: 'https://api.example.test/v1/tester-media/9e7d6c5b-4a39-4281-9f0e-000000000001',
  width: 1170,
  height: 2532,
  thumbhash: null,
  description: null,
}

const message = (
  over: Partial<MyTesterMessage> & Pick<MyTesterMessage, 'id' | 'text'>,
): MyTesterMessage => ({
  projectId: jardin.id,
  project: jardin,
  closed: false,
  kind: 'feedback',
  outcome: 'partly',
  device: 'phone',
  createdAt: '2026-11-14T18:00:00.000Z',
  media: null,
  removed: false,
  ...over,
})

// Liste à plat, la plus récente d'abord, comme l'API la rend : l'écran regroupe par projet.
const jardinFeedback = message({
  id: '0f1e2d3c-4b5a-4968-8776-000000000001',
  text: 'La voix se coupe quand je change de page.',
  media: capture,
})
const recettesFeedback = message({
  id: '0f1e2d3c-4b5a-4968-8776-000000000002',
  projectId: recettes.id,
  project: recettes,
  closed: true,
  text: 'Les quantités ne suivent pas le nombre de parts.',
  createdAt: '2026-11-13T10:00:00.000Z',
})
const jardinReply = message({
  id: '0f1e2d3c-4b5a-4968-8776-000000000003',
  kind: 'reply',
  outcome: null,
  device: null,
  text: 'Oui, sur Android aussi.',
  createdAt: '2026-11-12T08:00:00.000Z',
})
const goneFeedback = message({
  id: '0f1e2d3c-4b5a-4968-8776-000000000004',
  projectId: goneProjectId,
  project: null,
  closed: true,
  text: 'Le bouton Valider ne répond pas.',
  createdAt: '2026-11-10T21:00:00.000Z',
})

const cursor = 'eyJhdCI6IjIwMjYifQ'

// --- Le faux serveur -----------------------------------------------------------------------------

let firstPage: MyTesterMessagesPage
let nextPage: MyTesterMessagesPage
let firstRead: () => Promise<ApiResult<MyTesterMessagesPage>>
let nextDelete: (() => Promise<ApiResult<null>>) | null
const sent: { method: string; path: string }[] = []

const fakeRequest = async (to: string, init: RequestInit = {}) => {
  sent.push({ method: init.method ?? 'GET', path: to })
  if (to === '/v1/me') return { ok: true, data: leaMe } as const
  if (to.startsWith('/v1/me/tester-messages') && (init.method ?? 'GET') === 'GET') {
    return to.includes('cursor=') ? ({ ok: true, data: nextPage } as const) : firstRead()
  }
  return { ok: false, error: 'notFound' } as const
}
const fakeRequestWithoutBody = async (to: string, init: RequestInit = {}) => {
  sent.push({ method: init.method ?? 'GET', path: to })
  if (init.method === 'DELETE' && /^\/v1\/projects\/[^/]+\/messages\/[^/]+$/.test(to)) {
    return nextDelete ? nextDelete() : ({ ok: true, data: null } as const)
  }
  return { ok: false, error: 'notFound' } as const
}
const deletes = () => sent.filter((one) => one.method === 'DELETE').map((one) => one.path)
const deletePath = (one: MyTesterMessage) => `/v1/projects/${one.projectId}/messages/${one.id}`

beforeEach(() => {
  firstPage = {
    items: [jardinFeedback, recettesFeedback, jardinReply, goneFeedback],
    nextCursor: null,
  }
  nextPage = { items: [], nextCursor: null }
  firstRead = async () => ({ ok: true, data: firstPage })
  nextDelete = null
  sent.length = 0
  mockCanGoBack = true
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation(fakeRequestWithoutBody as typeof requestWithoutBody)
  mockSession({ user: { id: 'u-max', name: 'Max' } })
  for (const mock of [mockPush, mockReplace, mockNavigate, mockBack]) mock.mockReset()
})

const paths = () =>
  [mockPush, mockReplace, mockNavigate].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )

type TreeNode = { children: (TreeNode | string)[] }
const readingOrder = (...elements: unknown[]) => {
  const all: unknown[] = []
  const walk = (node: TreeNode) => {
    all.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => all.indexOf(element))
}
const inOrder = (places: number[]) =>
  places.every((place) => place >= 0) &&
  places.every((place, i) => i === 0 || place > (places[i - 1] as number))

const openPage = async () => {
  await renderWithProviders(<MyTesterMessagesScreen />)
  await screen.findAllByText(containing(jardinFeedback.text ?? ''))
}

const askToDelete = async (one: MyTesterMessage) => {
  await fireEvent.press(screen.getByRole('button', { name: named(deleteName(one.text ?? '')) }))
  await screen.findByRole('header', { name: T.deleteTitle })
  await passTapGuard()
}
const confirmButton = () => screen.getByRole('button', { name: named(T.deleteConfirm) })

// --- La liste ------------------------------------------------------------------------------------

describe('MyTesterMessagesScreen, the list', () => {
  it('is the page of the /settings/data/feedback address', () => {
    expect(MyFeedbackRoute).toBe(MyTesterMessagesScreen)
  })

  it('groups my messages by project, newest first, the project with the newest message on top', async () => {
    await openPage()

    expect(screen.getByRole('header', { name: T.title })).toBeTruthy()
    // Un seul titre par projet, même quand ses messages ne se suivent pas dans la liste reçue.
    expect(screen.getAllByText(jardin.title)).toHaveLength(1)
    expect(screen.getAllByText(recettes.title)).toHaveLength(1)
    const text = (one: MyTesterMessage) => screen.getAllByText(containing(one.text ?? ''))[0]
    expect(
      inOrder(
        readingOrder(
          screen.getByText(jardin.title),
          text(jardinFeedback),
          text(jardinReply),
          screen.getByText(recettes.title),
          text(recettesFeedback),
          screen.getByText(T.projectGone),
          text(goneFeedback),
        ),
      ),
    ).toBe(true)
    expect(sent).toContainEqual({ method: 'GET', path: '/v1/me/tester-messages' })
  })

  it('shows the capture of a message, named by a fixed sentence', async () => {
    await openPage()

    // Comme dans le coin (TestersCornerScreen.test) : la capture se trouve par son nom lu.
    const images = screen.getAllByLabelText(T.capture)
    expect(images.length).toBeGreaterThan(0)
  })

  it('says « Projet qui n’est plus visible » for a project I no longer see, and names nobody', async () => {
    await openPage()

    expect(screen.getAllByText(T.projectGone)).toHaveLength(1)
    expect(screen.getAllByText(containing(goneFeedback.text ?? ''))).toBeTruthy()
    // Un projet qu'il ne voit plus n'a pas de coin où entrer.
    expect(screen.queryByRole('link', { name: containing(goneFeedback.text ?? '') })).toBeNull()
  })

  it('opens the corner of a project whose corner is still open', async () => {
    await openPage()

    await fireEvent.press(control(cornerName(jardin.title)))

    expect(paths()).toEqual([`/projects/${jardin.id}/testers`])
  })

  it('says a closed corner is read-only, keeps only my messages, and offers no way in', async () => {
    await openPage()

    // Le coin de « Mes recettes du dimanche » est fermé ; celui du projet parti aussi.
    expect(screen.getAllByText(T.closed).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(T.closedNote).length).toBeGreaterThanOrEqual(1)
    // Témoin : le coin ouvert a son lien.
    expect(control(cornerName(jardin.title))).toBeTruthy()
    expect(screen.queryByRole('link', { name: named(cornerName(recettes.title)) })).toBeNull()
    expect(screen.queryByRole('button', { name: named(cornerName(recettes.title)) })).toBeNull()
  })

  it('loads the list by pages', async () => {
    firstPage = { items: [jardinFeedback], nextCursor: cursor }
    nextPage = { items: [goneFeedback], nextCursor: null }
    await openPage()
    expect(screen.queryByText(containing(goneFeedback.text ?? ''))).toBeNull()

    await fireEvent.press(control(T.more))

    expect(await screen.findAllByText(containing(goneFeedback.text ?? ''))).toBeTruthy()
    expect(sent).toContainEqual({ method: 'GET', path: `/v1/me/tester-messages?cursor=${cursor}` })
  })

  it('says so when I have sent no feedback', async () => {
    firstPage = { items: [], nextCursor: null }
    await renderWithProviders(<MyTesterMessagesScreen />)

    expect(await screen.findByText(T.empty)).toBeTruthy()
  })

  it('says the list could not be loaded', async () => {
    firstRead = async () => ({ ok: false, error: 'internal' })
    await renderWithProviders(<MyTesterMessagesScreen />)

    expect(await screen.findAllByText(containing(T.loadError))).toBeTruthy()
  })

  it('goes back to Mes données when there is no page before', async () => {
    mockCanGoBack = false
    await openPage()

    await fireEvent.press(control(T.back))

    expect(paths()).toContain('/settings/data')
  })
})

// --- Supprimer -----------------------------------------------------------------------------------

describe('MyTesterMessagesScreen, deleting', () => {
  it('asks with the sentence of the corner, naming the author of the project, then deletes through the route of the corner', async () => {
    await openPage()

    await askToDelete(jardinFeedback)
    expect(screen.getAllByText(containing(cornerBody(jardin.author.name)))).toBeTruthy()
    expect(deletes()).toEqual([])
    await fireEvent.press(confirmButton())

    await waitFor(() => expect(deletes()).toEqual([deletePath(jardinFeedback)]))
    await waitFor(() =>
      expect(screen.queryByText(containing(jardinFeedback.text ?? ''))).toBeNull(),
    )
    expect(screen.getAllByText(containing(jardinReply.text ?? ''))).toBeTruthy()
  })

  it('deletes a message in a closed corner too', async () => {
    await openPage()

    await askToDelete(recettesFeedback)
    await fireEvent.press(confirmButton())

    await waitFor(() => expect(deletes()).toEqual([deletePath(recettesFeedback)]))
  })

  // Relecture de l'interface du plan de R11 (U5), mot pour mot.
  it('deletes a message on a project no longer visible with a sentence that names nobody', async () => {
    await openPage()

    await askToDelete(goneFeedback)
    expect(screen.getByText(T.goneBody)).toBeTruthy()
    // Ni la phrase du coin, qui nommerait l'auteur, ni sa variante sans nom (« pour  aussi »).
    for (const name of [jardin.author.name, recettes.author.name, '']) {
      expect(screen.queryByText(containing(cornerBody(name)))).toBeNull()
    }
    await fireEvent.press(confirmButton())

    await waitFor(() => expect(deletes()).toEqual([deletePath(goneFeedback)]))
  })

  it('says what the moderation keeps before deleting a removed message', async () => {
    const removed = { ...jardinFeedback, removed: true, media: null }
    firstPage = { items: [removed], nextCursor: null }
    await openPage()

    await askToDelete(removed)

    expect(screen.getAllByText(containing(removedBody(jardin.author.name)))).toBeTruthy()
  })

  it('says what the moderation keeps when a removed message belongs to a project no longer visible', async () => {
    const removedGone = { ...goneFeedback, removed: true }
    firstPage = { items: [jardinFeedback, removedGone], nextCursor: null }
    await openPage()

    await askToDelete(removedGone)

    expect(screen.getByText(T.goneBodyRemoved)).toBeTruthy()
    expect(screen.queryByText(T.goneBody)).toBeNull()
  })

  it('describes each Supprimer by its excerpt', async () => {
    await openPage()

    for (const one of [jardinFeedback, jardinReply, recettesFeedback, goneFeedback]) {
      expect(screen.getByRole('button', { name: named(deleteName(one.text ?? '')) })).toBeTruthy()
    }
  })

  it('keeps the message, and says so, when it could not be deleted', async () => {
    nextDelete = async () => ({ ok: false, error: 'internal' })
    await openPage()

    await askToDelete(jardinFeedback)
    await fireEvent.press(confirmButton())

    expect(await screen.findAllByText(containing(T.deleteError))).toBeTruthy()
    expect(screen.getAllByText(containing(jardinFeedback.text ?? '')).length).toBeGreaterThan(0)
  })
})
