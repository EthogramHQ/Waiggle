// Test de la grille des cartes à texte très agrandi (tranche R15) : à 1 440 points, à côté du
// panneau du Fil, la place (1 012 points) tient trois cartes de 320 ; à 200 %, leurs titres se
// coupaient au premier mot (« Le tri des photos d… »). Le texte agrandi demande donc des cartes plus
// larges : deux colonnes au lieu de trois.
import { screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectGrid } from './ProjectGrid'
import { ContentWidthContext } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; parent: Node | null; children: unknown[] }

/** Le nombre de cases de la rangée qui porte ce texte (la première vue en rangée au-dessus). */
const cellsInRowOf = (text: string) => {
  let node = (screen.getByText(text) as unknown as Node).parent
  while (
    node &&
    (StyleSheet.flatten(node.props.style as never) as { flexDirection?: string } | undefined)
      ?.flexDirection !== 'row'
  )
    node = node.parent
  if (!node) throw new Error(`No row for ${text}`)
  return node.children.length
}

const initialWindow = Dimensions.get('window')
// fontScale : la taille du texte réglée sur l'appareil (2 = 200 %).
const setWindow = (width: number, fontScale: number) => {
  const size = { ...initialWindow, width, height: 900, fontScale }
  Dimensions.set({ window: size, screen: size })
}
afterEach(() => Dimensions.set({ window: initialWindow, screen: initialWindow }))

const grid = (
  <ContentWidthContext.Provider value={1012}>
    <ProjectGrid>
      {['Carte 1', 'Carte 2', 'Carte 3', 'Carte 4'].map((label) => (
        <Text key={label}>{label}</Text>
      ))}
    </ProjectGrid>
  </ContentWidthContext.Provider>
)

describe('ProjectGrid with very large text', () => {
  it('keeps three feed cards beside the panel at 1 440 with ordinary text', async () => {
    setWindow(1440, 1)
    await renderWithProviders(grid)
    expect(cellsInRowOf('Carte 1')).toBe(3)
  })

  it('widens the cards at 200 %: two columns beside the panel at 1 440', async () => {
    setWindow(1440, 2)
    await renderWithProviders(grid)
    expect(cellsInRowOf('Carte 1')).toBe(2)
  })
})
