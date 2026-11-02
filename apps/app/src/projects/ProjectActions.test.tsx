// Tests des actions de la page d'un projet (R5a, ProjectActions) : « Tester la démo » et le site
// qu'elle ouvre, « Suivre ce projet » et ses abonnés pour un autre membre, « Modifier » pour
// l'auteur, le bandeau d'un projet privé. La page elle-même (ordre, menus) est testée par
// screens/ProjectScreen.test.tsx.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectActions } from './ProjectActions'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

const onOpenDemo = jest.fn()
const onEdit = jest.fn()
const mockToggle = jest.fn()
const seenByMax = { ...recipesProject, isMine: false, isFollowed: false, followerCount: 2 }

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  onOpenDemo.mockReset()
  onEdit.mockReset()
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
})

describe('ProjectActions', () => {
  it('opens the demo, and says first that it is on another site', async () => {
    await renderWithProviders(
      <ProjectActions project={seenByMax} onOpenDemo={onOpenDemo} onEdit={onEdit} />,
    )

    expect(
      screen.getByText(fr.t(($) => $.project.page.external, { host: 'recettes.example.com' })),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Tester la démo' }))
    expect(onOpenDemo).toHaveBeenCalledTimes(1)
  })

  it('says when there is no demo yet', async () => {
    await renderWithProviders(
      <ProjectActions
        project={{ ...seenByMax, demoUrl: null }}
        onOpenDemo={onOpenDemo}
        onEdit={onEdit}
      />,
    )

    expect(screen.getByText('Pas encore de démo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tester la démo' })).toBeNull()
  })

  it('lets another member follow the project, with the number of followers', async () => {
    await renderWithProviders(
      <ProjectActions project={seenByMax} onOpenDemo={onOpenDemo} onEdit={onEdit} />,
    )

    const follow = screen.getByRole('switch', { name: 'Suivre ce projet' })
    expect(screen.getByText('2 abonnés')).toBeTruthy()
    expect(useFollow).toHaveBeenCalledWith({ kind: 'project', id: recipesProject.id })
    await fireEvent.press(follow)
    expect(mockToggle).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })

  it('offers the author « Modifier » and the number of followers, never « Suivre »', async () => {
    await renderWithProviders(
      <ProjectActions project={recipesProject} onOpenDemo={onOpenDemo} onEdit={onEdit} />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Modifier' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(screen.getByText(fr.t(($) => $.follow.followers, { count: 0 }))).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Suivre ce projet' })).toBeNull()
  })

  it('tells the author of a private project who sees it', async () => {
    await renderWithProviders(
      <ProjectActions
        project={{ ...recipesProject, visibility: 'private' }}
        onOpenDemo={onOpenDemo}
        onEdit={onEdit}
      />,
    )

    expect(screen.getByText(fr.t(($) => $.project.page.privateBanner))).toBeTruthy()
  })

  it('offers no « Modifier » to a suspended author', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(
      <ProjectActions project={recipesProject} onOpenDemo={onOpenDemo} onEdit={onEdit} />,
    )

    // Le profil se lit après le premier rendu : « Modifier » s'en va une fois la suspension connue.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull())
    // Témoin : la démo et le nombre d'abonnés restent.
    expect(screen.getByRole('button', { name: 'Tester la démo' })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.follow.followers, { count: 0 }))).toBeTruthy()
  })
})
