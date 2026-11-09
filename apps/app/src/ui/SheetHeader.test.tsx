// Test de la rangée empilée de SheetHeader (R6a, correction C5-E1) : quand la place manque (320
// points, texte à 200 %), « Annuler » et l'action forment une rangée au-dessus du titre. Cette
// rangée passe à la ligne, et le bouton garde sa largeur : il ne se coupe jamais au milieu d'un mot
// (« Enregist / rer »). Jest ne mesure rien : on donne les largeurs que l'appareil mesurerait, puis
// on lit les styles de la rangée et du bouton.
import { act, screen } from '@testing-library/react-native'
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { SheetHeader } from './SheetHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
type Measure = (event: { nativeEvent: { layout: { width: number } } }) => void

const nodes = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodes(child))),
]
const styleOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {}) as ViewStyle
const measuring = () =>
  nodes(screen.root as unknown as Node).filter((n) => typeof n.props.onLayout === 'function')
const width = (value: number) => ({ nativeEvent: { layout: { width: value } } })

describe('SheetHeader, stacked', () => {
  it('lets the row wrap and keeps the action button at its natural width', async () => {
    await renderWithProviders(
      <SheetHeader
        title="Modifier le projet"
        cancel={{ label: 'Annuler', onPress: () => {} }}
        action={{ label: 'Enregistrer', onPress: () => {} }}
      />,
    )
    // Les trois mesures, dans l'ordre : la barre, « Annuler », l'action (centrée au premier rendu).
    const handlers = measuring().map((n) => n.props.onLayout as Measure)
    const sizes = [280, 120, 180]
    await act(async () => {
      for (const [i, handler] of handlers.entries()) handler(width(sizes[i] ?? 0))
    })

    // Empilé : la barre contient la rangée (`flexWrap`), puis le titre.
    const row = nodes(screen.root as unknown as Node).find((n) => styleOf(n).flexWrap === 'wrap')
    expect(row).toBeDefined()
    // Le conteneur de l'action : le dernier élément qui mesure.
    const action = measuring().at(-1) as Node
    expect(styleOf(action).flexShrink).toBeUndefined()
  })
})
