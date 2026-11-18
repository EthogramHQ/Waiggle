// Tests de « Outils » sur un grand écran (tranche R16, docs/scenarios/refonte.md, « Ruches,
// Recherche et Outils en grand » ; planches R16-Outils-1920, R16-Outils-1440 et
// R16-Outils-Squelette-1920, validées le 17/11) :
// - dès 1 280 points, la page prend le gabarit large de R15 (`Screen width="wide"`) ;
// - « Les plus utilisés » en cartes, 5 par rangée à 1 920 comme à 1 440 (planche 1 440 : « les plus
//   utilisés sur 5 colonnes, de A à Z sur 4 ») ;
// - « De A à Z » en une liste sur 5 colonnes à 1 920, 4 à 1 440, qui se lit de haut en bas, colonne
//   après colonne (la planche : Arduino, Bolt, Canva, ChatGPT dans la première) ;
// - le champ « Chercher un outil » et les familles restent au-dessus des deux listes ;
// - sous 1 280, rien ne change : une colonne de lignes ;
// - le titre « Outils » n'est affiché à aucune largeur (« Chercher un outil » dit déjà où l'on est),
//   mais reste le titre de niveau 1 des lecteurs d'écran (`titleHidden` de Screen) ;
// - pendant le chargement : le champ, les familles et les deux titres sont vrais ; 10 cartes vides
//   (2 rangées de 5) et 20 lignes vides (4 par colonne) à 1 920.
//
// Ce que ces tests supposent du code : une carte d'outil est un lien nommé comme la ligne
// d'aujourd'hui (« Claude, Assistant IA · 41 projets ») ; la grille des cartes est faite de rangées
// (comme `ui/ProjectGrid`), la liste de A à Z de colonnes ; la carte vide s'appelle
// `ToolCardSkeleton`, exportée par `ui/ToolCard.tsx` (avec la carte, `ToolCard`) ; la ligne vide est
// `ListRowSkeleton` (`ui/ListGroup`).
//
// Jest ne mesure rien : on lit l'arbre (`testing/wideLayout.ts`), jamais un style.
import type { CatalogueTool, ToolFamily, ToolList } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import {
  atWindow,
  heightOf,
  insideProgressbar,
  linesOf,
  piecesNamed,
  readBefore,
  startingWith,
} from '../testing/wideLayout'
import { useTools } from '../tools/api'
import { ToolsScreen } from './ToolsScreen'

/** Les propriétés reçues par le cadre de page (`Screen`), notées par son faux module. */
const mockScreenProps: Record<string, unknown>[] = []

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/tools',
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
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
// rôle ni nom à elles, choix 4 du plan) : le test les compte. `virtual` pour la carte d'outil : le
// module n'existe pas encore avant le code de la page ; ce faux module ne sert que lorsque l'écran
// l'importe.
jest.mock(
  '../ui/ToolCard',
  () => {
    const actual = jest.requireActual('../ui/ToolCard')
    const { createElement } = require('react')
    const { View } = require('react-native')
    return {
      ...actual,
      ToolCardSkeleton: (props: Record<string, unknown>) =>
        createElement(
          View,
          { testID: 'ToolCardSkeleton' },
          createElement(actual.ToolCardSkeleton, props),
        ),
    }
  },
  { virtual: true },
)
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

// --- Le catalogue de la planche : vingt outils, dans l'ordre de l'API (du plus utilisé au moins) ---

const tool = (
  slug: string,
  name: string,
  family: ToolFamily,
  projectCount: number,
): CatalogueTool => ({ slug, name, family, aliases: [], projectCount })

