// Tests de la tuile d'un projet sans `onPress` (tranche R12) : dans l'aperçu « Voir ma page comme un
// visiteur », la tuile est seulement dessinée. Rien à toucher (ni lien, ni bouton), et ses textes se
// lisent un à un : le titre, l'auteur, la pastille.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ProjectTile } from './Tile'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ProjectTile without onPress (R12 preview)', () => {
  it('is neither a link nor a button', async () => {
    await renderWithProviders(
      <ProjectTile title="Le ciel de ce soir" author="Inès Haddad" badge="Terminé" />,
    )

    // Témoin : la tuile est là, son titre se lit.
    expect(screen.getByText('Le ciel de ce soir')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('lets its title, author and pill be read, not hidden inside a named frame', async () => {
    await renderWithProviders(
      <ProjectTile title="Le ciel de ce soir" author="Inès Haddad" badge="Terminé" />,
    )

    // Sans `includeHiddenElements` : dans un lien, ces textes seraient cachés derrière son nom.
    expect(screen.getByText('Inès Haddad')).toBeTruthy()
    expect(screen.getByText('Terminé')).toBeTruthy()
  })
})
