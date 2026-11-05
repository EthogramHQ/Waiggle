// Tests de la page d'un projet : modifier, supprimer, masquer et démasquer un commentaire par son
// menu « … » (R5b : les boutons texte sous chaque carte deviennent un menu), ce que montre l'aperçu
// d'un commentaire masqué ou retiré (jur-P4), puis les corrections des relectures de la tranche 5.
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx (la page) et ProjectComments.testkit.tsx (les commentaires).
import { NO_REACTIONS } from '@ruche/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import {
  useComments,
  useDeleteComment,
  useEditComment,
  useHideComment,
  usePostComment,
} from '../comments/api'
import { getProject } from '../projects/api'
import { leaReply, maxComment, zoeComment, zoeReply } from '../testing/comments'
import { passTapGuard } from '../testing/dialog'
import { removalAfterReport } from '../testing/moderation'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  cardOf,
  chooseInMenu,
  commentField,
  lineOf,
  linkOrButton,
  openMenuOf,
  openSheet,
  previewNames,
  sheet,
  writeAndSend,
} from './ProjectComments.testkit'
import { ProjectScreen } from './ProjectScreen'
import {
  ancestorWithRole,
  dialogTitled,
  id,
  mockComments,
  mockEdit,
  mockFetchNextPage,
  mockPost,
  mockPush,
  mockRemoveComment,
  mockReplace,
  mockScreenProps,
  mockSetHidden,
  resetProjectScreenMocks,
  seenByOther,
  signInAgain,
  withReactions,
} from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
// Suivre : un faux hook, dont le test lit les appels (toggle) et choisit l'erreur.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// La page de l'auteur est lue (« Suivre » n'est proposé qu'une fois qu'on sait si on le suit, et
// plus quand la lecture échoue : décision du 2/11/2026). Ici, une lecture réussie, auteur non suivi.
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
// Les notes (tranche 4b) : de faux hooks, dont le test lit les appels (publish, remove).
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
// Les réactions et les commentaires (tranche 5) : de faux hooks, dont le test lit les appels.
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
// Les suggestions après « @ » (tranche 6b) : personne à proposer ; elles sont testées dans
// ProjectComments.test.tsx.
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
// Le presse-papiers (R5a) : « Copier le lien » du menu « … » et de la feuille Partager, « Copier »
// d'un prompt. Le test lit ce qui est copié ; l'appareil, lui, n'est jamais touché.
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
// Les paramètres de l'adresse de la page (?announce=testable), choisis par chaque test.
let mockParams: Record<string, string | undefined> = {}
// RF (ui-1) : la page est-elle affichée ? Sur le web, la page quittée reste montée, cachée ; le
// retour la rend affichée de nouveau. `useIsFocused` et `useFocusEffect` suivent ce drapeau, relu
// à chaque rendu (le test redessine après l'avoir changé).
let mockFocused = true
jest.mock('expo-router', () => {
  const { useEffect } = require('react')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useIsFocused: () => mockFocused,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mockFocused
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})
// Le cadre de page, tel quel, mais dont le test lit les propriétés (RF : `fade`).
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})

beforeEach(() => {
  resetProjectScreenMocks()
  mockParams = {}
  mockFocused = true
})

// --- Après les relectures de la tranche 5 ---

describe('reactions, after the reviews', () => {
  it('gathers the five reactions of another member in a group named after what they do', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    const bravo = await screen.findByRole('button', { name: 'Waggle\u202f!, 0' })
    expect(ancestorWithRole(bravo, 'group')?.props.accessibilityLabel).toBe('Réagir à ce projet')
  })

  it('shows the author her numbers as a list, zeros included', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 9 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Les réactions à ton projet')
    const items = screen.getAllByRole('listitem', {
      name: /^(Bluffant|Inspirant|Utile|Drôle|Waggle\s!),/,
    })
    expect(items).toHaveLength(5)
    expect(screen.getByRole('listitem', { name: 'Waggle\u202f!, 9' })).toBeTruthy()
    expect(screen.getAllByText('0')).toHaveLength(4)
    const bravo = screen.getByRole('listitem', { name: 'Waggle\u202f!, 9' })
    expect(ancestorWithRole(bravo, 'list')?.props.accessibilityLabel).toBe(
      'Les réactions à ton projet',
    )
  })
})

