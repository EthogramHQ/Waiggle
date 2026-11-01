// Tests de la place flottante de Screen (`floating`, R5a, relecture de l'interface du plan ui-2 et
// ui-13) et du libellé du bouton du haut (`backLabel`, ui-11).
//
// La place flottante porte ce qui reste en bas de l'écran pendant que la page défile : la capsule
// des réactions de la page projet. C'est Screen qui la pose (aucune position écrite dans l'écran) :
// - hors de la zone qui défile ;
// - au-dessus de la zone sûre du téléphone (la barre du bas de l'appareil), et au-dessus de la barre
//   d'onglets quand il y en a une (la page projet n'en a pas) ;
// - sa hauteur, mesurée, est réservée en bas du contenu : la fin de la page (« Signaler ce projet »)
//   remonte au-dessus d'elle, et sur le web, un contrôle qui reçoit le focus au clavier ne passe
//   jamais dessous (`scroll-padding-bottom`, WCAG 2.4.11). La capsule passe sur deux rangées à
//   320 points et 200 % : la réserve suit la nouvelle hauteur.
//
// `backLabel` : le bouton du haut dit « Retour » où qu'on arrive (ui-11 : « Retour au fil »
// mentirait en venant d'un membre ou d'Explorer). Sur ordinateur, l'icône et le texte ; sur
// téléphone, l'icône seule, nommée par ce texte.
//
// Jest ne calcule aucune position : on donne une hauteur à la place flottante comme le ferait
// l'appareil (son `onLayout`), puis on lit les marges demandées au ScrollView et à la place.
import { act, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Platform, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { Text } from './Text'
import { type TabBarSpace, TabBarSpaceContext } from './tabBarSpace'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit. RNTL 14 ne cherche que par rôle ou texte : le
// ScrollView de l'écran (l'élément natif RCTScrollView) se trouve en parcourant l'arbre.
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

const styleOf = (node: Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) as
    | Record<string, unknown>
    | undefined) ?? {}

/** Le premier élément natif de ce type (« RCTScrollView »). */
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

/** La marge du bas demandée au contenu du ScrollView de l'écran. */
const bottomPadding = (): number => {
  const style = StyleSheet.flatten(
    hostOfType('RCTScrollView').props.contentContainerStyle as StyleProp<ViewStyle>,
  )
  return typeof style?.paddingBottom === 'number' ? style.paddingBottom : 0
}

const isInside = (node: Node, ancestor: Node): boolean => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

/**
 * La place flottante prend une hauteur, comme l'appareil la mesurerait. On remonte depuis son
 * contenu jusqu'au premier élément qui mesure : un ancêtre qui a `onLayout`, ou une vue vide sœur
 * posée pour mesurer (`StyleSheet.absoluteFill`, pièges de code-appli.md). Seul ce premier-là est
 * appelé : `fireEvent(…, 'layout')` ferait de même en remontant, mais ne verrait pas la vue sœur.
 * On s'arrête au premier ancêtre qui porte aussi la zone qui défile : au-delà, ce qui mesure
 * mesurerait tout l'écran (le KeyboardAvoidingView), pas la place flottante.
 */
const measureFloating = async (content: Node, height: number) => {
  const layout = {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
    persist: () => {},
  }
  const scroller = hostOfType('RCTScrollView')
  let path: Node | null = content
  for (let node: Node | null = content.parent; node; path = node, node = node.parent) {
    if (isInside(scroller, node)) break
    const own = node.props.onLayout
    if (typeof own === 'function') {
      await act(async () => own(layout))
      return
    }
    const probe = node.children.find(
      (child): child is Node =>
        typeof child !== 'string' &&
        child !== path &&
        child.children.length === 0 &&
        typeof child.props.onLayout === 'function',
    )
    if (probe) {
      const onLayout = probe.props.onLayout as (event: typeof layout) => void
      await act(async () => onLayout(layout))
      return
    }
  }
  throw new Error('Nothing measures the floating place')
}

/**
 * La distance entre le bas de l'écran et le contenu flottant : la somme des `bottom`, des marges et
 * des remplissages du bas de ses ancêtres (la couche posée en bas, puis ses marges).
 */
const liftOf = (content: Node): number => {
  let lift = 0
  for (let node: Node | null = content.parent; node; node = node.parent) {
    const style = styleOf(node)
    for (const key of ['bottom', 'paddingBottom', 'marginBottom'] as const) {
      const value = style[key]
      if (typeof value === 'number') lift += value
    }
  }
  return lift
}

const tabBar = (height: number): TabBarSpace => ({ height, topSignal: 0, scrollToTop: () => {} })

// Un téléphone à encoche : 34 points de zone sûre en bas (la barre de l'iPhone).
const notched = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

const CAPSULE = 'Waggle !, 21, ta réaction'

const page = (floating?: ReactNode) => (
  <Screen width="page" onBack={() => {}} floating={floating}>
    <Text>La description du projet</Text>
    <Button label="Signaler ce projet" variant="secondary" onPress={() => {}} />
  </Screen>
)

const capsule = () => <Button label={CAPSULE} variant="glass" onPress={() => {}} />

const floatingContent = () => screen.getByRole('button', { name: CAPSULE }) as unknown as Node

