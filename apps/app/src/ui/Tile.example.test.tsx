// Tests de la pastille « Exemple » sur la tuile d'un projet (`ProjectTile` : une étiquette, une
// ruche ; tranche R12b, « Les exemples ») : un projet d'un compte d'exemples porte « Exemple »
// au-dessus du titre, après la pastille de visibilité s'il en a une. Dans le lien de la tuile, qui
// ne se lit que par son nom, les deux pastilles le décrivent dans cet ordre : `aria-describedby`
// sur le web, l'indice sur téléphone. Une tuile ordinaire n'a rien de plus.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectTile } from './Tile'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const EXAMPLE = fr.t(($) => $.common.example)
const title = 'Le carnet des plantes'
const BADGE = 'Réservé à Famille'

const tile = (props: { example?: boolean; badge?: string } = {}) => (
  <ProjectTile title={title} author="WaiggleBot" onPress={jest.fn()} {...props} />
)

/** Les éléments de l'arbre, dans l'ordre de lecture (en profondeur d'abord). */
type TreeNode = { props: Record<string, unknown>; children: (TreeNode | string)[] }
const nodesOf = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]

describe('ProjectTile with a project of the examples account (R12b)', () => {
  it('shows « Exemple » after the visibility pill, before the title', async () => {
    await renderWithProviders(tile({ example: true, badge: BADGE }))

    const order = nodesOf(screen.root as unknown as TreeNode)
    const at = (text: string) => order.indexOf(screen.getByText(text) as unknown as TreeNode)
    expect(at(BADGE)).toBeGreaterThanOrEqual(0)
    expect(at(EXAMPLE)).toBeGreaterThan(at(BADGE))
    expect(at(title)).toBeGreaterThan(at(EXAMPLE))
  })

  it('shows nothing more for an ordinary member', async () => {
    await renderWithProviders(tile())

    // Témoin : la tuile est là.
    expect(screen.getByText('WaiggleBot')).toBeTruthy()
    expect(screen.queryAllByText(EXAMPLE)).toHaveLength(0)
    expect(screen.getByRole('link', { name: title }).props.accessibilityHint).toBeUndefined()
  })

  it('has « Exemple » read on a phone, after the visibility, as the hint of the link', async () => {
    await renderWithProviders(tile({ example: true, badge: BADGE }))

    const hint = String(screen.getByRole('link', { name: title }).props.accessibilityHint)
    expect(hint).toContain(EXAMPLE)
    expect(hint.indexOf(EXAMPLE)).toBeGreaterThan(hint.indexOf(BADGE))
  })

  it('has the link described by the visibility, then « Exemple », on the web', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(tile({ example: true, badge: BADGE }))

      const props = screen.getByRole('link', { name: title }).props as Record<string, unknown>
      const idOf = (text: string) => screen.getByText(text).props.nativeID as unknown
      expect(String(props['aria-describedby']).split(' ')).toEqual([idOf(BADGE), idOf(EXAMPLE)])
    } finally {
      restore.restore()
    }
  })

  it('has the link described by « Exemple » alone without a visibility pill', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(tile({ example: true }))

      const props = screen.getByRole('link', { name: title }).props as Record<string, unknown>
      expect(props['aria-describedby']).toBe(screen.getByText(EXAMPLE).props.nativeID)
    } finally {
      restore.restore()
    }
  })
})
