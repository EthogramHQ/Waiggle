// Tests du panneau de la carte vide (R16, « Les squelettes ») : en bas de `ProjectCardSkeleton`, le
// panneau plein qui tient la place du verre prend son rôle de couleur (`skeletonPanel`, la crème de
// jour, le fond groupé de nuit), de jour comme de nuit, et les formes posées dessus s'y voient à
// 1,5:1 au moins. De nuit, la feuille (`sheet`) avait la couleur de la carte vide : le panneau s'y
// confondait (planche R16-Fil-1440-Nuit).
import { contrastRatio, palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { ProjectCardSkeleton } from './ProjectCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type TreeNode = { props: Record<string, unknown>; children: (TreeNode | string)[] }

const under = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : under(child))),
]
const backgroundOf = (node: TreeNode) =>
  ((StyleSheet.flatten(node.props.style as never) ?? {}) as { backgroundColor?: unknown })
    .backgroundColor

describe('ProjectCardSkeleton, its panel (R16)', () => {
  it.each(['day', 'night'] as const)(
    'paints the panel in its own colour role, its shapes visible on it (%s)',
    async (scheme) => {
      const palette = palettes[scheme]
      await renderWithProviders(
        <PieceHost>
          <ProjectCardSkeleton />
        </PieceHost>,
        'fr',
        scheme,
      )

      const host = screen.getByTestId('empty-piece-host', {
        includeHiddenElements: true,
      }) as unknown as TreeNode
      const panel = under(host).find((node) => backgroundOf(node) === palette.skeletonPanel)
      expect(panel).toBeDefined()
      // Les formes du panneau : tout fond posé dessous, hors de la lueur qui traverse la carte.
      const shapes = (panel ? under(panel).slice(1) : [])
        .map(backgroundOf)
        .filter((color): color is string => typeof color === 'string')
      expect(shapes.length).toBeGreaterThan(0)
      for (const color of shapes) {
        expect(contrastRatio(color, palette.skeletonPanel)).toBeGreaterThanOrEqual(1.5)
      }
    },
  )
})
