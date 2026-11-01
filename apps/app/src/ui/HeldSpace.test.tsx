// Tests de HeldSpace (tranche R2, relecture de design C6) : le contenu s'affiche, puis s'efface en
// laissant un vide de sa hauteur, que les lecteurs d'écran ne lisent pas.
import { fireEvent, render, screen } from '@testing-library/react-native'
import { HeldSpace } from './HeldSpace'
import { Text } from './Text'

/** Le premier parent du texte qui mesure sa taille (la vue de HeldSpace). */
const measuredParent = (text: string) => {
  let node = screen.getByText(text).parent
  while (node && typeof node.props.onLayout !== 'function') node = node.parent
  if (!node) throw new Error('aucune vue mesurée autour du texte')
  return node
}

describe('HeldSpace', () => {
  it('shows its content while it is not vacated', async () => {
    await render(
      <HeldSpace vacated={false}>
        <Text>Trop d’essais pour l’instant.</Text>
      </HeldSpace>,
    )

    expect(screen.getByText('Trop d’essais pour l’instant.')).toBeTruthy()
    expect(screen.queryByTestId('held-space', { includeHiddenElements: true })).toBeNull()
  })

  it('keeps the measured height once vacated, with nothing left to read', async () => {
    await render(
      <HeldSpace vacated={false}>
        <Text>Trop d’essais pour l’instant.</Text>
      </HeldSpace>,
    )
    await fireEvent(measuredParent('Trop d’essais pour l’instant.'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 52 } },
    })

    await screen.rerender(
      <HeldSpace vacated>
        <Text>Trop d’essais pour l’instant.</Text>
      </HeldSpace>,
    )

    expect(screen.queryByText('Trop d’essais pour l’instant.')).toBeNull()
    const space = screen.getByTestId('held-space', { includeHiddenElements: true })
    expect(space).toHaveStyle({ height: 52 })
    // Un vide décoratif : caché aux lecteurs d'écran.
    expect(space).toHaveProp('aria-hidden', true)
  })
})
