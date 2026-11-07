// La carte visée reste en vue (relecture de R5b, des-C4) : « Répondre » ou « Modifier » amènent la
// carte surlignée dans la zone qui défile de la feuille, et l'y gardent jusqu'à la fin du geste.
// La feuille est enveloppée pour noter ce qu'on lui demande ; que la liste défile vraiment, et de
// combien, est testé dans ui/Sheet.comments.test.tsx et mesuré dans le navigateur.
import { palettes } from '@ruche/brand'
import type { Comment, Project } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { StyleSheet } from 'react-native'
import {
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
import { Comments } from './ProjectComments'
import {
  cardOf,
  chooseInMenu,
  closeSheet,
  openSheet,
  writeAndSend,
} from './ProjectComments.testkit'

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

const mockReveal = jest.fn()
jest.mock('../ui/Sheet', () => {
  const actual = jest.requireActual('../ui/Sheet')
  const { useImperativeHandle } = jest.requireActual('react')
  return {
    ...actual,
    // La vraie feuille, dont la poignée `revealRef` est remplacée par une fausse qui note ses appels.
    Sheet: ({ revealRef, ...props }: ComponentProps<typeof actual.Sheet>) => {
      useImperativeHandle(revealRef, () => ({ reveal: mockReveal }))
      return <actual.Sheet {...props} />
    },
  }
})

const project: Project = { ...recipesProject, isMine: false }
const counted = (commentCount: number): Project => ({ ...project, commentCount })

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

/** La dernière chose que l'écran a demandé d'amener en vue, et son fond (miel pâle : la carte visée). */
const lastRevealed = () => {
  const node = mockReveal.mock.lastCall?.[0] as { props?: { style?: object } } | null | undefined
  return node ? StyleSheet.flatten(node.props?.style) : node
}

beforeEach(() => {
  mockReveal.mockReset()
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, id: 'u4', name: 'Malik', handle: 'malik' })
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
})

afterEach(() => jest.restoreAllMocks())

describe('the card aimed at stays in view', () => {
  it('« Répondre » reveals the highlighted card', async () => {
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<Comments project={counted(4)} />)
    await openSheet()
    expect(mockReveal.mock.calls.filter(([node]) => node !== null)).toEqual([])

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )

    expect(lastRevealed()).toMatchObject({ backgroundColor: palettes.day.highlightSoft })
  })

  it('« Modifier » reveals the highlighted card', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderWithProviders(<Comments project={counted(3)} />)
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')

    expect(lastRevealed()).toMatchObject({ backgroundColor: palettes.day.highlightSoft })
  })

  it('stops following once the reply is sent', async () => {
    mockComments([zoeComment])
    await renderWithProviders(<Comments project={counted(1)} />)
    await openSheet()
    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    expect(lastRevealed()).toBeTruthy()

    await writeAndSend('Oui.')

    expect(screen.queryByText('Oui.')).toBeNull()
    expect(mockReveal.mock.lastCall?.[0]).toBeNull()
  })

  it('reveals the card again when the sheet comes back on a reply in progress', async () => {
    mockComments([zoeComment])
    await renderWithProviders(<Comments project={counted(1)} />)
    await openSheet()
    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await closeSheet()
    mockReveal.mockClear()

    await openSheet()

    expect(lastRevealed()).toMatchObject({ backgroundColor: palettes.day.highlightSoft })
  })
})
