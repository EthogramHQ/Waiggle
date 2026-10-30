// Tests de l'encadré « à savoir avant le geste » (Callout, R2, relecture de l'interface C6) : il
// montre son titre et son explication, son icône reste décorative, et il n'est pas annoncé comme
// un message (ni alerte ni statut : rien ne vient de se passer).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Callout } from './Callout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const sample = (
  <Callout
    icon="device-mobile"
    title="Tes autres appareils seront déconnectés"
    body="Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe."
  />
)

describe('Callout', () => {
  it('shows its title and its explanation', async () => {
    await renderWithProviders(sample)

    expect(screen.getByText('Tes autres appareils seront déconnectés')).toBeTruthy()
    expect(
      screen.getByText(
        'Cet appareil reste connecté. Sur les autres, il faudra le nouveau mot de passe.',
      ),
    ).toBeTruthy()
  })

  it('is not announced as a message when the page appears', async () => {
    await renderWithProviders(sample)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps its icon away from screen readers', async () => {
    await renderWithProviders(sample)

    // Le seul contenu lu : les deux textes ; l'icône n'a ni nom ni image annoncée.
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
