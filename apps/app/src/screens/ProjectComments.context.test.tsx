// « Voir en contexte » (R8, planche `R8-Contexte`) : arrivé d'une notification, le membre trouve la
// feuille des commentaires ouverte sur le commentaire visé. L'écran du projet lit `?comment=<id>`
// dans l'adresse et le donne à `Comments` (`focusCommentId`) ; la feuille lit le contexte
// (`useCommentContext`, GET /v1/comments/{id}/context) et :
// - trouvé sur ce projet : le fil visé en tête, déplié, le commentaire éclairé (`lit`), amené en vue
//   et focalisé (clavier sur le web, lecteur d'écran sur téléphone), une seule fois, puis
//   `onFocusDone` ; la liste habituelle suit, sans répéter ce fil ;
// - disparu (404), ou d'un autre projet : la feuille en haut, avec « Ce commentaire n'est plus
//   là. », et rien du fil d'un autre projet.
//
// Les hooks des commentaires sont remplacés ; la feuille est enveloppée pour noter ce qu'on lui
// demande d'amener en vue (comme `ProjectComments.reveal.test.tsx`), et les aides du focus sont
// espionnées.
import { palettes } from '@ruche/brand'
import type { Comment, Project } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { Platform, StyleSheet } from 'react-native'
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
import { commentOf, maxComment, replyOf, zoeComment } from '../testing/comments'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { moveReaderTo } from '../ui/focus'
import { Comments } from './ProjectComments'
import { inesComment, sheet, sheetIsOpen } from './ProjectComments.testkit'

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
// Où la feuille pose le focus : les vraies aides, espionnées.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

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

// --- Les données ---------------------------------------------------------------------------------

const project: Project = { ...recipesProject, isMine: false }
const counted = (commentCount: number): Project => ({ ...project, commentCount })

const GONE = fr.t(($) => $.project.comments.gone)
/** La réponse visée : celle de Zoé, dans le fil de Max. */
const TARGET = 'Moi aussi, dis-nous !'
const targetId = maxComment.replies[0]?.id ?? ''
const ROOT = 'Super idée, je teste ce soir.'

/** La liste de la feuille : le fil de Zoé, celui de Max, celui d'Inès (le fil visé n'est pas en tête). */
const list: Comment[] = [zoeComment, maxComment, inesComment]

/** Un fil d'un autre projet, que l'adresse viserait. */
const elsewhere = commentOf({
  id: '0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d',
  body: 'Un fil d’un autre projet, jamais montré ici.',
  createdAt: '2026-10-16T09:00:00.000Z',
})

/** Un long fil : la racine, puis huit réponses ; la septième est visée. */
const longReplies = Array.from({ length: 8 }, (_, index) =>
  replyOf({
    id: `1b2c3d4e-5f60-4a7b-8c8d-9e0f1a2b3c4${index}`,
    body: `Réponse numéro ${index + 1}`,
    createdAt: `2026-10-15T1${index}:00:00.000Z`,
  }),
)
const longThread = commentOf({
  id: '2c3d4e5f-6071-4b8c-9d9e-0f1a2b3c4d5e',
  body: 'Le début du long fil.',
  createdAt: '2026-10-15T09:00:00.000Z',
  replies: longReplies,
})

// --- Les outils ----------------------------------------------------------------------------------

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

type Context = ReturnType<typeof useCommentContext>
const mockContext = (context: Context) => jest.mocked(useCommentContext).mockReturnValue(context)
const found = (thread: Comment, projectId = project.id): Context => ({
  status: 'found',
  projectId,
  thread,
})

type Node = {
  props: Record<string, unknown>
  parent: Node | null
  children: ReadonlyArray<Node | string>
}
const nodesOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]
const allNodes = () => nodesOf(screen.root as unknown as Node)
const chainOf = (node: Node): Node[] => {
  const chain: Node[] = []
  for (let at: Node | null = node; at; at = at.parent) chain.push(at)
  return chain
}
/** Le rang d'un texte dans l'ordre de lecture de la feuille (de haut en bas). */
const placeOf = (text: string) => allNodes().indexOf(sheet().getByText(text) as unknown as Node)

