// Tests des pastilles vides du filtre du Fil (R16, « Les squelettes ») : pendant la lecture des
// ruches, la rangée garde sa place et sa hauteur (des pastilles de 44 points, comme les vraies) ;
// elle ne dit rien et ne se touche pas : aucun onglet tant que les ruches ne sont pas lues.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { HivePillsSkeleton } from './HivePills'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('HivePillsSkeleton', () => {
  it('keeps the height of the real pills, with no tab, no role and no name', async () => {
    await renderWithProviders(
      <PieceHost>
        <HivePillsSkeleton />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(layout.touchTarget)
    expect(emptyPiece().spoken).toEqual([])
    expect(screen.queryByRole('tab', { hidden: true })).toBeNull()
  })

  it('draws « Tout » and one empty pill per hive to come', async () => {
    await renderWithProviders(
      <PieceHost>
        <HivePillsSkeleton count={3} />
      </PieceHost>,
    )

    // Quatre pastilles de 44 points : « Tout », puis trois ruches.
    expect(drawnSizes().heights.filter((height) => height === layout.touchTarget)).toHaveLength(4)
  })
})
