// Tests du badge « Testeur » dans les commentaires d'un projet (R7b ; planche validée 3, juridique
// J4 ; décision de Louis du 11/11/2026 : le badge pour tous les testeurs actuels, inscrits d'avant
// compris, sans prévenir). L'API dit qui teste le projet (`CommentAuthor.isTester`, jamais vrai pour
// l'auteur du projet) ; l'écran le passe à la carte (`isProjectTester`), dans les commentaires comme
// dans les réponses. Le lien du nom le lit : « Zoé, Testeur », comme « Léa, Auteur ».
//
// Le dessin du badge est testé dans `ui/CommentCard.tester.test.tsx` ; ici, seulement que l'écran
// branche la donnée de l'API (ProjectComments.tsx, ProjectCommentThreads.tsx).
import type { Comment, Project } from '@ruche/contracts'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useMentionable } from '../mentions/api'
import { getMe } from '../profile/api'
import { commentOf, leaAuthor, maxAuthor, replyOf, zoeAuthor } from '../testing/comments'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Comments } from './ProjectComments'
import { openSheet, sheet } from './ProjectComments.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

// Malik regarde le projet public de Léa, qui a trois commentaires.
const project: Project = { ...recipesProject, isMine: false, commentCount: 3 }

const TESTER = fr.t(($) => $.project.comments.tester)
const testerLink = (name: string) => fr.t(($) => $.project.comments.testerLink, { name })
const authorLink = (name: string) => fr.t(($) => $.project.comments.authorLink, { name })

/** Max teste le projet ; Zoé aussi, et lui répond ; Léa, l'auteure, répond aussi. */
const threadWithTesters = (maxTests: boolean, zoeTests: boolean): Comment =>
  commentOf({
    id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    author: { ...maxAuthor, isTester: maxTests },
    body: 'Testé ce matin sur tablette : tout marche.',
    createdAt: '2026-11-05T09:00:00.000Z',
    replies: [
      replyOf({
        id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
        author: { ...zoeAuthor, isTester: zoeTests },
        body: 'Pareil sur téléphone.',
        createdAt: '2026-11-05T10:00:00.000Z',
      }),
      replyOf({
        id: '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f',
        author: leaAuthor,
        body: 'Merci à vous deux.',
        createdAt: '2026-11-05T11:00:00.000Z',
      }),
    ],
  })

const mockComments = (items: Comment[]) =>
  jest.mocked(useComments).mockReturnValue({
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isRefetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useComments>)

beforeEach(() => {
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, id: 'u4', name: 'Malik', handle: 'malik' })
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: jest.fn(), pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: jest.fn(), pending: false, error: false })
  jest.mocked(useDeleteComment).mockReset().mockReturnValue({ remove: jest.fn(), error: false })
  jest.mocked(useHideComment).mockReset().mockReturnValue({ setHidden: jest.fn(), error: false })
  jest.mocked(useMentionable).mockReset().mockReturnValue([])
})

describe('the « Testeur » badge in the comments of a project (R7b)', () => {
  it('reads the name of a tester who wrote a comment « Max, Testeur »', async () => {
    mockComments([threadWithTesters(true, false)])
    await renderWithProviders(<Comments project={project} />)

    await openSheet()

    expect(sheet().getByRole('link', { name: testerLink('Max') })).toBeTruthy()
    expect(sheet().getAllByText(TESTER).length).toBeGreaterThan(0)
    // Zoé ne teste pas : son nom seul.
    expect(sheet().getByRole('link', { name: 'Zoé' })).toBeTruthy()
  })

  it('reads the name of a tester who wrote a reply « Zoé, Testeur »', async () => {
    mockComments([threadWithTesters(false, true)])
    await renderWithProviders(<Comments project={project} />)

    await openSheet()

    expect(sheet().getByRole('link', { name: testerLink('Zoé') })).toBeTruthy()
    expect(sheet().getByRole('link', { name: 'Max' })).toBeTruthy()
  })

  it('shows no « Testeur » when nobody in the thread tests the project', async () => {
    mockComments([threadWithTesters(false, false)])
    await renderWithProviders(<Comments project={project} />)

    await openSheet()

    // Témoin : le badge de l'auteure est là, et le fil entier aussi.
    expect(sheet().getByRole('link', { name: authorLink('Léa') })).toBeTruthy()
    expect(sheet().getByText('Pareil sur téléphone.')).toBeTruthy()
    expect(sheet().queryAllByText(TESTER)).toHaveLength(0)
    expect(sheet().queryByRole('link', { name: /, Testeur$/ })).toBeNull()
  })

  it('keeps « Auteur » alone on the author of the project, even next to testers', async () => {
    mockComments([threadWithTesters(true, true)])
    await renderWithProviders(<Comments project={project} />)

    await openSheet()

    // Témoin : les deux testeurs portent leur badge.
    expect(sheet().getByRole('link', { name: testerLink('Max') })).toBeTruthy()
    expect(sheet().getByRole('link', { name: testerLink('Zoé') })).toBeTruthy()
    expect(sheet().getByRole('link', { name: authorLink('Léa') })).toBeTruthy()
    expect(sheet().queryByRole('link', { name: testerLink('Léa') })).toBeNull()
  })
})
