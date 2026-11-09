// Tests de la mise en rangées de la mosaïque (tranche R6b), en plus de TileMosaic.test.tsx : la
// mosaïque est lue comme une liste d'autant d'éléments que de projets (les cases vides de la
// dernière rangée ne comptent pas), et une tuile hors d'une mosaïque garde ses 150 points (la
// rangée qui défile d'une ruche).
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectTile } from './Tile'
import { TileMosaic } from './TileMosaic'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const titles = ['Carnet de cafés', 'Quel papillon ?', 'Arrosage malin']

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Les nœuds de l'arbre qui portent un rôle donné, dans l'ordre. */
const withRole = (node: Host | string, role: string): Host[] =>
  typeof node === 'string'
    ? []
    : [
        ...(node.props.role === role ? [node] : []),
        ...node.children.flatMap((child) => withRole(child, role)),
      ]

describe('TileMosaic rows', () => {
  it('is a list with one item per project, empty cells left out', async () => {
    await renderWithProviders(
      <TileMosaic columns={4}>
        {titles.map((title) => (
          <ProjectTile key={title} title={title} author="Sam Petit" onPress={() => {}} />
        ))}
      </TileMosaic>,
    )

    const root = screen.root as unknown as Host
    expect(withRole(root, 'list')).toHaveLength(1)
    expect(withRole(root, 'listitem')).toHaveLength(titles.length)
  })

  it('keeps a lone tile 150 points wide, outside a mosaic', async () => {
    await renderWithProviders(
      <ProjectTile title="Carnet de cafés" author="Sam Petit" onPress={() => {}} />,
    )

    const link = screen.getByRole('link', { name: 'Carnet de cafés' })
    expect((StyleSheet.flatten(link.props.style) as { width?: unknown }).width).toBe(150)
  })
})
