// Tests de Screen avec la barre d'onglets du téléphone, au clavier (R10, noté au plan) : sur le web,
// le navigateur fait défiler le contrôle qui reçoit le focus (Tab) jusqu'entre les marges de
// `scroll-padding`. Sans marge du bas, un champ ou un bouton au bas de la page finissait caché sous
// la barre d'onglets, qui flotte par-dessus le contenu (WCAG 2.4.11). Screen réserve donc la hauteur
// de la barre dans `scroll-padding-bottom`, même sans place flottante. Jest ne fait rien défiler : on
// lit la marge demandée à la zone qui défile.
import { screen } from '@testing-library/react-native'
import { Platform, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Screen } from './Screen'
import { Text } from './Text'
import { TabBarSpaceContext } from './tabBarSpace'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** La zone qui défile de l'écran (l'élément natif RCTScrollView). */
const scroller = (): Node => {
  let found: Node | undefined
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === 'RCTScrollView') found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error('No scrolling page')
  return found
}

const scrollStyle = () =>
  (StyleSheet.flatten(scroller().props.style as StyleProp<ViewStyle>) ?? {}) as Record<
    string,
    unknown
  >

const page = (barHeight: number) => (
  <TabBarSpaceContext.Provider value={{ height: barHeight, topSignal: 0, scrollToTop: () => {} }}>
    <Screen title="Ruches">
      <Text>Inviter un proche</Text>
    </Screen>
  </TabBarSpaceContext.Provider>
)

describe('Screen and the tab bar, with the keyboard (R10)', () => {
  it('keeps a focused control above the tab bar on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(page(80))

      const bottom = scrollStyle().scrollPaddingBottom
      expect(typeof bottom).toBe('number')
      expect(bottom as number).toBeGreaterThanOrEqual(80)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('reserves nothing without a tab bar (témoin)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(page(0))

      expect(scrollStyle().scrollPaddingBottom).toBeUndefined()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps the scroll indicator above the tab bar on a phone', async () => {
    await renderWithProviders(page(80))

    expect(scroller().props.scrollIndicatorInsets).toEqual({ bottom: 80 })
  })
})
