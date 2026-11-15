// Tests de la jauge en alvéoles de miel : sa phrase est le nom lu de sa barre de progression, et
// une fois la jauge pleine elle ne s'affiche plus (« moins de mots ») sans cesser d'être annoncée.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { HoneyMeter } from './HoneyMeter'

describe('HoneyMeter', () => {
  it('names its progressbar with its sentence and shows it while filling', async () => {
    await renderWithProviders(<HoneyMeter value={9} max={12} label="Encore 3 caractères" />)

    const bar = screen.getByRole('progressbar', { name: 'Encore 3 caractères' })
    expect(bar.props['aria-valuemin']).toBe(0)
    expect(bar.props['aria-valuemax']).toBe(12)
    expect(bar.props['aria-valuenow']).toBe(9)
    expect(bar.props['aria-valuetext']).toBe('Encore 3 caractères')
    expect(screen.getByText('Encore 3 caractères')).toBeTruthy()
  })

  it('once full, hides its sentence and keeps it as the name of its progressbar', async () => {
    await renderWithProviders(<HoneyMeter value={12} max={12} label="Mot de passe assez long" />)

    const bar = screen.getByRole('progressbar', { name: 'Mot de passe assez long' })
    expect(bar.props['aria-valuenow']).toBe(12)
    expect(bar.props['aria-valuetext']).toBe('Mot de passe assez long')
    // La phrase n'est plus à l'écran ni dans l'arbre lu : une seule annonce, le nom de la barre.
    expect(screen.queryByText('Mot de passe assez long')).toBeNull()
  })

  it('does not count past its maximum', async () => {
    await renderWithProviders(<HoneyMeter value={20} max={12} label="Mot de passe assez long" />)

    expect(
      screen.getByRole('progressbar', { name: 'Mot de passe assez long' }).props['aria-valuenow'],
    ).toBe(12)
  })
})
