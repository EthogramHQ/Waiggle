// « Tu es à jour », de jour et de nuit : où se pose le texte (R4, couples de contrastPairs). De
// jour, il est à l'encre sur la lumière miel, claire partout. La nuit, cette lumière s'éteint dans le
// noir au bord du bloc : le texte passe alors par le verre (`panel`), avec la couleur de texte de la
// nuit, et ce verre a l'arrondi d'un panneau, pas d'une pilule (à 200 %, le titre passe sur deux
// lignes, et le rayon d'une pilule rognait ses lettres : relecture design de R1).
import { palettes, radii } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { UpToDate } from './UpToDate'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const title = fr.t(($) => $.feed.upToDate.title)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { parent: Node | null; props: Record<string, unknown>; children: (Node | string)[] }
const flat = (node: Node) => (StyleSheet.flatten(node.props.style as TextStyle) ?? {}) as TextStyle

/** Tous les nœuds sous `node`, lui compris. */
const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

/**
 * Le verre sous le titre : le premier cadre arrondi au-dessus de lui. Sa couleur est sur lui, ou
 * sur une couche posée juste dedans (Surface sépare le flou, la couleur et le contenu).
 */
const glassUnder = (heading: Node) => {
  let each = heading.parent
  while (each && typeof flat(each).borderRadius !== 'number') each = each.parent
  return each
}
const colorsOf = (glass: Node) =>
  [glass, ...glass.children.filter((child): child is Node => typeof child !== 'string')]
    .map((each) => flat(each).backgroundColor)
    .filter((color) => color !== undefined)

describe('UpToDate, day and night', () => {
  it('writes in ink straight on the honey light by day', async () => {
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />, 'fr', 'day')

    const heading = screen.getByRole('header', { name: title }) as unknown as Node
    expect(flat(heading).color).toBe(palettes.day.onHoney)
    // Aucun verre de jour : rien n'a la couleur du panneau.
    const panels = everyNode(screen.root as unknown as Node).filter(
      (node) => flat(node).backgroundColor === palettes.day.panel,
    )
    expect(panels).toHaveLength(0)
  })

  it('puts the text on a glass panel at night, never on the dark edge of the honey', async () => {
    await renderWithProviders(<UpToDate onExplore={jest.fn()} />, 'fr', 'night')

    const heading = screen.getByRole('header', { name: title }) as unknown as Node
    expect(flat(heading).color).toBe(palettes.night.text)
    const glass = glassUnder(heading)
    expect(glass).not.toBeNull()
    expect(colorsOf(glass as Node)).toContain(palettes.night.panel)
    expect(flat(glass as Node).borderRadius).toBeLessThan(radii.pill)
  })
})
