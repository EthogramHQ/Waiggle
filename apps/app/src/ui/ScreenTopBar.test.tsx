// Tests de la place fixe du haut d'un écran (`ScreenTopBar`, tranche RF, « La barre du haut reste en
// place »). Sur tablette et ordinateur, Screen y pose sa barre (`header`, la capsule de verre de
// TopNav et le bandeau d'une suspension) hors de la zone qui défile, par-dessus elle : le contenu
// passe dessous. Ce fichier teste la place seule ; quand elle est fixe, et ce que Screen réserve,
// c'est `Screen.pinned.test.tsx`.
//
// L'interface attendue (noms choisis au plan des tests, à suivre par l'ui-dev) :
//   <ScreenTopBar belowBar={…} onHeight={(height) => …}>{header}</ScreenTopBar>
// - `children` : la barre ;
// - `belowBar` : ce qui se pose sous la barre (le bouton des nouveautés du Fil, ui-5) ;
// - `onHeight` : la hauteur mesurée de la barre seule, rendue à Screen qui la réserve en haut du
//   contenu. Jamais 0 : une page quittée, cachée sur le web, mesure 0, et la place réservée
//   sauterait au retour (relecture du plan, ui-6) ; la dernière mesure non nulle reste.
//
// Ce que la relecture du plan demande à la bande elle-même :
// - ui-4 : la barre puis `belowBar`, dans cet ordre de lecture ; autour de la capsule, la bande
//   laisse passer les clics vers le contenu et sa barre de défilement (`box-none`, en propriété :
//   en style, react-native-web ne crée pas la règle des enfants, piège de code-appli.md) ;
// - ui-2 : la bande est transparente (la capsule porte son verre) ;
// - ui-9 et S5 : le voile en dégradé derrière la capsule est dans la bande, sans adresse d'image
//   (`url(…)`), et ne prend ni toucher ni lecture.
//
// Jest ne calcule aucune position : on appelle les `onLayout` comme l'appareil le ferait, et on lit
// l'arbre et les propriétés.
import { space } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Button } from './Button'
import { ScreenTopBar } from './ScreenTopBar'
import { type ScreenScroll, ScreenScrollContext, type ScrollEvent } from './scrollLight'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'expose pas le type complet).
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

const styleOf = (node: Node): Record<string, unknown> =>
  (StyleSheet.flatten(node.props.style as never) as Record<string, unknown> | undefined) ?? {}

/** Tous les nœuds sous `node`, lui compris, dans l'ordre de lecture (profondeur d'abord). */
const everyNode = (node: Node): Node[] => {
  const all: Node[] = []
  const visit = (current: Node | string) => {
    if (typeof current === 'string') return
    all.push(current)
    for (const child of current.children) visit(child)
  }
  visit(node)
  return all
}

const isInside = (node: Node, ancestor: Node): boolean => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

/** Les ancêtres de `node` jusqu'à `stop` (exclu), du plus proche au plus lointain. */
const ancestorsUpTo = (node: Node, stop: Node): Node[] => {
  const found: Node[] = []
  for (let current = node.parent; current && current !== stop; current = current.parent) {
    found.push(current)
  }
  return found
}

const BAR = 'Barre du haut'
const NEWS = '3 nouveautés'

// La barre telle qu'un écran la donne : un cadre à elle (sa racine, qu'on retrouve par le texte),
// avec un bouton dedans.
const bar = (
  <View>
    <Text>{BAR}</Text>
    <Button label="Publier" onPress={() => {}} />
  </View>
)

/** La place du haut, posée dans un cadre du test (`host`) qui borne ce qu'on lit. */
const stage = (props: { belowBar?: ReactNode; onHeight?: (height: number) => void } = {}) => (
  <View testID="host">
    <ScreenTopBar belowBar={props.belowBar} onHeight={props.onHeight}>
      {bar}
    </ScreenTopBar>
  </View>
)

const host = () => screen.getByTestId('host') as unknown as Node
/** La racine de la barre donnée par l'écran : le parent du texte « Barre du haut ». */
const barRoot = () => (screen.getByText(BAR) as unknown as Node).parent as Node

