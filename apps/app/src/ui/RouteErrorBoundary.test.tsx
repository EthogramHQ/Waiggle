// Test de l'écran de secours affiché quand une page plante.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { RouteErrorBoundary } from './RouteErrorBoundary'

// Les outils de test chargent le module des comptes ; on le remplace (pas de vrai client ici).
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('RouteErrorBoundary', () => {
  it('replaces a broken page with a message and a way to try again', async () => {
    const retry = jest.fn().mockResolvedValue(undefined)
    await renderWithProviders(<RouteErrorBoundary error={new Error('boom')} retry={retry} />)

    expect(screen.getByText('Cette page n’a pas pu s’afficher.')).toBeTruthy()
    expect(screen.queryByText(/boom/)).toBeNull() // pas de détail technique à l'écran
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(retry).toHaveBeenCalled()
  })
})
