// Tests des commentaires d'un projet en temps réel (R21, docs/scenarios/refonte.md : « Léa et Nora
// regardent la page du projet ; Nora publie un commentaire ; Léa le voit apparaître en moins de
// 2 secondes, à sa place dans la liste, sans recharger ; si Léa lit plus loin, la liste ne saute
// pas : un bouton « 1 nouveau commentaire » apparaît, qui l'y amène »).
//
// Le serveur envoie `{ topic: 'project:<id>', kind: 'comments' }` ; la liste des commentaires se
// relit (`liveSignal`, comme le fait la connexion). Les commentaires sont rangés du plus récent au
// plus ancien : le nouveau arrive en haut. Quand le membre lit plus bas dans la feuille, il est hors
// de vue : rien ne défile tout seul, le bouton paraît, et son arrivée est annoncée une fois au
// lecteur d'écran (choix 11 du plan).
//
// Le composant `Comments` est rendu seul, comme dans ProjectComments.test.tsx ; la liste passe par
// un vrai `useInfiniteQuery` sur la clé des commentaires, avec un faux serveur choisi par le test.
import type { Comment, CommentPage, Project } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { AccessibilityInfo, Text as NativeText, ScrollView, View } from 'react-native'
import { usePostComment } from '../comments/api'
import { useMentionable } from '../mentions/api'
import { getMe } from '../profile/api'
import { commentOf, maxComment, zoeComment } from '../testing/comments'
import { leaMe } from '../testing/fixtures'
import { liveSignal } from '../testing/live'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { focusAndReveal } from '../ui/focus'
import { Comments, type CommentsFresh } from './ProjectComments'
import { lineOf, openSheet, previewNames, sheet, sheetLayer } from './ProjectComments.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
/** Le faux serveur des commentaires : la liste rendue, et le nombre de lectures. */
const mockServer = { comments: [] as Comment[], reads: 0 }
// La liste des commentaires : un vrai `useInfiniteQuery` sur la vraie clé, qui lit le faux serveur.
// Les écritures restent de faux hooks (ce fichier ne teste que la lecture).
jest.mock('../comments/api', () => {
  const actual = jest.requireActual('../comments/api')
  const { useInfiniteQuery: useInfinite } = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useComments: (projectId: string) =>
      useInfinite({
        queryKey: actual.commentsQueryKey(projectId),
        queryFn: async (): Promise<CommentPage> => {
          mockServer.reads += 1
          return { items: mockServer.comments, nextCursor: null }
        },
        initialPageParam: undefined,
        getNextPageParam: () => undefined,
      }),
    usePostComment: jest.fn(),
    useEditComment: jest.fn(() => ({ edit: jest.fn(), pending: false, error: false })),
    useDeleteComment: jest.fn(() => ({ remove: jest.fn(), error: false })),
    useHideComment: jest.fn(() => ({ setHidden: jest.fn(), error: false })),
  }
})
jest.mock('../mentions/api', () => ({ useMentionable: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Où le code amène le lecteur : les aides de ui/focus, gardées telles quelles, mais espionnées.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusAndReveal: jest.fn((node: unknown, calm: boolean) => actual.focusAndReveal(node, calm)),
  }
})
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

// Léa regarde le projet public d'un autre membre.
const project: Project = { ...recipesProject, isMine: false, commentCount: 2 }
const other = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const nora = { id: 'u2', name: 'Nora', handle: 'nora', avatarUrl: null, isTester: false }
/** Les commentaires que Nora publie pendant que Léa regarde, plus récents que tous les autres. */
const fromNora = (index: number, body: string) =>
  commentOf({
    id: `c0ffee00-0000-4000-8000-00000000000${index}`,
    author: nora,
    body,
    createdAt: `2026-10-2${index}T09:00:00.000Z`,
  })
const firstNew = fromNora(1, 'Décollage réussi chez moi !')
const secondNew = fromNora(2, 'Et sur la tablette aussi.')

const plain = (text: string) => text.replace(/\s+/g, ' ')

beforeEach(() => {
  mockServer.comments = [maxComment, zoeComment]
  mockServer.reads = 0
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: jest.fn(), pending: false, error: false })
  jest.mocked(useMentionable).mockReset().mockReturnValue([])
})

afterEach(() => {
  jest.restoreAllMocks()
})

/** Les commentaires du projet, lus une première fois. */
const renderComments = async () => {
  const rendered = await renderWithProviders(<Comments project={project} />)
  await act(async () => {})
  // Témoin : les commentaires du serveur sont là.
  expect(previewNames()).toContainEqual(expect.stringMatching(lineOf('Max', 'Super idée')))
  return rendered
}

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Léa fait défiler la feuille : elle lit plus bas, le haut de la liste est hors de vue. */
const scrollSheetDown = async () => {
  const layer = sheetLayer() as unknown as Node | null
  const scroller = layer ? hostsOf(layer).find((node) => 'scrollEventThrottle' in node.props) : null
  if (!scroller) throw new Error('the comments sheet does not scroll')
  await fireEvent.scroll(scroller as never, {
    nativeEvent: {
      contentOffset: { x: 0, y: 900 },
      contentSize: { width: 390, height: 2400 },
      layoutMeasurement: { width: 390, height: 700 },
    },
  })
}

const signalComments = (queryClient: Parameters<typeof liveSignal>[0], id = project.id) =>
  liveSignal(queryClient, { topic: `project:${id}`, kind: 'comments' })