/**
 * La barre prend une hauteur, comme l'appareil la mesurerait. On remonte depuis sa racine jusqu'au
 * premier élément qui mesure : un ancêtre qui a `onLayout`, ou une vue vide sœur posée pour mesurer
 * (`StyleSheet.absoluteFill`, pièges de code-appli.md). Seul ce premier-là est appelé.
 */
const measureBar = async (height: number) => {
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 1280, height } }, persist: () => {} }
  let path: Node = barRoot()
  for (let node = path.parent; node && node !== host(); path = node, node = node.parent) {
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
  throw new Error('Nothing measures the top bar')
}

/**
 * Le canal de défilement d'un Screen, prêté (RF, correction après relecture, 2.4.11) : la page a
 * défilé de `y` (`emit`), et `jumpTo` note où la barre demande de la ramener.
 */
const fakeScroll = () => {
  const listeners = new Set<(event: ScrollEvent) => void>()
  const channel: ScreenScroll & { jumpTo: jest.Mock } = {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    lightHeld: { current: false },
    coveredTop: { current: 0 },
    toTop: jest.fn(),
    jumpTo: jest.fn(),
  }
  const emit = async (y: number) => {
    const event = { nativeEvent: { contentOffset: { x: 0, y } } } as unknown as ScrollEvent
    await act(async () => {
      for (const listener of listeners) listener(event)
    })
  }
  return Object.assign(channel, { emit })
}

const stageIn = (scroll: ScreenScroll) => (
  <ScreenScrollContext.Provider value={scroll}>{stage()}</ScreenScrollContext.Provider>
)

/**
 * Un bouton de la barre reçoit le focus, sur le web (le focus d'un enfant remonte jusqu'à la bande :
 * on appelle son `onFocus`, le premier en remontant serait celui du bouton). `top` : le haut du
 * bouton dans la fenêtre, tel que le navigateur le mesure.
 */
const focusInBar = async (top: number) => {
  const band = [barRoot(), ...ancestorsUpTo(barRoot(), host())]
    .reverse()
    .find((node) => typeof node.props.onFocus === 'function')
  if (!band) throw new Error('The band does not listen to the focus')
  const onFocus = band.props.onFocus as (event: unknown) => void
  jest.replaceProperty(Platform, 'OS', 'web')
  try {
    await act(async () =>
      onFocus({ target: { getBoundingClientRect: () => ({ top, bottom: top + 44 }) } }),
    )
  } finally {
    jest.restoreAllMocks()
  }
}

