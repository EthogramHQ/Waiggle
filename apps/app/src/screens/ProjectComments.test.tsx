// Tests des commentaires d'un projet, tels que R5b les redessine (docs/scenarios/refonte.md,
// « R5b — Les commentaires ») : l'aperçu sur la page, la feuille qui s'ouvre par-dessus, le champ
// du bas (écrire, répondre, modifier, mentionner), le menu « … » de chaque carte et les états
// (retiré, bloqué, suspendu). Le composant `Comments` est rendu seul, avec un projet donné ; la page
// entière est testée dans ProjectScreen.comments.test.tsx et ProjectScreen.comment-actions.test.tsx.
//
// Les aides communes (la feuille, le champ, le menu, les touches, le focus) sont dans
// ProjectComments.testkit.tsx.
import type { Comment, Project } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, View } from 'react-native'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { useMentionable } from '../mentions/api'
import { getMe } from '../profile/api'
import {
  commentOf,
  inesMember,
  inesMention,
  inikoMember,
  leaReply,
  maxComment,
  zoeComment,
  zoeReply,
} from '../testing/comments'
import { passTapGuard } from '../testing/dialog'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { removalAfterReport } from '../testing/moderation'
import { reportsOpened } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr, missingSentences, removalSentences } from '../testing/text'
import { parisDateTime } from '../ui/parisTime'
import { Comments } from './ProjectComments'
import {
  cardOf,
  chooseInMenu,
  closeSheet,
  commentField,
  describeFocused,
  dismissed,
  inside,
  layerOf,
  lendContains,
  lendPage,
  lineOf,
  menuButtonOf,
  openMenuOf,
  openSheet,
  outside,
  pressKey,
  previewLines,
  previewNames,
  queryCommentField,
  sendButton,
  sheet,
  sheetIsOpen,
  sixComments,
  sixThreads,
  threadItems,
  watchFocus,
  writeAndSend,
} from './ProjectComments.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
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
// Les suggestions après « @ » : un faux hook, qui propose Inès et Iniko pour « in ».
jest.mock('../mentions/api', () => ({ useMentionable: jest.fn() }))
// Le profil du membre connecté (tranche 7c) : il dit si son compte est suspendu.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Où le code pose le focus : les aides de ui/focus, gardées telles quelles, mais dont le test lit
// les appels (watchFocus du testkit).
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

// Malik regarde le projet public de Léa.
const project: Project = { ...recipesProject, isMine: false }
/** Le projet, avec le nombre de commentaires que l'API donne (le titre et « Voir les N »). */
const counted = (commentCount: number, fields: Partial<Project> = {}): Project => ({
  ...project,
  ...fields,
  commentCount,
})
const mockPost = jest.fn()
const mockEdit = jest.fn()
const mockRemove = jest.fn()
const mockSetHidden = jest.fn()

/** La liste des commentaires telle que useComments la rend : une seule page, sans suite. */
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

/** Les blancs d'Intl et de la typographie française ramenés à des espaces, comme getByText. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

/**
 * Rend les commentaires de ce projet, à côté d'une vue témoin : sa `ref` donne le prototype commun
 * des vues (watchFocus, lendContains).
 */
const probe = createRef<View>()
const renderComments = (shown: Project = project) =>
  renderWithProviders(
    <>
      <View ref={probe} />
      <Comments project={shown} />
    </>,
  )

beforeEach(() => {
  mockPush.mockReset()
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  // Tranche 7c : Malik n'est pas suspendu (son profil, tel que GET /v1/me le rend).
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
  jest
    .mocked(useMentionable)
    .mockReset()
    .mockImplementation((_projectId, query) =>
      query?.startsWith('in') ? [inesMember, inikoMember] : [],
    )
  mockComments([])
})

afterEach(() => {
  jest.restoreAllMocks()
})

// --- L'aperçu sur la page (téléphone) ---

