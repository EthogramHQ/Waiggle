// Tests des relectures de R5b sur les commentaires d'un projet (décision 22 du scénario, et les défauts
// de focus et d'annonce) : ce que la section dit et offre selon ce que le membre peut lire ou écrire.
// 1. La colonne repliée annonce un envoi : une seule région, toujours montée, hors de la liste.
// 2. Un compteur à 0 n'est pas « aucun » pour qui lit un commentaire non compté.
// 3. Un projet retiré n'a ni champ ni audience.
// 4. La feuille d'un suspendu dit pourquoi elle n'a pas de champ.
// 5. Le focus ne se perd pas : après « Réessayer », et quand plus rien n'est voisin ni champ.
// 6. Sur un projet privé, un emplacement ne dit pas « masqué » : personne ne l'a masqué.
//
// Les aides communes (la feuille, le champ, le menu, le focus) sont dans ProjectComments.testkit.tsx.
import type { Comment, Project } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { createRef } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useMentionable } from '../mentions/api'
import { getMe } from '../profile/api'
import { maxComment, zoeComment, zoeReply } from '../testing/comments'
import { passTapGuard } from '../testing/dialog'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { removalAfterReport } from '../testing/moderation'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { Comments } from './ProjectComments'
import {
  cardOf,
  commentField,
  dismissed,
  layerOf,
  linkOrButton,
  menuButtonOf,
  openMenuOf,
  openSheet,
  queryCommentField,
  sheet,
  sixThreads,
  watchFocus,
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
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn((node: unknown) => actual.focusWithoutScroll(node)),
    focusAndReveal: jest.fn((node: unknown, calm: boolean) => actual.focusAndReveal(node, calm)),
  }
})
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const project: Project = { ...recipesProject, isMine: false }
const counted = (commentCount: number, fields: Partial<Project> = {}): Project => ({
  ...project,
  ...fields,
  commentCount,
})
const removedProject = (commentCount: number) =>
  counted(commentCount, { isMine: true, removal: removalAfterReport })

const mockPost = jest.fn()
const mockRemove = jest.fn()

const answered = (items: Comment[]) => ({
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
})

const mockComments = (items: Comment[]) =>
  jest
    .mocked(useComments)
    .mockReturnValue(answered(items) as unknown as ReturnType<typeof useComments>)

/** La première page n'a pas pu se lire : `refetch` est ce que « Réessayer » déclenche. */
const mockFailure = (refetch: () => Promise<unknown>) =>
  jest.mocked(useComments).mockReturnValue({
    ...answered([]),
    data: undefined,
    status: 'error',
    isSuccess: false,
    isError: true,
    error: new Error('panne'),
    refetch,
  } as unknown as ReturnType<typeof useComments>)

/** La relecture est en route, sans données : React Query efface alors l'erreur (charte, v5). */
const mockReloading = (refetch: () => Promise<unknown>) =>
  jest.mocked(useComments).mockReturnValue({
    ...answered([]),
    data: undefined,
    status: 'pending',
    isPending: true,
    isSuccess: false,
    refetch,
  } as unknown as ReturnType<typeof useComments>)

/**
 * Une relecture laissée en attente : `answer` la finit, avec ce que la liste devient. Une relecture
 * qui répondrait dans la même tâche ferait passer `retrying` de vrai à faux sans rendu entre les
 * deux : React n'aurait rien à redessiner, ce qui n'arrive jamais avec un vrai réseau.
 */
const pendingReload = () => {
  let finish = () => {}
  const refetch = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const answer = (then: () => void) =>
    act(async () => {
      then()
      finish()
    })
  return { refetch, answer }
}

const probe = createRef<View>()
const renderComments = (shown: Project = project) =>
  renderWithProviders(
    <>
      <View ref={probe} />
      <Comments project={shown} />
    </>,
  )

/** Les blancs d'Intl et de la typographie française ramenés à des espaces, comme getByText. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

const nothingYet = 'Aucun commentaire pour l’instant.'
const suspendedNote = () => fr.t(($) => $.project.comments.suspendedNote)
const emptyRemoved = () => plain(fr.t(($) => $.project.comments.emptyRemoved))
const audience = () => plain(fr.t(($) => $.project.comments.hint))
const hiddenPlaceholder = () => fr.t(($) => $.project.comments.hiddenPlaceholder)
const privateKept = () => fr.t(($) => $.project.comments.privateKeptPlaceholder)

/** Le commentaire de cet autre membre, tel que l'API le donne : sa place seulement, et sa réponse. */
const placeholderWithReply: Comment = {
  ...maxComment,
  author: null,
  body: '',
  state: 'hidden',
  isMine: false,
  mentions: [],
  createdAt: null,
  editedAt: null,
  removal: null,
  replies: [{ ...zoeReply, isMine: true }],
}

