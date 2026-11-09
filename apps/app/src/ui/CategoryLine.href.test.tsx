// Tests de la ligne de catégorie devenue lien, après la relecture de R6b (interface S4) : sur le web,
// le lien porte sa vraie adresse (`href`, un `<a>` : ouvrir dans un nouvel onglet, l'adresse au
// survol), comme les autres liens de l'appli ; Entrée l'ouvre.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CategoryLine } from './CategoryLine'

describe('CategoryLine, its address on the web', () => {
  it('carries its address on the web, and opens with Enter', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <CategoryLine
          label="Cuisine"
          icon="cooking-pot"
          href="/explore?category=cooking"
          onPress={onPress}
        />,
      )

      const link = screen.getByRole('link', { name: 'Cuisine' })
      expect(link.props.href).toBe('/explore?category=cooking')
      await fireEvent(link, 'keyDown', { key: 'Enter', preventDefault: () => {} })
      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })
})
