// Le rôle de l'action d'une `Notice` (ui-A3) : un lien par défaut (« Me reconnecter », vers une autre
// page), un bouton quand l'action se fait sur place (« Réessayer », `role: 'button'`).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Notice } from './Notice'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Notice, the role of its action', () => {
  it('is a button for an action done on the spot (`role: "button"`), and not a link', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <Notice
        message="Le message n’a pas pu partir."
        action={{ label: 'Réessayer', role: 'button', onPress }}
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: 'Réessayer' })).toBeNull()
  })

  it('is a link without a role', async () => {
    await renderWithProviders(
      <Notice
        message="Ta session a expiré."
        action={{ label: 'Me reconnecter', onPress: () => {} }}
      />,
    )

    expect(screen.getByRole('link', { name: 'Me reconnecter' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Me reconnecter' })).toBeNull()
  })
})
