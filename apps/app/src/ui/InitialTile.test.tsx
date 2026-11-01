// Tests de la tuile à l'initiale d'un outil (R3, « Tous les outils ») : la première lettre en
// capitale, accent et emoji compris ; décorative, donc cachée aux lecteurs d'écran ; une seule
// teinte pour tous les outils depuis R4 (miel pâle, initiale à l'encre : la liste alternée miel et
// crème, sans ordre apparent, faisait croire à un sens ; reporté de la relecture de design de R3).
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { InitialTile, initialOf, tileVariantOf } from './InitialTile'

/** Les outils de la planche R3-Outils, et quelques autres. */
const slugs = ['claude', 'chatgpt', 'cursor', 'python', 'n8n', 'mistral', 'v0', 'lovable']

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null }

/** La couleur d'une propriété de style d'un élément (son style aplati). */
const styleOf = (node: Node, key: 'color' | 'backgroundColor'): unknown =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined)?.[key]

/** Le premier fond posé au-dessus de l'élément : celui de la tuile. */
const tileBackground = (text: Node): unknown => {
  let node: Node | null = text.parent
  while (node && styleOf(node, 'backgroundColor') === undefined) node = node.parent
  return node ? styleOf(node, 'backgroundColor') : undefined
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('InitialTile', () => {
  it('shows the first letter of the name, in capital, accent kept', () => {
    expect(initialOf('cursor')).toBe('C')
    expect(initialOf('Écrivain')).toBe('É')
    expect(initialOf('  n8n')).toBe('N')
  })

  it('keeps a whole emoji as the first character', () => {
    const robot = String.fromCodePoint(0x1f916)
    expect(initialOf(`${robot} Bot`)).toBe(robot)
  })

  it('is hidden from screen readers (the name is written next to it)', async () => {
    await renderWithProviders(<InitialTile name="Claude" />)

    expect(screen.queryByText('C')).toBeNull()
    expect(screen.getByText('C', { includeHiddenElements: true })).toBeTruthy()
  })

  // R4 (reporté de la relecture de design de R3) : une seule teinte, plus de liste alternée.
  it('gives every tool the same single tint', () => {
    expect(new Set(slugs.map(tileVariantOf)).size).toBe(1)
  })

  it('writes every initial in ink on pale honey', async () => {
    // Chaque outil avec la teinte que lui donnent ses appelants (ToolsScreen, SearchScreen).
    await renderWithProviders(
      <View>
        {slugs.map((slug) => (
          <InitialTile key={slug} name={slug} variant={tileVariantOf(slug)} />
        ))}
      </View>,
      'fr',
      'day',
    )

    for (const slug of slugs) {
      const initial = screen.getAllByText(initialOf(slug), { includeHiddenElements: true })[0]
      expect(initial).toBeTruthy()
      const node = initial as unknown as Node
      expect(styleOf(node, 'color')).toBe(palettes.day.text)
      expect(tileBackground(node)).toBe(palettes.day.honeySoft)
    }
  })
})
