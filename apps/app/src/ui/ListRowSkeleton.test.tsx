// Tests de la ligne vide d'une liste (R16, « Les squelettes ») au-delà du test de base (sans rôle ni
// nom, dans ListGroup.test.tsx) : posée dans un `ListGroup`, elle prend la hauteur d'une vraie
// ligne, et ses formes changent de longueur d'une ligne à la suivante (des noms de longueurs
// différentes), sans que l'écran les numérote. Et la galerie vide d'un projet, qui choisit sa
// hauteur comme la galerie.
import { layout } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet } from 'react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRowSkeleton } from './ListGroup'
import { ProjectCoverSkeleton } from './ProjectCover'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }

/** Les largeurs écrites en pourcentage sous le cadre, dans l'ordre de l'arbre. */
const percentWidths = () => {
  const widths: string[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
    if (typeof style.width === 'string' && style.width.endsWith('%') && style.width !== '100%')
      widths.push(style.width)
    for (const child of node.children) visit(child)
  }
  visit(screen.getByTestId('empty-piece-host', { includeHiddenElements: true }) as unknown as Node)
  return widths
}

describe('ListRowSkeleton in a list (R16)', () => {
  it('varies the length of its lines from one row to the next', async () => {
    await renderWithProviders(
      <PieceHost>
        <ListGroup>
          <ListRowSkeleton key="a" />
          <ListRowSkeleton key="b" />
        </ListGroup>
      </PieceHost>,
    )

    const widths = percentWidths()
    // Deux lignes par rangée : celles de la première ne sont pas celles de la seconde.
    expect(widths).toHaveLength(4)
    expect(widths.slice(0, 2)).not.toEqual(widths.slice(2, 4))
  })

  it('takes at least the height of a real row, with a tile and a pill, and says nothing', async () => {
    await renderWithProviders(
      <PieceHost>
        <ListRowSkeleton leading="square" trailing="pill" />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(layout.controlHeight.regular)
    expect(drawnSizes().heights).toContain(layout.controlHeight.small)
    expect(emptyPiece().spoken).toEqual([])
  })
})

describe('ProjectCoverSkeleton without a shape (R16)', () => {
  afterEach(async () => {
    const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
    await act(async () => Dimensions.set({ window: phone, screen: phone }))
  })

  it('takes the height of the gallery on a phone: a band', async () => {
    await renderWithProviders(
      <PieceHost>
        <ProjectCoverSkeleton />
      </PieceHost>,
    )
    expect(drawnSizes().heights).toContain(layout.cover.band)
  })

  it('takes the height of the gallery on a computer: the hero', async () => {
    const desktop = { width: 1440, height: 900, scale: 2, fontScale: 1 }
    Dimensions.set({ window: desktop, screen: desktop })
    await renderWithProviders(
      <PieceHost>
        <ProjectCoverSkeleton />
      </PieceHost>,
    )
    expect(drawnSizes().heights).toContain(layout.cover.hero)
  })
})