const tools: CatalogueTool[] = [
  tool('claude', 'Claude', 'assistant', 41),
  tool('chatgpt', 'ChatGPT', 'assistant', 38),
  tool('lovable', 'Lovable', 'no-code', 34),
  tool('python', 'Python', 'development', 22),
  tool('mistral', 'Mistral', 'assistant', 12),
  tool('midjourney', 'Midjourney', 'creation', 11),
  tool('gemini', 'Gemini', 'assistant', 10),
  tool('home-assistant', 'Home Assistant', 'smart-home', 9),
  tool('n8n', 'n8n', 'automation', 8),
  tool('notion', 'Notion', 'no-code', 7),
  tool('glide', 'Glide', 'no-code', 6),
  tool('cursor', 'Cursor', 'development', 5),
  tool('arduino', 'Arduino', 'hardware', 4),
  tool('bolt', 'Bolt', 'no-code', 4),
  tool('canva', 'Canva', 'creation', 3),
  tool('raspberry-pi', 'Raspberry Pi', 'hardware', 3),
  tool('suno', 'Suno', 'creation', 3),
  tool('perplexity', 'Perplexity', 'assistant', 2),
  tool('replit', 'Replit', 'development', 2),
  tool('zapier', 'Zapier', 'automation', 2),
]

/** « Les plus utilisés » : les dix premiers de l'API. */
const MOST_USED = tools.slice(0, 10).map((one) => one.name)
/** « De A à Z », dans l'ordre alphabétique du français (celui de la planche). */
const A_TO_Z = [
  'Arduino',
  'Bolt',
  'Canva',
  'ChatGPT',
  'Claude',
  'Cursor',
  'Gemini',
  'Glide',
  'Home Assistant',
  'Lovable',
  'Midjourney',
  'Mistral',
  'n8n',
  'Notion',
  'Perplexity',
  'Python',
  'Raspberry Pi',
  'Replit',
  'Suno',
  'Zapier',
]