describe('the preview of the comments on a phone', () => {
  it('shows the first 3 lines of the sheet, replies included, newest thread first', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    // Le fil de Max, puis ses deux réponses : les 3 premières lignes de la feuille (choix 2).
    expect(previewNames()).toEqual([
      expect.stringMatching(lineOf('Max', 'Super idée')),
      expect.stringMatching(lineOf('Zoé', 'Moi aussi')),
      expect.stringMatching(lineOf('Léa', 'Merci à vous deux')),
    ])
  })

  it('shows neither « Répondre » nor « … » in the preview', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    // Témoin : les lignes de l'aperçu sont là.
    expect(previewLines()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Actions du commentaire de / })).toBeNull()
  })

  it('titles the preview « Commentaires 6 », read « Commentaires, 6 commentaires »', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    expect(screen.getByRole('header', { name: 'Commentaires, 6 commentaires' })).toBeTruthy()
  })

  it('opens the sheet from « Voir les 6 commentaires »', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    expect(sheetIsOpen()).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: 'Voir les 6 commentaires' }))

    expect(sheetIsOpen()).toBe(true)
    expect(sheet().getByText('Testé avec des restes de couscous.')).toBeTruthy()
  })

  it('opens the sheet from a comment of the preview', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    await fireEvent.press(screen.getByRole('button', { name: lineOf('Zoé', 'Moi aussi') }))

    expect(sheetIsOpen()).toBe(true)
  })

  it('offers « Commenter » with 3 comments or fewer, which opens the sheet', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))

    expect(screen.queryByRole('button', { name: /^Voir les/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Commenter' }))

    expect(sheetIsOpen()).toBe(true)
    expect(commentField(sheet())).toBeTruthy()
  })

  it('says there is no comment yet, and « Écrire un commentaire » opens the sheet with the field', async () => {
    await renderComments(counted(0))

    expect(screen.getByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText('Aucun commentaire pour l’instant.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))

    expect(sheetIsOpen()).toBe(true)
    expect(commentField(sheet())).toBeTruthy()
  })

  // jur-P9, décision D4 : sur son projet privé, l'auteur ne lit pas « Aucun commentaire » ; les
  // commentaires des autres sont gardés, et aucun membre ne les lit tant que le projet reste privé.
  it("does not say there are no comments on a private project that keeps others' comments", async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await renderComments(counted(0, { isMine: true, visibility: 'private' }))

    expect(screen.queryByText('Aucun commentaire pour l’instant.')).toBeNull()
    expect(screen.getByText(plain(fr.t(($) => $.project.comments.emptyPrivate)))).toBeTruthy()
  })
})

// --- La feuille ---

