// Tests ajoutés en R7a (U5a), à côté de ceux de ProjectActions.testers.test.tsx, et adaptés en R7b :
// les cas que l'écriture du bouton des testeurs a fait naître.
// - Après un départ qu'on ne peut plus défaire (projet qui ne cherche plus de testeurs, compte
//   suspendu), le bouton reste à sa place, inactif : le focus, rendu à la page, ne doit pas tomber
//   sur un bouton disparu (comme « Suivre ce projet », tranche 7c). R7b : on ne quitte plus depuis
//   une feuille de ce bouton (il mène au coin), mais depuis le menu « … » de la page ou le coin ;
//   le départ arrive donc ici comme un projet relu, `isTester` devenu faux.
// - La session expirée se dit dans la feuille d'inscription, avec « Me reconnecter ».
// - L'auteur d'un projet qui ne cherche pas de testeurs ne lit pas « 0 testeur ».
import type { Project } from '@ruche/contracts'
import type { QueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { requestWithoutBody } from '../api/client'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { passTapGuard } from '../testing/dialog'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectActions } from './ProjectActions'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
}))

const JOIN = fr.t(($) => $.project.testers.join)
const CORNER = fr.t(($) => $.project.testers.corner)

const tester: Project = {
  ...recipesProject,
  isMine: false,
  isFollowed: false,
  followerCount: 2,
  isTester: true,
  testerCount: null,
  testerJoinable: true,
}

let mockServer: Project = tester

function OnPage({ project }: { project: Project }) {
  const { data } = useQuery({
    queryKey: ['project', project.id],
    queryFn: () => Promise.resolve(mockServer),
    initialData: project,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return <ProjectActions project={data} onOpenDemo={jest.fn()} onEdit={jest.fn()} />
}

const renderPage = async (project: Project) => {
  mockServer = project
  return renderWithProviders(
    <ToastProvider>
      <OnPage project={project} />
    </ToastProvider>,
  )
}

/** « Le coin des testeurs » : un lien, ou un bouton. */
const queryCorner = () =>
  screen.queryByRole('link', { name: CORNER }) ?? screen.queryByRole('button', { name: CORNER })

/**
 * Le départ, fait ailleurs sur la page (menu « … ») : le projet relu dit `isTester: false`, comme
 * le cache le dit au toucher de « Quitter » (`useQuitTester`).
 */
const leaveElsewhere = async (queryClient: QueryClient) => {
  // Témoin : avant le départ, le lien du coin est là, à la place du bouton.
  await waitFor(() => expect(queryCorner()).not.toBeNull())
  await act(async () => {
    queryClient.setQueryData<Project>(['project', tester.id], (shown) =>
      shown ? { ...shown, isTester: false } : shown,
    )
  })
}

beforeEach(() => {
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation(async (_path, init) => {
      mockServer = { ...mockServer, isTester: init?.method === 'POST' }
      return { ok: true, data: null }
    })
})

describe('the testers button after leaving (R7a, U5a; R7b: leaving happens elsewhere)', () => {
  it('keeps the button in place, inactive, after leaving a project that no longer looks for testers', async () => {
    const { queryClient } = await renderPage({ ...tester, status: 'paused' })

    await leaveElsewhere(queryClient)

    const button = await screen.findByRole('button', { name: JOIN })
    expect(button).toBeDisabled()
    expect(queryCorner()).toBeNull()
  })

  it('keeps the button in place, inactive, after a suspended tester leaves', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    const { queryClient } = await renderPage(tester)
    await waitFor(() => expect(getMe).toHaveBeenCalled())

    await leaveElsewhere(queryClient)

    expect(await screen.findByRole('button', { name: JOIN })).toBeDisabled()
  })

  it('keeps an active « Rejoindre les testeurs » after leaving a testable project', async () => {
    const { queryClient } = await renderPage(tester)

    await leaveElsewhere(queryClient)

    expect(await screen.findByRole('button', { name: JOIN })).not.toBeDisabled()
  })
})

describe('the testers sheet when the session has expired (R7a, U5a)', () => {
  it('says so in the sheet, with « Me reconnecter »', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'unauthorized' })
    await renderPage({ ...tester, isTester: false })
    await fireEvent.press(screen.getByRole('button', { name: JOIN }))
    await screen.findByRole('header', { name: JOIN })
    await passTapGuard()

    const confirm = screen.getAllByRole('button', { name: JOIN }).at(-1)
    if (!confirm) throw new Error('The sheet has no « Rejoindre les testeurs »')
    await fireEvent.press(confirm)

    expect(await screen.findByText(fr.t(($) => $.states.expired))).toBeTruthy()
    expect(screen.getAllByText(fr.t(($) => $.states.signIn)).length).toBeGreaterThan(0)
  })
})

describe('the number of testers for the author (R7a, U5a)', () => {
  const mine: Project = { ...recipesProject, testerCount: 0 }

  it('shows « 0 testeur » on a testable project', async () => {
    await renderPage(mine)

    expect(screen.getByText('0 testeur')).toBeTruthy()
  })

  it('shows no number of testers on a project that never looked for testers', async () => {
    await renderPage({ ...mine, status: 'idea' })
    // Témoin : la ligne des abonnés est là.
    expect(
      screen.getByText(fr.t(($) => $.follow.followers, { count: mine.followerCount })),
    ).toBeTruthy()
    expect(screen.queryByText(/testeurs?$/)).toBeNull()
  })
})
