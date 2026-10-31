// Tests de la tuile à l'initiale d'un outil (R3, « Tous les outils ») : la première lettre en
// capitale, accent et emoji compris ; décorative, donc cachée aux lecteurs d'écran ; une teinte
// toujours la même pour un même outil.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { InitialTile, initialOf, tileVariantOf } from './InitialTile'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('InitialTile', () => {
  it('shows the first letter of the name, in capital, accent kept', () => {
    expect(initialOf('cursor')).toBe('C')
    expect(initialOf('Écrivain')).toBe('É')
    expect(initialOf('  n8n')).toBe('N')
  })

  it('keeps a whole emoji as the first character', () => {
    const robot = String.fromCodePoint(0x1f916)
    expect(initialOf(`${robot} Bot`)).toBe(robot)
  })

  it('is hidden from screen readers (the name is written next to it)', async () => {
    await renderWithProviders(<InitialTile name="Claude" />)

    expect(screen.queryByText('C')).toBeNull()
    expect(screen.getByText('C', { includeHiddenElements: true })).toBeTruthy()
  })

  it('gives a tool always the same tint', () => {
    expect(tileVariantOf('claude')).toBe(tileVariantOf('claude'))
    expect(new Set(['claude', 'chatgpt', 'cursor', 'python', 'n8n'].map(tileVariantOf)).size).toBe(
      2,
    )
  })
})