describe('the comments sheet', () => {
  it('the sheet lists 6 threads as list items', async () => {
    mockComments(sixThreads)
    await renderComments(counted(6))

    await openSheet()

    expect(threadItems()).toHaveLength(6)
  })

  it('shows every comment in the sheet, each with « Répondre » and its « … »', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    await openSheet()

    expect(sheet().getAllByRole('button', { name: 'Répondre' })).toHaveLength(6)
    expect(sheet().getAllByRole('button', { name: /^Actions du commentaire de / })).toHaveLength(6)
    expect(sheet().getByRole('button', { name: 'Actions du commentaire de Max' })).toBeTruthy()
  })

  it('reads the name of the author of the project with her badge, « Léa, Auteur »', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))

    await openSheet()

    expect(sheet().getByRole('link', { name: 'Léa, Auteur' })).toBeTruthy()
    // Les autres auteurs : leur nom seul.
    expect(sheet().getByRole('link', { name: 'Max' })).toBeTruthy()
  })

  it('keeps a started text when the sheet closes, and finds it again when it opens', async () => {
    mockComments(sixComments)
    await renderComments(counted(6))

    await openSheet()
    await fireEvent.changeText(commentField(), 'Testé ce soir, c’est')
    await closeSheet()
    expect(sheetIsOpen()).toBe(false)
    await openSheet()

    expect(commentField()).toHaveDisplayValue('Testé ce soir, c’est')
  })

  describe('on the web, with the keyboard', () => {
    // Le faux document : la fenêtre de confirmation y écoute l'Échap enfoncée (ui-B3).
    let returnPage: () => void = () => {}
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      returnPage = lendPage()
    })
    afterEach(() => returnPage())

    it('closes with « Fermer » and gives the focus back to « Voir les 6 commentaires »', async () => {
      mockComments(sixComments)
      await renderComments(counted(6))
      await openSheet()
      const focus = watchFocus(probe)
      try {
        await closeSheet()

        expect(sheetIsOpen()).toBe(false)
        expect(focus.last()?.accessibilityLabel).toBe('Voir les 6 commentaires')
      } finally {
        focus.restore()
      }
    })

    it('closes with Escape and gives the focus back to the button that opened it', async () => {
      mockComments(sixComments)
      await renderComments(counted(6))
      await openSheet()
      const restore = lendContains(probe)
      const focus = watchFocus(probe)
      try {
        await pressKey(sheet().getByRole('button', { name: 'Fermer' }), 'Escape', inside)

        expect(sheetIsOpen()).toBe(false)
        expect(focus.last()?.accessibilityLabel).toBe('Voir les 6 commentaires')
      } finally {
        focus.restore()
        restore()
      }
    })

    it('closing the sheet opened from a preview card gives the focus back to that card', async () => {
      mockComments(sixComments)
      await renderComments(counted(6))
      await fireEvent.press(screen.getByRole('button', { name: lineOf('Zoé', 'Moi aussi') }))
      const focus = watchFocus(probe)
      try {
        await closeSheet()

        expect(String(focus.last()?.accessibilityLabel)).toMatch(lineOf('Zoé', 'Moi aussi'))
      } finally {
        focus.restore()
      }
    })

    // ui-B1 : la feuille n'agit sur Échap que si la touche vient de son panneau et n'a pas déjà
    // été prise par ce qui est dedans (la liste des mentions) ou par-dessus (le menu, la fenêtre).
    it('Escape in the open mention list closes the list and keeps the sheet open', async () => {
      await renderComments(counted(0))
      await openSheet()
      const restore = lendContains(probe)
      try {
        await fireEvent.changeText(commentField(), 'Bravo @in')
        expect(screen.getByLabelText('Membres à mentionner')).toBeTruthy()

        await pressKey(commentField(), 'Escape', inside)

        expect(screen.queryByLabelText('Membres à mentionner')).toBeNull()
        expect(sheetIsOpen()).toBe(true)
        expect(commentField()).toHaveDisplayValue('Bravo @in')
      } finally {
        restore()
      }
    })

    it('Escape in a comment menu inside the sheet closes the menu only and gives the focus back to « … »', async () => {
      mockComments([zoeComment])
      await renderComments(counted(1))
      await openSheet()
      const restore = lendContains(probe)
      await fireEvent.press(menuButtonOf(cardOf('Ça marche aussi en anglais ?')))
      const item = screen.getByRole('menuitem', { name: 'Signaler' })
      const menu = layerOf(item)
      const focus = watchFocus(probe)
      try {
        await pressKey(item, 'Escape', outside)
        await dismissed(menu)

        expect(screen.queryByRole('menuitem')).toBeNull()
        expect(sheetIsOpen()).toBe(true)
        expect(focus.last()?.accessibilityLabel).toBe('Actions du commentaire de Zoé')
        expect(reportsOpened(mockPush)).toEqual([])
      } finally {
        focus.restore()
        restore()
      }
    })

    it('Escape in the delete confirmation closes the dialog and keeps the sheet open', async () => {
      mockComments([{ ...maxComment, isMine: true }])
      await renderComments(counted(3))
      await openSheet()
      const restore = lendContains(probe)
      try {
        await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
        expect(screen.getByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeTruthy()
        await passTapGuard()

        await pressKey(screen.getByRole('button', { name: 'Annuler' }), 'Escape', outside)

        await waitFor(() =>
          expect(screen.queryByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeNull(),
        )
        expect(sheetIsOpen()).toBe(true)
        expect(mockRemove).not.toHaveBeenCalled()
      } finally {
        restore()
      }
    })
  })

  // ui-B2 : depuis la feuille, un nom, une pastille ou « Signaler » ferme d'abord la feuille, puis
  // ouvre la page (sinon la page s'ouvrirait sous la feuille restée ouverte).
  it('touching a mention pill in the sheet closes the sheet and opens the member page', async () => {
    mockComments([
      { ...maxComment, body: 'Demande à @ines_morel, elle sait.', mentions: [inesMention] },
    ])
    await renderComments(counted(3))
    await openSheet()

    await fireEvent.press(sheet().getByRole('link', { name: 'Inès Morel, ouvre son profil' }))

    expect(sheetIsOpen()).toBe(false)
    // Le membre gardé avec la mention (son identifiant), même s'il a changé de pseudo depuis.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/members/[id]',
      params: { id: inesMention.memberId },
    })
  })

  it('« Signaler » in a comment menu closes the sheet and opens the report of this comment', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu(zoeReply.body, 'Signaler')

    expect(sheetIsOpen()).toBe(false)
    expect(reportsOpened(mockPush)).toEqual([
      expect.objectContaining({ kind: 'comment', id: zoeReply.id }),
    ])
  })

  it('touching an author name in the sheet closes the sheet and opens their page', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))
    await openSheet()

    await fireEvent.press(sheet().getByRole('link', { name: 'Léa, Auteur' }))

    expect(sheetIsOpen()).toBe(false)
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u1' } })
  })
})

// --- Écrire et envoyer ---

