// Tests de la page d'un projet : modifier, supprimer et masquer un commentaire, puis les
// corrections des relectures de la tranche 5 (réactions, réponses, commentaires).
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
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
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { ProjectScreen } from './ProjectScreen'
import {
  ancestorWithRole,
  cardOf,
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

describe('editing and deleting one’s comment', () => {
  // Max regarde le projet de Léa : son propre commentaire, et celui de Zoé.
  beforeEach(() => {
    seenByOther()
    mockComments([{ ...maxComment, isMine: true }, zoeComment])
  })

  /** Touche ce bouton dans la carte du commentaire de Max. */
  const pressOnMaxComment = async (name: string) => {
    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(cardOf('Super idée, je teste ce soir.').getByRole('button', { name }))
  }

  it('lets the author of a comment edit it, starting from its text', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Modifier le commentaire')
    const field = screen.getByLabelText('Ton commentaire')
    expect(field).toHaveDisplayValue('Super idée, je teste ce soir.')
    await fireEvent.changeText(field, 'Testé : ça marche.')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(useEditComment).toHaveBeenCalledWith(id)
    expect(mockEdit).toHaveBeenCalledWith({ id: maxComment.id, body: 'Testé : ça marche.' })
    await waitFor(() => expect(screen.queryByLabelText('Ton commentaire')).toBeNull())
  })

  it('says so when the edit could not be saved, and keeps the text', async () => {
    mockEdit.mockResolvedValue(false)
    jest.mocked(useEditComment).mockReturnValue({ edit: mockEdit, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Modifier le commentaire')
    await fireEvent.changeText(screen.getByLabelText('Ton commentaire'), 'Testé.')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être modifié. Réessaie.',
    )
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Testé.')
  })

  it('offers neither edit nor delete on the comments of others', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Ça marche aussi en anglais ?')
    const others = cardOf('Ça marche aussi en anglais ?')
    expect(others.queryByRole('button', { name: 'Modifier le commentaire' })).toBeNull()
    expect(others.queryByRole('button', { name: 'Supprimer le commentaire' })).toBeNull()
    // Une seule paire en tout : celle du commentaire de Max.
    expect(screen.getAllByRole('button', { name: 'Modifier le commentaire' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Supprimer le commentaire' })).toHaveLength(1)
  })

  it('deletes a comment once its author confirms, and says so', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Supprimer le commentaire')
    expect(mockRemoveComment).not.toHaveBeenCalled() // il faut d'abord confirmer
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(useDeleteComment).toHaveBeenCalledWith(id)
    expect(mockRemoveComment).toHaveBeenCalledWith(maxComment.id)
    expect(await screen.findByRole('status')).toHaveTextContent('Ton commentaire a été supprimé.')
  })

  it('deletes nothing when the author changes her mind', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Supprimer le commentaire')
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Annuler' }),
    )

    expect(mockRemoveComment).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: 'Supprimer ce commentaire ?' })).toBeNull()
  })

  it('keeps the window open with the reason when the deletion fails, to try again', async () => {
    mockRemoveComment.mockResolvedValue(false)
    jest.mocked(useDeleteComment).mockReturnValue({ remove: mockRemoveComment, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await pressOnMaxComment('Supprimer le commentaire')
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(dialogTitled('Supprimer ce commentaire ?').getByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être supprimé. Réessaie.',
    )
  })
})

