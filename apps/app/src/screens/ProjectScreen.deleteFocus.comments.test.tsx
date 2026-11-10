import { screen, waitFor } from '@testing-library/react-native'
import { maxComment, zoeComment } from '../testing/comments'
import { watchOpeningFocus } from '../testing/openingFocus'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { chooseInMenu, openSheet } from './ProjectComments.testkit'
import { ProjectScreen } from './ProjectScreen'
import {
  dialogTitled,
  id,
  mockComments,
  mockPush,
  mockReplace,
  mockScreenProps,
  resetProjectScreenMocks,
  seenByOther,
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
// Les mises à jour (R7a, qui remplacent les notes) : de faux hooks, dont le test lit les appels.
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
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

// --- Correction C8 (H3) : le focus d'ouverture de la fenêtre « Supprimer ce commentaire ? » ---

afterEach(() => {
  jest.restoreAllMocks()
})

describe('the « Supprimer ce commentaire ? » window opening focus', () => {
  it('opens on « Annuler », not on « Supprimer »', async () => {
    seenByOther({ ...recipesProject, commentCount: 4 })
    mockComments([{ ...maxComment, isMine: true }, zoeComment])
    await renderWithProviders(<ProjectScreen id={id} />)
    await screen.findByRole('header', { name: /^Commentaires/ })
    await openSheet()
    const focused = watchOpeningFocus()

    await chooseInMenu('Super idée, je teste ce soir.', 'Supprimer')
    dialogTitled('Supprimer ce commentaire ?')

    await waitFor(() => expect(focused()).toBe('Annuler'))
  })
})
