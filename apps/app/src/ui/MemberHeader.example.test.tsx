// Tests de l'en-tête d'un membre pour le compte d'exemples de l'équipe (tranche R12b) : avec sa
// phrase (`exampleNote`), « Exemple » se pose à côté du nom et la phrase se lit après lui ; sans
// elle, l'en-tête reste celui de tout membre. Les pages qui le posent : MemberScreen.example.test.tsx
// et PublicExamples.test.tsx.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MemberHeader } from './MemberHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const example = fr.t(($) => $.common.example)
const note = 'Les projets de ce compte sont fictifs.'

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type TreeNode = { children: (TreeNode | string)[] }
/** La place de chaque élément dans l'ordre de lecture (l'arbre, en profondeur d'abord). */
const readingOrder = (...elements: unknown[]) => {
  const order: unknown[] = []
  const walk = (node: TreeNode) => {
    order.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => order.indexOf(element))
}

describe('MemberHeader, for the examples account (R12b)', () => {
  it('reads the name, then « Exemple », then the note, before the bio', async () => {
    await renderWithProviders(
      <MemberHeader
        name="WaiggleBot"
        handle="@waigglebot"
        avatar={null}
        bio="Des projets pour montrer."
        toolsTitle="Outils favoris"
        tools={[]}
        exampleNote={note}
      />,
    )

    const [name, badge, said, bio] = readingOrder(
      screen.getByRole('header', { name: 'WaiggleBot' }),
      screen.getByText(example),
      screen.getByText(note),
      screen.getByText('Des projets pour montrer.'),
    )
    expect(name).toBeGreaterThanOrEqual(0)
    expect(badge).toBeGreaterThan(name ?? Number.POSITIVE_INFINITY)
    expect(said).toBeGreaterThan(badge ?? Number.POSITIVE_INFINITY)
    expect(bio).toBeGreaterThan(said ?? Number.POSITIVE_INFINITY)
  })

  it('shows neither for any other member', async () => {
    await renderWithProviders(
      <MemberHeader name="Léa" avatar={null} bio="" toolsTitle="Outils favoris" tools={[]} />,
    )

    // Témoin : l'en-tête est là.
    expect(screen.getByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.queryByText(example)).toBeNull()
  })
})
