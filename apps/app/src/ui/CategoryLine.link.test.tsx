// Tests de la ligne de catégorie devenue lien (R6b) : donnée avec `onPress`, elle est un lien nommé
// par son texte, de 44 points au moins, qui s'ouvre au toucher ; sans `onPress`, ce n'est qu'un texte.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { CategoryLine } from './CategoryLine'

describe('CategoryLine as a link', () => {
  it('is a link named by its text, opened by a tap', async () => {
    const onPress = jest.fn()
    await renderWithProviders(<CategoryLine label="Cuisine" icon="cooking-pot" onPress={onPress} />)

    await fireEvent.press(screen.getByRole('link', { name: 'Cuisine' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is plain text without onPress', async () => {
    await renderWithProviders(<CategoryLine label="Cuisine" icon="cooking-pot" />)

    expect(screen.getByText('Cuisine')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
