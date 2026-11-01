// Tests de Screen avec la barre d'onglets (refonte, tranche R3) : quand la barre flotte en bas,
// l'écran réserve sa hauteur sous le contenu (sinon la dernière carte resterait cachée sous le
// verre), et quand l'onglet actif est retouché sur sa première page, l'écran affiché remonte en
// haut. Sur le web, les pages précédentes restent montées sous la nouvelle : seul l'écran affiché
// remonte (useIsFocused, relecture de l'interface ui-3).
//
// La hauteur vient du contexte de ui/tabBarSpace.ts (mesurée par TabBarHost dans l'appli) : ici,
// le test la fournit lui-même. Jest ne calcule aucune position : on lit la marge demandée au
// ScrollView, et on compte ses appels à scrollTo.

import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { ScrollView, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { useScreenFocused } from './screenFocus'
import { Text } from './Text'
import { type TabBarSpace, TabBarSpaceContext } from './tabBarSpace'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Si la page de l'écran est celle qui est affichée (useIsFocused d'Expo Router, derrière une
// aide qui répond « oui » hors d'un navigateur) : remplacée ici.
jest.mock('./screenFocus', () => ({ useScreenFocused: jest.fn() }))

/** Un espace de barre fixe, sans signal de remontée. */
const space = (height: number, topSignal = 0): TabBarSpace => ({
  height,
  topSignal,
  scrollToTop: () => {},
})

// Un nœud de l'arbre rendu, le peu qu'on en lit. RNTL 14 ne cherche que par rôle ou texte : le
// ScrollView de l'écran (l'élément natif RCTScrollView) se trouve en parcourant l'arbre.
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Le premier élément natif de ce type (« RCTScrollView », « Image »). */
const hostOfType = (type: string): Node => {
  let found: Node | undefined
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === type) found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error(`No host element of type ${type}`)
  return found
}

/** La marge du bas demandée au ScrollView de l'écran. */
const bottomPadding = (): number => {
  const style = StyleSheet.flatten(
    hostOfType('RCTScrollView').props.contentContainerStyle as StyleProp<ViewStyle>,
  )
  return typeof style?.paddingBottom === 'number' ? style.paddingBottom : 0
}

// La fonction scrollTo du faux ScrollView de Jest, commune à toutes ses instances : on l'espionne.
const scrollTo = () => jest.spyOn(ScrollView.prototype, 'scrollTo')

/** Un écran dans un espace de barre qu'un bouton peut faire « retoucher » (le signal monte). */
const Sample = ({ height, focused }: { height: number; focused: boolean }) => {
  const [topSignal, setTopSignal] = useState(0)
  jest.mocked(useScreenFocused).mockReturnValue(focused)
  return (
    <TabBarSpaceContext.Provider value={{ ...space(height), topSignal }}>
      <Screen title="Explorer">
        <Text>Récents</Text>
      </Screen>
      <Button label="Retoucher" onPress={() => setTopSignal((n) => n + 1)} />
    </TabBarSpaceContext.Provider>
  )
}

beforeEach(() => {
  jest.mocked(useScreenFocused).mockReset().mockReturnValue(true)
})

describe('Screen under the tab bar', () => {
  it('keeps the bottom of the content clear of the bar', async () => {
    await renderWithProviders(
      <TabBarSpaceContext.Provider value={space(72)}>
        <Screen title="Explorer">
          <Text>Récents</Text>
        </Screen>
      </TabBarSpaceContext.Provider>,
    )

    expect(screen.getByText('Récents')).toBeTruthy() // témoin
    expect(bottomPadding()).toBeGreaterThanOrEqual(72)
  })

  it('reserves nothing without a bar', async () => {
    await renderWithProviders(
      <TabBarSpaceContext.Provider value={space(0)}>
        <Screen title="Explorer">
          <Text>Récents</Text>
        </Screen>
      </TabBarSpaceContext.Provider>,
    )

    // La marge habituelle du bas de l'écran (space.huge, sans encoche), plus rien.
    expect(bottomPadding()).toBeLessThan(72)
  })

  it('scrolls to the top when the active tab is touched again', async () => {
    await renderWithProviders(<Sample height={72} focused />)
    scrollTo().mockClear()

    await fireEvent.press(screen.getByRole('button', { name: 'Retoucher' }))
    await act(async () => {})

    expect(scrollTo()).toHaveBeenCalledTimes(1)
    expect(scrollTo().mock.calls[0]?.[0]).toMatchObject({ y: 0 })
  })

  it('does not scroll at mount, before any signal', async () => {
    // L'espion est posé avant l'affichage : un scrollTo au montage serait compté.
    const spy = scrollTo()
    spy.mockClear()
    await renderWithProviders(<Sample height={72} focused />)
    await act(async () => {})

    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText('Récents')).toBeTruthy() // témoin
  })

  it('leaves a page that is not displayed where it is', async () => {
    // Sur le web, la page quittée reste montée sous la nouvelle : elle ne doit pas bouger.
    await renderWithProviders(<Sample height={72} focused={false} />)
    scrollTo().mockClear()

    await fireEvent.press(screen.getByRole('button', { name: 'Retoucher' }))
    await act(async () => {})

    expect(scrollTo()).not.toHaveBeenCalled()
  })
})
