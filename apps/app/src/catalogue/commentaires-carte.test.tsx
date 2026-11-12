// La section « Carte d'un commentaire » du catalogue montre aussi la carte éclairée (`lit`, R8,
// « Voir en contexte ») : de jour et de nuit, chacune avec « Rallumer », qui la refait arriver
// allumée (son miel s'éteint en 1,5 s, il serait parti avant qu'on la trouve).
import { palettes } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { CommentCardCatalogue } from './commentaires-carte'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = NonNullable<typeof screen.root>
const everyNode = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : everyNode(child))),
]
/** Les couches de miel pâle du rendu (la carte visée et la carte éclairée en ont une). */
const paleHoney = () =>
  everyNode(screen.root as Node).filter(
    (node) => StyleSheet.flatten(node.props.style)?.backgroundColor === palettes.day.highlightSoft,
  ).length

describe('CommentCardCatalogue', () => {
  it('shows the lit card, by day and by night, and lights it again on « Rallumer »', async () => {
    await renderWithProviders(<CommentCardCatalogue />)

    expect(screen.getAllByText(/^Éclairé par/)).toHaveLength(2)
    const relight = screen.getAllByRole('button', { name: 'Rallumer' })
    expect(relight).toHaveLength(2)
    const before = paleHoney()
    expect(before).toBeGreaterThan(0)

    await fireEvent.press(relight[0] as Node)
    // Une carte neuve, toujours éclairée : son miel pâle est encore là, rien n'a disparu.
    expect(screen.getAllByRole('button', { name: 'Rallumer' })).toHaveLength(2)
    expect(paleHoney()).toBe(before)
  })
})
