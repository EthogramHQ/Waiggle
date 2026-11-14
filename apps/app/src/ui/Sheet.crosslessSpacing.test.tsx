// La marge du haut d'une feuille sans croix (contre-visite de R9) : sans la rangée de 44 points de la
// croix, le titre ne doit pas frôler le coin arrondi. Il garde au moins la marge du côté (`space.xl`).
// Avec la croix, rien ne change : la rangée de 44 points fait déjà l'air du haut.

import { space } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { SheetPanel } from './Sheet'
import { Text } from './Text'

type Node = { parent: Node | null; props: { style?: unknown } } | null

/** La marge du haut de la vue qui porte la tête (la première, en montant, qui a aussi une marge de côté). */
const headerPaddingTop = (title: string): number | undefined => {
  let node = screen.getByRole('header', { name: title }) as unknown as Node
  while (node) {
    const style = StyleSheet.flatten(node.props.style as never) as
      | { paddingTop?: number; paddingHorizontal?: number }
      | undefined
    if (style?.paddingHorizontal !== undefined && style.paddingTop !== undefined) {
      return style.paddingTop
    }
    node = node.parent
  }
  return undefined
}

const renderPanel = (layout: 'phone' | 'desktop', closeInFooter: boolean) =>
  renderWithProviders(
    <SheetPanel
      layout={layout}
      title="Merci"
      closeLabel="Fermer"
      onClose={() => {}}
      closeInFooter={closeInFooter}
      footer={<Button label="Fermer" onPress={() => {}} />}
    >
      <Text>Ton signalement est parti.</Text>
    </SheetPanel>,
  )

describe('SheetPanel top margin', () => {
  it('is as wide as the side margin when the cross row is not drawn (desktop, closeInFooter)', async () => {
    await renderPanel('desktop', true)
    expect(headerPaddingTop('Merci')).toBeGreaterThanOrEqual(space.xl)
  })

  it('keeps the margin it had with the cross row (desktop)', async () => {
    await renderPanel('desktop', false)
    expect(headerPaddingTop('Merci')).toBe(space.md)
  })

  it('keeps the margin on a phone, where the handle row is always there', async () => {
    await renderPanel('phone', true)
    expect(headerPaddingTop('Merci')).toBe(space.md)
  })
})