/** Les blancs d'Intl et de la typographie française ramenés à des espaces, comme getByText. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

/** Rend la page, attend l'aperçu des commentaires, puis ouvre la feuille. */
const renderAndOpenSheet = async () => {
  await renderWithProviders(<ProjectScreen id={id} />)
  await screen.findByRole('header', { name: /^Commentaires/ })
  await openSheet()
}

describe('editing and deleting one’s comment', () => {
  // Max regarde le projet de Léa : son propre commentaire, et celui de Zoé.
  beforeEach(() => {
    seenByOther({ ...recipesProject, commentCount: 4 })
    mockComments([{ ...maxComment, isMine: true }, zoeComment])
  })

  it('offers « Modifier » and « Supprimer » in the menu of one’s own comment', async () => {
    await renderAndOpenSheet()

    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Modifier', 'Supprimer'])
  })

  it('offers neither « Modifier » nor « Supprimer » on the comments of others', async () => {
    await renderAndOpenSheet()

    expect(await openMenuOf('Ça marche aussi en anglais ?')).toEqual(['Signaler'])
  })

  it('lets the author of a comment edit it in the field, starting from its text', async () => {
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    expect(commentField()).toHaveDisplayValue('Super idée, je teste ce soir.')
    await writeAndSend('Testé : ça marche.')

    expect(useEditComment).toHaveBeenCalledWith(id)
    expect(mockEdit).toHaveBeenCalledWith({ id: maxComment.id, body: 'Testé : ça marche.' })
    // L'envoi fini, le bandeau s'en va et le champ se vide.
    await waitFor(() => expect(sheet().queryByText('Modifier ton commentaire')).toBeNull())
    expect(commentField()).toHaveDisplayValue('')
  })

  it('says so when the edit could not be saved, and keeps the text', async () => {
    mockEdit.mockResolvedValue(false)
    jest.mocked(useEditComment).mockReturnValue({ edit: mockEdit, pending: false, error: true })
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Modifier')
    await writeAndSend('Testé.')

    expect(await sheet().findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être modifié. Réessaie.',
    )
    expect(commentField()).toHaveDisplayValue('Testé.')
  })

  it('deletes a comment once its author confirms, and says so', async () => {
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    expect(mockRemoveComment).not.toHaveBeenCalled() // il faut d'abord confirmer
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(useDeleteComment).toHaveBeenCalledWith(id)
    expect(mockRemoveComment).toHaveBeenCalledWith(maxComment.id)
    expect(await screen.findByRole('status')).toHaveTextContent('Ton commentaire a été supprimé.')
  })

  it('deletes once on a double tap on « Supprimer »', async () => {
    // L'API ne répond pas encore : la suppression reste en route pendant la seconde tape.
    mockRemoveComment.mockReturnValue(new Promise(() => {}))
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    await passTapGuard()
    const confirm = dialogTitled('Supprimer ce commentaire ?').getByRole('button', {
      name: 'Supprimer',
    })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(mockRemoveComment).toHaveBeenCalledTimes(1)
  })

  it('deletes nothing when the author changes her mind', async () => {
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Annuler' }),
    )

    expect(mockRemoveComment).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeNull()
  })

  it('keeps the window open with the reason when the deletion fails, to try again', async () => {
    mockRemoveComment.mockResolvedValue(false)
    jest.mocked(useDeleteComment).mockReturnValue({ remove: mockRemoveComment, error: true })
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(dialogTitled('Supprimer ce commentaire ?').getByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être supprimé. Réessaie.',
    )
  })

  it('asks to confirm with a word on the replies kept, for a comment that has some', async () => {
    mockComments([
      { ...maxComment, isMine: true },
      { ...zoeComment, isMine: true },
    ])
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    expect(
      screen.getByText(/^Ton texte et ton nom disparaîtront pour tout le monde\./),
    ).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Annuler' }),
    )

    await chooseInMenu('Ça marche aussi en anglais ?', 'Supprimer')
    expect(screen.getByText('Il disparaîtra pour tout le monde.')).toBeTruthy()
  })
})

