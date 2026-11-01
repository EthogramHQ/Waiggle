// Tests du toast et de la barre d'onglets du téléphone (refonte, tranche R3, relecture de
// l'interface du plan) : le toast lit la hauteur de la barre (ui/tabBarSpace.ts) et se pose
// au-dessus d'elle, jamais dessus ; sans barre, il garde sa place habituelle.
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../../testing/render'
import { Button } from '../Button'
import { TabBarHost } from '../TabBar'
import { Text } from '../Text'
import { ToastProvider, toastBottom, useToast } from './toast'

type Node = { props: { style?: unknown }; parent: Node | null }

/** Le décalage du bas posé sur la couche du toast : on remonte du texte jusqu'au premier `bottom`. */
const bottomOf = (text: string): number | undefined => {
  let node = screen.getByText(text) as unknown as Node | null
  while (node) {
    const { bottom } = StyleSheet.flatten(node.props.style as never) ?? {}
    if (typeof bottom === 'number') return bottom
    node = node.parent
  }
  return undefined
}

const Show = () => {
  const toast = useToast()
  return <Button label="Montrer" onPress={() => toast.show('Projet publié')} />
}

describe('toastBottom', () => {
  it('keeps the usual place without a bar', () => {
    expect(toastBottom('compact', 0)).toBe(104)
    expect(toastBottom('wide', 0)).toBe(32)
  })

  it('rises above a bar taller than the usual place', () => {
    expect(toastBottom('compact', 130)).toBeGreaterThan(130)
  })

  it('never goes below the usual place for a low bar', () => {
    expect(toastBottom('compact', 20)).toBe(104)
  })
})

describe('the toast over the tab bar', () => {
  it('sits above the measured height of the bar', async () => {
    await renderWithProviders(
      <TabBarHost bar={<Text>barre</Text>}>
        <ToastProvider>
          <Show />
        </ToastProvider>
      </TabBarHost>,
    )
    // L'appareil mesure la barre (onLayout) : l'événement remonte jusqu'au cadre qui écoute.
    await fireEvent(screen.getByText('barre'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 700, width: 390, height: 140 } },
    })

    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }))

    expect(bottomOf('Projet publié')).toBeGreaterThan(140)
  })

  it('keeps its usual place on a page without a bar', async () => {
    await renderWithProviders(
      <TabBarHost bar={null}>
        <ToastProvider>
          <Show />
        </ToastProvider>
      </TabBarHost>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Montrer' }))

    expect(bottomOf('Projet publié')).toBe(104)
  })
})
