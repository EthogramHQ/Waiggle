// Tests du filtre du Fil pendant la lecture des ruches (R16, planche R16-Fil-1440) : le vrai onglet
// « Tout », choisi, qui commande déjà le Fil (aucun panneau sans onglet), puis, dans la même
// capsule, les pastilles vides des ruches à venir, qui ne se lisent pas et ne sont pas des onglets.
import { layout } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { drawnSizes, PieceHost } from '../testing/emptyPiece'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ALL_HIVES, HivePills } from './HivePills'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const all = fr.t(($) => $.hives.pills.all)
const label = fr.t(($) => $.hives.pills.label)

describe('HivePills waiting', () => {
  it('shows the real « Tout » tab, chosen, controlling the feed, and the empty pills after it', async () => {
    await renderWithProviders(
      <PieceHost>
        <HivePills hives={[]} value={ALL_HIVES} onChange={() => {}} panelId="feed" waiting />
      </PieceHost>,
    )

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(1)
    const tab = screen.getByRole('tab', { name: all, selected: true })
    expect(tab.props['aria-controls']).toBe('feed')
    expect(screen.getByLabelText(label).props.role).toBe('tablist')
    // « Tout » et deux pastilles vides de 44 points, à la hauteur des vraies.
    expect(drawnSizes().heights.filter((height) => height === layout.touchTarget)).toHaveLength(3)
  })

  it('draws no empty pill once the hives are read', async () => {
    await renderWithProviders(
      <PieceHost>
        <HivePills
          hives={[{ id: 'h1', name: 'Famille' }]}
          value={ALL_HIVES}
          onChange={() => {}}
          panelId="feed"
        />
      </PieceHost>,
    )

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(drawnSizes().heights.filter((height) => height === layout.touchTarget)).toHaveLength(2)
  })
})