describe('ScreenTopBar', () => {
  it('shows the bar, then what sits below it, in reading order', async () => {
    await renderWithProviders(
      stage({ belowBar: <Button label={NEWS} variant="glass" onPress={() => {}} /> }),
    )

    const order = everyNode(host())
    const publish = screen.getByRole('button', { name: 'Publier' }) as unknown as Node
    const news = screen.getByRole('button', { name: NEWS }) as unknown as Node
    expect(order.indexOf(publish)).toBeGreaterThan(-1)
    expect(order.indexOf(news)).toBeGreaterThan(order.indexOf(publish))
  })

  it('hands the measured height of the bar to the screen', async () => {
    const onHeight = jest.fn()
    await renderWithProviders(stage({ onHeight }))

    await measureBar(80)

    expect(onHeight).toHaveBeenLastCalledWith(80)
  })

  it('keeps the last height that was not zero, when a hidden page measures 0 (ui-6)', async () => {
    const onHeight = jest.fn()
    await renderWithProviders(stage({ onHeight }))

    await measureBar(80)
    await measureBar(0)

    // Témoin : la première mesure est bien arrivée.
    expect(onHeight).toHaveBeenCalledWith(80)
    expect(onHeight).not.toHaveBeenCalledWith(0)
    expect(onHeight).toHaveBeenLastCalledWith(80)
  })

  it('follows a new height that is not zero (text enlarged, banner unfolded)', async () => {
    const onHeight = jest.fn()
    await renderWithProviders(stage({ onHeight }))

    await measureBar(80)
    await measureBar(0)
    await measureBar(132)

    expect(onHeight).toHaveBeenLastCalledWith(132)
  })

  it('lets touches beside the bar pass to the page, by the pointerEvents property (ui-4)', async () => {
    await renderWithProviders(stage())

    const between = ancestorsUpTo(barRoot(), host())
    // Témoin : la barre est bien posée dans une bande à elle, sous le cadre du test.
    expect(between.length).toBeGreaterThan(0)
    for (const node of between) {
      // Chaque cadre autour de la barre laisse passer ce qui le touche hors de ses enfants…
      expect(node.props.pointerEvents).toBe('box-none')
      // … par la propriété, jamais par le style (sur le web, le style prendrait les clics).
      expect(styleOf(node).pointerEvents).toBeUndefined()
    }
  })

  it('puts no opaque background behind the capsule, which carries its own glass (ui-2)', async () => {
    await renderWithProviders(stage())

    const between = ancestorsUpTo(barRoot(), host())
    expect(between.length).toBeGreaterThan(0) // témoin
    for (const node of between) {
      const background = styleOf(node).backgroundColor
      expect(background === undefined || background === 'transparent').toBe(true)
    }
  })

  it('draws its veil without any image address (S5)', async () => {
    await renderWithProviders(stage())

    const nodes = everyNode(host())
    expect(nodes.length).toBeGreaterThan(3) // témoin : la bande est dessinée
    for (const node of nodes) {
      for (const value of Object.values(styleOf(node))) {
        if (typeof value === 'string') expect(value).not.toMatch(/url\(/)
      }
    }
  })

  it('brings the bar back into the window when one of its controls gets the focus after a scroll (2.4.11)', async () => {
    const scroll = fakeScroll()
    await renderWithProviders(stageIn(scroll))
    await measureBar(120)
    await scroll.emit(600)

    // Maj+Tab arrive sur un bouton de la barre, 150 points au-dessus du haut de la fenêtre.
    await focusInBar(-150)

    // La page redescend juste assez : le bouton reparaît en haut, avec un peu d'air pour son anneau.
    expect(scroll.jumpTo).toHaveBeenCalledTimes(1)
    expect(scroll.jumpTo).toHaveBeenCalledWith(600 - 150 - space.sm)
  })

  it('leaves the page where it is when the focused control is already in the window', async () => {
    const scroll = fakeScroll()
    await renderWithProviders(stageIn(scroll))
    await measureBar(120)
    await scroll.emit(40)

    await focusInBar(20)

    expect(scroll.jumpTo).not.toHaveBeenCalled()
  })

  it('leaves the page where it is when the bar is pinned, which never leaves the window', async () => {
    const restore = setDesktopWindow()
    try {
      const scroll = fakeScroll()
      await renderWithProviders(stageIn(scroll))
      await measureBar(80)
      await scroll.emit(600)

      await focusInBar(-150)

      expect(scroll.jumpTo).not.toHaveBeenCalled()
    } finally {
      await act(async () => restore())
    }
  })

  it('keeps the veil and anything else it draws out of the way of touches', async () => {
    await renderWithProviders(
      stage({ belowBar: <Button label={NEWS} variant="glass" onPress={() => {}} /> }),
    )

    const content = [barRoot(), screen.getByRole('button', { name: NEWS }) as unknown as Node]
    const others = everyNode(host()).filter(
      (node) =>
        node !== host() &&
        // Ni un cadre autour de la barre ou de `belowBar`, ni ce qu'ils contiennent…
        !content.some((own) => isInside(own, node) || isInside(node, own)),
    )
    // … tout le reste (le voile, une vue qui mesure) ne prend aucun toucher : lui-même ou un de ses
    // ancêtres dans la bande est en `pointerEvents="none"`.
    for (const node of others) {
      const blocked = [node, ...ancestorsUpTo(node, host())].some(
        (current) => current.props.pointerEvents === 'none',
      )
      expect(blocked).toBe(true)
    }
  })
})
