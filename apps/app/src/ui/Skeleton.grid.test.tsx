// Tests du squelette du fil rangé en colonnes (relecture de design de R15) : à 1 920, le Fil arrive
// en trois colonnes à côté de son panneau ; son squelette doit avoir la même forme (une rangée de
// trois cartes), et non une seule carte de toute la largeur, sinon tout saute à l'arrivée. Jest ne
// calcule aucune position : on compte les cases des rangées, comme celles de `ProjectGrid`.
import { act, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SkeletonList } from './Skeleton'
import { ContentWidthContext } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }

const isRow = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) as { flexDirection?: string } | undefined)
    ?.flexDirection === 'row'

/** Les rangées du squelette : les vues en rangée, avec le nombre de cases de chacune. */
const rowsIn = (node: Node | string, found: number[] = []): number[] => {
  if (typeof node === 'string') return found
  if (isRow(node)) {
    found.push(node.children.length)
    return found
  }
  for (const child of node.children) rowsIn(child, found)
  return found
}

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
afterEach(async () => {
  await act(async () => Dimensions.set({ window: phone, screen: phone }))
})

it('SkeletonList lays the feed cards in the columns of the feed grid on a large screen', async () => {
  const size = { width: 1920, height: 940, scale: 2, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
  // La colonne principale du Fil à 1 920 : 1 728 de contenu, moins le panneau et l'écart.
  await renderWithProviders(
    <ContentWidthContext.Provider value={1364}>
      <SkeletonList count={3} shape="feed" />
    </ContentWidthContext.Provider>,
  )

  const loading = screen.getByLabelText(fr.t(($) => $.common.loading)) as unknown as Node
  // Une seule rangée de trois cartes, comme le Fil chargé.
  expect(rowsIn(loading)).toEqual([3])
})

it('keeps one card per row on a phone', async () => {
  await renderWithProviders(
    <ContentWidthContext.Provider value={358}>
      <SkeletonList count={3} shape="feed" />
    </ContentWidthContext.Provider>,
  )

  const loading = screen.getByLabelText(fr.t(($) => $.common.loading)) as unknown as Node
  expect(rowsIn(loading)).toEqual([1, 1, 1])
})
