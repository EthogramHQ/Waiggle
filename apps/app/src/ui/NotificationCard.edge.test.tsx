// Le liseré miel d'une ligne nouvelle de la page « Activité » (ui/NotificationCard.tsx, relecture de
// design de R8) : sur la lumière miel de la page, le miel pâle seul ne se voyait presque pas
// (1,16:1 sur téléphone). La ligne nouvelle a un bord `highlightEdge` ; une ligne vue garde un bord
// de même épaisseur, transparent, pour que ses textes restent alignés sur ceux d'une nouvelle.
// (Fichier à part : les tests d'origine du composant restent tels qu'écrits avec le contrat.)
import { borders, palettes } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { NotificationCard } from './NotificationCard'

type Props = ComponentProps<typeof NotificationCard>

/** Une ligne de base : un commentaire de Malik, déjà vu, qui mène quelque part. */
const base: Props = {
  leading: { kind: 'avatar', name: 'Malik', image: null },
  parts: [{ text: 'Malik', style: 'strong' }, { text: ' a commenté Météo' }],
  when: '20 oct.',
  thumb: { kind: 'project', image: null, title: 'Météo' },
  isNew: false,
  onPress: () => {},
}

type Node = NonNullable<typeof screen.root>
const everyNode = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : everyNode(child))),
]

/** Les bords dessinés par le rendu : leur épaisseur et leur couleur (styles aplatis). */
const edges = () =>
  everyNode(screen.root as Node)
    .map((node) => StyleSheet.flatten(node.props.style))
    .filter((style) => style?.borderWidth !== undefined)
    .map((style) => ({ width: style?.borderWidth, color: style?.borderColor }))

describe('NotificationCard, the edge of what is new', () => {
  it('draws a honey edge around a new notification, on its pale honey', async () => {
    await renderWithProviders(<NotificationCard {...base} isNew />)
    expect(edges()).toContainEqual({ width: borders.strong, color: palettes.day.highlightEdge })
  })

  it('keeps an edge of the same width, but transparent, on a notification already seen', async () => {
    await renderWithProviders(<NotificationCard {...base} />)
    expect(edges()).toContainEqual({ width: borders.strong, color: 'transparent' })
    expect(edges().map(({ color }) => color)).not.toContain(palettes.day.highlightEdge)
  })

  it('draws the edge on a new notification that leads nowhere too', async () => {
    await renderWithProviders(<NotificationCard {...base} isNew onPress={null} />)
    expect(edges()).toContainEqual({ width: borders.strong, color: palettes.day.highlightEdge })
  })
})
