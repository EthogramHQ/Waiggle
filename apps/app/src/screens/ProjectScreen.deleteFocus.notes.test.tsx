// Le focus d'ouverture de la fenêtre « Supprimer cette note ? » (R6a, correction C8, H3). Mêmes
// simulations que ProjectScreen.journal.test.tsx, dont voici le début :
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
import { watchOpeningFocus } from '../testing/openingFocus'
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

// --- Correction C8 (H3) : le focus d'ouverture de la fenêtre « Supprimer cette note ? » ---

afterEach(() => {
  jest.restoreAllMocks()
})

describe('the « Supprimer cette note ? » window opening focus', () => {
  it('opens on « Annuler », not on « Supprimer »', async () => {
    jest.mocked(getProject).mockResolvedValue(withNotes)
    await renderWithProviders(<ProjectScreen id={id} />)
    await screen.findAllByRole('button', { name: 'Supprimer la note' })
    const focused = watchOpeningFocus()

    await fireEvent.press(await deleteButton(0))
    dialogTitled('Supprimer cette note ?')

    await waitFor(() => expect(focused()).toBe('Annuler'))
  })
})