const ownRemoved: Comment = {
  ...maxComment,
  state: 'removed',
  isMine: true,
  removal: removalAfterReport,
  replies: [],
}

beforeEach(() => {
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, id: 'u4', name: 'Malik', handle: 'malik' })
  mockPost.mockReset().mockResolvedValue(true)
  mockRemove.mockReset().mockResolvedValue(true)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: mockPost, pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: jest.fn().mockResolvedValue(true), pending: false, error: false })
  jest.mocked(useDeleteComment).mockReset().mockReturnValue({ remove: mockRemove, error: false })
  jest
    .mocked(useHideComment)
    .mockReset()
    .mockReturnValue({ setHidden: jest.fn().mockResolvedValue(true), error: false })
  jest.mocked(useMentionable).mockReset().mockReturnValue([])
  mockComments([])
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('the announcement of the column', () => {
  let phone: () => void
  beforeEach(() => {
    phone = setDesktopWindow()
  })
  afterEach(() => {
    phone()
  })

  it('says « Commentaire publié. » from a folded column of 6 comments', async () => {
    mockComments(sixThreads)
    await renderComments(counted(6))
    // Témoin : la colonne est repliée, et sa région est déjà là, vide, avant l'envoi.
    expect(screen.getByRole('button', { name: 'Voir les 6 commentaires' })).toBeTruthy()
    expect(screen.getByRole('status')).toHaveTextContent('')

    await writeAndSend('Bravo !')

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Commentaire publié.'))
    expect(StyleSheet.flatten(screen.getByRole('status').props.style)?.position).toBe('absolute')
  })

  it('keeps a single region once the list is unrolled', async () => {
    mockComments(sixThreads)
    await renderComments(counted(6))

    await fireEvent.press(screen.getByRole('button', { name: 'Voir les 6 commentaires' }))
    await writeAndSend('Bravo !')

    // `getByRole` refuse deux régions.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Commentaire publié.'))
  })
})

describe('the announcement on a phone', () => {
  it('lives in the sheet only: the page has no region of its own', async () => {
    await renderComments(counted(0))
    expect(screen.queryByRole('status')).toBeNull()

    await openSheet()

    // Une région hors d'une fenêtre `aria-modal` ne serait pas lue : `getByRole` en refuse deux.
    expect(sheet().getByRole('status')).toBeTruthy()
  })
})

describe('a count of 0 for a reader who has a comment to read (phone)', () => {
  it('does not say there are no comments to a reader who has one only they see', async () => {
    mockComments([ownRemoved])
    await renderComments(counted(0))

    await fireEvent.press(await screen.findByRole('button', { name: 'Voir le commentaire' }))

    expect(screen.queryByText(nothingYet)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Écrire un commentaire' })).toBeNull()
    expect(sheet().getByText('Super idée, je teste ce soir.')).toBeTruthy()
    // Il peut toujours écrire : la feuille a son champ.
    expect(commentField(sheet())).toBeTruthy()
  })

  it('gives the author of the project the way to « Démasquer » behind « Voir le commentaire »', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }])
    await renderComments(counted(0, { isMine: true }))

    await fireEvent.press(screen.getByRole('button', { name: 'Voir le commentaire' }))

    expect(screen.queryByText(nothingYet)).toBeNull()
    expect(
      linkOrButton(cardOf('Ça marche aussi en anglais ?'), /^Démasquer( le commentaire)?$/),
    ).toBeTruthy()
  })

  it('still says it to a reader who has nothing to read, and offers to write', async () => {
    await renderComments(counted(0))

    expect(screen.getByText(nothingYet)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
  })

  it('does not count a placeholder as something to read', async () => {
    mockComments([{ ...placeholderWithReply, replies: [] }])
    await renderComments(counted(0))

    expect(screen.getByText(nothingYet)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
  })
})