describe('writing a comment in the sheet', () => {
  it('sends the comment with the arrow, empties the field and stays in the sheet', async () => {
    await renderComments(counted(0))
    await openSheet()

    await writeAndSend('Bravo, ça marche !')

    expect(mockPost).toHaveBeenCalledWith(expect.objectContaining({ body: 'Bravo, ça marche !' }))
    expect(mockPost.mock.calls[0]?.[0]).not.toHaveProperty('replyTo', expect.anything())
    await waitFor(() => expect(commentField()).toHaveDisplayValue(''))
    expect(sheetIsOpen()).toBe(true)
  })

  it('refuses to send an empty field', async () => {
    await renderComments(counted(0))
    await openSheet()

    expect(sendButton()).toBeDisabled()
    await fireEvent.press(sendButton())

    expect(mockPost).not.toHaveBeenCalled()
  })

  it('puts the new comment at the head of the list, and the number goes up on the page and in the sheet', async () => {
    mockComments([zoeComment])
    const view = await renderComments(counted(1))
    await openSheet()

    await writeAndSend('Bravo !')
    // Le cache de React Query, que le faux hook ne tient pas : la liste et le nombre, comme après
    // l'envoi (le nouveau commentaire en tête, le sien).
    mockComments([
      commentOf({
        id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f90a1b2c3',
        author: { id: 'u4', name: 'Malik', handle: 'malik', avatarUrl: null },
        body: 'Bravo !',
        createdAt: '2026-10-16T09:00:00.000Z',
        isMine: true,
      }),
      zoeComment,
    ])
    await view.rerender(
      <>
        <View ref={probe} />
        <Comments project={counted(2)} />
      </>,
    )

    const shown = sheet().getAllByText(/^(Bravo !|Ça marche aussi en anglais \?)$/)
    expect(shown.map((node) => node.props.children)).toEqual([
      'Bravo !',
      'Ça marche aussi en anglais ?',
    ])
    expect(screen.getAllByRole('header', { name: 'Commentaires, 2 commentaires' })).toHaveLength(2)
  })

  it('shows the error above the field, keeps the text, and « Réessayer » sends again', async () => {
    mockPost.mockResolvedValue(false)
    jest.mocked(usePostComment).mockReturnValue({ post: mockPost, pending: false, error: true })
    await renderComments(counted(0))
    await openSheet()

    await writeAndSend('Bravo, ça marche !')

    expect(await sheet().findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être publié. Réessaie.',
    )
    expect(commentField()).toHaveDisplayValue('Bravo, ça marche !')
    await fireEvent.press(sheet().getByRole('button', { name: 'Réessayer' }))
    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(mockPost).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: 'Bravo, ça marche !' }),
    )
  })
})

// jur-P1 : la légende sous le champ dit qui lira, selon ce qu'on écrit et le projet (les six
// textes d'aujourd'hui, gardés).
describe('who will read it, under the field', () => {
  const caption = (key: 'hint' | 'hintPrivate' | 'replyHint' | 'editHint' | 'editHintHidden') =>
    plain(fr.t(($) => $.project.comments[key]))

  it('shows who will read a new comment on a public project', async () => {
    await renderComments(counted(0))
    await openSheet()

    expect(sheet().getByText(caption('hint'))).toBeTruthy()
  })

  it('shows the private-project audience under the field on a private project', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await renderComments(counted(0, { isMine: true, visibility: 'private' }))
    await openSheet()

    expect(sheet().getByText(caption('hintPrivate'))).toBeTruthy()
    expect(sheet().queryByText(caption('hint'))).toBeNull()
  })

  it('shows the hidden-comment audience while editing a hidden comment', async () => {
    mockComments([{ ...maxComment, state: 'hidden', isMine: true, replies: [] }])
    await renderComments(counted(0))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')

    expect(sheet().getByText(caption('editHintHidden'))).toBeTruthy()
  })

  it('shows the reply audience while replying', async () => {
    mockComments([zoeComment])
    await renderComments(counted(1))
    await openSheet()

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )

    expect(sheet().getByText(caption('replyHint'))).toBeTruthy()
    expect(sheet().queryByText(caption('hint'))).toBeNull()
  })

  it('shows the edit audience while editing a visible comment', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')

    expect(sheet().getByText(caption('editHint'))).toBeTruthy()
  })
})

// --- Répondre ---