describe('Screen floating place', () => {
  it('shows what floats, found by role and name', async () => {
    await renderWithProviders(page(capsule()))

    expect(floatingContent()).toBeTruthy()
  })

  it('keeps it out of the scrolling content', async () => {
    await renderWithProviders(page(capsule()))

    const scroller = hostOfType('RCTScrollView')
    // Témoin : le contenu de la page, lui, défile.
    expect(
      isInside(screen.getByText('La description du projet') as unknown as Node, scroller),
    ).toBe(true)
    expect(isInside(floatingContent(), scroller)).toBe(false)
  })

  it('reserves its measured height under the content', async () => {
    await renderWithProviders(page(capsule()))
    const before = bottomPadding()

    await measureFloating(floatingContent(), 140)

    // La fin de la page remonte au-dessus de la capsule : toute sa hauteur, plus qu'avant.
    expect(bottomPadding()).toBeGreaterThanOrEqual(140)
    expect(bottomPadding()).toBeGreaterThan(before)
  })

  it('follows a new height, when the capsule wraps on two rows', async () => {
    await renderWithProviders(page(capsule()))

    await measureFloating(floatingContent(), 140)
    await measureFloating(floatingContent(), 220)

    expect(bottomPadding()).toBeGreaterThanOrEqual(220)
  })

  it('keeps a focused control clear of it on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(page(capsule()))
      await measureFloating(floatingContent(), 140)

      // Le navigateur fait défiler le contrôle qui reçoit le focus au-dessus de cette marge.
      const style = styleOf(hostOfType('RCTScrollView'))
      expect(style.scrollPaddingBottom).toEqual(expect.any(Number))
      expect(style.scrollPaddingBottom as number).toBeGreaterThanOrEqual(140)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('sits above the safe area of the phone, on a page without a tab bar', async () => {
    await renderWithProviders(
      <SafeAreaProvider initialMetrics={notched}>{page(capsule())}</SafeAreaProvider>,
    )

    expect(liftOf(floatingContent())).toBeGreaterThanOrEqual(34)
  })

  it('reserves the safe area under the content too', async () => {
    await renderWithProviders(
      <SafeAreaProvider initialMetrics={notched}>{page(capsule())}</SafeAreaProvider>,
    )

    await measureFloating(floatingContent(), 140)

    expect(bottomPadding()).toBeGreaterThanOrEqual(140 + 34)
  })

  it('sits above the tab bar when there is one', async () => {
    await renderWithProviders(
      <TabBarSpaceContext.Provider value={tabBar(72)}>
        {page(capsule())}
      </TabBarSpaceContext.Provider>,
    )

    expect(liftOf(floatingContent())).toBeGreaterThanOrEqual(72)
  })

  it('reserves the tab bar and the floating place together', async () => {
    await renderWithProviders(
      <TabBarSpaceContext.Provider value={tabBar(72)}>
        {page(capsule())}
      </TabBarSpaceContext.Provider>,
    )

    await measureFloating(floatingContent(), 140)

    expect(bottomPadding()).toBeGreaterThanOrEqual(72 + 140)
  })

  it('reserves nothing more without a floating place', async () => {
    await renderWithProviders(page())

    // La marge habituelle du bas (space.huge, sans encoche) : rien n'est ajouté.
    expect(screen.getByText('La description du projet')).toBeTruthy() // témoin
    expect(bottomPadding()).toBeLessThan(140)
  })
})

describe('Screen backLabel', () => {
  it('names the top button with the given label on a phone', async () => {
    await renderWithProviders(
      <Screen width="page" onBack={() => {}} backLabel="Revenir">
        <Text>Le contenu</Text>
      </Screen>,
    )

    expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy()
  })

  it('shows only the icon on a phone', async () => {
    await renderWithProviders(
      <Screen width="page" onBack={() => {}} backLabel="Revenir">
        <Text>Le contenu</Text>
      </Screen>,
    )

    expect(screen.getByText('Le contenu')).toBeTruthy() // témoin
    expect(screen.queryByText('Revenir')).toBeNull()
  })

  it('shows the icon and the label « Retour » on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <Screen width="page" onBack={() => {}} backLabel="Retour">
          <Text>Le contenu</Text>
        </Screen>,
      )

      const button = screen.getByRole('button', { name: 'Retour' }) as unknown as Node
      const label = screen.getByText('Retour') as unknown as Node
      // Le texte est dans le bouton (toute la pilule se touche), et le nom n'est pas doublé.
      expect(isInside(label, button)).toBe(true)
      expect(screen.getAllByRole('button', { name: 'Retour' })).toHaveLength(1)
    } finally {
      // Le retour au téléphone redessine l'écran encore monté : dans act().
      await act(async () => restore())
    }
  })

  it('keeps the icon alone on a computer without a label, as before', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(
        <Screen width="page" onBack={() => {}}>
          <Text>Le contenu</Text>
        </Screen>,
      )

      expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy() // témoin
      expect(screen.queryByText('Retour')).toBeNull()
    } finally {
      // Le retour au téléphone redessine l'écran encore monté : dans act().
      await act(async () => restore())
    }
  })
})
