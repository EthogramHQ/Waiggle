// Tests de la recherche sur un grand écran (tranche R16, docs/scenarios/refonte.md, « Ruches,
// Recherche et Outils en grand » ; planches R16-Recherche-1920, R16-Recherche-1440 et
// R16-Recherche-Squelette-1920, validées le 17/11) :
// - dès 1 280 points, la page prend le gabarit large de R15 (`Screen width="wide"`) ;
// - les projets trouvés en grille de cartes, comme sur Explorer : 4 colonnes à 1 920, 3 à 1 440 ;
// - les membres et les outils trouvés dans un panneau à droite (une région `complementary`, comme
//   celui d'Explorer), lu après les projets ;
// - sous 1 280, rien ne change : une colonne, les projets, puis les membres, puis les outils ;
// - le titre « Recherche » n'est affiché à aucune largeur (le champ dit déjà où l'on est), mais reste
//   le titre de niveau 1 des lecteurs d'écran (`titleHidden` de Screen) ;
// - pendant la recherche : « Projets » et 8 cartes vides, le panneau avec « Membres » (2 lignes
//   vides) et « Outils » (1 ligne vide), avant de connaître les nombres (choix 9 des planches).
//
// Ce que ces tests supposent du code : une carte de projet est un lien dont le nom commence par le
// titre du projet ; la grille est faite de rangées (`ui/ProjectGrid`) ; les cartes vides sont
// `ProjectCardSkeleton` (`ui/ProjectCard`) ou `TileSkeleton` (`ui/Tile`), les lignes vides
// `ListRowSkeleton` (`ui/ListGroup`).
//
// Jest ne mesure rien : on lit l'arbre (`testing/wideLayout.ts`), jamais un style.
import type { CatalogueTool, SearchMember, SearchProject, SearchResults } from '@ruche/contracts'
import { screen, within } from '@testing-library/react-native'
import { request } from '../api/client'
import { getMe } from '../profile/api'
import { useSearch } from '../search/api'
import { categoryList } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import {
  atWindow,
  heightOf,
  inside,
  insideProgressbar,
  linesOf,
  panel,
  panels,
  piecesNamed,
  readBefore,
  startingWith,
} from '../testing/wideLayout'
import { SearchScreen } from './SearchScreen'

/** Les propriétés reçues par le cadre de page (`Screen`), notées par son faux module. */
const mockScreenProps: Record<string, unknown>[] = []

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../search/api', () => ({ useSearch: jest.fn() }))
// Le faux réseau, pour GET /v1/categories (le filtre « Toutes les catégories »).
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/search',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({ q: 'carn' }),
}))
// Le cadre de page, tel quel, mais dont le test lit les propriétés (`width`, `titleHidden`).
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
// R16 : les pièces vides, telles quelles, chacune dans une vue marquée de son nom (elles n'ont ni
// rôle ni nom à elles, choix 4 du plan) : le test les compte.
jest.mock('../ui/ProjectCard', () => {
  const actual = jest.requireActual('../ui/ProjectCard')
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    ...actual,
    ProjectCardSkeleton: (props: Record<string, unknown>) =>
      createElement(
        View,
        { testID: 'ProjectCardSkeleton' },
        createElement(actual.ProjectCardSkeleton, props),
      ),
  }
})
jest.mock('../ui/Tile', () => {
  const actual = jest.requireActual('../ui/Tile')
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    ...actual,
    TileSkeleton: (props: Record<string, unknown>) =>
      createElement(View, { testID: 'TileSkeleton' }, createElement(actual.TileSkeleton, props)),
  }
})
jest.mock('../ui/ListGroup', () => {
  const actual = jest.requireActual('../ui/ListGroup')
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    ...actual,
    ListRowSkeleton: (props: Record<string, unknown>) =>
      createElement(
        View,
        { testID: 'ListRowSkeleton' },
        createElement(actual.ListRowSkeleton, props),
      ),
  }
})

// --- Les résultats de « carn » (planche R16-Recherche-1920) : 6 projets, 2 membres, 1 outil ---

const projectHit = (n: number, title: string, excerpt: string | null): SearchProject => ({
  ...summaryOf({
    ...recipesProject,
    id: `1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4${String(n).padStart(2, '0')}`,
    title,
    author: {
      id: `u${20 + n}`,
      name: ['Léa Moreau', 'Nora', 'Max', 'Hugo'][n % 4] ?? 'Nora',
      avatarUrl: null,
    },
  }),
  excerpt,
})

