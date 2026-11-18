// Tests de deux règles de la bande des onglets (`Tabs scroll`, R16, « Les squelettes ») :
// - `trailing` : des pièces posées après les onglets, dans la même capsule, qui ne sont pas des
//   onglets (les pastilles vides des ruches à venir, après « Tout ») ;
// - un onglet ajouté après la mesure de la bande n'est pas borné à l'ancienne largeur : la bande,
//   large de « Tout » seul, faisait passer « Amis du jeudi » à la ligne, le temps d'une mesure, et
//   le Fil dessous descendait de 27 points puis remontait (mesuré dans le navigateur, à 1 440 et
//   2 560).
import { act, screen } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Tabs } from './Tabs'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

const inside = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : inside(child))),
]

/** La bande (`band` points) et la rangée des onglets mesurées, comme le ferait le navigateur. */
const layOut = async (band: number) => {
  for (const node of inside(screen.root as unknown as Node)) {
    const onLayout = node.props.onLayout
    if (typeof onLayout !== 'function') continue
    const layout =
      node.type === 'RCTScrollView'
        ? { x: 0, y: 0, width: band, height: 52 }
        : node.props.role === 'tablist'
          ? { x: 0, y: 0, width: band, height: 44 }
          : null
    if (layout) await act(() => onLayout({ nativeEvent: { layout } }))
  }
}

const maxWidthOf = (name: string) =>
  StyleSheet.flatten(screen.getByRole('tab', { name }).props.style).maxWidth

const all = { key: 'all', label: 'Tout' }
const family = { key: 'family', label: 'Famille' }

describe('Tabs trailing', () => {
  it('draws the trailing pieces after the tabs, in the same capsule, as no tab', async () => {
    await renderWithProviders(
      <Tabs
        label="Ruches du fil"
        tabs={[all]}
        selected="all"
        onSelect={() => {}}
        panelId="panel"
        scroll
        trailing={<Text>pièce vide</Text>}
      />,
    )

    expect(screen.getAllByRole('tab')).toHaveLength(1)
    const list = screen.getByLabelText('Ruches du fil')
    expect(list.props.role).toBe('tablist')
    expect(
      inside(list as unknown as Node).some((node) => node.children.includes('pièce vide')),
    ).toBe(false)
    expect(screen.getByText('pièce vide')).toBeTruthy()
  })
})

describe('Tabs scroll, a tab added after the strip was measured', () => {
  it('is not held to the old strip width until the strip is measured again', async () => {
    const view = await renderWithProviders(
      <Tabs label="Ruches" tabs={[all]} selected="all" onSelect={() => {}} panelId="p" scroll />,
    )
    // La bande, large de « Tout » seul : 72 points.
    await layOut(72)
    // Témoin : l'onglet mesuré est borné à la bande.
    expect(maxWidthOf('Tout')).toBe(72)

    // Les ruches arrivent : « Famille » ne passe pas à la ligne dans 72 points.
    await view.rerender(
      <Tabs
        label="Ruches"
        tabs={[all, family]}
        selected="all"
        onSelect={() => {}}
        panelId="p"
        scroll
      />,
    )
    expect(maxWidthOf('Famille')).toBeUndefined()

    // La bande mesurée de nouveau, avec ses deux onglets : chacun est borné à sa largeur.
    await layOut(180)
    expect(maxWidthOf('Famille')).toBe(180)
    expect(maxWidthOf('Tout')).toBe(180)
  })
})
