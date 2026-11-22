// R18 : l'espace que le membre a tapée devant « ? » reste insécable à l'affichage de la page d'un projet (titre et accroche)
// (la ponctuation des textes des membres). Les espaces spéciales sont écrites par leur numéro.
import { screen } from '@testing-library/react-native'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { ProjectHeader } from './ProjectHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../members/api', () => ({
  useMember: () => ({ data: undefined, isError: true, isPending: false }),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}))

const NNBSP = String.fromCodePoint(0x202f)

// Le texte tel que dessiné : les requêtes de test normalisent les espaces (insécables comprises),
// on lit donc les enfants du nœud.
const drawn = (node: { props: { children?: unknown } }) => [node.props.children].flat().join('')

describe('ProjectHeader', () => {
  it('keeps the typed space before ? non-breaking in a member text', async () => {
    mockSession({ user: { id: 'u2', name: 'Max' } })
    await renderWithProviders(
      <ProjectHeader
        project={{
          ...recipesProject,
          isMine: false,
          title: 'Et si on cuisinait ?',
          pitch: 'Un menu, vraiment ?',
        }}
      />,
    )

    expect(drawn(screen.getByText(/cuisinait/))).toBe(`Et si on cuisinait${NNBSP}?`)
    expect(drawn(screen.getByText(/vraiment/))).toBe(`Un menu, vraiment${NNBSP}?`)
  })
})