const projects = [
  projectHit(1, 'Carnet de cafés', null),
  projectHit(2, 'Biscotte au parc', '… Le carnet de balades de Biscotte…'),
  projectHit(3, 'Décollage !', '… un carnet de bord pour Yanis…'),
  projectHit(4, 'Mon agent de recettes', '… ton carnet de recettes de famille…'),
  projectHit(5, 'Quel papillon ?', '… garde un carnet des papillons vus…'),
  projectHit(6, 'Le journal de Chelsea', '… le carnet secret de Chelsea…'),
]
const TITLES = projects.map((project) => project.title)

const members: SearchMember[] = [
  {
    id: 'u31',
    name: 'Camille Carnot',
    handle: 'camille_carnot',
    avatarUrl: null,
    followerCount: 12,
  },
  { id: 'u32', name: 'Lucas Carnel', handle: 'lucas_carnel', avatarUrl: null, followerCount: 3 },
]
const notion: CatalogueTool = {
  slug: 'notion',
  name: 'Notion',
  family: 'no-code',
  aliases: [],
  projectCount: 7,
}

const carn: SearchResults = {
  projects: { items: projects, more: false },
  members: { items: members, more: false },
  tools: { items: [notion], more: false },
}

/** Ce que renvoie un useQuery de React Query, réduit à ce que l'écran lit. */
const queryResult = (overrides: Record<string, unknown>) =>
  ({
    data: undefined,
    status: 'pending',
    fetchStatus: 'idle',
    isPending: true,
    isLoading: false,
    isFetching: false,
    isSuccess: false,
    isError: false,
    isPlaceholderData: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ReturnType<typeof useSearch>

const answered = queryResult({
  data: carn,
  status: 'success',
  isPending: false,
  isSuccess: true,
})
/** La recherche partie, sans réponse encore. */
const searching = queryResult({ fetchStatus: 'fetching', isLoading: true, isFetching: true })

/** Le faux hook : comme le vrai, rien sous 2 caractères ; au-delà, la réponse choisie. */
const mockAnswer = (result: ReturnType<typeof useSearch>) =>
  jest
    .mocked(useSearch)
    .mockImplementation((q: string) => (q.trim().length >= 2 ? result : queryResult({})))

beforeEach(() => {
  mockScreenProps.length = 0
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) =>
      path.startsWith('/v1/categories')
        ? { ok: true, data: categoryList('fr', { cooking: 3, animals: 1 }) }
        : { ok: false, error: 'internal' }) as typeof request)
  jest.mocked(useSearch).mockReset()
  mockAnswer(answered)
})

// --- Les aides ---

const PROJECTS = fr.t(($) => $.search.tabs.projects)
const MEMBERS = fr.t(($) => $.search.tabs.members)
const TOOLS = fr.t(($) => $.search.tabs.tools)
const TITLE = fr.t(($) => $.search.title)
const heading = (name: string) => screen.getByRole('header', { name })

/** Les liens des projets trouvés, dans l'ordre (le nom commence par le titre). */
const projectLinks = () =>
  TITLES.map((title) => screen.getByRole('link', { name: startingWith(title) }))

const lastScreen = () => mockScreenProps.at(-1)

/** Ouvre la recherche de « carn » et attend les projets. */
const openSearch = async () => {
  await renderWithProviders(<SearchScreen />)
  expect(await screen.findByRole('link', { name: startingWith('Carnet de cafés') })).toBeTruthy()
}

// --- En grand ---

