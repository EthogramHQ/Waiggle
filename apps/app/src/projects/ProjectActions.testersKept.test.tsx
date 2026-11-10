// Tests ajoutés par l'interface (R7a, U5a), à côté de ceux de TW-3 (ProjectActions.testers.test.tsx) :
// les cas que l'écriture du bouton des testeurs a fait naître.
// - Après un départ qu'on ne peut plus défaire (projet qui ne cherche plus de testeurs, compte
//   suspendu), le bouton reste à sa place, inactif : la feuille rend le focus à ce bouton, qui ne
//   doit pas avoir disparu (comme « Suivre ce projet », tranche 7c).
// - La session expirée se dit dans la feuille, avec « Me reconnecter ».
// - L'auteur d'un projet qui ne cherche pas de testeurs ne lit pas « 0 testeur ».
import type { Project } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
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
const JOINED = fr.t(($) => $.project.testers.joined)
const QUIT = fr.t(($) => $.project.testers.quit)

const tester: Project = {
  ...recipesProject,
  isMine: false,
  isFollowed: false,
  followerCount: 2,
  isTester: true,
  testerCount: null,
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

/** Ouvre la feuille « Tu testes ce projet », attend sa garde, puis touche « Quitter les testeurs ». */
const quitFromSheet = async () => {
  await fireEvent.press(screen.getByRole('button', { name: JOINED }))
  await screen.findByRole('header', { name: JOINED })
  await passTapGuard()
  await fireEvent.press(screen.getByRole('button', { name: QUIT }))
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

describe('the testers button after leaving (R7a, U5a)', () => {
  it('keeps the button in place, inactive, after leaving a project that no longer looks for testers', async () => {
    await renderPage({ ...tester, status: 'paused' })

    await quitFromSheet()

    const button = await screen.findByRole('button', { name: JOIN })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: JOINED })).toBeNull()
  })

  it('keeps the button in place, inactive, after a suspended tester leaves', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderPage(tester)
    await waitFor(() => expect(getMe).toHaveBeenCalled())

    await quitFromSheet()

    expect(await screen.findByRole('button', { name: JOIN })).toBeDisabled()
  })

  it('keeps an active « Rejoindre les testeurs » after leaving a testable project', async () => {
    await renderPage(tester)

    await quitFromSheet()

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