/**
 * L'élément de l'arbre d'une vue reçue par une aide du focus ou par `reveal` : la `ref` d'une vue
 * garde les mêmes `children` que l'élément rendu.
 */
const elementOf = (instance: unknown) => {
  const children = (instance as { props?: { children?: unknown } } | null)?.props?.children
  if (children === undefined || children === null) return undefined
  return allNodes().find((node) => node.props.children === children)
}
/** Vrai si la vue reçue contient ce texte (elle est la carte, ou l'entoure). */
const holds = (instance: unknown, text: string) => {
  const element = elementOf(instance)
  if (!element) return false
  return chainOf(screen.getByText(text) as unknown as Node).includes(element)
}

/** Vrai si un fond miel pâle (`highlightSoft`) éclaire ce texte. */
const litAround = (text: string) =>
  chainOf(screen.getByText(text) as unknown as Node).some((node) => {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    return style.backgroundColor === palettes.day.highlightSoft
  }) ||
  // La teinte peut aussi être une couche sœur, posée dans la carte.
  allNodes().some((node) => {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    return (
      style.backgroundColor === palettes.day.highlightSoft &&
      node.parent !== null &&
      chainOf(screen.getByText(text) as unknown as Node).includes(node.parent)
    )
  })

/** Les vues reçues par `focusWithoutScroll` (web) ou par `moveReaderTo` (téléphone). */
const focusCalls = () => [
  ...jest.mocked(focusWithoutScrollMock()).mock.calls.map(([node]) => node),
  ...jest.mocked(moveReaderTo).mock.calls.map(([node]) => node),
]
// `focusWithoutScroll` est lu dans le module remplacé (un import nommé de plus ne servirait qu'ici).
const focusWithoutScrollMock = () =>
  (jest.requireMock('../ui/focus') as typeof import('../ui/focus')).focusWithoutScroll

beforeEach(() => {
  mockReveal.mockReset()
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
  jest.mocked(useCommentContext).mockReset().mockReturnValue({ status: 'idle' })
  jest.mocked(focusWithoutScrollMock()).mockClear()
  jest.mocked(moveReaderTo).mockClear()
  mockComments(list)
})

afterEach(() => jest.restoreAllMocks())

// --- Les tests -----------------------------------------------------------------------------------

describe('Comments without a targeted comment', () => {
  it('keeps the sheet closed and asks no context, as before R8', async () => {
    await renderWithProviders(<Comments project={counted(5)} />)

    expect(screen.getByText('Ça marche aussi en anglais ?')).toBeTruthy() // témoin : l'aperçu
    expect(sheetIsOpen()).toBe(false)
    for (const [id] of jest.mocked(useCommentContext).mock.calls) expect(id ?? null).toBeNull()
  })
})

