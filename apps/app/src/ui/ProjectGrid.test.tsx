// Tests du nombre de colonnes de ProjectGrid (R4) : la grille suit la largeur (une colonne sur
// téléphone, trois sur ordinateur), sauf quand l'écran l'impose (`columns`, le Fil : deux colonnes
// sur ordinateur, à côté de sa colonne latérale). Jest ne place rien : on compte les cases de la
// rangée qui porte la première carte.
import { layout, space } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Columns } from './Columns'
import { ProjectGrid } from './ProjectGrid'
import { Screen } from './Screen'
import { Text } from './Text'
import { useHydrated } from './theme/hydration'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
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

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Le nombre de cases de la rangée de la grille qui porte cette carte. */
const cellsInRowOf = (text: string) => {
  // La carte → sa case → sa rangée : la rangée est la première vue en `flexDirection: 'row'`.
  let node = (screen.getByText(text) as unknown as Node).parent
  while (
    node &&
    (node.props.style as { flexDirection?: string } | undefined)?.flexDirection !== 'row'
  )
    node = node.parent
  if (!node) throw new Error('No grid row')
  return node.children.length
}

const cards = ['Un', 'Deux', 'Trois', 'Quatre'].map((title) => <Text key={title}>{title}</Text>)

describe('ProjectGrid columns', () => {
  it('follows the width when the screen imposes nothing', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(<ProjectGrid empty="Rien">{cards}</ProjectGrid>)
      // Témoin : trois colonnes sur ordinateur.
      expect(cellsInRowOf('Un')).toBe(3)
    } finally {
      restore()
    }
  })

  it('draws the number of columns the screen imposes on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ProjectGrid empty="Rien" columns={2}>
          {cards}
        </ProjectGrid>,
      )
      expect(cellsInRowOf('Un')).toBe(2)
      expect(cellsInRowOf('Trois')).toBe(2)
    } finally {
      restore()
    }
  })

  it('draws one column when the screen asks for one', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ProjectGrid empty="Rien" columns={1}>
          {cards}
        </ProjectGrid>,
      )
      expect(cellsInRowOf('Un')).toBe(1)
      expect(screen.getByText('Quatre')).toBeTruthy()
    } finally {
      restore()
    }
  })
})

// R15 (« Des colonnes qui suivent la place ») : la grille compte ses colonnes selon la place, plus
// selon le type d'appareil. Une carte ne descend pas sous `layout.cardMin.feed`, et une colonne de
// plus apparaît dès qu'elle tient (l'écart entre deux cartes, `space.lg`, compris). La place est
// celle de la colonne où la grille est posée : l'écran (`Screen`) ou la colonne principale de
// `Columns` la lui disent (relecture du plan, C2), sans qu'aucun écran ne fasse le calcul.
describe('ProjectGrid columns from the room it has (R15)', () => {
  /** Les colonnes de cartes du Fil (`cardMin.feed` au moins) dans `width` points (au moins une). */
  const columnsIn = (width: number) =>
    Math.max(1, Math.floor((width + space.lg) / (layout.cardMin.feed + space.lg)))
  const titled = (prefix: string) =>
    ['1', '2', '3', '4', '5', '6', '7', '8'].map((rank) => (
      <Text key={rank}>{`${prefix} ${rank}`}</Text>
    ))

  const initialWindow = Dimensions.get('window')
  const setWindow = (width: number) => {
    const size = { ...initialWindow, width, height: 900 }
    Dimensions.set({ window: size, screen: size })
  }
  afterEach(() => {
    Dimensions.set({ window: initialWindow, screen: initialWindow })
    jest.mocked(useHydrated).mockReturnValue(true)
  })

  it('ProjectGrid counts its columns from the width of the column it sits in', async () => {
    setWindow(1440)
    await renderWithProviders(
      <Screen width="wide" title="Fil">
        <ProjectGrid>{titled('Seule')}</ProjectGrid>
        <Columns
          sideWidth="panel"
          main={<ProjectGrid>{titled('Fil')}</ProjectGrid>}
          side={<Text>Le panneau</Text>}
        />
      </Screen>,
    )

    // À 1 440, le contenu large fait 1 376 points ; à côté du panneau, il en reste
    // 1 376 − 340 − 24 = 1 012.
    const whole = 1376
    const beside = whole - layout.sidePanel - space.xxl
    expect(cellsInRowOf('Seule 1')).toBe(columnsIn(whole))
    expect(cellsInRowOf('Fil 1')).toBe(columnsIn(beside))
    expect(columnsIn(whole)).toBeGreaterThan(columnsIn(beside)) // témoin : les deux places diffèrent bien
  })

  it('draws as many columns as the screen imposes, past three', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <ProjectGrid empty="Rien" columns={5}>
          {titled('Carte')}
        </ProjectGrid>,
      )
      expect(cellsInRowOf('Carte 1')).toBe(5)
    } finally {
      restore()
    }
  })

  // Relecture du plan, C2 : avant l'hydratation, la place vaut 0 ; la grille garde une colonne (la
  // page du téléphone) et montre toutes ses cartes, au lieu de boucler sans fin sur 0 colonne.
  it('draws one column, with every card, until the page is hydrated', async () => {
    setWindow(1920)
    jest.mocked(useHydrated).mockReturnValue(false)
    await renderWithProviders(
      <Screen width="wide" title="Fil">
        <ProjectGrid>{titled('Carte')}</ProjectGrid>
      </Screen>,
    )

    expect(cellsInRowOf('Carte 1')).toBe(1)
    expect(screen.getByText('Carte 8')).toBeTruthy()
  })
})
