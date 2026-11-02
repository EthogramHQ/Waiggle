// Tests de la ligne de petits renseignements (R5a, MetaLine) : un point entre deux morceaux, aucun
// au bout, et ce point est caché aux lecteurs d'écran.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { MetaLine } from './MetaLine'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Les points dessinés, cachés ou non (getAllByText ne voit pas les éléments cachés sans option). */
const dots = () => screen.queryAllByText('·', { includeHiddenElements: true })

describe('MetaLine', () => {
  it('puts a dot between two pieces, hidden from screen readers', async () => {
    await renderWithProviders(
      <MetaLine>
        <Text>Publié hier</Text>
        <Text>Mis à jour à l’instant</Text>
      </MetaLine>,
    )

    expect(screen.getByText('Publié hier')).toBeTruthy()
    expect(screen.getByText('Mis à jour à l’instant')).toBeTruthy()
    expect(dots()).toHaveLength(1)
    // Caché : la recherche ordinaire, qui suit les lecteurs d'écran, ne le trouve pas.
    expect(screen.queryByText('·')).toBeNull()
  })

  it('puts no dot after a single piece, nor for an empty one', async () => {
    await renderWithProviders(
      <MetaLine>
        <Text>Publié hier</Text>
        {false}
      </MetaLine>,
    )

    expect(screen.getByText('Publié hier')).toBeTruthy()
    expect(dots()).toHaveLength(0)
  })
})
