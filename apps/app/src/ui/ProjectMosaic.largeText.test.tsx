// Tests de la mosaïque à texte très agrandi (tranche R14) : sur un téléphone de 320 points, une
// carte compacte, deux par rangée, ne fait que 115 points de large ; à 200 %, son statut
// (« Testable ») sortait de la carte (essai au navigateur du catalogue). Les compactes passent alors
// une par rangée. Au-delà du téléphone, rien ne change.
import { screen } from '@testing-library/react-native'
import { Dimensions, Text, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { mosaicRows, ProjectMosaic } from './ProjectMosaic'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Le bloc d'en tête : la grande carte (rang 0) et deux compactes empilées à côté (1 et 2). */
const block = { lead: 0, beside: [1, 2] }

describe('mosaicRows with very large text', () => {
  it('puts one compact card per row on a phone', () => {
    expect(mosaicRows(5, 320, { largeText: true })).toEqual([[0], [1], [2], [3], [4]])
    // Témoin : au texte ordinaire, deux par rangée.
    expect(mosaicRows(5, 320)).toEqual([[0], [1, 2], [3, 4]])
  })

  it('keeps the rows of a wider page', () => {
    expect(mosaicRows(5, 1440, { largeText: true })).toEqual([block, [3, 4]])
  })
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = {
  props: Record<string, unknown>
  parent: Host | null
  children: ReadonlyArray<Host | string>
}
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const cells = () =>
  hostsOf(screen.root as unknown as Host).filter((node) => node.props.role === 'listitem')

const initialWindow = Dimensions.get('window')
afterEach(() => {
  Dimensions.set({ window: initialWindow, screen: initialWindow })
})

describe('ProjectMosaic with very large text', () => {
  it('draws each compact card on its own row on a phone at 200 %', async () => {
    const size = { ...initialWindow, width: 320, height: 844, fontScale: 2 }
    Dimensions.set({ window: size, screen: size })
    const items = Array.from({ length: 3 }, (_, rank) => ({ id: `p${rank}`, title: `P${rank}` }))
    await renderWithProviders(
      <ProjectMosaic
        items={items}
        render={(item) => (
          <View>
            <Text>{item.title}</Text>
          </View>
        )}
      />,
    )

    expect(cells()).toHaveLength(3) // témoin : la mosaïque est là
    // Chaque case est seule dans sa rangée.
    for (const cell of cells()) {
      const row = cell.parent as Host
      const siblings = row.children.filter(
        (child): child is Host => typeof child !== 'string' && child.props.role === 'listitem',
      )
      expect(siblings).toHaveLength(1)
    }
  })
})