describe('SearchScreen on a wide computer screen (R16)', () => {
  it.each([1920, 1440])('lays the search out on the wide template at %i', (width) =>
    atWindow(width, heightOf(width), async () => {
      await openSearch()

      expect(lastScreen()?.width).toBe('wide')
    }),
  )

  it.each([
    [1920, [4, 2]],
    [1440, [3, 3]],
  ])('shows the projects found as cards in a grid at %i (%j per row)', (width, rows) =>
    atWindow(width, heightOf(width), async () => {
      await openSearch()

      expect(linesOf(projectLinks()).sizes).toEqual(rows)
    }),
  )

  it.each([1920, 1440])(
    'puts the members and tools found in a side panel, read after the projects, at %i',
    (width) =>
      atWindow(width, heightOf(width), async () => {
        await openSearch()

        const side = panel()
        expect(within(side).getByRole('header', { name: MEMBERS })).toBeTruthy()
        expect(within(side).getByRole('header', { name: TOOLS })).toBeTruthy()
        expect(
          within(side).getByRole('link', { name: startingWith('Camille Carnot') }),
        ).toBeTruthy()
        expect(within(side).getByRole('link', { name: startingWith('Lucas Carnel') })).toBeTruthy()
        expect(within(side).getByRole('link', { name: startingWith('Notion') })).toBeTruthy()
        // Les projets (et leur titre) restent dans la colonne principale.
        expect(within(side).queryByRole('header', { name: PROJECTS })).toBeNull()
        for (const link of projectLinks()) expect(inside(link, side)).toBe(false)
        // Le panneau est lu après les projets, comme celui d'Explorer.
        const lastProject = projectLinks().at(-1)
        expect(readBefore(lastProject, heading(MEMBERS))).toBe(true)
        expect(readBefore(heading(MEMBERS), heading(TOOLS))).toBe(true)
      }),
  )
})

// --- Sous 1 280 : rien ne change ---

describe('SearchScreen below 1 280 stays as it is today (R16)', () => {
  it('keeps one column at 1 100: the projects, then the members, then the tools', () =>
    atWindow(1100, 800, async () => {
      await openSearch()

      expect(lastScreen()?.width ?? 'form').toBe('form')
      expect(panels()).toHaveLength(0)
      expect(linesOf(projectLinks()).sizes).toEqual([1, 1, 1, 1, 1, 1])
      expect(readBefore(heading(PROJECTS), heading(MEMBERS))).toBe(true)
      expect(readBefore(heading(MEMBERS), heading(TOOLS))).toBe(true)
    }))
})

// --- Le titre, caché à toutes les largeurs ---

describe('SearchScreen title (R16)', () => {
  it.each([390, 1100, 1440, 1920])(
    'keeps « Recherche » as the heading screen readers find, never shown, at %i',
    (width) =>
      atWindow(width, heightOf(width), async () => {
        await openSearch()

        // Le titre de la page reste lu…
        expect(heading(TITLE)).toBeTruthy()
        // … mais n'est jamais affiché.
        expect(mockScreenProps.length).toBeGreaterThan(0)
        expect(mockScreenProps.map((props) => props.titleHidden)).toEqual(
          mockScreenProps.map(() => true),
        )
        // Le titre de l'onglet du navigateur reste « Recherche », sans le texte cherché (sec-A8).
        expect(lastScreen()?.pageTitle).toBe(TITLE)
      }),
  )
})

// --- Le squelette (planche R16-Recherche-Squelette-1920) ---

describe('SearchScreen while it searches on a computer (R16)', () => {
  /** La recherche de « carn » est partie ; on attend que « Chargement » se montre (160 ms). */
  const openSearching = async () => {
    mockAnswer(searching)
    await renderWithProviders(<SearchScreen />)
    expect(
      (await screen.findAllByRole('progressbar', { name: fr.t(($) => $.common.loading) })).length,
    ).toBeGreaterThan(0)
  }

  it('draws « Projets » and two rows of empty project cards, eight in all, at 1 920', () =>
    atWindow(1920, 1080, async () => {
      await openSearching()

      expect(piecesNamed('ProjectCardSkeleton').length + piecesNamed('TileSkeleton').length).toBe(8)
      // « Projets » est déjà vrai, lu hors de la zone « Chargement ».
      expect(insideProgressbar(heading(PROJECTS))).toBe(false)
      expect(lastScreen()?.width).toBe('wide')
      expect(lastScreen()?.titleHidden).toBe(true)
    }))

  it('draws the side panel with « Membres », « Outils » and three empty rows at 1 920', () =>
    atWindow(1920, 1080, async () => {
      await openSearching()

      const side = panel()
      const membersTitle = within(side).getByRole('header', { name: MEMBERS })
      const toolsTitle = within(side).getByRole('header', { name: TOOLS })
      expect(insideProgressbar(membersTitle)).toBe(false)
      expect(insideProgressbar(toolsTitle)).toBe(false)
      // Deux membres et un outil vides (choix 9), tous dans le panneau.
      const rows = piecesNamed('ListRowSkeleton')
      expect(rows).toHaveLength(3)
      for (const row of rows) expect(inside(row, side)).toBe(true)
    }))
})
