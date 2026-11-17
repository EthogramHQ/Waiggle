// Tests du panneau d'à côté (SidePanel, R15) : une région complémentaire, qui laisse ses boutons et
// ses titres atteignables un par un (jamais `accessible`, qui les fondrait en un seul élément sur
// téléphone), et qui reçoit un nom quand l'écran lui en donne un.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { SidePanel } from './SidePanel'
import { Text } from './Text'

type Host = { props: Record<string, unknown>; children: (Host | string)[] }

/** Les éléments de l'arbre rendu qui portent ce rôle (getByRole ne trouve qu'un élément `accessible`). */
const withRole = (role: string) => {
  const all = (node: Host): Host[] => [
    node,
    ...node.children.flatMap((child) => (typeof child === 'string' ? [] : all(child))),
  ]
  return all(screen.root as unknown as Host).filter((node) => node.props.role === role)
}

describe('SidePanel', () => {
  it('is a complementary region whose title and buttons stay reachable one by one', async () => {
    await renderWithProviders(
      <SidePanel>
        <Text variant="heading" heading={2}>
          Outils populaires
        </Text>
        <Button label="Tester" onPress={() => {}} />
      </SidePanel>,
    )

    const regions = withRole('complementary')
    expect(regions).toHaveLength(1)
    // Pas `accessible` : sur téléphone, le titre et le bouton restent deux éléments distincts.
    expect(regions[0]?.props.accessible).not.toBe(true)
    expect(screen.getByRole('header', { name: 'Outils populaires' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tester' })).toBeTruthy()
  })

  it('names the region when the screen gives it a label', async () => {
    await renderWithProviders(
      <SidePanel label="À côté">
        <Text>Contenu</Text>
      </SidePanel>,
    )

    expect(withRole('complementary')[0]?.props['aria-label']).toBe('À côté')
  })

  it('has no name of its own without a label', async () => {
    await renderWithProviders(
      <SidePanel>
        <Text>Contenu</Text>
      </SidePanel>,
    )

    expect(withRole('complementary')[0]?.props['aria-label']).toBeUndefined()
  })
})
