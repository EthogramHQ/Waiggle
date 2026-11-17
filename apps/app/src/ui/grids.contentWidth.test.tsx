// Tests des trois grilles de cartes (R15, « Des colonnes qui suivent la place ») face à la largeur
// publiée par leur colonne (`ContentWidthContext`), sans passer par `Screen` ni `Columns` : on pose
// la largeur à la main, comme le feraient l'écran large (1 376 à 1 440, 1 728 à 1 920) ou la colonne
// principale à côté du panneau (1 012) et du profil (1 344). Ces tests disent que la grille compte
// avec la place reçue, et non avec la fenêtre ; ceux de `ProjectGrid.test.tsx`, `TileMosaic.test.tsx`
// et `ProjectMosaic.test.tsx` disent que l'écran publie la bonne place.
import { screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectGrid } from './ProjectGrid'
import { ProjectMosaic } from './ProjectMosaic'
import { ProjectTile } from './Tile'
import { TileMosaic } from './TileMosaic'
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
const setWindow = (width: number) => {
  const size = { ...initialWindow, width, height: 1080 }
  Dimensions.set({ window: size, screen: size })
}
afterEach(() => Dimensions.set({ window: initialWindow, screen: initialWindow }))

const inRoom = (room: number, children: ReactNode) => (
  <ContentWidthContext.Provider value={room}>{children}</ContentWidthContext.Provider>
)
const labels = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`)

describe('ProjectGrid reads the width its column publishes', () => {
  const grid = (room: number) =>
    inRoom(
      room,
      <ProjectGrid>
        {labels('Carte', 8).map((label) => (
          <Text key={label}>{label}</Text>
        ))}
      </ProjectGrid>,
    )

  it('lays four feed cards in the 1 376 points of the wide screen at 1 440, three beside the panel', async () => {
    setWindow(1440)
    const first = await renderWithProviders(grid(1376))
    expect(cellsInRowOf('Carte 1')).toBe(4)
    await first.unmount()

    await renderWithProviders(grid(1012))
    expect(cellsInRowOf('Carte 1')).toBe(3)
  })

  it('counts with the wider feed card from 1 536 points: three beside the panel at 1 920', async () => {
    setWindow(1920)
    await renderWithProviders(grid(1364))
    // 1 364 points tiendraient quatre cartes de 320, mais trois seulement de 420.
    expect(cellsInRowOf('Carte 1')).toBe(3)
  })

  it('draws one column in a room of 0, before the page is hydrated', async () => {
    setWindow(1920)
    await renderWithProviders(grid(0))
    expect(cellsInRowOf('Carte 1')).toBe(1)
    expect(screen.getByText('Carte 8')).toBeTruthy()
  })
})

describe('TileMosaic reads the width its column publishes', () => {
  const mosaic = (room: number) =>
    inRoom(
      room,
      <TileMosaic>
        {labels('Tuile', 12).map((title) => (
          <ProjectTile key={title} title={title} author="Sam Petit" onPress={() => {}} />
        ))}
      </TileMosaic>,
    )

  it('lays five tiles in the 1 728 points of the wide screen at 1 920, one in a room of 0', async () => {
    setWindow(1920)
    const first = await renderWithProviders(mosaic(1728))
    expect(cellsInRowOf('Tuile 1')).toBe(5)
    await first.unmount()

    await renderWithProviders(mosaic(0))
    expect(cellsInRowOf('Tuile 1')).toBe(1)
  })
})

describe('ProjectMosaic reads the width its column publishes', () => {
  const mosaic = (room: number, count: number) =>
    inRoom(
      room,
      <ProjectMosaic
        items={labels('Projet', count).map((title) => ({ id: title, title }))}
        render={(item) => (
          <View>
            <Text>{item.title}</Text>
          </View>
        )}
      />,
    )

  it('lays three compact cards per row beside the profile at 1 920, four in the whole wide screen', async () => {
    setWindow(1920)
    const first = await renderWithProviders(mosaic(1344, 7))
    expect(cellsInRowOf('Projet 4')).toBe(3)
    await first.unmount()

    await renderWithProviders(mosaic(1728, 7))
    expect(cellsInRowOf('Projet 4')).toBe(4)
  })

  it('keeps three columns under the block in a narrow room beside the profile at 1 100', async () => {
    setWindow(1100)
    await renderWithProviders(mosaic(652, 7))
    expect(cellsInRowOf('Projet 4')).toBe(3)
  })
})
