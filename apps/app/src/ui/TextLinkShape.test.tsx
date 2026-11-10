// Tests de TextLinkShape (ui/TextLink.tsx) : l'allure d'un lien, seulement dessinée, pour le
// gabarit d'une place gardée. Elle montre le libellé, mais rien n'y est atteignable : ni lien, ni
// bouton (un arrêt du clavier dans une place vide serait un arrêt fantôme).
import { screen, within } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { TextLink, TextLinkShape } from './TextLink'

describe('TextLinkShape', () => {
  it('draws the label of a link, with nothing to press or reach', async () => {
    await renderWithProviders(<TextLinkShape label="Voir le code" external />)

    expect(screen.getByText('Voir le code')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps TextLink a link around the same drawn label', async () => {
    // Témoin : le vrai lien, dessiné avec la même forme, porte bien son rôle et son libellé.
    await renderWithProviders(<TextLink label="Créer un compte" onPress={jest.fn()} />)

    const link = screen.getByRole('link', { name: 'Créer un compte' })
    expect(within(link).getByText('Créer un compte')).toBeTruthy()
  })
})
