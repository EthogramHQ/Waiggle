// Tests de la pastille « Exemple » sur la carte d'un projet du fil (tranche R12b, « Les
// exemples ») : un projet d'un compte d'exemples porte « Exemple » juste après son statut, dans la
// rangée du bas, hors de tout lien (un lecteur d'écran la lit à son tour, comme le statut, sur le
// web comme sur téléphone). Une carte ordinaire n'a rien de plus. La carte de liste (`SummaryCard`,
// qui lit le contrat) : screens/ExploreScreen.example.test.tsx.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectCard } from './ProjectCard'

const EXAMPLE = fr.t(($) => $.common.example)

const card = (example?: boolean) => (
  <ProjectCard
    title="Le carnet des plantes"
    pitch="Une photo de la feuille, et il dit quand arroser."
    author={{ name: 'WaiggleBot', avatar: null, onPress: jest.fn() }}
    when="12 oct."
    status={{ label: 'Testable', strong: true }}
    tryIt={{ label: 'Tester', onPress: jest.fn() }}
    badge="Privé"
    onPress={jest.fn()}
    {...(example === undefined ? null : { example })}
  />
)

/** Les éléments de l'arbre, dans l'ordre de lecture (en profondeur d'abord). */
type TreeNode = {
  props: Record<string, unknown>
  children: (TreeNode | string)[]
  parent: TreeNode | null
}
const nodesOf = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]

describe('ProjectCard with a project of the examples account (R12b)', () => {
  it('shows « Exemple » right after the status, before the other pill', async () => {
    await renderWithProviders(card(true))

    const order = nodesOf(screen.root as unknown as TreeNode)
    const at = (text: string) => order.indexOf(screen.getByText(text) as unknown as TreeNode)
    expect(at('Testable')).toBeGreaterThanOrEqual(0)
    expect(at(EXAMPLE)).toBeGreaterThan(at('Testable'))
    expect(at('Privé')).toBeGreaterThan(at(EXAMPLE))
  })

  it('keeps « Exemple » out of every link and button', async () => {
    await renderWithProviders(card(true))

    let node = (screen.getByText(EXAMPLE) as unknown as TreeNode).parent
    while (node) {
      const role = String(node.props.role ?? node.props.accessibilityRole ?? '')
      expect(['link', 'button']).not.toContain(role)
      node = node.parent
    }
  })

  it('shows nothing more for an ordinary member', async () => {
    await renderWithProviders(card())

    // Témoin : la rangée du bas est là.
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.queryAllByText(EXAMPLE)).toHaveLength(0)
  })
})
