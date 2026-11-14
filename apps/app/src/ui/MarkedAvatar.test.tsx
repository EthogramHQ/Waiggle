// Tests de l'avatar marqué (R9, planche R9-Bloquer) : la pastille a son propre nom, lu à côté de
// celui de l'avatar (la couleur seule ne dirait rien), avec ou sans photo.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { MarkedAvatar } from './MarkedAvatar'

const mark = { icon: 'prohibit' as const, label: 'bloqué' }

describe('MarkedAvatar', () => {
  it('names the mark as an image of its own, next to the avatar', async () => {
    await renderWithProviders(
      <MarkedAvatar name="Léa Martin" source={null} label="Léa Martin" mark={mark} />,
    )

    expect(screen.getByRole('image', { name: 'bloqué' })).toBeTruthy()
    expect(screen.getByRole('image', { name: 'Léa Martin' })).toBeTruthy()
  })

  it('keeps the mark over a photo', async () => {
    await renderWithProviders(
      <MarkedAvatar
        name="Léa Martin"
        source={{ uri: 'https://example.com/lea.jpg' }}
        label="Léa Martin"
        mark={mark}
      />,
    )

    expect(screen.getByRole('image', { name: 'bloqué' })).toBeTruthy()
    expect(screen.getByLabelText('Léa Martin')).toBeTruthy()
  })
})
