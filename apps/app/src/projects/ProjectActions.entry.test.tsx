// Tests ajoutés avec l'écriture des entrées du coin des testeurs (R7b), à côté de
// ProjectActions.testers.test.tsx :
// - l'arrivée sur la page d'un projet par `?focus=join`, que pose le coin après « Quitter les
//   testeurs » (interface B6) : le focus va sur « Rejoindre les testeurs », ou sur « Suivre ce
//   projet » quand on ne peut plus rejoindre ; le paramètre quitte ensuite l'adresse (`setParams`) ;
// - la double tape sur « Le coin des testeurs » n'empile pas deux fois la page du coin.
// Sur téléphone (le cas de Jest), `focusWithoutScroll` ne fait rien : le lecteur d'écran est amené
// sur l'élément par `moveReaderTo`, dont ces tests lisent les appels.
import type { Project } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { labelOf } from '../testing/arrivedFocus'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectActions } from './ProjectActions'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Le routeur et les paramètres de l'adresse : le test choisit `mockParams` avant le rendu.
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
}
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}))
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return { ...actual, moveReaderTo: jest.fn((node: unknown) => actual.moveReaderTo(node)) }
})

const JOIN = fr.t(($) => $.project.testers.join)
const CORNER = fr.t(($) => $.project.testers.corner)
const FOLLOW = fr.t(($) => $.follow.project)

/** Le projet de Léa, vu par Inès, qui vient de quitter ses testeurs. */
const seenByInes: Project = {
  ...recipesProject,
  isMine: false,
  isFollowed: false,
  followerCount: 2,
  isTester: false,
  testerCount: null,
  testerJoinable: true,
}

function OnPage({ project }: { project: Project }) {
  const { data } = useQuery({
    queryKey: ['project', project.id],
    queryFn: () => Promise.resolve(project),
    initialData: project,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return <ProjectActions project={data} onOpenDemo={jest.fn()} onEdit={jest.fn()} />
}

const renderPage = (project: Project) =>
  renderWithProviders(
    <ToastProvider>
      <OnPage project={project} />
    </ToastProvider>,
  )

/** Les noms des éléments où le lecteur d'écran a été amené, dans l'ordre. */
const readerWentTo = () => jest.mocked(moveReaderTo).mock.calls.map(([node]) => labelOf(node))

beforeEach(() => {
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  for (const fn of Object.values(mockRouter)) fn.mockClear()
  jest.mocked(moveReaderTo).mockClear()
  mockParams = {}
})

describe('the arrival from the testers corner, ?focus=join (R7b, interface B6)', () => {
  it('moves the focus to « Rejoindre les testeurs » and takes the parameter out of the address', async () => {
    mockParams = { focus: 'join' }
    await renderPage(seenByInes)

    await waitFor(() => expect(readerWentTo()).toEqual([JOIN]))
    expect(mockRouter.setParams).toHaveBeenCalledWith({ focus: undefined })
  })

  it.each([
    ['a project that no longer looks for testers', { status: 'paused' }],
    ['a member the author removed', { testerJoinable: false }],
  ] as const)('moves the focus to « Suivre ce projet » on %s', async (_case, change) => {
    mockParams = { focus: 'join' }
    await renderPage({ ...seenByInes, ...change })

    await waitFor(() => expect(readerWentTo()).toEqual([FOLLOW]))
    // Témoin : « Rejoindre les testeurs » n'est pas proposé.
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  it('moves no focus and leaves the address alone without the parameter', async () => {
    await renderPage(seenByInes)

    // Témoin : la page est là.
    expect(screen.getByRole('button', { name: JOIN })).toBeTruthy()
    await act(async () => {})
    expect(readerWentTo()).toEqual([])
    expect(mockRouter.setParams).not.toHaveBeenCalled()
  })

  it('ignores another value of the parameter', async () => {
    mockParams = { focus: 'nimporte' }
    await renderPage(seenByInes)

    expect(screen.getByRole('button', { name: JOIN })).toBeTruthy()
    await act(async () => {})
    expect(readerWentTo()).toEqual([])
  })
})

describe('« Le coin des testeurs » against a double tap (R7b)', () => {
  it('opens the corner once on a double tap', async () => {
    await renderPage({ ...seenByInes, isTester: true })

    // Un lien depuis la correction 7 de R7b (interface A10) : il mène à une autre page.
    const corner = screen.getByRole('link', { name: CORNER })
    await fireEvent.press(corner)
    await fireEvent.press(corner)

    expect(mockRouter.push).toHaveBeenCalledTimes(1)
  })
})
