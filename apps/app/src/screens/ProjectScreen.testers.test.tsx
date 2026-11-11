// Tests des testeurs dans le menu « … » de la page d'un projet (R7b, ProjectScreen) :
// - pour un testeur, « Quitter les testeurs » (juridique J1 : partir reste possible depuis la page,
//   qui reste visible même quand le coin se ferme), avec sa confirmation (juridique J5) : « Quitter
//   les testeurs de « Mon agent de recettes » ? », ce qui reste chez l'auteur, « Quitter » et
//   « Annuler » ;
// - pour l'auteur, « Le coin des testeurs », qui mène à la page du coin.
// Les vrais hooks des testeurs (`testers/api.ts`) tournent sur un faux réseau (`requestWithoutBody`) ;
// le projet est relu par `getProject`, qui rend ce que le faux serveur sait.
import type { Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { requestWithoutBody } from '../api/client'
import { getMe } from '../profile/api'
import { getProject } from '../projects/api'
import { passTapGuard } from '../testing/dialog'
import { suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectScreen } from './ProjectScreen'
import { dialogTitled, id, mockPush, resetProjectScreenMocks } from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => {
  const actual: typeof import('../api/client') = jest.requireActual('../api/client')
  const { categoryList }: typeof import('../testing/categories') =
    jest.requireActual('../testing/categories')
  return {
    ...actual,
    request: jest.fn((...args: Parameters<typeof actual.request>) =>
      String(args[0]).startsWith('/v1/categories')
        ? Promise.resolve({ ok: true, data: categoryList('fr') })
        : actual.request(...args),
    ),
    // Rejoindre et quitter les testeurs : le faux serveur ci-dessous.
    requestWithoutBody: jest.fn(),
  }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    navigate: mockPush,
    replace: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}))

const QUIT = fr.t(($) => $.project.testers.quit)
const CORNER = fr.t(($) => $.project.testers.corner)
const JOIN = fr.t(($) => $.project.testers.join)
const { title } = recipesProject
const quitTitle = fr.t(($) => $.project.testers.quitTitle, { title })
const quitBody = fr.t(($) => $.project.testers.quitBody, { name: 'Léa' })
const quitConfirm = fr.t(($) => $.project.testers.quitConfirm)

/** Le projet de Léa, vu par Inès, qui le teste. */
const testedByInes: Project = {
  ...recipesProject,
  isMine: false,
  isTester: true,
  testerCount: null,
  testerJoinable: true,
}

/** Ce que le faux serveur sait du projet : la page le relit après chaque geste. */
let server: Project = testedByInes
const testerRequests = () =>
  jest
    .mocked(requestWithoutBody)
    .mock.calls.filter(([path]) => String(path) === `/v1/projects/${id}/testers`)
    .map(([, init]) => init?.method)

const renderPage = async (project: Project) => {
  server = project
  return renderWithProviders(
    <ToastProvider>
      <ProjectScreen id={id} />
    </ToastProvider>,
  )
}

/** Ouvre le menu « … » de la page (« Plus d'actions »). */
const openMenu = async () =>
  fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.actionMenu.label) }))

/** « Quitter les testeurs » du menu, puis la fenêtre de confirmation, sa garde passée. */
const askToQuit = async () => {
  await openMenu()
  await fireEvent.press(screen.getByRole('menuitem', { name: QUIT }))
  expect(await screen.findByRole('header', { name: quitTitle })).toBeTruthy()
  await passTapGuard()
}

/** Les adresses où la page a mené, en texte. */
const visitedPaths = () =>
  mockPush.mock.calls.map(([to]) => {
    if (typeof to === 'string') return to
    const { pathname, params } = to as { pathname: string; params?: Record<string, string> }
    return Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`[${key}]`, value),
      pathname,
    )
  })

beforeEach(() => {
  resetProjectScreenMocks()
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest.mocked(getProject).mockImplementation(async () => server)
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation(async (_path, init) => {
      server = { ...server, isTester: init?.method === 'POST' }
      return { ok: true, data: null }
    })
})

