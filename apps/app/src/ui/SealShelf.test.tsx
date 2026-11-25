// Tests de l'étagère des sceaux (R19, la page d'un membre) : une liste lue par les noms des sceaux,
// en rangée qui défile (téléphone) ou en grille (la colonne du profil sur ordinateur).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { inOrder } from '../testing/wideLayout'
import { SealShelf, type ShelfSeal } from './SealShelf'

const seals: ShelfSeal[] = [
  { key: 'first_feedback', icon: 'chat-centered-text', matter: 'honey', name: 'Premier retour' },
  { key: 'cooking', icon: 'cooking-pot', matter: 'cream', name: 'Cuisine explorée' },
]

/**
 * Les vues qui portent ce rôle (`role`, lu sur le web). Lues dans l'arbre : une vue de liste n'est
 * pas un élément « accessible » au sens de RNTL, qui ne la trouverait pas par `getByRole`.
 */
const withRole = (role: string) => inOrder().filter((node) => node.props.role === role)

describe('SealShelf', () => {
  it('lists every seal by its name in a row', async () => {
    await renderWithProviders(<SealShelf seals={seals} layout="row" />)

    expect(withRole('list')).toHaveLength(1)
    expect(withRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Premier retour')).toBeTruthy()
    expect(screen.getByText('Cuisine explorée')).toBeTruthy()
  })

  it('lists every seal by its name in a grid', async () => {
    await renderWithProviders(<SealShelf seals={seals} layout="grid" />)

    expect(withRole('list')).toHaveLength(1)
    expect(withRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Cuisine explorée')).toBeTruthy()
  })

  // Le nom est écrit sous le sceau : le sceau lui-même n'est pas lu une seconde fois.
  it('reads each name once, the wax seal being a drawing', async () => {
    await renderWithProviders(<SealShelf seals={seals} layout="row" />)

    expect(screen.queryAllByLabelText('Premier retour')).toHaveLength(0)
    expect(screen.queryAllByRole('image')).toHaveLength(0)
  })
})
