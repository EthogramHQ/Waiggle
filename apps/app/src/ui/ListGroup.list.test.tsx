// Tests du groupe annoncé comme une liste (`ListGroup list`, R7b) : la liste des testeurs d'un
// projet. Le groupe pose chaque ligne dans un élément de liste, son trait de séparation compris
// (sur le web, un `<ul>` ne contient que des `<li>`) ; sans `list`, rien ne change.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Les vues de l'arbre rendu qui portent ce rôle, parcourues à la main (`role` sans `accessible`). */
const withRole = (role: string): Host[] => {
  const found: Host[] = []
  const visit = (node: Host | string) => {
    if (typeof node === 'string') return
    if (node.props.role === role) found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Host)
  return found
}

const rows = ['Inès Morel', 'Sam Petit', 'Hugo Lefèvre']

describe('ListGroup list', () => {
  it('is announced as a list of one item per row', async () => {
    await renderWithProviders(
      <ListGroup list>
        {rows.map((name) => (
          <ListRow key={name} label={name} />
        ))}
      </ListGroup>,
    )

    expect(withRole('list')).toHaveLength(1)
    const items = withRole('listitem')
    expect(items).toHaveLength(3)
    // Toutes les vues du groupe sont des éléments de liste : aucun trait posé entre deux.
    expect(withRole('list')[0]?.children).toHaveLength(3)
  })

  it('stays a plain group without `list`', async () => {
    await renderWithProviders(
      <ListGroup>
        {rows.map((name) => (
          <ListRow key={name} label={name} />
        ))}
      </ListGroup>,
    )

    expect(screen.getByText('Sam Petit')).toBeTruthy() // témoin
    expect(withRole('list')).toHaveLength(0)
    expect(withRole('listitem')).toHaveLength(0)
  })
})
