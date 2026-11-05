// La section « Fil, aperçu et titre compté » du catalogue (R5b) se dessine sans erreur, avec ses
// états : les titres comptés, et les boutons des quatre aperçus.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { CommentThreadCatalogue } from './commentaires-fil'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('CommentThreadCatalogue', () => {
  it('shows the counted titles and the buttons of the previews', async () => {
    await renderWithProviders(<CommentThreadCatalogue />)

    expect(screen.getByRole('header', { name: 'Mes projets, 3 projets' })).toBeTruthy()
    expect(screen.getAllByRole('header', { name: 'Commentaires, 6 commentaires' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Voir les 6 commentaires' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Commenter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Écrire un commentaire' })).toBeTruthy()
  })
})