describe('replying from the sheet', () => {
  it('« Répondre » under a comment shows « Réponse à Zoé » and sends the reply in its thread', async () => {
    mockComments([maxComment, zoeComment])
    await renderComments(counted(4))
    await openSheet()

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    expect(sheet().getByText(/Réponse à\s*Zoé/)).toBeTruthy()
    // Une réponse à une racine : pas de mention au début du champ.
    expect(commentField()).toHaveDisplayValue('')
    await writeAndSend('Oui, en anglais aussi.')

    expect(mockPost).toHaveBeenCalledWith({
      body: 'Oui, en anglais aussi.',
      replyTo: zoeComment.id,
    })
  })

  it('« Répondre » under a reply answers in the same thread, the field starting with its author’s mention', async () => {
    mockComments([maxComment, zoeComment])
    await renderComments(counted(4))
    await openSheet()

    await fireEvent.press(cardOf(zoeReply.body).getByRole('button', { name: 'Répondre' }))

    // Choix 3 : le champ commence par la mention de Zoé, pour qu'on sache à qui il répond.
    expect(commentField()).toHaveDisplayValue('@zoe ')
    await writeAndSend('@zoe Je vous raconte demain.')
    // Les réponses tiennent sur un seul niveau : on répond au commentaire racine.
    expect(mockPost).toHaveBeenCalledWith({
      body: '@zoe Je vous raconte demain.',
      replyTo: maxComment.id,
    })
  })

  it('« Répondre » under one’s own reply starts with no mention', async () => {
    mockComments([{ ...maxComment, replies: [{ ...zoeReply, isMine: true }, leaReply] }])
    await renderComments(counted(3))
    await openSheet()

    await fireEvent.press(cardOf(zoeReply.body).getByRole('button', { name: 'Répondre' }))

    // Témoin : on répond bien (le bandeau), mais sans se mentionner soi-même.
    expect(sheet().getByText(/Réponse à\s*Zoé/)).toBeTruthy()
    expect(commentField()).toHaveDisplayValue('')
  })

  it('« Annuler la réponse » ends the reply: the next comment starts a thread', async () => {
    mockComments([zoeComment])
    await renderComments(counted(1))
    await openSheet()

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await fireEvent.press(sheet().getByRole('button', { name: 'Annuler la réponse' }))

    expect(sheet().queryByText(/Réponse à\s*Zoé/)).toBeNull()
    await writeAndSend('Un nouveau fil.')
    expect(mockPost).toHaveBeenCalledWith({ body: 'Un nouveau fil.' })
  })
})

// --- Modifier (choix 5 : dans le champ du bas, avec un bandeau) ---

describe('editing one’s comment from the sheet', () => {
  it('« Modifier » puts the text in the field under « Modifier ton commentaire », and sending replaces it', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    expect(sheet().getByText('Modifier ton commentaire')).toBeTruthy()
    expect(commentField()).toHaveDisplayValue('Super idée, je teste ce soir.')
    await writeAndSend('Testé : ça marche.')

    expect(mockEdit).toHaveBeenCalledWith({ id: maxComment.id, body: 'Testé : ça marche.' })
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('« Annuler la modification » gives the field back its text from before', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()
    await fireEvent.changeText(commentField(), 'Un brouillon')

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    await fireEvent.press(sheet().getByRole('button', { name: 'Annuler la modification' }))

    expect(sheet().queryByText('Modifier ton commentaire')).toBeNull()
    expect(commentField()).toHaveDisplayValue('Un brouillon')
    expect(mockEdit).not.toHaveBeenCalled()
  })
})

// --- Les mentions (tranche 6b, puis R5b : la pastille au nom du membre) ---

describe('mentioning a member in a comment', () => {
  /** Tape ce texte dans le champ, puis choisit Inès dans les suggestions. */
  const mentionInes = async (typed: string) => {
    await fireEvent.changeText(commentField(), typed)
    await fireEvent.press(screen.getByRole('option', { name: /Inès Morel/ }))
  }

  it('looks for the members of « @in » on this project', async () => {
    await renderComments(counted(0))
    await openSheet()

    await fireEvent.changeText(commentField(), 'Bravo @in')

    expect(useMentionable).toHaveBeenCalledWith(project.id, 'in')
    expect(screen.getByRole('option', { name: /Inès Morel.*@ines_morel/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Iniko Diallo.*@iniko/ })).toBeTruthy()
  })

  it('writes « @ines_morel » once Inès is chosen, and sends it with the text', async () => {
    await renderComments(counted(0))
    await openSheet()

    await mentionInes('Bravo @in')
    expect(commentField()).toHaveDisplayValue('Bravo @ines_morel ')
    await fireEvent.press(sendButton())

    expect(mockPost).toHaveBeenCalledWith({ body: expect.stringContaining('Bravo @ines_morel') })
  })

  it('offers the same suggestions in a reply', async () => {
    mockComments([zoeComment])
    await renderComments(counted(1))
    await openSheet()

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await mentionInes('Oui, demande à @in')
    await fireEvent.press(sendButton())

    expect(mockPost).toHaveBeenCalledWith({
      body: expect.stringContaining('Oui, demande à @ines_morel'),
      replyTo: zoeComment.id,
    })
  })

  it('offers the same suggestions when editing a comment', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    await mentionInes('Testé avec @in')
    await fireEvent.press(sendButton())

    expect(mockEdit).toHaveBeenCalledWith({
      id: maxComment.id,
      body: expect.stringContaining('Testé avec @ines_morel'),
    })
  })

  it('shows a published mention as a pill named after the member, never by the handle', async () => {
    mockComments([
      { ...maxComment, body: 'Salut @zoe_martin et @ines_morel !', mentions: [inesMention] },
    ])
    await renderComments(counted(3))
    await openSheet()

    // La mention rendue par l'API : une pastille, lue avec le nom actuel (D3).
    expect(sheet().getByRole('link', { name: 'Inès Morel, ouvre son profil' })).toBeTruthy()
    // L'autre pseudo ne désigne personne : du texte simple.
    expect(sheet().queryByRole('link', { name: /zoe_martin/ })).toBeNull()
    expect(sheet().queryByRole('link', { name: /@ines_morel/ })).toBeNull()
  })
})

