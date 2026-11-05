// Tests de la page d'un projet : réagir au projet (tranche 5), et ses commentaires tels que R5b les
// redessine (docs/scenarios/refonte.md, « R5b — Les commentaires ») : l'aperçu sous la page, la
// feuille qui s'ouvre par-dessus sur téléphone, écrire, répondre, et sur ordinateur la liste qui se
// déroule dans la colonne de droite, sans feuille (choix 1).
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx (la page) et ProjectComments.testkit.tsx (les commentaires).
import { NO_REACTIONS } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { createRef } from 'react'
import { View } from 'react-native'
import { useComments, usePostComment } from '../comments/api'
import { getProject } from '../projects/api'
import { useReaction } from '../reactions/api'
import { commentOf, maxAuthor, maxComment, zoeComment, zoeReply } from '../testing/comments'
import { recipesProject } from '../testing/projects'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import {
  cardOf,
  closeSheet,
  commentField,
  describeFocused,
  hugoComment,
  lineOf,
  openSheet,
  previewNames,
  queryCommentField,
  sendButton,
  sheet,
  sheetIsOpen,
  sixComments,
  sixTexts,
  watchFocus,
  writeAndSend,
} from './ProjectComments.testkit'
import { ProjectScreen } from './ProjectScreen'
import {
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
  signInAgain,
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
// Où le code pose le focus : les aides de ui/focus, gardées telles quelles, mais dont le test lit
// les appels (watchFocus de ProjectComments.testkit.tsx).
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn((node: unknown) => actual.focusWithoutScroll(node)),
    focusAndReveal: jest.fn((node: unknown, calm: boolean) => actual.focusAndReveal(node, calm)),
  }
})
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

/** Les blancs d'Intl et de la typographie française ramenés à des espaces, comme getByText. */
const plain = (text: string) => text.replace(/\s+/g, ' ')

/** Une vue témoin à côté de la page : sa `ref` donne le prototype commun des vues (watchFocus). */
const probe = createRef<View>()
const renderPage = (language?: 'en') =>
  renderWithProviders(
    <>
      <View ref={probe} />
      <ProjectScreen id={id} />
    </>,
    language,
  )

/** Le projet de Léa, avec ce nombre de commentaires, vu par Max. */
const seenWithCount = (commentCount: number) => seenByOther({ ...withNotes, commentCount })

