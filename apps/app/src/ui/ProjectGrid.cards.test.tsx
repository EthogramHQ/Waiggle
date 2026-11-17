// Tests de la famille de cartes d'une grille (R15, « Explorer ») : sur un très grand écran, une
// grille du Fil garde de grandes cartes (`cardMin.feedWide`), tandis que « Récents » d'Explorer,
// posé sous `GridCardsContext` à `compact`, compte avec la carte compacte (`cardMin.compact`) :
// quatre à cinq colonnes à côté du panneau. Jest ne place rien : la largeur vient de la fenêtre
// simulée, et l'on compte les cases de la rangée qui porte la première carte.
import { layout, space } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Columns } from './Columns'
import { GridCardsContext, ProjectGrid } from './ProjectGrid'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))

type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

/** Le nombre de cases de la rangée de la grille qui porte ce texte. */
const cellsInRowOf = (text: string) => {
  let node: Node | null = screen.getByText(text) as unknown as Node
  let row: Node | null = null
  while (node && node.props.accessibilityRole !== 'list') {
    row = node
    node = node.parent
  }
  if (!node || !row) throw new Error(`no grid around « ${text} »`)
  return row.children.length
}

const titled = (prefix: string) =>
  ['1', '2', '3', '4', '5', '6'].map((rank) => <Text key={rank}>{`${prefix} ${rank}`}</Text>)

/** Combien de cartes d'au moins `min` points tiennent dans `width`, l'écart compris. */
const columnsIn = (width: number, min: number) =>
  Math.max(1, Math.floor((width + space.lg) / (min + space.lg)))

const initialWindow = Dimensions.get('window')
afterEach(() => Dimensions.set({ window: initialWindow, screen: initialWindow }))

it('ProjectGrid counts with the compact card when the page asks for it, beside the panel at 1 920', async () => {
  const size = { ...initialWindow, width: 1920, height: 1080 }
  Dimensions.set({ window: size, screen: size })
  await renderWithProviders(
    <Screen width="wide" title="Explorer">
      <Columns
        sideWidth="panel"
        main={
          <>
            <ProjectGrid>{titled('Fil')}</ProjectGrid>
            <GridCardsContext.Provider value="compact">
              <ProjectGrid>{titled('Récent')}</ProjectGrid>
            </GridCardsContext.Provider>
          </>
        }
        side={<Text>Le panneau</Text>}
      />
    </Screen>,
  )

  // À 1 920, le contenu large fait 1 728 points ; à côté du panneau, il en reste 1 728 − 340 − 24.
  const beside = 1728 - layout.sidePanel - space.xxl
  expect(cellsInRowOf('Récent 1')).toBe(columnsIn(beside, layout.cardMin.compact))
  expect(cellsInRowOf('Fil 1')).toBe(columnsIn(beside, layout.cardMin.feedWide))
  // Témoin : les deux familles donnent bien deux nombres différents à cette largeur.
  expect(cellsInRowOf('Récent 1')).toBeGreaterThan(cellsInRowOf('Fil 1'))
})
