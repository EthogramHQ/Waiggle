// Tests du panneau d'onglets porté par l'écran (`TabPanel` de ui/Tabs.tsx, tranche R10) : le Fil
// sous les pastilles des ruches. Avec un identifiant, c'est le `tabpanel` que les onglets citent
// (`aria-controls`), nommé par l'onglet choisi ; sans, une simple vue, sans rôle ni nom.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { TabPanel, Tabs } from './Tabs'
import { Text } from './Text'

type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Toutes les vues de l'arbre rendu, de haut en bas. */
const allNodes = (): Node[] => {
  const nodes: Node[] = []
  const walk = (node: Node) => {
    nodes.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as Node)
  return nodes
}

/** La vue qui porte cet identifiant. */
const nodeWithId = (id: string) => allNodes().find((node) => node.props.nativeID === id)

describe('TabPanel', () => {
  it('is the tab panel that the tabs control, named after the chosen tab', async () => {
    await renderWithProviders(
      <>
        <Tabs
          label="Ruches du fil"
          tabs={[
            { key: 'all', label: 'Tout' },
            { key: 'f', label: 'Famille' },
          ]}
          selected="f"
          onSelect={() => {}}
          panelId="feed-panel"
        />
        <TabPanel id="feed-panel" label="Famille">
          <Text>Le plan de table</Text>
        </TabPanel>
      </>,
    )

    const tab = screen.getByRole('tab', { name: 'Famille' })
    expect(tab.props['aria-controls']).toBe('feed-panel')
    const panel = nodeWithId('feed-panel')
    expect(panel?.props.role).toBe('tabpanel')
    expect(panel?.props['aria-label']).toBe('Famille')
    expect(screen.getByText('Le plan de table')).toBeTruthy()
  })

  it('is a plain view, without role or name, when there are no tabs', async () => {
    await renderWithProviders(
      <TabPanel label="Tout">
        <Text>Le jeu de mémoire</Text>
      </TabPanel>,
    )

    // Témoin : le contenu est là.
    expect(screen.getByText('Le jeu de mémoire')).toBeTruthy()
    const nodes = allNodes()
    expect(nodes.some((node) => node.props.role === 'tabpanel')).toBe(false)
    expect(nodes.some((node) => node.props['aria-label'] === 'Tout')).toBe(false)
  })
})
