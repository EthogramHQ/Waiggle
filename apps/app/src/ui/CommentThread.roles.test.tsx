// Tests des rôles et du pied d'un fil de commentaires (R5b, relecture de l'interface ui-M1) : le
// fil est un élément de la liste des fils, ses réponses une liste imbriquée dont chaque réponse est
// un élément ; le trait ne se touche pas ; le pied vient après les réponses, hors de leur liste.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { CommentThread } from './CommentThread'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = {
  props: Record<string, unknown>
  parent: Host | null
  children: ReadonlyArray<Host | string>
}

const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const all = () => hostsOf(screen.root as unknown as Host)

/** Le plus proche ancêtre qui porte ce rôle (`role` ou `accessibilityRole`). */
const closest = (node: unknown, role: string) => {
  let parent = (node as Host).parent
  while (parent && parent.props.role !== role && parent.props.accessibilityRole !== role) {
    parent = parent.parent
  }
  return parent
}

const replies = [
  <Text key="zoe">Zoé : Moi aussi, dis-nous !</Text>,
  <Text key="lea">Léa : Merci à vous deux.</Text>,
]

describe('CommentThread, roles', () => {
  it('is one list item, its replies a nested list of items', async () => {
    await renderWithProviders(
      <CommentThread root={<Text>Max : Super idée.</Text>} replies={replies} />,
    )

    const thread = closest(screen.getByText('Max : Super idée.'), 'listitem')
    expect(thread).not.toBeNull()
    const zoe = closest(screen.getByText('Zoé : Moi aussi, dis-nous !'), 'listitem')
    const lea = closest(screen.getByText('Léa : Merci à vous deux.'), 'listitem')
    expect(zoe).not.toBe(lea)
    const list = closest(zoe, 'list')
    expect(list).not.toBeNull()
    expect(closest(lea, 'list')).toBe(list)
    // La liste des réponses est dans le fil, et chacune de ses cases est une réponse.
    expect(closest(list, 'listitem')).toBe(thread)
    expect(
      list?.children.filter(
        (child) => typeof child !== 'string' && child.props.role === 'listitem',
      ),
    ).toHaveLength(2)
  })

  it('has no nested list without replies', async () => {
    await renderWithProviders(<CommentThread root={<Text>Inès : Ça marche ?</Text>} />)

    expect(closest(screen.getByText('Inès : Ça marche ?'), 'listitem')).not.toBeNull() // témoin
    expect(all().filter((node) => node.props.accessibilityRole === 'list')).toHaveLength(0)
  })

  it('lets the touches go through its line', async () => {
    await renderWithProviders(
      <CommentThread root={<Text>Max : Super idée.</Text>} replies={replies} />,
    )

    const lines = all().filter((node) => node.props['aria-hidden'] === true)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.props.pointerEvents).toBe('none')
  })

  it('shows its footer after the replies, outside their list', async () => {
    await renderWithProviders(
      <CommentThread
        root={<Text>Max : Super idée.</Text>}
        replies={replies}
        footer={<Text>Réponse publiée.</Text>}
      />,
    )

    const footer = screen.getByText('Réponse publiée.')
    const order = all()
    expect(order.indexOf(footer as unknown as Host)).toBeGreaterThan(
      order.indexOf(screen.getByText('Léa : Merci à vous deux.') as unknown as Host),
    )
    expect(closest(footer, 'list')).toBeNull()
  })
})
