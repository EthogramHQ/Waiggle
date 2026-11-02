// Test de l'icône de « Suivre ce projet » (R5a, décision du 2/11/2026) : une cloche, pour qu'on ne
// la prenne pas pour « Suivre » l'auteur, juste au-dessus, qui garde la personne avec un « + ».
// Le nom lu ne change pas (voir ProjectActions.test.tsx).
import { screen } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { iconPaths } from '../ui/icons.generated'
import { ProjectActions } from './ProjectActions'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Les tracés des icônes dessinées dans un élément (un `path` porte son `d`). */
const pathsIn = (node: Node | string): string[] => {
  if (typeof node === 'string') return []
  const own = typeof node.props.d === 'string' ? [node.props.d] : []
  return [...own, ...node.children.flatMap(pathsIn)]
}

describe('ProjectActions follow icon', () => {
  it('draws a bell for « Suivre ce projet », not the person of « Suivre » the author', async () => {
    mockSession({ user: { id: 'u2', name: 'Max' } })
    jest.mocked(getMe).mockResolvedValue(leaMe)
    jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
    await renderWithProviders(
      <ProjectActions
        project={{ ...recipesProject, isMine: false, isFollowed: false, followerCount: 2 }}
        onOpenDemo={() => {}}
        onEdit={() => {}}
      />,
    )

    const follow = screen.getByRole('switch', { name: 'Suivre ce projet' })
    expect(pathsIn(follow as unknown as Node)).toEqual(iconPaths.bell)
    expect(pathsIn(follow as unknown as Node)).not.toEqual(iconPaths['user-plus'])
  })
})