describe('hiding a comment from the project page', () => {
  // Léa regarde son projet : le commentaire de Max (et ses réponses, dont la sienne), et celui de
  // Zoé.
  beforeEach(() => {
    mockComments([
      { ...maxComment, replies: [zoeReply, { ...leaReply, isMine: true }] },
      zoeComment,
    ])
  })

  it('lets the author of the project hide the comment of another member', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Masquer le commentaire',
      }),
    )

    expect(useHideComment).toHaveBeenCalledWith(id)
    expect(mockSetHidden).toHaveBeenCalledWith({ id: maxComment.id, hidden: true })
  })

  it('offers her to hide the comments of others only, and to delete her own instead', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Merci à vous deux.')
    const own = cardOf('Merci à vous deux.')
    // Son propre commentaire, elle le supprime plutôt que de le masquer.
    expect(own.queryByRole('button', { name: 'Masquer le commentaire' })).toBeNull()
    expect(own.getByRole('button', { name: 'Supprimer le commentaire' })).toBeTruthy()
    // Celui d'un autre, elle ne le modifie ni ne le supprime : elle peut le masquer.
    const others = cardOf('Ça marche aussi en anglais ?')
    expect(others.queryByRole('button', { name: 'Modifier le commentaire' })).toBeNull()
    expect(others.queryByRole('button', { name: 'Supprimer le commentaire' })).toBeNull()
    expect(others.getByRole('button', { name: 'Masquer le commentaire' })).toBeTruthy()
  })

  it('shows her a hidden comment with its banner, and lets her show it back', async () => {
    mockComments([{ ...zoeComment, state: 'hidden' }])
    await renderWithProviders(<ProjectScreen id={id} />)

    // C’est elle qui l’a masqué : le bandeau le lui dit.
    expect(await screen.findByText('Masqué par toi')).toBeTruthy()
    expect(screen.getByText('Ça marche aussi en anglais ?')).toBeTruthy()
    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', {
        name: 'Démasquer le commentaire',
      }),
    )

    expect(mockSetHidden).toHaveBeenCalledWith({ id: zoeComment.id, hidden: false })
  })

  it('shows its author that a comment is hidden, without letting him show it back', async () => {
    seenByOther()
    mockComments([{ ...maxComment, state: 'hidden', isMine: true, replies: [] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByText(
        'Masqué par la personne qui a publié le projet : les autres membres ne le voient plus.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Super idée, je teste ce soir.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Démasquer le commentaire' })).toBeNull()
  })

  it('never offers other members to hide a comment', async () => {
    seenByOther()
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    expect(screen.queryByRole('button', { name: 'Masquer le commentaire' })).toBeNull()
  })

  it('says so when the comment could not be hidden', async () => {
    mockSetHidden.mockResolvedValue(false)
    jest.mocked(useHideComment).mockReturnValue({ setHidden: mockSetHidden, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Masquer le commentaire',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le changement n’a pas pu être enregistré. Réessaie.',
    )
  })
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

describe('replying, once per thread', () => {
  it('offers « Répondre » once per thread, at its end, and on no comment', async () => {
    seenByOther()
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    // Deux fils, deux « Répondre » ; le fil de Max en a un seul pour lui et ses deux réponses.
    expect(screen.getAllByRole('button', { name: 'Répondre' })).toHaveLength(2)
    const replies = screen.getAllByText(/^(Moi aussi, dis-nous !|Merci à vous deux\.)$/)
    expect(replies).toHaveLength(2)
  })

  it('offers no reply under a hidden comment, even to the author of the project', async () => {
    mockComments([{ ...maxComment, state: 'hidden' }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Masqué par toi')
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
  })

  it('says that the thread no longer takes replies when the API cannot find it', async () => {
    seenByOther()
    mockComments([zoeComment])
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'gone' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Répondre' }))
    await fireEvent.changeText(screen.getByLabelText('Ta réponse'), 'Et en espagnol ?')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fil n’accepte plus de réponse.')
    // Le texte reste dans le champ : rien de ce qui est écrit ne se perd.
    expect(screen.getByLabelText('Ta réponse')).toHaveDisplayValue('Et en espagnol ?')
  })
})

describe('the comments, after the reviews', () => {
  it('shows « Commenter » on a phone, and keeps the full name for screen readers', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    const add = await screen.findByRole('button', { name: 'Écrire un commentaire' })
    expect(within(add).getByText('Commenter')).toBeTruthy()
  })

  it('tells who will read the comment', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))

    expect(
      screen.getByText(
        'Tous les membres connectés liront ton commentaire. La personne qui a publié le projet peut le masquer.',
      ),
    ).toBeTruthy()
  })

  it('tells the author of a private project that nobody else will read her reply', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    mockComments([{ ...leaReply, isMine: true, replies: [] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Répondre' }))

    expect(screen.getByText(/personne d’autre que toi ne lira cette réponse/)).toBeTruthy()
  })

  it('tells the author of a hidden comment, while editing it, who still reads it', async () => {
    seenByOther()
    mockComments([{ ...maxComment, state: 'hidden', isMine: true, replies: [] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Modifier le commentaire' }))

    expect(
      screen.getByText(
        /il ne reste visible que de toi et de la personne qui a publié le projet\.$/,
      ),
    ).toBeTruthy()
  })

  it('asks to confirm with a word on the replies kept, for a comment that has some', async () => {
    seenByOther()
    mockComments([
      { ...maxComment, isMine: true },
      { ...zoeComment, isMine: true },
    ])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Super idée, je teste ce soir.')
    await fireEvent.press(
      cardOf('Super idée, je teste ce soir.').getByRole('button', {
        name: 'Supprimer le commentaire',
      }),
    )
    expect(
      screen.getByText(/^Ton texte et ton nom disparaîtront pour tout le monde\./),
    ).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Annuler' }),
    )

    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', {
        name: 'Supprimer le commentaire',
      }),
    )
    expect(screen.getByText('Il disparaîtra pour tout le monde.')).toBeTruthy()
  })

  it('says where a deleted reply was that it is gone', async () => {
    seenByOther()
    mockComments([{ ...maxComment, replies: [{ ...zoeReply, isMine: true }, leaReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Moi aussi, dis-nous !')
    await fireEvent.press(
      cardOf('Moi aussi, dis-nous !').getByRole('button', { name: 'Supprimer le commentaire' }),
    )
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer ce commentaire ?').getByRole('button', { name: 'Supprimer' }),
    )
    // La liste n'a pas encore changé dans ce faux hook : on la change comme l'aurait fait l'API.
    mockComments([{ ...maxComment, replies: [leaReply] }])

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Ton commentaire a été supprimé.')
    // À sa place, juste avant la réponse de Léa, dans le fil.
    const shown = screen.getAllByText(/^(Ton commentaire a été supprimé\.|Merci à vous deux\.)$/)
    expect(shown.map((node) => node.props.children)).toEqual([
      'Ton commentaire a été supprimé.',
      'Merci à vous deux.',
    ])
  })

  it('keeps the button of a comment being hidden busy, without sending twice', async () => {
    // L'API ne répond pas encore : le masquage reste en route.
    mockSetHidden.mockReturnValue(new Promise(() => {}))
    mockComments([zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    const button = await screen.findByRole('button', { name: 'Masquer le commentaire' })
    await fireEvent.press(button)

    expect(screen.getByRole('button', { name: 'Masquer le commentaire' })).toBeBusy()
    await fireEvent.press(screen.getByRole('button', { name: 'Masquer le commentaire' }))
    expect(mockSetHidden).toHaveBeenCalledTimes(1)
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
