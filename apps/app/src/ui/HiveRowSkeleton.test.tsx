// Tests de la ligne vide d'une ruche (R16, « Les squelettes ») : « Tes ruches » de la colonne du Fil
// la pose pendant la lecture des ruches. Elle prend au moins la hauteur d'une vraie ligne (sa zone à
// toucher de 44 points), dessine la pastille des nouveautés à la hauteur de la vraie, et ne dit
// rien : le `Loading` autour dit « Chargement… ».
import { layout } from '@ruche/brand'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { HiveRowSkeleton } from './HiveRow'
import { STATUS_PILL_HEIGHT } from './StatusPill'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('HiveRowSkeleton', () => {
  it.each([
    ['short (the Feed column)', true],
    ['full (the Hives tab)', false],
  ])('in its %s form, takes the height of a real row and says nothing', async (_form, compact) => {
    await renderWithProviders(
      <PieceHost>
        <HiveRowSkeleton compact={compact} />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(layout.touchTarget)
    expect(drawnSizes().heights).toContain(STATUS_PILL_HEIGHT)
    expect(emptyPiece().spoken).toEqual([])
  })
})
