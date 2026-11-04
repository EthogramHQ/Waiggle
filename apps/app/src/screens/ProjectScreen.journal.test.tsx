// Tests de la page d'un projet : son journal (tranche 4b), publier, écrire et supprimer une note,
// la note proposée après un changement d'état.
//
// L'ancien ProjectScreen.test.tsx est coupé par sections (159 tests, de 50 à 100 s à lui seul) : Jest
// donne un fichier entier à un seul processus, alors que plusieurs fichiers tournent en parallèle.
// L'API est remplacée par de faux appels ; les aides et données communes sont dans
// ProjectScreen.testkit.tsx.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useDeleteNote, usePublishNote } from '../notes/api'
import { getProject } from '../projects/api'
import { passTapGuard } from '../testing/dialog'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import {
  deleteButton,
  dialogTitled,
  id,
  mockPublish,
  mockPush,
  mockRemove,
  mockReplace,
  mockScreenProps,
  publishSomething,
  resetProjectScreenMocks,
  seenByOther,
  shownNotes,
  signInAgain,
  v2,
  withNotes,
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

// --- Tranche 4b : le journal du projet ---

describe('the journal of a project', () => {
  it('shows the notes under a « Journal » header, newest first', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Journal' })).toBeTruthy()
    const shown = shownNotes()
    expect(shown).toHaveLength(2)
    expect(shown[0]).toHaveTextContent('v2 : mode hors ligne')
    expect(shown[1]).toHaveTextContent('Première version en ligne')
  })

  it('shows no journal to another member when there is no note', async () => {
    seenByOther(recipesProject)
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Mon agent de recettes' })
    expect(screen.queryByRole('header', { name: 'Journal' })).toBeNull()
  })

  it('offers another member neither to publish nor to delete a note', async () => {
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByRole('button', { name: 'Publier une note' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Supprimer la note' })).toBeNull()
    expect(screen.queryByLabelText('Ta note')).toBeNull()
  })

  it('invites the author to write a first note', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByRole('header', { name: 'Journal' })).toBeTruthy()
    // RF (T11) : l'état vide dit seulement « Pas encore de note. » ; l'aide du champ dit le reste.
    expect(screen.getByText('Pas encore de note.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publier une note' })).toBeTruthy()
  })
})

describe('publishing a note from the project page', () => {
  it('opens a field to write the note, then publishes it', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    // Le champ n'est pas ouvert d'office.
    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(usePublishNote).toHaveBeenCalledWith(id)
    expect(mockPublish).toHaveBeenCalledWith('v2 : mode hors ligne')
  })

  it('empties and closes the field once the note is published', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    await waitFor(() => expect(screen.queryByLabelText('Ta note')).toBeNull())
    // Rouvert, le champ repart de zéro.
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))
    expect(screen.getByLabelText('Ta note')).toHaveDisplayValue('')
  })

  it('says so when the note could not be published, and keeps the text', async () => {
    mockPublish.mockResolvedValue(false)
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La note n’a pas pu être publiée. Réessaie.',
    )
    // Rien n'est perdu : le texte attend dans le champ, pour réessayer.
    expect(screen.getByLabelText('Ta note')).toHaveDisplayValue('v2 : mode hors ligne')
  })

  it('forgets the error once the field is closed and opened again', async () => {
    mockPublish.mockResolvedValue(false)
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v2 : mode hors ligne')
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))
    await screen.findByRole('alert')

    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: 'Annuler' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier une note' }))

    // L'ancienne erreur n'est pas relue : rien n'a encore été réessayé.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // RF (T16, jur-RF6) : sous le bandeau « Privé », le même état vide qu'un projet public, sans
  // parler d'abonnés ; qui lira les notes, c'est l'aide du champ qui le dit (`hintPrivate`).
  it('gives a private project the same empty journal, without speaking of followers', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByText('Pas encore de note.')).toBeTruthy()
    expect(screen.queryByText(/abonnés/)).toBeNull()
  })

  // jur-RF6 : l'état vide ne dit plus qui lira ; c'est l'aide du champ ouvert, propre au projet
  // privé (`hintPrivate`), qui le dit, et elle ne parle pas d'abonnés non plus.
  it('says in the opened field of a private project who will read the note, without followers', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, visibility: 'private' })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))

    expect(screen.getByLabelText('Ta note')).toBeTruthy() // témoin : le champ est ouvert
    expect(screen.getByText(fr.t(($) => $.project.notes.hintPrivate))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.project.notes.hint))).toBeNull()
    expect(screen.queryByText(/abonnés/)).toBeNull()
  })
})