describe('a project removed by the moderation', () => {
  it('offers no field and no audience on a project removed by the moderation', async () => {
    await renderComments(removedProject(0))

    // Témoin : la section est là, et elle dit ce qu'il en est.
    expect(screen.getByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText(emptyRemoved())).toBeTruthy()
    expect(screen.queryByText(nothingYet)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(queryCommentField()).toBeNull()
    expect(screen.queryByText(audience())).toBeNull()
  })

  it('offers « Voir le commentaire » to its author who has one, without a field, « Répondre » or « Modifier »', async () => {
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    await renderComments(removedProject(1))

    await fireEvent.press(screen.getByRole('button', { name: 'Voir le commentaire' }))

    expect(sheet().getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(queryCommentField()).toBeNull()
    expect(sheet().queryByRole('button', { name: 'Répondre' })).toBeNull()
    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Supprimer'])
    // Ce n'est pas une suspension : la feuille n'en parle pas.
    expect(sheet().queryByText(suspendedNote())).toBeNull()
  })

  it('offers no field either in the column of a wide screen', async () => {
    const phone = setDesktopWindow()
    try {
      await renderComments(removedProject(0))

      expect(await screen.findByText(emptyRemoved())).toBeTruthy()
      expect(queryCommentField()).toBeNull()
      expect(screen.queryByText(audience())).toBeNull()
    } finally {
      phone()
    }
  })

  it('keeps the field and the audience on a public project that was not removed', async () => {
    const phone = setDesktopWindow()
    try {
      await renderComments(counted(0))

      expect(commentField()).toBeTruthy()
      expect(screen.getByText(audience())).toBeTruthy()
      expect(screen.queryByText(emptyRemoved())).toBeNull()
    } finally {
      phone()
    }
  })
})

describe('the sheet of a suspended member', () => {
  it('says why it has no field', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...suspendedMe, id: 'u4', name: 'Malik' })
    mockComments([zoeComment])
    await renderComments(counted(1))

    await fireEvent.press(await screen.findByRole('button', { name: 'Voir le commentaire' }))

    expect(sheet().getByText(suspendedNote())).toBeTruthy()
    expect(queryCommentField()).toBeNull()
  })

  it('says nothing of the kind to a member who is not suspended', async () => {
    mockComments([zoeComment])
    await renderComments(counted(1))
    await openSheet()
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    expect(commentField(sheet())).toBeTruthy()
    expect(sheet().queryByText(suspendedNote())).toBeNull()
  })
})

describe('where the focus goes after « Réessayer »', () => {
  it('goes to the first card of the sheet once the comments are read', async () => {
    const reload = pendingReload()
    mockFailure(reload.refetch)
    await renderComments(counted(1))
    await openSheet()
    const focus = watchFocus({ current: probe.current })
    try {
      await fireEvent.press(sheet().getByRole('button', { name: 'Réessayer' }))
      await reload.answer(() => mockComments([zoeComment]))

      await waitFor(() =>
        expect(focus.last()?.accessibilityLabel).toBe('Actions du commentaire de Zoé'),
      )
      expect(reload.refetch).toHaveBeenCalledTimes(1)
      expect(sheet().queryByRole('button', { name: 'Réessayer' })).toBeNull()
    } finally {
      focus.restore()
    }
  })

  it('goes to the first line of the preview when the sheet is closed', async () => {
    const reload = pendingReload()
    mockFailure(reload.refetch)
    await renderComments(counted(1))
    const focus = watchFocus({ current: probe.current })
    try {
      await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
      await reload.answer(() => mockComments([zoeComment]))

      await waitFor(() =>
        expect(String(focus.last()?.accessibilityLabel)).toMatch(/^Commentaire de Zoé/),
      )
    } finally {
      focus.restore()
    }
  })

  it('goes to the first card of the column on a wide screen', async () => {
    const phone = setDesktopWindow()
    const reload = pendingReload()
    mockFailure(reload.refetch)
    await renderComments(counted(1))
    const focus = watchFocus({ current: probe.current })
    try {
      await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
      await reload.answer(() => mockComments([zoeComment]))

      await waitFor(() =>
        expect(focus.last()?.accessibilityLabel).toBe('Actions du commentaire de Zoé'),
      )
    } finally {
      focus.restore()
      phone()
    }
  })

  it('leaves « Réessayer » and its focus while the comments are read again', async () => {
    const refetch = jest.fn(
      () =>
        new Promise<void>(() => {
          mockReloading(refetch)
        }),
    )
    mockFailure(refetch)
    await renderComments(counted(1))
    await openSheet()
    const focus = watchFocus({ current: probe.current })
    try {
      await fireEvent.press(sheet().getByRole('button', { name: 'Réessayer' }))

      // Le même bouton, occupé : un chargement à sa place emporterait le focus.
      expect(sheet().getByRole('button', { name: 'Réessayer' })).toBeBusy()
      expect(sheet().queryByText(fr.t(($) => $.project.comments.loading))).toBeNull()
      expect(focus.last()).toBeNull()
    } finally {
      focus.restore()
    }
  })

  it('leaves « Réessayer » and its focus when the comments still cannot be read', async () => {
    const reload = pendingReload()
    mockFailure(reload.refetch)
    await renderComments(counted(1))
    await openSheet()
    const focus = watchFocus({ current: probe.current })
    try {
      await fireEvent.press(sheet().getByRole('button', { name: 'Réessayer' }))
      expect(sheet().getByRole('button', { name: 'Réessayer' })).toBeBusy()
      await reload.answer(() => {})

      expect(sheet().getByRole('button', { name: 'Réessayer' })).not.toBeBusy()
      expect(reload.refetch).toHaveBeenCalledTimes(1)
      expect(focus.last()).toBeNull()
    } finally {
      focus.restore()
    }
  })

  it('goes to the title of the section when the list is empty and there is no field', async () => {
    const phone = setDesktopWindow()
    const reload = pendingReload()
    mockFailure(reload.refetch)
    await renderComments(removedProject(0))
    const focus = watchFocus({ current: probe.current })
    try {
      await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
      await reload.answer(() => mockComments([]))

      await waitFor(() => expect(screen.getByText(emptyRemoved())).toBeTruthy())
      expect(focus.last()).toMatchObject({ accessibilityRole: 'header' })
    } finally {
      focus.restore()
      phone()
    }
  })
})

