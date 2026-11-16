// Tests de la pastille « Exemple » sur la carte « Ils cherchent des testeurs » (tranche R12b, « Les
// exemples ») : un projet d'un compte d'exemples porte « Exemple » après le nom de son auteur. La
// pastille est dans le lien de la carte, qui ne se lit que par son nom : elle le décrit, par
// `aria-describedby` sur le web et par son indice sur téléphone. Une carte ordinaire n'a rien de plus.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TesterCard } from './TesterCard'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const EXAMPLE = fr.t(($) => $.common.example)
const title = 'Le carnet des plantes'

const card = (example?: boolean) => (
  <TesterCard
    title={title}
    author="WaiggleBot"
    image={null}
    onTest={jest.fn()}
    onOpen={jest.fn()}
    {...(example === undefined ? null : { example })}
  />
)

/** Les éléments de l'arbre, dans l'ordre de lecture (en profondeur d'abord). */
type TreeNode = { props: Record<string, unknown>; children: (TreeNode | string)[] }
const nodesOf = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]

describe('TesterCard with a project of the examples account (R12b)', () => {
  it('shows « Exemple » after the name of the author', async () => {
    await renderWithProviders(card(true))

    const order = nodesOf(screen.root as unknown as TreeNode)
    const at = (text: string) => order.indexOf(screen.getByText(text) as unknown as TreeNode)
    expect(at('WaiggleBot')).toBeGreaterThanOrEqual(0)
    expect(at(EXAMPLE)).toBeGreaterThan(at('WaiggleBot'))
  })

  it('shows nothing more for an ordinary member', async () => {
    await renderWithProviders(card())

    // Témoin : l'auteur est là.
    expect(screen.getByText('WaiggleBot')).toBeTruthy()
    expect(screen.queryAllByText(EXAMPLE)).toHaveLength(0)
    expect(screen.getByRole('link', { name: title }).props.accessibilityHint).toBeUndefined()
  })

  it('has « Exemple » read on a phone, as the hint of the link', async () => {
    await renderWithProviders(card(true))

    expect(screen.getByRole('link', { name: title }).props.accessibilityHint).toBe(EXAMPLE)
  })

  it('has the link described by « Exemple » on the web', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(card(true))

      const link = screen.getByRole('link', { name: title })
      const props = link.props as Record<string, unknown>
      expect(props['aria-describedby']).toBe(screen.getByText(EXAMPLE).props.nativeID)
      // Pas d'indice en double sur le web : la description le dit déjà.
      expect(props.accessibilityHint).toBeUndefined()
    } finally {
      restore.restore()
    }
  })
})