// Règle 2b de la relecture du plan de 6b : mentionner un membre qu'on a bloqué est refusé par l'API
// (422 `blocked_mention`, `reason: 'blockedMention'`) ; l'écran l'explique au lieu de « Réessaie ».
describe('mentioning a member one blocked', () => {
  const blockedMention = /Tu ne peux pas mentionner .*bloqué/

  it('says a blocked member cannot be mentioned, and keeps the comment to change it', async () => {
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'blockedMention' })
    await renderComments(counted(0))
    await openSheet()

    await writeAndSend('Bravo @ines_morel')

    expect(await sheet().findByRole('alert')).toHaveTextContent(blockedMention)
    expect(screen.queryByText(containing(fr.t(($) => $.project.comments.error)))).toBeNull()
    expect(commentField()).toHaveDisplayValue('Bravo @ines_morel')
  })

  it('says the same when an edited comment mentions a blocked member', async () => {
    mockEdit.mockResolvedValue(false)
    jest
      .mocked(useEditComment)
      .mockReturnValue({ edit: mockEdit, pending: false, error: true, reason: 'blockedMention' })
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    await writeAndSend('Testé avec @ines_morel')

    expect(await sheet().findByRole('alert')).toHaveTextContent(blockedMention)
  })
})

// --- Tranche 7a : signaler un commentaire, et ce qu'on voit d'un commentaire retiré ---

describe('reporting a comment', () => {
  it('offers « Signaler » alone in the menu of another member’s comment', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))
    await openSheet()

    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Signaler'])
  })

  it('offers it on a reply too, which is a comment', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu(zoeReply.body, 'Signaler')

    expect(reportsOpened(mockPush)).toEqual([
      expect.objectContaining({ kind: 'comment', id: zoeReply.id }),
    ])
  })

  it('names the menu after the author of the comment', async () => {
    mockComments([maxComment])
    await renderComments(counted(3))
    await openSheet()

    expect(menuButtonOf(cardOf('Super idée, je teste ce soir.')).props.accessibilityLabel).toBe(
      'Actions du commentaire de Max',
    )
  })

  it('never offers to report one’s own comment', async () => {
    mockComments([{ ...maxComment, isMine: true, replies: [] }])
    await renderComments(counted(1))
    await openSheet()

    // Témoin : ses propres actions sont là.
    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Modifier', 'Supprimer'])
  })

  it('lets the author of the project report a comment as well as hide it', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    mockComments([{ ...maxComment, replies: [] }])
    await renderComments(counted(1, { isMine: true }))
    await openSheet()

    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Masquer', 'Signaler'])
  })
})