describe('« Quitter les testeurs » in the « … » menu of the page (R7b, juridique J1 and J5)', () => {
  it('offers « Quitter les testeurs » in the menu to a tester', async () => {
    await renderPage(testedByInes)

    await openMenu()

    // Témoin : « Signaler ce projet » est là, comme pour tout autre membre.
    expect(screen.getByRole('menuitem', { name: fr.t(($) => $.report.project) })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: QUIT })).toBeTruthy()
  })

  it('offers no « Quitter les testeurs » to a member who does not test the project', async () => {
    await renderPage({ ...testedByInes, isTester: false })

    await openMenu()

    expect(screen.getByRole('menuitem', { name: fr.t(($) => $.report.project) })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: QUIT })).toBeNull()
  })

  it('asks before quitting, saying the feedback stays readable by the author', async () => {
    await renderPage(testedByInes)

    await askToQuit()

    const dialog = dialogTitled(quitTitle)
    expect(dialog.getByText(containing(quitBody))).toBeTruthy()
    expect(quitBody).toMatch(/restent lisibles par Léa/)
    expect(dialog.getByRole('button', { name: quitConfirm })).toBeTruthy()
    expect(dialog.getByRole('button', { name: 'Annuler' })).toBeTruthy()
    // Demander n'est pas partir.
    expect(testerRequests()).toEqual([])
  })

  it('quits on « Quitter »: one request, a bubble, and « Rejoindre les testeurs » again', async () => {
    await renderPage(testedByInes)
    await askToQuit()

    await fireEvent.press(dialogTitled(quitTitle).getByRole('button', { name: quitConfirm }))

    expect(testerRequests()).toEqual(['DELETE'])
    expect(
      await screen.findByText(fr.t(($) => $.project.testers.quitToast, { title })),
    ).toBeTruthy()
    expect(await screen.findByRole('button', { name: JOIN })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('header', { name: quitTitle })).toBeNull())
  })

  it('stays a tester on « Annuler »', async () => {
    await renderPage(testedByInes)
    await askToQuit()

    await fireEvent.press(dialogTitled(quitTitle).getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByRole('header', { name: quitTitle })).toBeNull())
    expect(testerRequests()).toEqual([])
  })

  it('sends one request on a double tap on « Quitter »', async () => {
    jest.mocked(requestWithoutBody).mockImplementation(() => new Promise(() => {}))
    await renderPage(testedByInes)
    await askToQuit()

    const confirm = dialogTitled(quitTitle).getByRole('button', { name: quitConfirm })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(testerRequests()).toEqual(['DELETE'])
  })

  it('says the departure failed, and stays a tester', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    await renderPage(testedByInes)
    await askToQuit()

    await fireEvent.press(dialogTitled(quitTitle).getByRole('button', { name: quitConfirm }))

    expect(
      (await screen.findAllByText(containing(fr.t(($) => $.project.testers.quitError)))).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  // Juridique J1 (plan R7b validé du 11/11/2026) : la page du projet reste visible quand le coin se ferme
  // (auteur suspendu, que l'appli ne connaît pas ici) ; partir y reste possible. Un testeur suspendu
  // part aussi (R7a : ce qui permet de partir ne tombe pas avec le droit d'entrer).
  it('lets a suspended tester quit from the menu', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...suspendedMe, id: 'u3', name: 'Inès' })
    await renderPage(testedByInes)
    await waitFor(() => expect(getMe).toHaveBeenCalled())

    await askToQuit()
    await fireEvent.press(dialogTitled(quitTitle).getByRole('button', { name: quitConfirm }))

    expect(testerRequests()).toEqual(['DELETE'])
  })

  it.each(['paused', 'done'] as const)(
    'lets a tester quit a project that no longer looks for testers (%s)',
    async (status) => {
      await renderPage({ ...testedByInes, status })

      await askToQuit()
      await fireEvent.press(dialogTitled(quitTitle).getByRole('button', { name: quitConfirm }))

      expect(testerRequests()).toEqual(['DELETE'])
    },
  )
})

describe('« Le coin des testeurs » in the « … » menu of the author (R7b)', () => {
  const mine: Project = { ...recipesProject, isMine: true, testerCount: 12 }

  beforeEach(() => mockSession({ user: { id: 'u1', name: 'Léa' } }))

  it('offers the author « Le coin des testeurs », which opens the corner', async () => {
    await renderPage(mine)

    await openMenu()
    await fireEvent.press(screen.getByRole('menuitem', { name: CORNER }))

    expect(visitedPaths()).toContain(`/projects/${id}/testers`)
  })

  it('offers the author no « Quitter les testeurs »', async () => {
    await renderPage(mine)

    await openMenu()

    // Témoin : « Modifier » est dans le menu de l'auteur.
    expect(screen.getByRole('menuitem', { name: fr.t(($) => $.project.page.edit) })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: QUIT })).toBeNull()
  })

  it('offers no corner in the menu of a project that never looked for testers', async () => {
    await renderPage({ ...mine, status: 'idea', testerCount: 0 })

    await openMenu()

    expect(screen.getByRole('menuitem', { name: fr.t(($) => $.project.page.edit) })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: CORNER })).toBeNull()
  })

  it('keeps « Le coin des testeurs » out of the menu of a tester', async () => {
    mockSession({ user: { id: 'u3', name: 'Inès' } })
    await renderPage(testedByInes)

    await openMenu()

    expect(screen.getByRole('menuitem', { name: QUIT })).toBeTruthy()
    // Le testeur a son lien sur la page, sous « Suivre ce projet » ; pas dans le menu.
    expect(screen.queryByRole('menuitem', { name: CORNER })).toBeNull()
  })
})