const query = (overrides: Record<string, unknown>) =>
  ({
    data: undefined,
    status: 'pending',
    isPending: true,
    isSuccess: false,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ReturnType<typeof useTools>

beforeEach(() => {
  mockScreenProps.length = 0
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useTools).mockReturnValue(
    query({
      data: { tools, others: [{ name: 'Teachable Machine' }] } satisfies ToolList,
      status: 'success',
      isPending: false,
      isSuccess: true,
    }),
  )
})

// --- Les aides ---

const MOST_USED_TITLE = fr.t(($) => $.tools.mostUsed)
const A_TO_Z_TITLE = fr.t(($) => $.tools.aToZ)
const TITLE = fr.t(($) => $.tools.title)
const heading = (name: string) => screen.getByRole('header', { name })

/**
 * Les liens d'un outil (« Claude, Assistant IA · 41 projets ») : un des dix plus utilisés en a deux,
 * sa carte puis sa ligne de A à Z, dans l'ordre de lecture ; les autres, leur seule ligne.
 */
const linksOf = (name: string) => screen.getAllByRole('link', { name: startingWith(`${name},`) })
const mostUsedLinks = () => MOST_USED.map((name) => linksOf(name)[0])
const aToZLinks = () => A_TO_Z.map((name) => linksOf(name).at(-1))

/** Les noms des outils de chaque colonne de « De A à Z ». */
const aToZColumns = () => {
  const { groups } = linesOf(aToZLinks())
  return groups.map((group) =>
    group.members.map((link) => A_TO_Z[aToZLinks().indexOf(link as never)]),
  )
}

const lastScreen = () => mockScreenProps.at(-1)

const openTools = async () => {
  await renderWithProviders(<ToolsScreen />)
  expect(await screen.findByRole('header', { name: A_TO_Z_TITLE })).toBeTruthy()
  // Témoin : chaque outil a son lien de A à Z, les dix premiers aussi leur place en tête.
  expect(linksOf('Claude')).toHaveLength(2)
  expect(linksOf('Zapier')).toHaveLength(1)
}

// --- En grand ---

describe('ToolsScreen on a wide computer screen (R16)', () => {
  it.each([1920, 1440])('lays Outils out on the wide template at %i', (width) =>
    atWindow(width, heightOf(width), async () => {
      await openTools()

      expect(lastScreen()?.width).toBe('wide')
    }),
  )

  it.each([1920, 1440])('shows « Les plus utilisés » as cards, five per row, at %i', (width) =>
    atWindow(width, heightOf(width), async () => {
      await openTools()

      expect(linesOf(mostUsedLinks()).sizes).toEqual([5, 5])
      // Dans l'ordre de l'API, rangée après rangée : Claude, ChatGPT, Lovable, Python, Mistral.
      const [first] = linesOf(mostUsedLinks()).groups
      expect(first?.members).toEqual(mostUsedLinks().slice(0, 5))
    }),
  )

  it.each([
    [1920, 5],
    [1440, 4],
  ])('lays « De A à Z » at %i on %i columns read top to bottom', (width, columns) =>
    atWindow(width, heightOf(width), async () => {
      await openTools()

      const perColumn = A_TO_Z.length / columns
      // Des colonnes de même hauteur, chacune la suite alphabétique de la précédente.
      expect(aToZColumns()).toEqual(
        Array.from({ length: columns }, (_, c) => A_TO_Z.slice(c * perColumn, (c + 1) * perColumn)),
      )
    }),
  )

  it('keeps the field and the families above both lists', () =>
    atWindow(1920, 1080, async () => {
      await openTools()

      const field = screen.getByPlaceholderText(fr.t(($) => $.tools.search))
      // Les familles, par leur première pastille, « Tous » (le groupe n'est pas un élément à lui).
      const families = screen.getByRole('radio', { name: fr.t(($) => $.tools.all) })
      expect(readBefore(field, families)).toBe(true)
      expect(readBefore(families, heading(MOST_USED_TITLE))).toBe(true)
      expect(readBefore(heading(MOST_USED_TITLE), heading(A_TO_Z_TITLE))).toBe(true)
    }))
})

// --- Sous 1 280 : rien ne change ---

describe('ToolsScreen below 1 280 stays as it is today (R16)', () => {
  it('keeps one column of rows at 1 100', () =>
    atWindow(1100, 800, async () => {
      await openTools()

      expect(lastScreen()?.width ?? 'form').toBe('form')
      expect(linesOf(mostUsedLinks()).sizes).toEqual(MOST_USED.map(() => 1))
      expect(linesOf(aToZLinks()).sizes).toEqual(A_TO_Z.map(() => 1))
    }))
})

// --- Le titre, caché à toutes les largeurs ---

describe('ToolsScreen title (R16)', () => {
  it.each([390, 1100, 1440, 1920])(
    'keeps « Outils » as the heading screen readers find, never shown, at %i',
    (width) =>
      atWindow(width, heightOf(width), async () => {
        await openTools()

        // Le titre de la page reste lu…
        expect(heading(TITLE)).toBeTruthy()
        // … mais n'est jamais affiché.
        expect(mockScreenProps.length).toBeGreaterThan(0)
        expect(mockScreenProps.map((props) => props.titleHidden)).toEqual(
          mockScreenProps.map(() => true),
        )
      }),
  )
})

// --- Le squelette (planche R16-Outils-Squelette-1920) ---

describe('ToolsScreen while it loads on a computer (R16)', () => {
  it('draws the field, the families, both titles, 10 empty cards and 20 empty rows at 1 920', () =>
    atWindow(1920, 1080, async () => {
      jest.mocked(useTools).mockReturnValue(query({}))
      await renderWithProviders(<ToolsScreen />)
      expect(
        (await screen.findAllByRole('progressbar', { name: fr.t(($) => $.common.loading) })).length,
      ).toBeGreaterThan(0)

      // Deux rangées de cinq cartes vides, puis quatre lignes vides dans chacune des cinq colonnes.
      expect(piecesNamed('ToolCardSkeleton')).toHaveLength(10)
      expect(piecesNamed('ListRowSkeleton')).toHaveLength(20)
      // Le champ, les familles et les titres sont vrais, hors de la zone « Chargement ».
      const field = screen.getByPlaceholderText(fr.t(($) => $.tools.search))
      // Les familles, par leur première pastille, « Tous » (le groupe n'est pas un élément à lui).
      const families = screen.getByRole('radio', { name: fr.t(($) => $.tools.all) })
      for (const real of [field, families, heading(MOST_USED_TITLE), heading(A_TO_Z_TITLE)])
        expect(insideProgressbar(real)).toBe(false)
      expect(lastScreen()?.width).toBe('wide')
      expect(lastScreen()?.titleHidden).toBe(true)
    }))
})
