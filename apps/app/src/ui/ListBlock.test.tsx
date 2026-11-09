// Tests de `ListBlock` (R6b, relecture ui-C5) : une case de contenu libre dans un `ListGroup`, à la
// place d'une ligne. Son contenu se lit tel quel, séparé des lignes voisines par le trait du groupe,
// et une rangée de pastilles passe à la ligne au lieu de déborder.
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ListBlock, ListGroup, ListRow } from './ListGroup'
import { Tag } from './Tag'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ListBlock', () => {
  it('shows its tags inside the group, under its title, after a row', async () => {
    await renderWithProviders(
      <ListGroup title="Pas encore dans le catalogue">
        <ListRow label="Claude" />
        <ListBlock wrap>
          <Tag label="Teachable Machine" inCatalogue={false} />
          <Tag label="Lobe" inCatalogue={false} />
        </ListBlock>
      </ListGroup>,
    )

    expect(screen.getByRole('header', { name: 'Pas encore dans le catalogue' })).toBeTruthy()
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByText('Teachable Machine')).toBeTruthy()
    expect(screen.getByText('Lobe')).toBeTruthy()
  })

  it('wraps a row of tags rather than overflowing the group', async () => {
    await renderWithProviders(
      <ListBlock wrap>
        <Tag label="Teachable Machine" inCatalogue={false} />
      </ListBlock>,
    )

    const block = screen.getByText('Teachable Machine')
    let node = block.parent
    while (node && StyleSheet.flatten(node.props.style)?.flexWrap === undefined) node = node.parent
    expect(StyleSheet.flatten(node?.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
    })
  })
})