describe('deleting a note from the project page', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
  })

  it('offers the author to delete each note, once confirmed', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findAllByRole('button', { name: 'Supprimer la note' })).toHaveLength(2)
    await fireEvent.press(await deleteButton(0))
    expect(mockRemove).not.toHaveBeenCalled() // il faut d'abord confirmer
    const dialog = dialogTitled('Supprimer cette note ?')
    await passTapGuard()
    await fireEvent.press(dialog.getByRole('button', { name: 'Supprimer' }))

    expect(useDeleteNote).toHaveBeenCalledWith(id)
    expect(mockRemove).toHaveBeenCalledWith(v2.id)
  })

  it('deletes nothing when the author changes her mind', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(1))
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Annuler' }),
    )

    expect(mockRemove).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: 'Supprimer cette note ?' })).toBeNull()
  })
})

describe('the note suggested after a change of status', () => {
  const suggested = 'Le projet passe en « Testable ».'

  it('opens the field, filled in with the new status, when the author comes from the form', async () => {
    mockParams = { id, announce: 'testable' }
    await renderWithProviders(<ProjectScreen id={id} />)

    expect(await screen.findByLabelText('Ta note')).toHaveDisplayValue(suggested)
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))

    expect(mockPublish).toHaveBeenCalledWith(suggested)
  })

  it('suggests nothing to another member', async () => {
    mockParams = { id, announce: 'testable' }
    seenByOther()
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
    expect(screen.queryByText(suggested)).toBeNull()
  })

  it('suggests nothing for a status that does not exist', async () => {
    // Une adresse fabriquée à la main ne doit rien glisser dans le champ de l'auteur.
    mockParams = { id, announce: 'piratage' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByRole('header', { name: 'Journal' })
    expect(screen.queryByLabelText('Ta note')).toBeNull()
  })

  it('says under the field why it opened by itself', async () => {
    mockParams = { id, announce: 'testable' }
    await renderWithProviders(<ProjectScreen id={id} />)

    await screen.findByLabelText('Ta note')
    // \s : les espaces insécables de la typographie française.
    expect(
      screen.getByText(/Ton projet est passé en «\sTestable\s»\s: annonce-le à tes abonnés/),
    ).toBeTruthy()
  })
})

// --- Relectures de la 4b : quand « Réessaie » ne sert à rien, et les suites d'une suppression ---

describe('a note refused for a reason that trying again cannot fix', () => {
  beforeEach(() => mockPublish.mockResolvedValue(false))

  it('says that the 30 notes of the day are used up', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true, reason: 'limited' })
    await renderWithProviders(<ProjectScreen id={id} />)
    await publishSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu as publié 30 notes aujourd’hui. La suivante pourra partir demain.',
    )
  })

  it('says that the session expired', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true, reason: 'expired' })
    await renderWithProviders(<ProjectScreen id={id} />)
    await publishSomething()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  it('offers to sign in again, back to the project, when the session expired (slice 6c)', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: false, error: true, reason: 'expired' })
    await renderWithProviders(<ProjectScreen id={id} />)
    await publishSomething()

    await signInAgain()
  })
})

describe('writing a note', () => {
  it('forgets the complaint about an empty note as soon as the text changes', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Publier la note' }))
    expect(screen.getByText('Écris ta note avant de la publier.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Ta note'), 'v')

    expect(screen.queryByText('Écris ta note avant de la publier.')).toBeNull()
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('freezes the text and the cancel button while the note is on its way', async () => {
    jest
      .mocked(usePublishNote)
      .mockReturnValue({ publish: mockPublish, pending: true, error: false })
    await renderWithProviders(<ProjectScreen id={id} />)
    await fireEvent.press(await screen.findByRole('button', { name: 'Publier une note' }))

    expect(screen.getByLabelText('Ta note')).toHaveProp('editable', false)
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
  })
})

describe('after deleting a note', () => {
  beforeEach(() => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
  })

  it('keeps the window open with the reason when the deletion fails, to try again', async () => {
    mockRemove.mockResolvedValue(false)
    jest.mocked(useDeleteNote).mockReturnValue({ remove: mockRemove, error: true })
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(0))
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Supprimer' }),
    )

    const dialog = dialogTitled('Supprimer cette note ?')
    expect(dialog.getByRole('alert')).toHaveTextContent(
      'La note n’a pas pu être supprimée. Réessaie.',
    )
    await passTapGuard()
    await fireEvent.press(dialog.getByRole('button', { name: 'Supprimer' }))
    expect(mockRemove).toHaveBeenCalledTimes(2)
  })

  it('confirms the deletion without interrupting the screen reader', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await deleteButton(0))
    await passTapGuard()
    await fireEvent.press(
      dialogTitled('Supprimer cette note ?').getByRole('button', { name: 'Supprimer' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent('Note supprimée.')
    expect(screen.queryByRole('header', { name: 'Supprimer cette note ?' })).toBeNull()
  })
})