describe('Comments opened on a targeted comment', () => {
  it('reads the context of the comment given by the address', async () => {
    mockContext({ status: 'loading' })
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={targetId} />)

    expect(useCommentContext).toHaveBeenCalledWith(targetId)
  })

  it('opens the sheet with the targeted thread first, unfolded, and does not repeat it', async () => {
    mockContext(found(maxComment))
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={targetId} />)

    expect(sheetIsOpen()).toBe(true)
    // Le fil visé, racine puis réponses, avant les autres fils de la liste.
    expect(placeOf(ROOT)).toBeLessThan(placeOf(TARGET))
    expect(placeOf(TARGET)).toBeLessThan(placeOf('Ça marche aussi en anglais ?'))
    expect(placeOf(TARGET)).toBeLessThan(placeOf('Et pour les végétariens ?'))
    // Puis la liste habituelle, sans ce fil une seconde fois.
    expect(sheet().getAllByText(ROOT)).toHaveLength(1)
    expect(sheet().getAllByText(TARGET)).toHaveLength(1)
    expect(sheet().getByText('Merci à vous deux.')).toBeTruthy()
  })

  it('lights the targeted comment with honey, and only it', async () => {
    mockContext(found(maxComment))
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={targetId} />)

    expect(litAround(TARGET)).toBe(true)
    expect(litAround(ROOT)).toBe(false)
    expect(litAround('Merci à vous deux.')).toBe(false)
  })

  it('brings the targeted reply into view in a long thread', async () => {
    mockComments([zoeComment, longThread])
    const target = longReplies[6]
    mockContext(found(longThread))
    await renderWithProviders(
      <Comments project={counted(10)} focusCommentId={target?.id ?? null} />,
    )

    const revealed = mockReveal.mock.calls.map(([node]) => node).filter((node) => node !== null)
    expect(revealed.length).toBeGreaterThan(0)
    expect(holds(revealed.at(-1), 'Réponse numéro 7')).toBe(true)
    expect(holds(revealed.at(-1), 'Le début du long fil.')).toBe(false)
  })

  it('moves the focus to the targeted reply once its context arrives, not to Close', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    mockContext({ status: 'loading' })
    const { rerender } = await renderWithProviders(
      <Comments project={counted(5)} focusCommentId={targetId} />,
    )
    // Pendant la lecture, le focus n'est pas encore posé sur un commentaire.
    expect(focusCalls().some((node) => holds(node, TARGET))).toBe(false)

    mockContext(found(maxComment))
    await rerender(<Comments project={counted(5)} focusCommentId={targetId} />)

    const calls = jest.mocked(focusWithoutScrollMock()).mock.calls.map(([node]) => node)
    const last = calls.at(-1)
    expect(holds(last, TARGET)).toBe(true)
    expect(holds(last, ROOT)).toBe(false)
    const closeButton = sheet().getByRole('button', { name: 'Fermer' })
    expect(elementOf(last) === (closeButton as unknown as Node)).toBe(false)
  })

  it('moves the screen reader to the targeted reply on phone', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    mockContext(found(maxComment))
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={targetId} />)

    const read = jest.mocked(moveReaderTo).mock.calls.map(([node]) => node)
    expect(read.some((node) => holds(node, TARGET))).toBe(true)
    expect(holds(read.at(-1), TARGET)).toBe(true)
  })

  it('focuses the targeted reply only once, then says it is done', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const onFocusDone = jest.fn()
    mockContext(found(maxComment))
    const { rerender } = await renderWithProviders(
      <Comments project={counted(5)} focusCommentId={targetId} onFocusDone={onFocusDone} />,
    )
    const onTarget = () =>
      jest.mocked(focusWithoutScrollMock()).mock.calls.filter(([node]) => holds(node, TARGET))
        .length
    expect(onTarget()).toBe(1)
    expect(onFocusDone).toHaveBeenCalledTimes(1)

    // Un nouveau dessin (la liste relue) ne repose pas le focus sur le commentaire.
    await rerender(
      <Comments project={counted(5)} focusCommentId={targetId} onFocusDone={onFocusDone} />,
    )

    expect(onTarget()).toBe(1)
    expect(onFocusDone).toHaveBeenCalledTimes(1)
  })
})

describe('Comments opened on a comment that is no longer there', () => {
  it('opens the sheet at the top and says the comment is no longer there', async () => {
    mockContext({ status: 'gone' })
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={targetId} />)

    expect(sheetIsOpen()).toBe(true)
    expect(sheet().getByText(GONE)).toBeTruthy()
    // La phrase en haut, puis la liste habituelle, dans son ordre.
    expect(placeOf(GONE)).toBeLessThan(placeOf('Ça marche aussi en anglais ?'))
    expect(placeOf('Ça marche aussi en anglais ?')).toBeLessThan(placeOf(ROOT))
    expect(litAround(TARGET)).toBe(false)
  })

  it('treats a comment of another project as gone, and shows nothing of it', async () => {
    mockContext(found(elsewhere, '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a'))
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={elsewhere.id} />)

    expect(sheetIsOpen()).toBe(true)
    expect(sheet().getByText(GONE)).toBeTruthy()
    expect(screen.queryByText(elsewhere.body)).toBeNull()
    // Rien n'est éclairé ni focalisé dans la liste de ce projet.
    expect(litAround('Ça marche aussi en anglais ?')).toBe(false)
  })

  it('says nothing is gone while the context is still loading', async () => {
    mockContext({ status: 'loading' })
    await renderWithProviders(<Comments project={counted(5)} focusCommentId={targetId} />)

    expect(screen.getAllByText('Ça marche aussi en anglais ?').length).toBeGreaterThan(0) // témoin
    expect(screen.queryByText(GONE)).toBeNull()
  })
})
