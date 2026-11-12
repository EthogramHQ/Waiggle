// « Voir en contexte » (R8), la fermeture et la hauteur de la feuille. Le plan veut le paramètre
// `?comment=` gardé dans l'adresse tant que la feuille est ouverte (recharger la page la rouvre au
// même endroit) et retiré à sa fermeture : `Comments` prévient l'écran par `onContextClosed`, à la
// fermeture seulement, jamais à l'arrivée. Sur téléphone, la feuille ouverte en contexte est à
// mi-hauteur (planche `R8-Contexte`) ; ouverte depuis la page, elle garde toute sa hauteur.
import type { Comment, Project } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import {
  useCommentContext,
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useMentionable } from '../mentions/api'
import { getMe } from '../profile/api'
import { maxComment, zoeComment } from '../testing/comments'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Comments } from './ProjectComments'
import { openSheet, sheet, sheetIsOpen } from './ProjectComments.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  useCommentContext: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const project: Project = { ...recipesProject, isMine: false, commentCount: 5 }
/** La réponse visée : celle de Zoé, dans le fil de Max. */
const targetId = maxComment.replies[0]?.id ?? ''
const close = fr.t(($) => $.common.close)

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

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Le style de la feuille elle-même (la vue qui garde VoiceOver dedans). */
const panelStyle = () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) => node.props.accessibilityViewIsModal === true,
  )
  if (!found) throw new Error('no sheet panel')
  return StyleSheet.flatten(found.props.style as never) as Record<string, unknown>
}

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: jest.fn().mockResolvedValue(true), pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: jest.fn().mockResolvedValue(true), pending: false, error: false })
  jest.mocked(useDeleteComment).mockReset().mockReturnValue({ remove: jest.fn(), error: false })
  jest.mocked(useHideComment).mockReset().mockReturnValue({ setHidden: jest.fn(), error: false })
  jest.mocked(useMentionable).mockReset().mockReturnValue([])
  jest
    .mocked(useCommentContext)
    .mockReset()
    .mockReturnValue({ status: 'found', projectId: project.id, thread: maxComment })
  mockComments([zoeComment, maxComment])
})

describe('Comments opened on a targeted comment, then closed (R8)', () => {
  it('keeps the address parameter while the sheet is open, and lets it go when it closes', async () => {
    const onContextClosed = jest.fn()
    await renderWithProviders(
      <Comments project={project} focusCommentId={targetId} onContextClosed={onContextClosed} />,
    )
    // Arrivée faite (le focus est posé) : la feuille est ouverte, l'adresse ne change pas.
    expect(sheetIsOpen()).toBe(true)
    expect(onContextClosed).not.toHaveBeenCalled()

    await fireEvent.press(sheet().getByRole('button', { name: close }))

    expect(onContextClosed).toHaveBeenCalledTimes(1)
  })

  it('opens the sheet at partial height on a phone, as on the board', async () => {
    await renderWithProviders(<Comments project={project} focusCommentId={targetId} />)

    expect(panelStyle().maxHeight).toEqual(expect.any(Number))
  })

  it('keeps the full height when the sheet is opened from the page (témoin)', async () => {
    jest.mocked(useCommentContext).mockReturnValue({ status: 'idle' })
    await renderWithProviders(<Comments project={project} />)

    await openSheet()

    expect(sheetIsOpen()).toBe(true)
    expect(panelStyle().maxHeight).toBeUndefined()
  })
})
