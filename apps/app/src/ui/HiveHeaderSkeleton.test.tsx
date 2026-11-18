// Tests du haut vide de la page d'une ruche (R16 ; relecture de l'interface R16, A1) : l'alvéole
// vide a la taille de la vraie (la même mesure, lue aux deux endroits), le nom et le nombre de
// membres ont la hauteur de leurs lignes écrites, les titres vides des colonnes celle des vrais ; et
// rien n'est lu (le « Chargement… » de la page le dit).
import { layout, textStyles } from '@ruche/brand'
import { drawnSizes, emptyPiece, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import {
  HIVE_HEADER_BADGE_SIZE,
  HiveColumnTitleSkeleton,
  HiveHeaderSkeleton,
} from './HiveHeaderSkeleton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('HiveHeaderSkeleton', () => {
  it('holds the place of the hive badge, the name and the member count, and says nothing', async () => {
    await renderWithProviders(
      <PieceHost>
        <HiveHeaderSkeleton />
      </PieceHost>,
    )

    // L'alvéole du haut est la grande des trois tailles de `HiveBadge`.
    expect(HIVE_HEADER_BADGE_SIZE).toBe(layout.hive.large)
    const { heights, widths } = drawnSizes()
    expect(heights).toContain(HIVE_HEADER_BADGE_SIZE)
    expect(widths).toContain(HIVE_HEADER_BADGE_SIZE)
    expect(heights).toContain(textStyles.title1.lineHeight)
    expect(heights).toContain(textStyles.callout.lineHeight)
    expect(emptyPiece().spoken).toEqual([])
  })

  it.each([
    ['members', textStyles.headline.lineHeight],
    ['testers', textStyles.caption.lineHeight],
  ] as const)('holds the place of the %s column title', async (column, height) => {
    await renderWithProviders(
      <PieceHost>
        <HiveColumnTitleSkeleton column={column} />
      </PieceHost>,
    )

    expect(drawnSizes().heights).toContain(height)
    expect(emptyPiece().spoken).toEqual([])
  })
})