describe('a comment removed by the moderation', () => {
  /** Le commentaire de Max retiré, tel que l'API le donne aux autres : ni auteur, ni texte. */
  const removedForOthers: Comment = {
    ...maxComment,
    state: 'removed',
    author: null,
    body: '',
    mentions: [],
    removal: null,
  }
  const removedOwn: Comment = {
    ...maxComment,
    state: 'removed',
    isMine: true,
    removal: removalAfterReport,
    replies: [],
  }

  it('is only « Contenu retiré par la modération » for the others, and its replies stay', async () => {
    mockComments([removedForOthers])
    await renderComments(counted(2))
    await openSheet()

    expect(sheet().getByText('Contenu retiré par la modération')).toBeTruthy()
    expect(sheet().queryByText('Commentaire masqué')).toBeNull()
    expect(sheet().queryByText('Commentaire supprimé')).toBeNull()
    // Les réponses restent lisibles.
    expect(sheet().getByText(zoeReply.body)).toBeTruthy()
    expect(sheet().getByText(leaReply.body)).toBeTruthy()
  })

  it('is the same placeholder for the author of the project, who cannot read it', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    mockComments([removedForOthers])
    await renderComments(counted(2, { isMine: true }))
    await openSheet()

    expect(sheet().getByText('Contenu retiré par la modération')).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.removal.onlyYou)))).toBeNull()
    expect(screen.queryByText('Super idée, je teste ce soir.')).toBeNull()
  })

  it('offers no reply nor menu on the placeholder', async () => {
    mockComments([{ ...removedForOthers, replies: [zoeReply] }])
    await renderComments(counted(1))
    await openSheet()

    // Témoin : la réponse est affichée, avec son « … » ; mais on ne répond plus dans ce fil (la
    // racine n'est plus visible : l'API refuserait la réponse).
    expect(sheet().getByText(zoeReply.body)).toBeTruthy()
    expect(sheet().queryByRole('button', { name: 'Répondre' })).toBeNull()
    expect(sheet().getAllByRole('button', { name: /^Actions du commentaire de / })).toEqual([
      sheet().getByRole('button', { name: 'Actions du commentaire de Zoé' }),
    ])
  })

  it('shows its author the comment, with « Retiré par la modération » and why', async () => {
    mockComments([removedOwn])
    await renderComments(counted(0))
    await openSheet()

    // Son texte, qu'il est désormais seul à lire, et le bandeau qui le dit.
    expect(sheet().getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBeGreaterThan(0)
    // Ce qui est retiré, pour qui, après un signalement, par une personne, pourquoi, et comment
    // contester (règle 13 de la relecture du plan de 7a, article 17 du DSA).
    expect(missingSentences(removalSentences(removalAfterReport), screen)).toEqual([])
    expect(screen.queryByText('Contenu retiré par la modération')).toBeNull()
  })

  it('lets its author delete it, but no longer edit it', async () => {
    // Règle 28 du plan de 7a : modifier un contenu retiré est refusé (409 `removed`).
    mockComments([removedOwn])
    await renderComments(counted(0))
    await openSheet()

    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Supprimer'])
  })

  it('names nobody who reported it, even to its author', async () => {
    mockComments([removedOwn])
    await renderComments(counted(0))
    await openSheet()

    expect(
      screen.getAllByText(containing(fr.t(($) => $.removal.afterReport))).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/Malik|Zoé|Inès/)).toBeNull()
  })
})

// --- Tranche 7b : ce qu'on voit d'un commentaire quand un blocage sépare deux membres ---

describe('a comment hidden by a block', () => {
  /** Le commentaire de Max tel que l'API le donne quand un blocage sépare Max et Malik. */
  const placeholderOf = (state: 'blocked' | 'unavailable'): Comment => ({
    ...maxComment,
    state,
    author: null,
    body: '',
    mentions: [],
    removal: null,
  })

  it('is « Commentaire d’un membre que tu as bloqué » for who blocked, and its replies stay', async () => {
    mockComments([placeholderOf('blocked')])
    await renderComments(counted(2))
    await openSheet()

    expect(sheet().getByText(fr.t(($) => $.project.comments.blockedPlaceholder))).toBeTruthy()
    expect(sheet().queryByText('Max')).toBeNull()
    expect(sheet().queryByText('Commentaire masqué')).toBeNull()
    expect(sheet().getByText(zoeReply.body)).toBeTruthy()
    expect(sheet().getByText(leaReply.body)).toBeTruthy()
  })

  it('is « Commentaire indisponible » for who is blocked, without a word on the block', async () => {
    mockComments([placeholderOf('unavailable')])
    await renderComments(counted(2))
    await openSheet()

    expect(sheet().getByText(fr.t(($) => $.project.comments.unavailablePlaceholder))).toBeTruthy()
    expect(screen.queryByText(/bloqu/i)).toBeNull()
    expect(sheet().getByText(zoeReply.body)).toBeTruthy()
  })

  it('offers neither a reply nor a menu on the placeholder', async () => {
    mockComments([{ ...placeholderOf('blocked'), replies: [zoeReply] }])
    await renderComments(counted(1))
    await openSheet()

    // Témoin : la réponse de Zoé est là, avec son propre « … ». Plus d'interaction avec un membre
    // bloqué : on ne répond pas dans son fil.
    expect(sheet().getByText(zoeReply.body)).toBeTruthy()
    expect(sheet().getAllByRole('button', { name: /^Actions du commentaire de / })).toHaveLength(1)
    expect(sheet().queryByRole('button', { name: 'Répondre' })).toBeNull()
  })
})