describe('hiding a comment from the project page', () => {
  // Léa regarde son projet : le commentaire de Max (et ses réponses, dont la sienne), et celui de
  // Zoé.
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, commentCount: 4 })
    mockComments([
      { ...maxComment, replies: [zoeReply, { ...leaReply, isMine: true }] },
      zoeComment,
    ])
  })

  it('lets the author of the project hide the comment of another member', async () => {
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Masquer')

    expect(useHideComment).toHaveBeenCalledWith(id)
    expect(mockSetHidden).toHaveBeenCalledWith({ id: maxComment.id, hidden: true })
  })

  it('offers her « Masquer » and « Signaler » on the comments of others, and her own to edit or delete', async () => {
    await renderAndOpenSheet()

    expect(await openMenuOf('Ça marche aussi en anglais ?')).toEqual(['Masquer', 'Signaler'])
    await fireEvent.press(screen.getByRole('button', { name: 'Fermer le menu' }))
    expect(await openMenuOf('Merci à vous deux.')).toEqual(['Modifier', 'Supprimer'])
  })

  it('shows her a hidden comment with « Masqué par toi », who still sees it, and « Démasquer »', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }])
    await renderAndOpenSheet()

    // C’est elle qui l’a masqué : la pastille le lui dit, et la note dit qui le voit encore (jur-P2).
    expect(sheet().getByText('Masqué par toi')).toBeTruthy()
    expect(sheet().getByText(plain(fr.t(($) => $.project.comments.hiddenNote)))).toBeTruthy()
    expect(sheet().getByText('Ça marche aussi en anglais ?')).toBeTruthy()
    await fireEvent.press(
      linkOrButton(cardOf('Ça marche aussi en anglais ?'), /^Démasquer( le commentaire)?$/),
    )

    expect(mockSetHidden).toHaveBeenCalledWith({ id: zoeComment.id, hidden: false })
  })

  it('shows its author that a comment is hidden by the author of the project, without « Démasquer »', async () => {
    seenByOther({ ...recipesProject, commentCount: 0 })
    mockComments([{ ...maxComment, state: 'hidden', isMine: true, replies: [] }])
    await renderAndOpenSheet()

    expect(sheet().getByText('Masqué par l’auteur du projet')).toBeTruthy()
    expect(
      sheet().getByText(plain(fr.t(($) => $.project.comments.hiddenByAuthorNote))),
    ).toBeTruthy()
    expect(sheet().getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(sheet().queryByRole('link', { name: /^Démasquer/ })).toBeNull()
    expect(sheet().queryByRole('button', { name: /^Démasquer/ })).toBeNull()
  })

  it('never offers other members to hide a comment', async () => {
    seenByOther({ ...recipesProject, commentCount: 4 })
    mockComments([maxComment, zoeComment])
    await renderAndOpenSheet()

    expect(await openMenuOf('Super idée, je teste ce soir.')).toEqual(['Signaler'])
  })

  it('says so when the comment could not be hidden', async () => {
    mockSetHidden.mockResolvedValue(false)
    jest.mocked(useHideComment).mockReturnValue({ setHidden: mockSetHidden, error: true })
    await renderAndOpenSheet()

    await chooseInMenu('Super idée, je teste ce soir.', 'Masquer')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le changement n’a pas pu être enregistré. Réessaie.',
    )
  })

  it('offers no « Répondre » on a hidden comment, even to the author of the project', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }, maxComment])
    await renderAndOpenSheet()

    expect(sheet().getByText('Masqué par toi')).toBeTruthy()
    expect(
      cardOf('Ça marche aussi en anglais ?').queryByRole('button', { name: 'Répondre' }),
    ).toBeNull()
    // Témoin : le commentaire visible de Max garde le sien.
    expect(
      cardOf('Super idée, je teste ce soir.').getByRole('button', { name: 'Répondre' }),
    ).toBeTruthy()
  })
})

// jur-P4 / ui-B7 : l'aperçu ne montre que les commentaires visibles de tous ; un masqué ou un
// retiré reste dans la feuille, avec sa pastille ou son encadré. (Les deux noms viennent des tests
// d'avant la relecture du plan ; leur règle est celle de la relecture.)
describe('what the preview shows of a hidden or removed comment', () => {
  it('keeps the hidden notice on a hidden comment in the preview', async () => {
    // Léa, sur son projet : le commentaire de Zoé, le plus récent, est masqué par elle.
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, commentCount: 3 })
    mockComments([
      { ...zoeComment, state: 'hidden', createdAt: '2026-10-16T09:00:00.000Z' },
      maxComment,
    ])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: /^Commentaires/ })
    // L'aperçu commence par Max : la ligne masquée n'y est pas, ni sa pastille.
    expect(previewNames()[0]).toMatch(lineOf('Max', 'Super idée'))
    expect(previewNames().some((name) => name.includes('Ça marche aussi en anglais'))).toBe(false)
    expect(screen.queryByText('Masqué par toi')).toBeNull()
    // Dans la feuille, elle reste à sa place, avec sa pastille.
    await openSheet()
    expect(sheet().getByText('Masqué par toi')).toBeTruthy()
    expect(sheet().getByText('Ça marche aussi en anglais ?')).toBeTruthy()
  })

  it("keeps the removal notice on the author's removed comment in the preview", async () => {
    // Max, l'auteur du commentaire retiré : lui seul le lit encore, avec l'encadré du retrait.
    seenByOther({ ...recipesProject, commentCount: 1 })
    mockComments([
      {
        ...maxComment,
        state: 'removed',
        isMine: true,
        removal: removalAfterReport,
        replies: [],
        createdAt: '2026-10-16T09:00:00.000Z',
      },
      zoeComment,
    ])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: /^Commentaires/ })
    expect(previewNames()).toEqual([expect.stringMatching(lineOf('Zoé', 'Ça marche'))])
    expect(screen.queryByText(containing(fr.t(($) => $.removal.banner)))).toBeNull()
    await openSheet()
    expect(sheet().getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(sheet().getAllByText(containing(fr.t(($) => $.removal.banner))).length).toBeGreaterThan(
      0,
    )
  })
})

