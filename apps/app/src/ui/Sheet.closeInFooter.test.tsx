// La feuille sans croix quand son pied a déjà « Fermer » (`closeInFooter`, relecture de R9) : un
// seul bouton de ce nom par étape. Sans la prop, la croix reste (témoin).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { SheetPanel } from './Sheet'
import { Text } from './Text'

const renderPanel = (layout: 'phone' | 'desktop', closeInFooter: boolean, onClose = () => {}) =>
  renderWithProviders(
    <SheetPanel
      layout={layout}
      title="Merci"
      closeLabel="Fermer"
      onClose={onClose}
      closeInFooter={closeInFooter}
      footer={<Button label="Fermer" onPress={onClose} />}
    >
      <Text>Ton signalement est parti.</Text>
    </SheetPanel>,
  )

describe('SheetPanel closeInFooter', () => {
  it.each(['phone', 'desktop'] as const)('draws a single « Fermer » (%s)', async (layout) => {
    const onClose = jest.fn()
    await renderPanel(layout, true, onClose)

    const closes = screen.getAllByRole('button', { name: 'Fermer' })
    expect(closes).toHaveLength(1)
    await fireEvent.press(closes[0] as never)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the cross without the prop', async () => {
    await renderPanel('desktop', false)

    // Témoin : la croix de la tête et le « Fermer » du pied.
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2)
  })
})
