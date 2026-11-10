// Tests des décisions de Louis du 6/11/2026 sur les commentaires (après les tests de la tranche) et
// de la précision du 6/11 pour l'ordinateur :
// 1. après un envoi, l'annonce est seulement lue (`LiveStatus visible={false}`), sans encadré ;
// 2. après une suppression, « supprimé » est seulement lu, et le focus va à la carte voisine ;
// 3. un suspendu voit « Voir les N » dès un commentaire, jamais « Commenter », et lit la feuille ; à 0
//    commentaire, pas de bouton, sauf s'il existe une ligne que lui seul voit ;
// 4. sur ordinateur, sans « Voir les N », la colonne montre la liste complète, états compris.
//
// Les aides communes (la feuille, le champ, le menu, le focus) sont dans ProjectComments.testkit.tsx.
import type { Comment, Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { createRef } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
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
import { Comments } from './ProjectComments'
import {
  cardOf,
  chooseInMenu,
  commentField,
  dismissed,
  layerOf,
  linkOrButton,
  openSheet,
  queryCommentField,
  sheet,
  sheetIsOpen,
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
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const project: Project = { ...recipesProject, isMine: false }
const counted = (commentCount: number, fields: Partial<Project> = {}): Project => ({
  ...project,
  ...fields,
  commentCount,
})
const mockPost = jest.fn()
const mockEdit = jest.fn()
const mockRemove = jest.fn()
const mockSetHidden = jest.fn()

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

const probe = createRef<View>()
const renderComments = (shown: Project = project) =>
  renderWithProviders(
    <>
      <View ref={probe} />
      <Comments project={shown} />
    </>,
  )

/**
 * La seule région annoncée de la feuille : son texte, et si elle est cachée à l'œil. Une deuxième
 * (un encadré `Notice polite`, qui porte le même rôle) ferait échouer `getByRole`.
 */
const announcement = () => {
  const status = sheet().getByRole('status')
  return {
    status,
    hidden: StyleSheet.flatten(status.props.style)?.position === 'absolute',
  }
}

beforeEach(() => {
  mockPush.mockReset()
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, id: 'u4', name: 'Malik', handle: 'malik' })
  mockPost.mockReset().mockResolvedValue(true)
  mockEdit.mockReset().mockResolvedValue(true)
  mockRemove.mockReset().mockResolvedValue(true)
  mockSetHidden.mockReset().mockResolvedValue(true)
  jest
    .mocked(usePostComment)
    .mockReset()
    .mockReturnValue({ post: mockPost, pending: false, error: false })
  jest
    .mocked(useEditComment)
    .mockReset()
    .mockReturnValue({ edit: mockEdit, pending: false, error: false })
  jest.mocked(useDeleteComment).mockReset().mockReturnValue({ remove: mockRemove, error: false })
  jest
    .mocked(useHideComment)
    .mockReset()
    .mockReturnValue({ setHidden: mockSetHidden, error: false })
  jest.mocked(useMentionable).mockReset().mockReturnValue([])
  mockComments([])
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('after sending (decision 1 of 6/11)', () => {
  it('only reads « Commentaire publié. », with no visible message', async () => {
    await renderComments(counted(0))
    await openSheet()

    await writeAndSend('Bravo !')

    await waitFor(() => expect(announcement().status).toHaveTextContent('Commentaire publié.'))
    expect(announcement().hidden).toBe(true)
  })

  it('only reads « Réponse publiée. » after a reply', async () => {
    mockComments([zoeComment])
    await renderComments(counted(1))
    await openSheet()

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await writeAndSend('Oui.')

    await waitFor(() => expect(announcement().status).toHaveTextContent('Réponse publiée.'))
    expect(announcement().hidden).toBe(true)
  })

  it('only reads « Commentaire modifié. » after an edit', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    await writeAndSend('Testé.')

    await waitFor(() => expect(announcement().status).toHaveTextContent('Commentaire modifié.'))
    expect(announcement().hidden).toBe(true)
  })

  it('refuses to close the sheet while a comment is being sent', async () => {
    // L'API ne répond pas encore : l'envoi reste en route.
    mockPost.mockReturnValue(new Promise(() => {}))
    await renderComments(counted(0))
    await openSheet()

    await writeAndSend('Bravo !')

    await waitFor(() => expect(sheet().getByRole('button', { name: 'Fermer' })).toBeDisabled())
    await fireEvent.press(sheet().getByRole('button', { name: 'Fermer' }))
    expect(sheetIsOpen()).toBe(true)
  })
})

describe('« Répondre » and the field', () => {
  it('gives the focus to the field', async () => {
    mockComments([zoeComment])
    await renderComments(counted(1))
    await openSheet()
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    focus.mockClear()

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )

    expect(focus).toHaveBeenCalled()
  })
})

