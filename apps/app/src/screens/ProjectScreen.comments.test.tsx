// Tests de la page d'un projet : réagir au projet et ses commentaires (tranche 5), écrire un
// commentaire et y répondre.
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
import { NO_REACTIONS } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useComments, usePostComment } from '../comments/api'
import { getProject } from '../projects/api'
import { useReaction } from '../reactions/api'
import {
  commentOf,
  leaReply,
  maxAuthor,
  maxComment,
  zoeComment,
  zoeReply,
} from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { ProjectScreen } from './ProjectScreen'
import {
  commentSomething,
  id,
  mockComments,
  mockFetchNextPage,
  mockPost,
  mockPush,
  mockReact,
  mockReplace,
  mockScreenProps,
  resetProjectScreenMocks,
  seenByOther,
  shownComments,
  signInAgain,
  threadOf,
  withNotes,
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

// --- Tranche 5 : réagir et commenter ---

describe('reacting to a project from its page', () => {
  it('offers another member the five reactions with their numbers, and reacts to the one touched', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 3 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    for (const name of ['Bluffant, 0', 'Inspirant, 0', 'Utile, 0', 'Drôle, 0']) {
      expect(await screen.findByRole('button', { name })).toBeTruthy()
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Waggle\u202f!, 3' }))

    expect(useReaction).toHaveBeenCalledWith(id)
    expect(mockReact).toHaveBeenCalledWith('bravo')
  })

  it('says in their name which reactions are the member’s own', async () => {
    seenByOther(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 4 }, mine: ['bravo'] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(
      await screen.findByRole('button', { name: 'Waggle\u202f!, 4, ta réaction' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Utile, 0' })).toBeTruthy()
  })

  it('shows the author the numbers of her project, without letting her react', async () => {
    jest
      .mocked(getProject)
      .mockResolvedValue(withReactions({ counts: { ...NO_REACTIONS.counts, bravo: 2 }, mine: [] }))
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Les réactions à ton projet')).toBeTruthy()
    expect(screen.getByLabelText('Waggle\u202f!, 2')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /^(Bluffant|Inspirant|Utile|Drôle|Waggle\s!),/ }),
    ).toBeNull()
  })

  it('says so when the reaction could not be saved', async () => {
    seenByOther(recipesProject)
    jest.mocked(useReaction).mockReturnValue({ toggle: mockReact, error: true, expired: false })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta réaction n’a pas pu être enregistrée. Réessaie.',
    )
  })

  it('says that the session expired', async () => {
    seenByOther(recipesProject)
    jest.mocked(useReaction).mockReturnValue({ toggle: mockReact, error: true, expired: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  it('offers to sign in again when the session expired while reacting (slice 6c)', async () => {
    seenByOther(recipesProject)
    jest.mocked(useReaction).mockReturnValue({ toggle: mockReact, error: true, expired: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await signInAgain()
  })
})

describe('the comments of a project', () => {
  it('shows the comments under their header, newest thread first, replies oldest first', async () => {
    seenByOther({ ...recipesProject, commentCount: 4 })
    mockComments([maxComment, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Commentaires (4)' })).toBeTruthy()
    expect(useComments).toHaveBeenCalledWith(id)
    const shown = shownComments()
    expect(shown).toHaveLength(4)
    expect(shown[0]).toHaveTextContent('Super idée, je teste ce soir.')
    expect(shown[1]).toHaveTextContent('Moi aussi, dis-nous !')
    expect(shown[2]).toHaveTextContent('Merci à vous deux.')
    expect(shown[3]).toHaveTextContent('Ça marche aussi en anglais ?')
  })

  it('leads from a comment to the page of its author', async () => {
    seenByOther()
    mockComments([zoeComment, commentOf({ id: maxComment.id, author: maxAuthor, body: 'Bravo' })])
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Voir la page de Max' }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u2' } })
  })

  it('elides « de » before an author whose name starts with a vowel (« d’Inès »)', async () => {
    // Tranche 6c : {{nameOf}}, rempli par useNameOf, pour l'autrice du projet et d'un commentaire.
    const ines = { id: 'u3', name: 'Inès', avatarUrl: null }
    seenByOther({ ...withNotes, author: ines })
    mockComments([commentOf({ id: maxComment.id, author: ines, body: 'Merci !' })])
    await renderWithProviders(<ProjectScreen id={id} />)

    const links = await screen.findAllByRole('link', { name: 'Voir la page d’Inès' })
    expect(links).toHaveLength(2) // l'autrice du projet, puis celle du commentaire
    expect(screen.queryByRole('link', { name: /de Inès/ })).toBeNull()
  })

  it('writes the possessive in English (« See Inès’s page »)', async () => {
    const ines = { id: 'u3', name: 'Inès', avatarUrl: null }
    seenByOther({ ...withNotes, author: ines })
    mockComments([commentOf({ id: maxComment.id, author: ines, body: 'Thanks!' })])
    await renderWithProviders(<ProjectScreen id={id} />, 'en')

    expect(await screen.findAllByRole('link', { name: 'See Inès’s page' })).toHaveLength(2)
  })

  it('says when a comment was edited', async () => {
    seenByOther()
    mockComments([{ ...zoeComment, editedAt: '2026-10-14T10:00:00.000Z' }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('modifié')).toBeTruthy()
  })

  it('invites to comment when there is no comment yet', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    // Sans commentaire, le titre seul : « (0) » n’apprend rien que la liste vide ne dise.
    expect(await screen.findByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText('Pas encore de commentaire.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('offers the next comments, then ends the list without a word (RF, T4)', async () => {
    seenByOther()
    mockComments([zoeComment], { hasNextPage: true })
    const view = await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Afficher la suite' }))
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)

    mockComments([zoeComment])
    await view.rerender(<ProjectScreen id={id} />)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull(),
    )
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('shows « Commentaire supprimé » in place of a deleted comment, above its replies', async () => {
    seenByOther()
    mockComments([{ ...maxComment, author: null, body: '', state: 'deleted', replies: [zoeReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Commentaire supprimé')).toBeTruthy()
    expect(screen.getByText('Moi aussi, dis-nous !')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Voir la page de Max' })).toBeNull()
  })

  it('shows « Commentaire masqué » in place of a hidden comment the member cannot read', async () => {
    seenByOther()
    mockComments([{ ...maxComment, author: null, body: '', state: 'hidden', replies: [zoeReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Commentaire masqué')).toBeTruthy()
    expect(screen.getByText('Moi aussi, dis-nous !')).toBeTruthy()
    // Le bandeau des deux auteurs n'est pas pour les autres : ils ne lisent rien du commentaire.
    expect(
      screen.queryByText(
        'Masqué par la personne qui a publié le projet : les autres membres ne le voient plus.',
      ),
    ).toBeNull()
  })
})

describe('writing a comment', () => {
  it('opens a field to write the comment, then publishes it', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    // Le champ n'est pas ouvert d'office.
    await screen.findByRole('button', { name: 'Écrire un commentaire' })
    expect(screen.queryByLabelText('Ton commentaire')).toBeNull()
    await commentSomething('Bravo, ça marche !')

    expect(usePostComment).toHaveBeenCalledWith(id)
    expect(mockPost).toHaveBeenCalledWith({ body: 'Bravo, ça marche !' })
  })

  it('lets the author comment her own project too', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething('Merci pour vos retours.')

    expect(mockPost).toHaveBeenCalledWith({ body: 'Merci pour vos retours.' })
  })

  it('empties and closes the field once the comment is published, and says so', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    await waitFor(() => expect(screen.queryByLabelText('Ton commentaire')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Commentaire publié.')
    // Rouvert, le champ repart de zéro.
    await fireEvent.press(screen.getByRole('button', { name: 'Écrire un commentaire' }))
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('')
  })

  it('says so when the comment could not be published, and keeps the text', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest.mocked(usePostComment).mockReturnValue({ post: mockPost, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething('Bravo, ça marche !')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être publié. Réessaie.',
    )
    expect(screen.getByLabelText('Ton commentaire')).toHaveDisplayValue('Bravo, ça marche !')
  })

  it('says that the 60 comments of the hour are used up', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'limited' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu as publié 60 commentaires en une heure. Attends un peu avant le suivant.',
    )
  })

  it('says that the session expired', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'expired' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  it('offers to sign in again when the session expired while commenting (slice 6c)', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'expired' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await commentSomething()

    await signInAgain()
  })

  it('asks for a text before publishing', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier le commentaire' }))

    expect(screen.getByText('Écris ton commentaire avant de le publier.')).toBeTruthy()
    expect(mockPost).not.toHaveBeenCalled()
  })
})

describe('replying to a comment', () => {
  beforeEach(() => {
    seenByOther()
    mockComments([maxComment, zoeComment])
  })

  it('opens a field under the comment, then publishes the reply in its thread', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Ça marche aussi en anglais ?')
    await fireEvent.press(
      threadOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await fireEvent.changeText(screen.getByLabelText('Ta réponse'), 'Oui, en anglais aussi.')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    expect(mockPost).toHaveBeenCalledWith({
      body: 'Oui, en anglais aussi.',
      replyTo: zoeComment.id,
    })
    // Une fois publiée, le champ de réponse se referme.
    await waitFor(() => expect(screen.queryByLabelText('Ta réponse')).toBeNull())
  })

  it('answers a reply in the same thread, under its first comment', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Moi aussi, dis-nous !')
    await fireEvent.press(
      threadOf('Moi aussi, dis-nous !').getByRole('button', { name: 'Répondre' }),
    )
    await fireEvent.changeText(screen.getByLabelText('Ta réponse'), 'Je vous raconte demain.')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la réponse' }))

    // Les réponses tiennent sur un seul niveau : on répond au commentaire racine.
    expect(mockPost).toHaveBeenCalledWith({
      body: 'Je vous raconte demain.',
      replyTo: maxComment.id,
    })
  })

  it('offers no reply under a deleted comment, even to its replies', async () => {
    mockComments([{ ...zoeComment, author: null, body: '', state: 'deleted', replies: [leaReply] }])
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByText('Commentaire supprimé')
    // « Répondre » appartient au fil, et ce fil n’accepte plus de réponse : aucun bouton, pas même
    // sous la réponse de Léa, encore visible.
    expect(screen.getByText('Merci à vous deux.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Répondre' })).toBeNull()
  })
})
