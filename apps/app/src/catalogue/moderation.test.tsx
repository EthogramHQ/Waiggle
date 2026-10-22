// La section « Modération » du catalogue (tranche 6d) se dessine, avec ses cartes dans tous leurs
// états : décisions proposées, envoi en cours, aucune décision (« Te concerne »), contenu retiré.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ModerationCatalogue } from './moderation'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ModerationCatalogue', () => {
  it('shows the report card in all its states, and the moderation notifications', async () => {
    await renderWithProviders(<ModerationCatalogue />)

    expect(screen.getByRole('header', { name: 'Modération' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Retirer' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Classer sans suite' }).length).toBe(3)
    expect(screen.getByRole('button', { name: 'Rétablir' })).toBeTruthy()
    expect(screen.getByText('Te concerne : un autre administrateur doit décider.')).toBeTruthy()
    // Une notification sans destination (signalement traité, cible plus visible) n'est pas un lien.
    expect(screen.getAllByRole('link', { name: /a été traité/ })).toHaveLength(1)
  })
})
