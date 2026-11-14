// Tests de KeyPoints (R9, planche R9-Bloquer) : le résumé, les puces en liste annoncée, puis le texte
// complet sous un intertitre (un titre, pas un bouton à déplier), tous visibles d'emblée ; et le
// même texte riche posé dans une fenêtre par `Dialog body`.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Dialog } from './Dialog'
import { KeyPoints } from './KeyPoints'

const points = [
  { icon: 'eye-slash' as const, text: 'Vous ne verrez plus les contenus.' },
  { icon: 'flag' as const, text: 'La modération n’est pas prévenue.' },
]
const details = { title: 'Ce que change le blocage', paragraphs: ['Premier.', 'Second.'] }

describe('KeyPoints', () => {
  it('shows the summary and the points as a list', async () => {
    await renderWithProviders(<KeyPoints summary="Léa et toi." points={points} />)

    expect(screen.getByText('Léa et toi.')).toBeTruthy()
    // Les éléments de liste ne sont pas `accessible` (getByRole ne les voit pas) : chaque puce a un
    // élément de liste parmi ses ancêtres, le résumé non.
    const inListItem = (text: string) => {
      let node = screen.getByText(text).parent
      while (node && node.props.role !== 'listitem') node = node.parent
      return node !== null
    }
    expect(points.map((point) => inListItem(point.text))).toEqual([true, true])
    expect(inListItem('Léa et toi.')).toBe(false)
    // Sans texte complet, pas d'intertitre.
    expect(screen.queryByRole('header')).toBeNull()
  })

  it('shows the whole text under a heading, nothing to unfold', async () => {
    await renderWithProviders(<KeyPoints summary="Léa et toi." points={points} details={details} />)

    expect(screen.getByRole('header', { name: details.title })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Premier.')).toBeTruthy()
    expect(screen.getByText('Second.')).toBeTruthy()
  })

  it('fits in a window as its body, under the title', async () => {
    await renderWithProviders(
      <Dialog
        visible
        title="Bloquer ?"
        body={<KeyPoints summary="Léa et toi." points={points} details={details} />}
        onDismiss={jest.fn()}
      >
        {null}
      </Dialog>,
    )

    expect(screen.getByRole('header', { name: 'Bloquer ?' })).toBeTruthy()
    expect(screen.getByText('Léa et toi.')).toBeTruthy()
    expect(screen.getByText('Second.')).toBeTruthy()
  })
})
