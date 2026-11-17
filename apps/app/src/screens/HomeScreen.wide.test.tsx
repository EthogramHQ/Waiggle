// Tests du Fil sur un grand écran (tranche R15, docs/scenarios/refonte.md, « L'ordinateur en
// grand », « Des colonnes qui suivent la place ») : le Fil prend le gabarit large, et sa grille
// compte ses colonnes selon la place qu'elle a, plus selon le type d'appareil. À 1 920, trois
// colonnes de cartes à côté du panneau ; à 1 100, deux, comme avant R15 (relecture du plan, C3 :
// entre 1 100 et 1 536, rien ne recule).
//
// Jest ne mesure rien : la largeur vient de la fenêtre simulée (`Dimensions.set`), que `Screen` et
// `Columns` transmettent à la grille par le calcul, sans mesure à l'écran. On compte les cases de la
// rangée de la grille qui porte une carte : la grille (`ui/ProjectGrid`) est une liste de rangées,
// chaque rangée a une case par colonne (les cases vides comprises).
//
// Les faux modules sont ceux de HomeScreen.computer.test.tsx ; le faux module de ProjectGrid note
// en plus ce que la grille reçoit, puis dessine la vraie.
import { screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { fr } from '../testing/text'
import {
  card,
  type Element,
  mockFollowing,
  mockScreenProps,
  nora,
  october,
  projectItem,
  renderMemberHome,
  resetHomeMocks,
  sam,
} from './HomeScreen.testkit'

/** Les propriétés reçues par chaque grille de cartes, notées par son faux module. */
const mockGridProps: Record<string, unknown>[] = []

jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../feed/api', () => ({
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
  useMarkFeedRead: jest.fn(),
}))
jest.mock('../suggestions/api', () => ({
  useSuggestions: jest.fn(),
  useDismissSuggestion: jest.fn(),
}))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés (la largeur `wide`).
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
// La grille, telle quelle, mais dont le test lit les propriétés : l'écran ne lui impose plus de
// nombre de colonnes (relecture du plan, C2).
jest.mock('../ui/ProjectGrid', () => {
  const actual = jest.requireActual('../ui/ProjectGrid')
  const { createElement } = require('react')
  return {
    ...actual,
    ProjectGrid: (props: Record<string, unknown>) => {
      mockGridProps.push(props)
      return createElement(actual.ProjectGrid, props)
    },
  }
})
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

beforeEach(() => {
  resetHomeMocks()
  mockGridProps.length = 0
})

/**
 * Le temps d'un test, une fenêtre de cette taille ; le téléphone de jest.setup.ts est remis à la
 * fin, même si le test échoue.
 */
const atWindow = async (width: number, height: number, run: () => Promise<void>) => {
  const window = { width, height, scale: 2, fontScale: 1 }
  const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window, screen: window })
  try {
    await run()
  } finally {
    Dimensions.set({ window: phone, screen: phone })
  }
}

/**
 * Le nombre de cases de la rangée de la grille qui porte cette carte : on remonte depuis le lien de
 * la carte jusqu'à la liste (la grille) ; la vue traversée juste avant elle est la rangée.
 */
const cellsInRowOf = (title: string) => {
  let node: Element | null = card(title)
  let row: Element | null = null
  while (node && node.props.accessibilityRole !== 'list' && node.props.role !== 'list') {
    row = node
    node = node.parent
  }
  if (!node || !row) throw new Error(`no grid around « ${title} »`)
  return row.children.length
}

// Quatre projets dans le Fil : assez pour remplir une rangée de trois.
const four = [
  projectItem('d1000000-0000-4000-8000-000000000001', 'La liste des courses', nora, october('20')),
  projectItem('d1000000-0000-4000-8000-000000000002', 'Le jeu des drapeaux', sam, october('19')),
  projectItem('d1000000-0000-4000-8000-000000000003', 'Le planning des repas', nora, october('18')),
  projectItem(
    'd1000000-0000-4000-8000-000000000004',
    'La boussole du randonneur',
    sam,
    october('17'),
  ),
]

describe('the feed on a wide computer screen (R15)', () => {
  it('lays the feed out on the wide template', () =>
    atWindow(1920, 1080, async () => {
      await renderMemberHome()

      expect(mockScreenProps.at(-1)?.width).toBe('wide')
    }))

  it('shows three columns of cards beside the panel at 1 920', () =>
    atWindow(1920, 1080, async () => {
      mockFollowing({ items: four })
      await renderMemberHome()

      // Témoin : le panneau est là, à côté du Fil.
      expect(screen.getByRole('header', { name: fr.t(($) => $.feed.side.testers) })).toBeTruthy()
      expect(cellsInRowOf('La liste des courses')).toBe(3)
    }))

  it('HomeScreen keeps two columns of cards at 1 100', () =>
    atWindow(1100, 800, async () => {
      mockFollowing({ items: four })
      await renderMemberHome()

      // Témoin : à 1 100, le panneau est encore là (deux colonnes de page tiennent).
      expect(screen.getByRole('header', { name: fr.t(($) => $.feed.side.testers) })).toBeTruthy()
      expect(cellsInRowOf('La liste des courses')).toBe(2)
    }))

  it('HomeScreen passes no column count to the feed grid', () =>
    atWindow(1920, 1080, async () => {
      mockFollowing({ items: four })
      await renderMemberHome()

      // Témoin : la grille du Fil a bien été dessinée.
      expect(card('La liste des courses')).toBeTruthy()
      expect(mockGridProps.length).toBeGreaterThan(0)
      // La grille compte seule ses colonnes, d'après la place de la colonne où elle est posée.
      expect(mockGridProps.map((props) => props.columns)).toEqual(
        mockGridProps.map(() => undefined),
      )
    }))
})
