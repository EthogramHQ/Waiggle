// Les niveaux de titre de la page d'un projet, tels qu'un lecteur d'écran les parcourt sur le web :
// le titre du projet (h1), ses sections (h2), puis les titres écrits dans la description (h3, h4).
// Avant, tous étaient des h1 : la page paraissait une suite de pages sans lien (relecture de design
// du 22/10/2026). Fichier à part de ProjectScreen.test.tsx : il remplace la plateforme par le web.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useComments, useDeleteComment, usePostComment } from '../comments/api'
import { useFollow } from '../follows/api'
import { useDeleteNote, usePublishNote } from '../notes/api'
import { getProject } from '../projects/api'
import { useReaction } from '../reactions/api'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { ProjectScreen } from './ProjectScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))
// Sur le web, la page passe à la langue du navigateur une fois affichée : on la garde en français.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))

// La règle de react-native-web qui choisit la balise d'un élément (<h1>, <h2>…) d'après son rôle et
// son niveau : on l'applique aux propriétés que reçoit chaque titre, comme le fait le navigateur.
const tagOf = jest.requireActual<(props: object) => string | undefined>(
  'react-native-web/dist/cjs/modules/AccessibilityUtil/propsToAccessibilityComponent',
)

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getProject).mockResolvedValue({ ...recipesProject, isMine: false })
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest.mocked(useReaction).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest.mocked(usePublishNote).mockReturnValue({ publish: jest.fn(), pending: false, error: false })
  jest.mocked(useDeleteNote).mockReturnValue({ remove: jest.fn(), error: false })
  jest.mocked(usePostComment).mockReturnValue({ post: jest.fn(), pending: false, error: false })
  jest.mocked(useDeleteComment).mockReturnValue({ remove: jest.fn(), error: false })
  jest.mocked(useComments).mockReturnValue({
    data: { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] },
    status: 'success',
    isPending: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isRefetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useComments>)
})

describe('ProjectScreen headings', () => {
  it('reads as one page: the project in h1, its sections in h2, the description below', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<ProjectScreen id={recipesProject.id} />)
      await screen.findByRole('header', { name: 'Mon agent de recettes' })

      const tagNamed = (name: string) => tagOf(screen.getByRole('header', { name }).props)
      const tags = screen.getAllByRole('header').map((heading) => tagOf(heading.props))

      // Un seul titre de niveau 1 : celui du projet, le premier de la page.
      expect(tags[0]).toBe('h1')
      expect(tags.filter((tag) => tag === 'h1')).toHaveLength(1)
      expect(tagNamed('Mon agent de recettes')).toBe('h1')
      expect(tagNamed('Description')).toBe('h2')
      expect(tagNamed('Commentaires')).toBe('h2')
      expect(tagNamed('La recette')).toBe('h2')
      // « ## Comment ça marche », écrit par le membre : sous la section « Description ».
      expect(tagNamed('Comment ça marche')).toBe('h3')
    } finally {
      jest.restoreAllMocks()
    }
  })
})