describe('the comments of a project', () => {
  it('shows the preview under its header: the first 3 lines, newest thread first, replies included', async () => {
    seenWithCount(6)
    mockComments(sixComments)
    await renderPage()

    expect(await screen.findByRole('header', { name: 'Commentaires, 6 commentaires' })).toBeTruthy()
    expect(useComments).toHaveBeenCalledWith(id)
    expect(previewNames()).toEqual([
      expect.stringMatching(lineOf('Max', 'Super idée')),
      expect.stringMatching(lineOf('Zoé', 'Moi aussi')),
      expect.stringMatching(lineOf('Léa', 'Merci à vous deux')),
    ])
    expect(screen.getByRole('button', { name: 'Voir les 6 commentaires' })).toBeTruthy()
  })

  it('lists in the sheet the threads newest first, each followed by its replies', async () => {
    seenWithCount(6)
    mockComments(sixComments)
    await renderPage()

    await screen.findByRole('button', { name: 'Voir les 6 commentaires' })
    await openSheet()

    const pattern = new RegExp(
      `^(${sixTexts.map((text) => text.replace(/[.?]/g, '\\$&')).join('|')})$`,
    )
    expect(
      sheet()
        .getAllByText(pattern)
        .map((node) => node.props.children),
    ).toEqual(sixTexts)
  })

  it('leads from a comment of the sheet to the page of its author', async () => {
    seenWithCount(2)
    mockComments([zoeComment, commentOf({ id: maxComment.id, author: maxAuthor, body: 'Bravo' })])
    await renderPage()

    await screen.findByRole('button', { name: 'Commenter' })
    await openSheet()
    await fireEvent.press(sheet().getByRole('link', { name: 'Max' }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u2' } })
  })

  it('elides « de » before an author whose name starts with a vowel (« d’Inès »)', async () => {
    // Tranche 6c : {{nameOf}}, rempli par useNameOf. Depuis R5b, le nom d'un commentaire est lu
    // seul (« Inès, Auteur » pour l'autrice du projet) : seul le lien du haut de la page garde
    // « Voir la page d’Inès ».
    const ines = { id: 'u3', name: 'Inès', handle: 'ines', avatarUrl: null }
    seenByOther({ ...withNotes, author: ines, commentCount: 1 })
    mockComments([commentOf({ id: maxComment.id, author: ines, body: 'Merci !' })])
    await renderPage()

    expect(await screen.findAllByRole('link', { name: 'Voir la page d’Inès' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /de Inès/ })).toBeNull()
    await openSheet()
    expect(sheet().getByRole('link', { name: 'Inès, Auteur' })).toBeTruthy()
  })

  it('writes the possessive and the preview line in English', async () => {
    const ines = { id: 'u3', name: 'Inès', handle: 'ines', avatarUrl: null }
    seenByOther({ ...withNotes, author: ines, commentCount: 1 })
    mockComments([commentOf({ id: maxComment.id, author: ines, body: 'Thanks!' })])
    await renderPage('en')

    expect(await screen.findAllByRole('link', { name: 'See Inès’s page' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^Comment by Inès: Thanks!/ })).toBeTruthy()
  })

  it('says in the sheet when a comment was edited', async () => {
    seenWithCount(1)
    mockComments([{ ...zoeComment, editedAt: '2026-10-14T10:00:00.000Z' }])
    await renderPage()

    await screen.findByRole('button', { name: 'Commenter' })
    await openSheet()

    expect(sheet().getByText('modifié')).toBeTruthy()
  })

  it('invites to comment when there is no comment yet', async () => {
    seenByOther()
    await renderPage()

    // Sans commentaire, le titre seul : « 0 » n’apprend rien que la phrase ne dise.
    expect(await screen.findByRole('header', { name: 'Commentaires' })).toBeTruthy()
    expect(screen.getByText('Aucun commentaire pour l’instant.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('offers the next comments at the end of the sheet, then ends the list without a word (RF, T4)', async () => {
    seenWithCount(25)
    mockComments([zoeComment], { hasNextPage: true })
    const view = await renderPage()

    await screen.findByRole('button', { name: 'Voir les 25 commentaires' })
    await openSheet()
    await fireEvent.press(sheet().getByRole('button', { name: 'Afficher la suite' }))
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1)

    mockComments([zoeComment])
    await view.rerender(
      <>
        <View ref={probe} />
        <ProjectScreen id={id} />
      </>,
    )
    await waitFor(() =>
      expect(sheet().queryByRole('button', { name: 'Afficher la suite' })).toBeNull(),
    )
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('shows « Commentaire supprimé » in the sheet in place of a deleted comment, above its replies', async () => {
    seenWithCount(1)
    mockComments([{ ...maxComment, author: null, body: '', state: 'deleted', replies: [zoeReply] }])
    await renderPage()

    await screen.findByRole('button', { name: 'Commenter' })
    await openSheet()

    expect(sheet().getByText('Commentaire supprimé')).toBeTruthy()
    expect(sheet().getByText('Moi aussi, dis-nous !')).toBeTruthy()
    expect(sheet().queryByRole('link', { name: 'Max' })).toBeNull()
  })

  it('shows « Commentaire masqué » in the sheet in place of a hidden comment the member cannot read', async () => {
    seenWithCount(1)
    mockComments([{ ...maxComment, author: null, body: '', state: 'hidden', replies: [zoeReply] }])
    await renderPage()

    await screen.findByRole('button', { name: 'Commenter' })
    await openSheet()

    expect(sheet().getByText('Commentaire masqué')).toBeTruthy()
    expect(sheet().getByText('Moi aussi, dis-nous !')).toBeTruthy()
    // La note des deux auteurs n'est pas pour les autres : ils ne lisent rien du commentaire.
    expect(sheet().queryByText(plain(fr.t(($) => $.project.comments.hiddenNote)))).toBeNull()
    expect(sheet().queryByText('Masqué par l’auteur du projet')).toBeNull()
  })
})

describe('the comments sheet on a phone', () => {
  it('opens over the page from « Voir les 6 commentaires », and closes with « Fermer »', async () => {
    seenWithCount(6)
    mockComments(sixComments)
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Voir les 6 commentaires' }))
    expect(sheetIsOpen()).toBe(true)
    // Le champ est fixé en bas de la feuille, pas sur la page.
    expect(commentField(sheet())).toBeTruthy()

    await closeSheet()
    expect(sheetIsOpen()).toBe(false)
    expect(queryCommentField()).toBeNull()
  })

  it('keeps the field off the page on a phone: it lives in the sheet', async () => {
    seenWithCount(6)
    mockComments(sixComments)
    await renderPage()

    await screen.findByRole('button', { name: 'Voir les 6 commentaires' })

    expect(queryCommentField()).toBeNull()
  })
})

describe('writing a comment', () => {
  it('opens the sheet with the field, then sends the comment', async () => {
    seenByOther()
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Bravo, ça marche !')

    expect(usePostComment).toHaveBeenCalledWith(id)
    expect(mockPost).toHaveBeenCalledWith({ body: 'Bravo, ça marche !' })
  })

  it('lets the author comment her own project too', async () => {
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Merci pour vos retours.')

    expect(mockPost).toHaveBeenCalledWith({ body: 'Merci pour vos retours.' })
  })

  it('empties the field once the comment is sent, and keeps the sheet open', async () => {
    seenByOther()
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Bravo, ça marche !')

    await waitFor(() => expect(commentField()).toHaveDisplayValue(''))
    expect(sheetIsOpen()).toBe(true)
  })

  it('says so when the comment could not be published, and keeps the text', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest.mocked(usePostComment).mockReturnValue({ post: mockPost, pending: false, error: true })
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Bravo, ça marche !')

    expect(await sheet().findByRole('alert')).toHaveTextContent(
      'Le commentaire n’a pas pu être publié. Réessaie.',
    )
    expect(commentField()).toHaveDisplayValue('Bravo, ça marche !')
  })

  it('says that the 60 comments of the hour are used up', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'limited' })
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Bravo, ça marche !')

    expect(await sheet().findByRole('alert')).toHaveTextContent(
      'Tu as publié 60 commentaires en une heure. Attends un peu avant le suivant.',
    )
  })

  it('says that the session expired', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'expired' })
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Bravo, ça marche !')

    expect(await sheet().findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  it('offers to sign in again when the session expired while commenting (slice 6c)', async () => {
    seenByOther()
    mockPost.mockResolvedValue(false)
    jest
      .mocked(usePostComment)
      .mockReturnValue({ post: mockPost, pending: false, error: true, reason: 'expired' })
    await renderPage()

    await fireEvent.press(await screen.findByRole('button', { name: 'Écrire un commentaire' }))
    await writeAndSend('Bravo, ça marche !')

    await signInAgain()
  })
})

describe('replying to a comment', () => {
  beforeEach(() => {
    seenWithCount(4)
    mockComments([maxComment, zoeComment])
  })

  it('offers « Répondre » under each comment of the sheet, replies included', async () => {
    await renderPage()

    await screen.findByRole('button', { name: 'Voir les 4 commentaires' })
    await openSheet()

    // Quatre commentaires, quatre « Répondre » (avant R5b : un seul par fil, au bout).
    expect(sheet().getAllByRole('button', { name: 'Répondre' })).toHaveLength(4)
  })

  it('publishes the reply in the thread of the comment', async () => {
    await renderPage()

    await screen.findByRole('button', { name: 'Voir les 4 commentaires' })
    await openSheet()
    await fireEvent.press(
      cardOf('Ça marche aussi en anglais ?').getByRole('button', { name: 'Répondre' }),
    )
    await writeAndSend('Oui, en anglais aussi.')

    expect(mockPost).toHaveBeenCalledWith({
      body: 'Oui, en anglais aussi.',
      replyTo: zoeComment.id,
    })
  })

  it('answers a reply in the same thread, under its first comment, with its author’s mention', async () => {
    await renderPage()

    await screen.findByRole('button', { name: 'Voir les 4 commentaires' })
    await openSheet()
    await fireEvent.press(cardOf('Moi aussi, dis-nous !').getByRole('button', { name: 'Répondre' }))
    expect(commentField()).toHaveDisplayValue('@zoe ')
    await writeAndSend('@zoe Je vous raconte demain.')

    expect(mockPost).toHaveBeenCalledWith({
      body: '@zoe Je vous raconte demain.',
      replyTo: maxComment.id,
    })
  })

  it('offers no reply under a deleted comment, even to its replies', async () => {
    mockComments([{ ...zoeComment, author: null, body: '', state: 'deleted', replies: [zoeReply] }])
    await renderPage()

    await screen.findByRole('button', { name: /^(Voir les 4 commentaires|Commenter)$/ })
    await openSheet()

    // Ce fil n’accepte plus de réponse : aucun bouton, pas même sous la réponse encore visible.
    expect(sheet().getByText('Moi aussi, dis-nous !')).toBeTruthy()
    expect(sheet().queryByRole('button', { name: 'Répondre' })).toBeNull()
  })
})

// Choix 1 de Louis (4/11/2026) : sur ordinateur, les commentaires sont dans la colonne de droite ;
// 5 au plus, « Voir les 6 commentaires » déroule la liste en place, et le champ y est déjà.
describe('the comments on a wide screen', () => {
  let phone: () => void
  beforeEach(() => {
    phone = setDesktopWindow()
  })
  afterEach(() => {
    phone()
  })

  it('shows 5 comments, « Voir les 6 commentaires », then the field and « Envoyer » with who will read', async () => {
    seenWithCount(6)
    mockComments(sixComments)
    await renderPage()

    await screen.findByRole('button', { name: 'Voir les 6 commentaires' })
    const shown = sixTexts.filter((text) => screen.queryAllByText(text).length > 0)
    expect(shown).toEqual(sixTexts.slice(0, 5))
    expect(commentField()).toBeTruthy()
    expect(sendButton()).toBeTruthy()
    expect(screen.getByText(plain(fr.t(($) => $.project.comments.hint)))).toBeTruthy()
    expect(sheetIsOpen()).toBe(false)
  })

  it('on a wide screen with 5 comments or fewer there is no button under the comments', async () => {
    seenWithCount(5)
    mockComments([maxComment, zoeComment, sixComments[2] ?? zoeComment])
    await renderPage()

    // Témoin : les commentaires et le champ de la colonne sont là.
    expect(await screen.findByText('Et pour les végétariens ?')).toBeTruthy()
    expect(commentField()).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Voir (le|les)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Commenter' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Écrire un commentaire' })).toBeNull()
  })

  it('after « Voir les 6 commentaires » on a wide screen the focus goes to the first newly shown comment', async () => {
    seenWithCount(6)
    mockComments(sixComments)
    await renderPage()
    const more = await screen.findByRole('button', { name: 'Voir les 6 commentaires' })
    const focus = watchFocus(probe)
    try {
      await fireEvent.press(more)

      // La liste se déroule en place : tous les commentaires, sans feuille, et le bouton s'en va.
      expect(await screen.findByText(hugoComment.body)).toBeTruthy()
      expect(sheetIsOpen()).toBe(false)
      expect(screen.queryByRole('button', { name: 'Voir les 6 commentaires' })).toBeNull()
      // Le premier nouvellement montré : le 6e, celui de Hugo.
      await waitFor(() => expect(describeFocused(focus.last())).toMatch(/Hugo/))
    } finally {
      focus.restore()
    }
  })

  it('sends from the field of the column, without a sheet', async () => {
    seenWithCount(1)
    mockComments([zoeComment])
    await renderPage()

    await screen.findByText('Ça marche aussi en anglais ?')
    await writeAndSend('Bravo, ça marche !')

    expect(mockPost).toHaveBeenCalledWith({ body: 'Bravo, ça marche !' })
    expect(sheetIsOpen()).toBe(false)
  })
})
