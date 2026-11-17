// Tests de la mosaïque de tuiles (tranche R6b, scénario « La page d'un outil », planches `R6-Outil`
// et `R6-Outil-Desktop`) : les projets d'un outil en tuiles (photo, titre, auteur), du plus récent au
// plus ancien, en deux colonnes sur téléphone et quatre sur ordinateur. La relecture du plan (point
// 15) fixe deux règles :
// - la mosaïque se range **en rangées** : un lecteur d'écran et la touche Tab suivent l'ordre des
//   projets (1, 2, 3, 4…), jamais une colonne après l'autre (1, 3, 5, puis 2, 4, 6) ;
// - une tuile prend la largeur de sa colonne (`Tile.tsx` change) : plus de 150 points fixes.
//
// L'API (découpage amendé de R6b, U2) : TileMosaic({ children; columns: 2 | 4 }), avec les
// `ProjectTile` de `ui/Tile.tsx` pour enfants.
import { fireEvent, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { ProjectTile } from './Tile'
import { TileMosaic } from './TileMosaic'
import { useHydrated } from './theme/hydration'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// R15 : la mosaïque se mesure aussi dans un vrai Screen (le gabarit large).
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))
// L'hydratation de la page, qu'un test choisit (vraie sur téléphone, d'emblée).
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: jest.fn(() => true),
}))

/** Sept projets, du plus récent au plus ancien (un nombre impair : la dernière rangée est courte). */
const projects = [
  { title: 'Carnet de cafés', author: 'Sam Petit' },
  { title: 'Quel papillon ?', author: 'Hugo Lefèvre' },
  { title: 'Mon agent de recettes', author: 'Inès Garnier' },
  { title: 'Arrosage malin', author: 'Yann Le Goff' },
  { title: 'Devine la plante', author: 'Élodie Martin' },
  { title: 'Budget des vacances', author: 'Sam Petit' },
  { title: 'Lampe qui écoute', author: 'Hugo Lefèvre' },
]
const titles = projects.map((project) => project.title)

/** La mosaïque des sept projets ; `onOpen` reçoit le titre de la tuile touchée. */
function Mosaic({
  columns,
  onOpen = () => {},
}: {
  columns: 2 | 4
  onOpen?: (title: string) => void
}) {
  return (
    <TileMosaic columns={columns}>
      {projects.map((project) => (
        <ProjectTile
          key={project.title}
          title={project.title}
          author={project.author}
          onPress={() => onOpen(project.title)}
        />
      ))}
    </TileMosaic>
  )
}

/** Les noms des liens, dans l'ordre de l'arbre : celui du lecteur d'écran et de la touche Tab. */
const linkOrder = () =>
  screen.getAllByRole('link').map((link) => link.props.accessibilityLabel as string)

describe('TileMosaic', () => {
  it('lists the tile links in the order of the projects, in 2 and in 4 columns', async () => {
    const { rerender } = await renderWithProviders(<Mosaic columns={2} />)
    expect(linkOrder()).toEqual(titles)

    await rerender(<Mosaic columns={4} />)
    expect(linkOrder()).toEqual(titles)
  })

  it('opens the touched project', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(<Mosaic columns={2} onOpen={onOpen} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Arrosage malin' }))

    expect(onOpen).toHaveBeenCalledWith('Arrosage malin')
  })

  it('sizes a tile to its column, not to a fixed 150 points', async () => {
    const { rerender } = await renderWithProviders(<Mosaic columns={2} />)
    const widths = () =>
      screen
        .getAllByRole('link')
        .map((link) => (StyleSheet.flatten(link.props.style) as { width?: unknown }).width)

    expect(widths()).toHaveLength(projects.length) // témoin
    for (const width of widths()) expect(width).not.toBe(150)

    await rerender(<Mosaic columns={4} />)
    for (const width of widths()) expect(width).not.toBe(150)
  })
})

// R15 (« Des colonnes qui suivent la place ») : sans nombre imposé (`columns` devient facultatif ;
// les Ruches, restées étroites, gardent le leur), la mosaïque compte ses colonnes selon la place que
// lui donne l'écran (`useContentWidth()`) : des tuiles de `layout.cardMin.tile` (280, décision du
// 17/11) au moins, une colonne de plus dès qu'elle tient. La page d'une étiquette ou d'un outil :
// quatre tuiles par rangée à 1 280 (1 216 points de contenu), cinq à 1 920 (1 728 points).
describe('TileMosaic columns from the room it has (R15)', () => {
  /** Quatorze tuiles : assez pour remplir deux rangées de six. */
  const many = Array.from({ length: 14 }, (_, i) => `Projet ${String(i + 1).padStart(2, '0')}`)
  type Node = { props: Record<string, unknown>; parent: Node | null; children: unknown[] }
  /** Le nombre de cases de la rangée qui porte cette tuile (la première vue en rangée). */
  const cellsInRowOf = (title: string) => {
    let node = (screen.getByRole('link', { name: title }) as unknown as Node).parent
    while (
      node &&
      (StyleSheet.flatten(node.props.style as never) as { flexDirection?: string } | undefined)
        ?.flexDirection !== 'row'
    )
      node = node.parent
    if (!node) throw new Error('No mosaic row')
    return node.children.length
  }
  const tagPage = (
    <Screen width="wide" title="Claude">
      <TileMosaic>
        {many.map((title) => (
          <ProjectTile key={title} title={title} author="Sam Petit" onPress={() => {}} />
        ))}
      </TileMosaic>
    </Screen>
  )

  const initialWindow = Dimensions.get('window')
  const setWindow = (width: number) => {
    const size = { ...initialWindow, width, height: 1080 }
    Dimensions.set({ window: size, screen: size })
  }
  afterEach(() => {
    Dimensions.set({ window: initialWindow, screen: initialWindow })
    jest.mocked(useHydrated).mockReturnValue(true)
  })

  it('shows five tiles per row at 1 920, with no column count given', async () => {
    setWindow(1920)
    await renderWithProviders(tagPage)

    expect(cellsInRowOf('Projet 01')).toBe(5)
    expect(cellsInRowOf('Projet 06')).toBe(5)
  })

  it('shows four tiles per row at 1 280', async () => {
    setWindow(1280)
    await renderWithProviders(tagPage)

    expect(cellsInRowOf('Projet 01')).toBe(4)
  })

  it('keeps the column count a screen gives, even on a wide screen', async () => {
    setWindow(1920)
    await renderWithProviders(
      <Screen width="wide" title="Famille">
        <TileMosaic columns={2}>
          {many.map((title) => (
            <ProjectTile key={title} title={title} author="Sam Petit" onPress={() => {}} />
          ))}
        </TileMosaic>
      </Screen>,
    )

    expect(cellsInRowOf('Projet 01')).toBe(2)
  })

  // Avant l'hydratation, la place vaut 0 : une tuile par rangée, toutes montrées, jamais une boucle
  // sans fin sur 0 colonne.
  it('lists every tile, one per row, until the page is hydrated', async () => {
    setWindow(1920)
    jest.mocked(useHydrated).mockReturnValue(false)
    await renderWithProviders(tagPage)

    expect(screen.getAllByRole('link')).toHaveLength(many.length)
    expect(cellsInRowOf('Projet 01')).toBe(1)
  })
})
