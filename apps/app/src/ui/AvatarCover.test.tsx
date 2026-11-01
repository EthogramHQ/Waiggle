// Tests de la photo de profil en tête de feuille (AvatarCover, tranche R2) : la photo nette est
// nommée, le flou ne se lit pas, et « Changer la photo » est un bouton qui dit quand il travaille.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithI18n } from '../testing/render'
import { AvatarCover } from './AvatarCover'

const source = { uri: 'https://api.example.com/media/avatars/lea.webp' }

describe('AvatarCover', () => {
  it('names the sharp photo once, and hides the blurred one from screen readers', async () => {
    await renderWithI18n(<AvatarCover name="Léa" source={source} label="Photo de profil" />)

    expect(screen.getAllByLabelText('Photo de profil')).toHaveLength(1)
  })

  it('offers « Changer la photo » as a button that answers the tap', async () => {
    const onPress = jest.fn()
    await renderWithI18n(
      <AvatarCover
        name="Léa"
        source={null}
        label="Photo de profil"
        action={{ label: 'Changer la photo', onPress }}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows the button as busy while the photo is sent', async () => {
    await renderWithI18n(
      <AvatarCover
        name="Léa"
        source={source}
        label="Photo de profil"
        action={{ label: 'Changer la photo', onPress: () => {}, loading: true }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Changer la photo' })
    expect(button.props['aria-busy'] ?? button.props.accessibilityState?.busy).toBe(true)
  })

  it('offers no button without an action (a profile that cannot change)', async () => {
    await renderWithI18n(<AvatarCover name="Léa" source={source} label="Photo de profil" />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