describe('after deleting (decision 2 of 6/11)', () => {
  /** Choisit « Supprimer », confirme, puis laisse partir la fenêtre (son `onDismiss`, sur le web). */
  const deleteComment = async (text: string) => {
    await chooseInMenu(text, 'Supprimer')
    await passTapGuard()
    const confirm = screen
      .getAllByRole('button', { name: 'Supprimer' })
      .find((button) => layerOf(button) !== null)
    if (!confirm) throw new Error('no confirmation')
    const layer = layerOf(confirm)
    await fireEvent.press(confirm)
    await dismissed(layer)
  }

  it('only reads « supprimé » after deleting a reply, and the focus goes to the next card', async () => {
    mockComments([{ ...maxComment, replies: [{ ...zoeReply, isMine: true }] }, zoeComment])
    await renderComments(counted(3))
    await openSheet()
    const focus = watchFocus({ current: probe.current })
    try {
      await deleteComment(zoeReply.body)

      await waitFor(() =>
        expect(announcement().status).toHaveTextContent('Ton commentaire a été supprimé.'),
      )
      expect(announcement().hidden).toBe(true)
      await waitFor(() =>
        expect(focus.last()?.accessibilityLabel).toBe('Actions du commentaire de Zoé'),
      )
    } finally {
      focus.restore()
    }
  })

  it('goes back to the previous card when the deleted comment was the last one', async () => {
    mockComments([zoeComment, { ...maxComment, isMine: true, replies: [] }])
    await renderComments(counted(2))
    await openSheet()
    const focus = watchFocus({ current: probe.current })
    try {
      await deleteComment('Super idée, je teste ce soir.')

      await waitFor(() =>
        expect(focus.last()?.accessibilityLabel).toBe('Actions du commentaire de Zoé'),
      )
    } finally {
      focus.restore()
    }
  })
})

describe('a suspended member (decision 3 of 6/11)', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue({ ...suspendedMe, id: 'u4', name: 'Malik' })
  })

  it('sees « Voir le commentaire » from one comment on, never « Commenter », and reads the sheet', async () => {
    mockComments([{ ...zoeComment, replies: [] }])
    await renderComments(counted(1))

    await fireEvent.press(await screen.findByRole('button', { name: 'Voir le commentaire' }))

    expect(screen.queryByRole('button', { name: 'Commenter' })).toBeNull()
    expect(sheetIsOpen()).toBe(true)
    expect(sheet().getByText('Ça marche aussi en anglais ?')).toBeTruthy()
    expect(queryCommentField()).toBeNull()
  })

  it('has no button with no comment', async () => {
    await renderComments(counted(0))

    // Témoin : le titre et la phrase sont là ; le profil est lu.
    expect(screen.getByRole('header', { name: 'Commentaires' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })

  it('keeps a way to open the sheet when the only comment is one that only he sees', async () => {
    // Ni le compteur ni l'aperçu ne le comptent (visibles de tous seulement) ; lui doit pouvoir lire
    // pourquoi il est retiré.
    mockComments([
      { ...maxComment, state: 'removed', isMine: true, removal: removalAfterReport, replies: [] },
    ])
    await renderComments(counted(0))

    // jur-J2 : « Aucun commentaire » serait faux, il en a un à lire.
    const see = await screen.findByRole('button', { name: 'Voir le commentaire' })
    expect(screen.queryByText('Aucun commentaire pour l’instant.')).toBeNull()
    await fireEvent.press(see)

    expect(sheet().getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(queryCommentField()).toBeNull()
  })
})

// Précision (6/11) : l'aperçu n'a que les visibles (jur-P4) ; sans bouton, un commentaire
// masqué ou retiré serait inatteignable. La colonne montre donc d'emblée la liste complète.
describe('the column of a wide screen, with no « Voir les N »', () => {
  let phone: () => void
  beforeEach(() => {
    phone = setDesktopWindow()
    mockSession({ user: { id: 'u1', name: 'Léa' } })
  })
  afterEach(() => {
    phone()
  })

  it('on a wide screen with 5 comments or fewer, a hidden comment stays reachable with its « Démasquer »', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }])
    await renderComments(counted(1, { isMine: true }))

    expect(await screen.findByText('Masqué par toi')).toBeTruthy()
    await fireEvent.press(
      linkOrButton(cardOf('Ça marche aussi en anglais ?', screen), /^Démasquer( le commentaire)?$/),
    )

    expect(mockSetHidden).toHaveBeenCalledWith({ id: zoeComment.id, hidden: false })
    expect(sheetIsOpen()).toBe(false)
  })

  it('shows a hidden comment even when the count says 0', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }])
    await renderComments(counted(0, { isMine: true }))

    expect(await screen.findByText('Masqué par toi')).toBeTruthy()
    expect(screen.queryByText('Aucun commentaire pour l’instant.')).toBeNull()
  })

  it('shows the actions of a visible comment, and moves no focus on arrival', async () => {
    mockComments([zoeComment])
    await renderWithProviders(<View ref={probe} />)
    const focus = watchFocus({ current: probe.current })
    try {
      await renderComments(counted(1))

      expect(
        await screen.findByRole('button', { name: 'Actions du commentaire de Zoé' }),
      ).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Répondre' })).toBeTruthy()
      expect(focus.last()).toBeNull()
    } finally {
      focus.restore()
    }
  })

  it('stays unrolled when a 6th comment arrives: nothing folds under the finger', async () => {
    mockComments([zoeComment])
    const view = await renderComments(counted(5))
    await screen.findByRole('button', { name: 'Actions du commentaire de Zoé' })

    await view.rerender(
      <>
        <View ref={probe} />
        <Comments project={counted(6)} />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Actions du commentaire de Zoé' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Voir / })).toBeNull()
    expect(commentField()).toBeTruthy()
  })
})