describe('replying, after the reviews', () => {
  it('says that the thread no longer takes replies when the API cannot find it', async () => {
    seenByOther({ ...recipesProject, commentCount: 1 })
    mockComments([zoeComment])
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'gone' })
    await renderAndOpenSheet()

    await fireEvent.press(sheet().getByRole('button', { name: 'Répondre' }))
    await writeAndSend('Et en espagnol ?')

    expect(await sheet().findByRole('alert')).toHaveTextContent('Ce fil n’accepte plus de réponse.')
    // Le texte reste dans le champ : rien de ce qui est écrit ne se perd.
    expect(commentField()).toHaveDisplayValue('Et en espagnol ?')
  })
})

describe('the comments, after the reviews', () => {
  it('shows « Commenter » on a phone when there are 3 comments or fewer', async () => {
    seenByOther({ ...recipesProject, commentCount: 1 })
    mockComments([zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    const button = await screen.findByRole('button', { name: 'Commenter' })
    expect(within(button).getByText('Commenter')).toBeTruthy()
  })

  it('tells who will read the comment, under the field of the sheet', async () => {
    seenByOther()
    await renderAndOpenSheet()

    expect(
      sheet().getByText(
        'Tous les membres connectés liront ton commentaire. La personne qui a publié le projet peut le masquer.',
      ),
    ).toBeTruthy()
  })

  it('tells the author of a private project that nobody else will read her reply', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue({ ...recipesProject, visibility: 'private', commentCount: 0 })
    mockComments([{ ...leaReply, isMine: true, replies: [] }])
    await renderAndOpenSheet()

    await fireEvent.press(sheet().getByRole('button', { name: 'Répondre' }))

    expect(sheet().getByText(/personne d’autre que toi ne lira cette réponse/)).toBeTruthy()
  })

  it('offers no retry when the comments could not load because the session expired', async () => {
    seenByOther()
    jest.mocked(useComments).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isError: true,
      isFetchNextPageError: false,
      error: new ApiError('unauthorized'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useComments>)
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByText('Ta session a expiré. Reconnecte-toi pour continuer.'),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('offers to sign in again when the comments could not load because the session expired (slice 6c)', async () => {
    seenByOther()
    jest.mocked(useComments).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isError: true,
      isFetchNextPageError: false,
      error: new ApiError('unauthorized'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useComments>)
    await renderWithProviders(<ProjectScreen id={id} />)

    await signInAgain()
  })

  it('offers to retry when the comments could not load for another reason', async () => {
    seenByOther()
    jest.mocked(useComments).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isError: true,
      isFetchNextPageError: false,
      error: new ApiError('network'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useComments>)
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Les commentaires n’ont pas pu se charger.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
  })

  // R5a (scénario, « L'auteur ») : « Modifier » monte à la place de « Suivre ce projet », sous
  // « Tester la démo » ; « Supprimer » garde sa place d'aujourd'hui, après les commentaires, jusqu'à
  // R6. (Avant R5a : les deux après les commentaires.)
  it('puts « Modifier » before the comments and « Supprimer » after them on a phone', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('button', { name: 'Écrire un commentaire' })
    const order = screen
      .getAllByRole('button', { name: /^(Écrire un commentaire|Modifier|Supprimer)$/ })
      .map((button) => button.props.accessibilityLabel)
    expect(order).toEqual(['Modifier', 'Écrire un commentaire', 'Supprimer'])
  })
})
