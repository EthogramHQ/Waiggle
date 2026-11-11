// L'icône (R7b, relecture d'interface A7) : une icône qui a sa couleur à elle (la coche de
// « Réglé », l'issue d'un retour) la reçoit par un rôle de la marque, au lieu d'être redessinée à
// la main dans chaque composant.
import { palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import Svg from 'react-native-svg'
import { renderWithProviders } from '../testing/render'
import { Icon } from './Icon'

type Node = {
  type: unknown
  props: Record<string, unknown>
  children: ReadonlyArray<Node | string>
}
const allNodes = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : allNodes(child))),
]
/**
 * Le remplissage de chaque dessin, tel que l'élément natif le reçoit (react-native-svg peut le
 * transformer) : on le compare donc à un dessin témoin rempli d'une couleur connue.
 */
const fills = (): string[] =>
  allNodes(screen.root as unknown as Node)
    .filter((node) => typeof node.type === 'string' && /^RNSVGSvg/.test(node.type))
    .map((svg) => JSON.stringify(svg.props.fill ?? null))

describe('Icon', () => {
  it('fills itself with the brand colour it is given, over its tone', async () => {
    await renderWithProviders(
      <>
        <Icon name="check-circle" tone="muted" color="settledText" />
        <Svg width={1} height={1} fill={palettes.day.settledText} />
      </>,
    )

    const [icon, witness] = fills()
    expect(icon).toBe(witness)
  })

  it('keeps its tone without a colour', async () => {
    await renderWithProviders(
      <>
        <Icon name="check-circle" tone="muted" />
        <Svg width={1} height={1} fill={palettes.day.textMuted} />
      </>,
    )

    const [icon, witness] = fills()
    expect(icon).toBe(witness)
  })
})
