// Tests du bouton de filtre, après la relecture de R6b (design C1, interface S2 et S5) : son libellé
// passe à la ligne au lieu d'être coupé par « … » (à 320 points et texte à 200 %, « Toutes les
// ca… » perdait la fin du mot), et sur le web il annonce qu'il ouvre une fenêtre
// (`aria-haspopup="dialog"`) : la feuille des catégories.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FilterButton } from './FilterButton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const ALL = fr.t(($) => $.tool.allCategories)

describe('FilterButton, long labels and the sheet it opens', () => {
  it('lets its label wrap instead of cutting it', async () => {
    await renderWithProviders(
      <FilterButton label={ALL} spokenLabel={ALL} icon="shapes" onPress={() => {}} />,
    )

    const label = screen.getByText(ALL)
    expect(label.props.numberOfLines ?? 0).toBe(0)
  })

  it('says on the web that it opens a dialog', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <FilterButton label={ALL} spokenLabel={ALL} icon="shapes" onPress={() => {}} />,
      )

      expect(screen.getByRole('button', { name: ALL }).props['aria-haspopup']).toBe('dialog')
    } finally {
      jest.restoreAllMocks()
    }
  })
})