// --- Tranche 7c : un compte suspendu ---
//
// Un membre suspendu lit les commentaires, mais n'a ni champ ni « Répondre », ne modifie plus les
// siens ; il peut encore les supprimer, et l'auteur du projet peut encore en masquer (ui-I1 : le
// test vient ici, l'écran ne rend pas le champ).
describe('the comments, for a suspended member', () => {
  const ownComment: Comment = { ...maxComment, isMine: true }

  it('offers a suspended member neither the field nor « Répondre », and lets him read', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...suspendedMe, id: 'u4', name: 'Malik' })
    mockComments([ownComment, zoeComment])
    await renderComments(counted(4))
    await openSheet()

    expect(await sheet().findByText('Super idée, je teste ce soir.')).toBeTruthy()
    await waitFor(() => expect(queryCommentField()).toBeNull())
    expect(sheet().queryByRole('button', { name: 'Répondre' })).toBeNull()
    // Supprimer le sien reste possible ; le modifier, non.
    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Supprimer'])
  })

  it('still lets a suspended author hide a comment on her project', async () => {
    jest.mocked(getMe).mockResolvedValue({ ...suspendedMe, id: 'u4', name: 'Malik' })
    mockComments([zoeComment])
    await renderComments(counted(1, { isMine: true }))
    await openSheet()

    await sheet().findByText('Ça marche aussi en anglais ?')
    await waitFor(() => expect(queryCommentField()).toBeNull())
    expect(await openMenuOf('Ça marche aussi en anglais ?')).toContain('Masquer')
  })

  it('keeps the field, « Répondre » and « Modifier » for a member who is not suspended', async () => {
    // Témoin : Malik, pas suspendu (beforeEach), une fois son profil lu.
    mockComments([ownComment, zoeComment])
    await renderComments(counted(4))
    await openSheet()

    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(commentField(sheet())).toBeTruthy()
    expect(sheet().getAllByRole('button', { name: 'Répondre' }).length).toBeGreaterThan(0)
    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Modifier', 'Supprimer'])
  })
})

// Design 7b (`guardTaps`) : la fenêtre « Supprimer ce commentaire ? » s'ouvre sous le doigt qui
// vient de toucher « Supprimer » ; une seconde tape trop rapide ne doit rien y décider.
describe('the window to delete a comment', () => {
  it('ignores a tap on its buttons right after opening, as the second tap of a double tap', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.getByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeTruthy()
  })

  it('answers a tap once the guard is over', async () => {
    mockComments([{ ...maxComment, isMine: true }])
    await renderComments(counted(3))
    await openSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeNull(),
    )
    // La feuille reste ouverte derrière la fenêtre refermée.
    expect(sheetIsOpen()).toBe(true)
  })
})

// R4 (F-Fil3) : la date d'un commentaire se dit par rapport à maintenant (« il y a 5 min »), et le
// lecteur d'écran lit la date complète, à l'heure de Paris.
describe('when a comment was written', () => {
  const fiveMinutesAgo = () => new Date(Date.now() - 5 * 60_000).toISOString()

  it('says it relative to now in the sheet, and reads the full date', async () => {
    const createdAt = fiveMinutesAgo()
    mockComments([{ ...zoeComment, createdAt }])
    await renderComments(counted(1))
    await openSheet()

    const card = cardOf(zoeComment.body)
    expect(card.getByText(plain(fr.t(($) => $.dates.minutes, { count: 5 })))).toBeTruthy()
    expect(card.getByLabelText(plain(parisDateTime(createdAt, 'fr').dateTime))).toBeTruthy()
  })

  it('gives a deleted comment kept for its replies neither name nor date', async () => {
    // R5b (« Les états ») : les emplacements n'ont ni nom, ni date, ni « Répondre », ni menu.
    // (Avant R5b, un commentaire supprimé gardait sa date.)
    const createdAt = fiveMinutesAgo()
    mockComments([
      { ...maxComment, createdAt, state: 'deleted', author: null, body: '', isMine: false },
    ])
    await renderComments(counted(2))
    await openSheet()

    expect(sheet().getByText(fr.t(($) => $.project.comments.deletedPlaceholder))).toBeTruthy()
    expect(sheet().queryByLabelText(plain(parisDateTime(createdAt, 'fr').dateTime))).toBeNull()
    // Témoin : les réponses gardent la leur.
    expect(
      cardOf(zoeReply.body).getByLabelText(
        plain(parisDateTime(zoeReply.createdAt ?? '', 'fr').dateTime),
      ),
    ).toBeTruthy()
  })
})

// L'aide `describeFocused` sert aux tests de la page (ProjectScreen.comments.test.tsx) ; elle est
// vérifiée ici sur un cas simple, pour qu'un échec là-bas ne vienne pas d'elle.
describe('the focus helper of these tests', () => {
  it('describes a focused view by its name and its hint', () => {
    expect(describeFocused({ accessibilityLabel: 'Répondre', accessibilityHint: 'Hugo : …' })).toBe(
      'Répondre Hugo : …',
    )
  })
})