describe('a comment that arrives on the project page', () => {
  it('appears in its place, at the top, without reloading', async () => {
    const { queryClient } = await renderComments()

    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient)

    expect(previewNames()[0]).toMatch(lineOf('Nora', 'Décollage réussi'))
  })

  it('is not reread for a signal about another project', async () => {
    const { queryClient } = await renderComments()
    const before = mockServer.reads

    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient, other)

    expect(mockServer.reads).toBe(before)
    expect(previewNames()[0]).not.toMatch(lineOf('Nora', 'Décollage réussi'))
  })

  it('shows no button when the top of the open sheet is in view', async () => {
    const { queryClient } = await renderComments()
    await openSheet()

    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient)

    expect(sheet().getByText(plain(firstNew.body))).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1 nouveau commentaire' })).toBeNull()
  })
})

describe('a comment that arrives out of view, while the member reads further down', () => {
  it('shows the « 1 nouveau commentaire » button, and nothing scrolls by itself', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    const { queryClient } = await renderComments()
    await openSheet()
    await scrollSheetDown()
    scrollTo.mockClear()
    jest.mocked(focusAndReveal).mockClear()

    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient)

    expect(screen.getByRole('button', { name: '1 nouveau commentaire' })).toBeTruthy()
    // Rien ne bouge sous le doigt : ni défilement, ni focus déplacé.
    expect(scrollTo).not.toHaveBeenCalled()
    expect(focusAndReveal).not.toHaveBeenCalled()
    // Ce qu'elle lisait est toujours là.
    expect(sheet().getByText(plain(zoeComment.body))).toBeTruthy()
  })

  it('counts the comments that arrive one after the other', async () => {
    const { queryClient } = await renderComments()
    await openSheet()
    await scrollSheetDown()

    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient)
    mockServer.comments = [secondNew, firstNew, maxComment, zoeComment]
    await signalComments(queryClient)

    expect(screen.getByRole('button', { name: '2 nouveaux commentaires' })).toBeTruthy()
  })

  it('takes the member to the new comment when the button is touched, then goes away', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    const { queryClient } = await renderComments()
    await openSheet()
    await scrollSheetDown()
    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient)
    scrollTo.mockClear()
    jest.mocked(focusAndReveal).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: '1 nouveau commentaire' }))

    // Amené en haut de la liste, là où le commentaire est arrivé (par défilement ou par le focus).
    expect(scrollTo.mock.calls.length + jest.mocked(focusAndReveal).mock.calls.length).toBe(1)
    // Relecture de design de R21 : un appel sur rien (`null`) ne fait rien voir. S'il passe par
    // le focus, c'est sur une vue rendue.
    for (const [node] of jest.mocked(focusAndReveal).mock.calls) expect(node).toBeTruthy()
    expect(screen.queryByRole('button', { name: '1 nouveau commentaire' })).toBeNull()
  })

  // Relecture de design de R21 : sur la page, le bouton de l'écran s'en allait, mais la page ne
  // défilait pas : la ligne de l'aperçu (carte `compact`) ne rendait aucune vue à `view()`, et
  // `focusAndReveal(null)` ne fait rien.
  it('brings the new line of the page into view when the page button is touched', async () => {
    // Jest ne place rien à l'écran : on prête aux vues et aux textes natifs un `measureInWindow`
    // qui met le titre de la section sous le bas de la fenêtre (Léa lit plus haut, la description).
    const probeText = createRef<NativeText>()
    const probeView = createRef<View>()
    const protos = [probeText, probeView]
    const pageFresh = jest.fn()
    const fresh = createRef<CommentsFresh>()
    const { queryClient } = await renderWithProviders(
      <>
        <NativeText ref={probeText} />
        <View ref={probeView} />
        <Comments project={project} onPageFresh={pageFresh} freshRef={fresh} />
      </>,
    )
    await act(async () => {})
    const patched = protos.map((probe) => {
      const proto = Object.getPrototypeOf(probe.current) as { measureInWindow?: unknown }
      const had = Object.hasOwn(proto, 'measureInWindow')
      const previous = proto.measureInWindow
      proto.measureInWindow = (done: (x: number, y: number, w: number, h: number) => void) =>
        done(0, 5000, 390, 30)
      return () => {
        if (had) proto.measureInWindow = previous
        else delete proto.measureInWindow
      }
    })
    try {
      mockServer.comments = [firstNew, maxComment, zoeComment]
      await signalComments(queryClient)
      // Témoin : l'écran reçoit le nombre, il montrerait le bouton.
      expect(pageFresh).toHaveBeenLastCalledWith(1)
      jest.mocked(focusAndReveal).mockClear()

      await act(async () => fresh.current?.goToFresh())

      expect(focusAndReveal).toHaveBeenCalledTimes(1)
      expect(jest.mocked(focusAndReveal).mock.calls[0]?.[0]).toBeTruthy()
      expect(pageFresh).toHaveBeenLastCalledWith(0)
    } finally {
      for (const restore of patched) restore()
    }
  })

  it('announces the arrival once to the screen reader', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    const { queryClient } = await renderComments()
    await openSheet()
    await scrollSheetDown()
    announce.mockClear()

    mockServer.comments = [firstNew, maxComment, zoeComment]
    await signalComments(queryClient)
    // Une relecture qui ne trouve rien de plus (un autre signal) ne répète rien.
    await signalComments(queryClient)

    const said = announce.mock.calls.map(([message]) => plain(String(message)))
    expect(said.filter((message) => message === '1 nouveau commentaire')).toHaveLength(1)
  })
})
