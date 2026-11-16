// Tests de la pastille « Exemple » sur la ligne « Ils cherchent des testeurs » (fil, ruche ; tranche
// R12b, « Les exemples ») : un projet d'un compte d'exemples porte « Exemple » après le nom de son
// auteur, sous le titre. La pastille est dans le lien de la ligne, qui ne se lit que par son nom :
// elle le décrit, par `aria-describedby` sur le web et par son indice sur téléphone. Une ligne
// ordinaire n'a rien de plus.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TesterRow } from './TesterRow'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const EXAMPLE = fr.t(($) => $.common.example)
const title = 'Le carnet des plantes'

const row = (example?: boolean) => (
  <TesterRow
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

describe('TesterRow with a project of the examples account (R12b)', () => {
  it('shows « Exemple » after the title and the name of the author', async () => {
    await renderWithProviders(row(true))

    const order = nodesOf(screen.root as unknown as TreeNode)
    const at = (text: string) => order.indexOf(screen.getByText(text) as unknown as TreeNode)
    expect(at(title)).toBeGreaterThanOrEqual(0)
    expect(at('WaiggleBot')).toBeGreaterThan(at(title))
    expect(at(EXAMPLE)).toBeGreaterThan(at('WaiggleBot'))
  })

  it('shows nothing more for an ordinary member', async () => {
    await renderWithProviders(row())

    // Témoin : l'auteur est là.
    expect(screen.getByText('WaiggleBot')).toBeTruthy()
    expect(screen.queryAllByText(EXAMPLE)).toHaveLength(0)
    expect(screen.getByRole('link', { name: title }).props.accessibilityHint).toBeUndefined()
  })

  it('has « Exemple » read on a phone, as the hint of the link', async () => {
    await renderWithProviders(row(true))

    expect(screen.getByRole('link', { name: title }).props.accessibilityHint).toBe(EXAMPLE)
  })

  it('has the link described by « Exemple » on the web', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(row(true))

      const props = screen.getByRole('link', { name: title }).props as Record<string, unknown>
      expect(props['aria-describedby']).toBe(screen.getByText(EXAMPLE).props.nativeID)
      expect(props.accessibilityHint).toBeUndefined()
    } finally {
      restore.restore()
    }
  })
})