describe('deleting the last comment, with no field to fall back on', () => {
  /** Choisit « Supprimer » dans la colonne, confirme, puis laisse partir la fenêtre. */
  const deleteFromColumn = async (text: string) => {
    await fireEvent.press(menuButtonOf(cardOf(text, screen)))
    const item = screen.getByRole('menuitem', { name: 'Supprimer' })
    const menu = layerOf(item)
    await fireEvent.press(item)
    await dismissed(menu)
    await passTapGuard()
    const confirm = screen
      .getAllByRole('button', { name: 'Supprimer' })
      .find((button) => layerOf(button) !== null)
    if (!confirm) throw new Error('no confirmation')
    const layer = layerOf(confirm)
    await fireEvent.press(confirm)
    await dismissed(layer)
  }

  it('keeps the focus in the section for a suspended member: the title takes it', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...suspendedMe, id: 'u4', name: 'Malik' })
    const phone = setDesktopWindow()
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    await renderComments(counted(1))
    await screen.findByRole('button', { name: 'Actions du commentaire de Max' })
    await waitFor(() => expect(queryCommentField()).toBeNull())
    const focus = watchFocus({ current: probe.current })
    try {
      await deleteFromColumn('Super idée, je teste ce soir.')

      await waitFor(() =>
        expect(focus.last()?.accessibilityLabel).toBe('Commentaires, 1 commentaire'),
      )
      expect(mockRemove).toHaveBeenCalledTimes(1)
    } finally {
      focus.restore()
      phone()
    }
  })

  it('still gives it to the field for a member who has one', async () => {
    const phone = setDesktopWindow()
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    await renderComments(counted(1))
    await screen.findByRole('button', { name: 'Actions du commentaire de Max' })
    const focus = watchFocus({ current: probe.current })
    try {
      await deleteFromColumn('Super idée, je teste ce soir.')

      await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(1))
      await act(async () => {
        await new Promise((done) => setTimeout(done, 50))
      })
      expect(focus.last()?.accessibilityLabel).not.toBe('Commentaires, 1 commentaire')
    } finally {
      focus.restore()
      phone()
    }
  })
})

describe('a placeholder on a private project', () => {
  it('says the comment is kept, not hidden: nobody hid it', async () => {
    mockComments([placeholderWithReply])
    await renderComments(counted(1, { isMine: true, visibility: 'private' }))

    await openSheet()

    expect(sheet().getByText(privateKept())).toBeTruthy()
    expect(sheet().queryByText(hiddenPlaceholder())).toBeNull()
    // Sa réponse reste sous lui.
    expect(sheet().getByText(zoeReply.body)).toBeTruthy()
  })

  it('still says « masqué » on a public project', async () => {
    mockComments([placeholderWithReply])
    await renderComments(counted(1))

    await openSheet()

    expect(sheet().getByText(hiddenPlaceholder())).toBeTruthy()
    expect(sheet().queryByText(privateKept())).toBeNull()
  })
})
