// Tests de la barre du haut fixe de Screen (tranche RF, « La barre du haut reste en place »,
// tablette et ordinateur), avec les règles de la relecture du plan, qui l'emportent sur le plan :
// - la barre (`header`) hors de la zone qui défile, par-dessus elle, et sa hauteur mesurée réservée
//   en haut du contenu ; la dernière mesure non nulle reste (ui-6 : une page cachée mesure 0) ;
// - sur téléphone, dans le flux, comme avant ; jamais sur le miel ;
// - fixe seulement si elle prend au plus un quart de la hauteur de la fenêtre (ui-3, jur-RF4 :
//   téléphone couché, texte à 200 %, bandeau de suspension déplié) ;
// - tout le `header` fixé, bandeau de suspension compris, jamais la capsule seule (S4) ;
// - la barre et `belowBar` avant la zone qui défile dans l'arbre (lecture et Tab d'abord), la bande
//   autour en `box-none` (ui-4) ;
// - aucun masque, filtre ou opacité sous 1 sur la zone qui défile (ui-9) : les verres du contenu
//   n'y flouteraient plus la lumière ;
// - sur le web, `scrollPaddingTop` = barre + `belowBar` + voile (jur-RF3) ;
// - passer de fixe à dans le flux ne remonte pas la barre (ui-10 : le champ de recherche garde le
//   focus) ;
// - `stickyHeader` (le formulaire de projet) garde son fond `sheet` opaque (ui-2) ;
// - `toTop()` du canal de défilement remonte l'écran en haut, sans animation en calme (ui-5).
//
// « Dans le flux » se lit sans supposer comment l'ui-dev le fait : la barre est dans la zone qui
// défile, ou elle suit le défilement (son décalage vertical, `top`, `marginTop` ou `translateY` dans
// le style de ses cadres, baisse d'autant que le contenu défile). ui-10 interdit en pratique de la
// changer de place dans l'arbre : c'est la seconde façon qui est attendue.
//
// Jest ne calcule aucune position : on appelle les `onLayout` et le `onScroll` comme l'appareil le
// ferait, et on lit l'arbre et les styles.
import { palettes } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { type ReactNode, useContext, useEffect } from 'react'
import { Dimensions, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { TopNav } from '../navigation/TopNav'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { suspendedMe } from '../testing/fixtures'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { Button } from './Button'
import { Screen } from './Screen'
import { ScreenScrollContext } from './scrollLight'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre de navigation (le test S4) lit le profil, la cloche et les images : de faux appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useIsFocused: () => true,
}))
// « Réduire les animations » (useCalmMotion lit useReducedMotion), choisi par chaque test.
// __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

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

const root = () => screen.root as unknown as Node

/** La zone qui défile de l'écran (l'élément natif RCTScrollView). */
const scroller = (): Node => {
  const found = everyNode(root()).find((node) => node.type === 'RCTScrollView')
  if (!found) throw new Error('No scrolling page')
  return found
}

const isInside = (node: Node, ancestor: Node): boolean => {
  for (let current: Node | null = node; current; current = current.parent) {
    if (current === ancestor) return true
  }
  return false
}

const asNode = (element: unknown) => element as Node

/** Le décalage vertical d'un élément donné par les styles de ses cadres (top, marges, translateY). */
const verticalOffset = (node: Node): number => {
  let offset = 0
  for (let current: Node | null = node; current; current = current.parent) {
    const style = styleOf(current)
    for (const key of ['top', 'marginTop'] as const) {
      const value = style[key]
      if (typeof value === 'number') offset += value
    }
    const transform = style.transform
    if (Array.isArray(transform)) {
      for (const step of transform as Record<string, unknown>[]) {
        if (typeof step.translateY === 'number') offset += step.translateY
      }
    }
  }
  return offset
}

/** Le contenu défile jusqu'à `y`, comme l'appareil l'annoncerait à la zone qui défile. */
const scrollTo = async (y: number) => {
  const onScroll = scroller().props.onScroll
  if (typeof onScroll !== 'function') throw new Error('The scrolling page does not listen')
  await act(async () => {
    onScroll({
      nativeEvent: {
        contentOffset: { x: 0, y },
        layoutMeasurement: { width: 1440, height: 900 },
        contentSize: { width: 1440, height: 6000 },
      },
    })
  })
}

/**
 * Vrai si l'élément part avec la page quand elle défile : dans la zone qui défile, ou hors d'elle
 * mais décalé d'autant que le contenu défile. Faux pour une barre fixe.
 */
const scrollsWithPage = async (element: unknown): Promise<boolean> => {
  const node = asNode(element)
  if (isInside(node, scroller())) return true
  await scrollTo(0)
  const before = verticalOffset(node)
  await scrollTo(120)
  const after = verticalOffset(node)
  await scrollTo(0)
  return before - after >= 100
}

/**
 * Un élément de la barre prend une hauteur, comme l'appareil la mesurerait. On remonte depuis lui
 * jusqu'au premier élément qui mesure : un ancêtre qui a `onLayout`, ou une vue vide sœur posée pour
 * mesurer. On s'arrête au premier ancêtre qui porte aussi la zone qui défile : au-delà, on
 * mesurerait tout l'écran.
 */
type Measurer = (event: unknown) => void

const measurerOf = (element: unknown): Measurer => {
  const scroll = scroller()
  let path: Node = asNode(element)
  for (let node = path.parent; node; path = node, node = node.parent) {
    if (isInside(scroll, node)) break
    const own = node.props.onLayout
    const probe = node.children.find(
      (child): child is Node =>
        typeof child !== 'string' &&
        child !== path &&
        child.children.length === 0 &&
        typeof child.props.onLayout === 'function',
    )
    const handler = typeof own === 'function' ? own : probe?.props.onLayout
    if (typeof handler === 'function') return handler as Measurer
  }
  throw new Error('Nothing measures this part of the top bar')
}

/** Donne `height` points à ce que mesure `measurer`. */
const measure = async (measurer: Measurer, height: number) => {
  const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 1280, height } }, persist: () => {} }
  await act(async () => measurer(layout))
}

/** La barre mesure `height` points. */
const measureBar = async (height: number) => measure(measurerOf(barRoot()), height)

/**
 * La barre mesure `bar` points et `belowBar` en mesure `below`. Si une même vue mesure les deux
 * ensemble, elle reçoit la somme ; sinon chacune la sienne.
 */
const measureBarAndBelow = async (bar: number, below: unknown, belowHeight: number) => {
  const barMeasurer = measurerOf(barRoot())
  const belowMeasurer = measurerOf(below)
  if (barMeasurer === belowMeasurer) {
    await measure(barMeasurer, bar + belowHeight)
    return
  }
  await measure(barMeasurer, bar)
  await measure(belowMeasurer, belowHeight)
}

/** La place réservée en haut du contenu qui défile. */
const reservedTop = (): number => {
  const style = StyleSheet.flatten(scroller().props.contentContainerStyle as never) as
    | Record<string, unknown>
    | undefined
  const value = style?.paddingTop ?? style?.paddingVertical ?? style?.padding
  return typeof value === 'number' ? value : 0
}

const BAR = 'Barre du haut'
const NEWS = '3 nouveautés'
const CONTENT = 'Le contenu de la page'

const bar = (
  <View>
    <Text>{BAR}</Text>
  </View>
)
/** La racine de la barre donnée par l'écran : le parent du texte « Barre du haut ». */
const barRoot = () => asNode(screen.getByText(BAR)).parent as Node

const page = (props: { header?: ReactNode; belowBar?: ReactNode; brand?: boolean } = {}) => (
  <Screen
    width="page"
    title="Fil"
    header={props.header ?? bar}
    belowBar={props.belowBar}
    {...(props.brand ? { ambiance: 'brand' as const } : null)}
  >
    <Text>{CONTENT}</Text>
  </Screen>
)

/** Une fenêtre de tablette (900 × 900), ou un téléphone couché (760 × 360), le temps d'un test. */
const setWindow = (width: number, height: number) => {
  const size = { width, height, scale: 2, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
}
const phoneWindow = { width: 390, height: 844, scale: 3, fontScale: 1 }

afterEach(async () => {
  // Le retour au téléphone redessine l'écran encore monté : dans act().
  await act(async () => Dimensions.set({ window: phoneWindow, screen: phoneWindow }))
  jest.restoreAllMocks()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

describe('Screen pinned top bar, where', () => {
  it('pins the top bar out of the scrolling page on a computer', async () => {
    setDesktopWindow()
    await renderWithProviders(page())

    // Témoin : le contenu de la page, lui, défile.
    expect(isInside(asNode(screen.getByText(CONTENT)), scroller())).toBe(true)
    expect(isInside(barRoot(), scroller())).toBe(false)
    expect(await scrollsWithPage(barRoot())).toBe(false)
  })

  it('pins it on a tablet too', async () => {
    setWindow(900, 900)
    await renderWithProviders(page())

    expect(isInside(barRoot(), scroller())).toBe(false)
    expect(await scrollsWithPage(barRoot())).toBe(false)
  })

  it('keeps it in the page on a phone, as before', async () => {
    await renderWithProviders(page())

    expect(screen.getByText(BAR)).toBeTruthy() // témoin
    expect(await scrollsWithPage(barRoot())).toBe(true)
  })

  it('never pins it on the honey of the brand screens', async () => {
    setDesktopWindow()
    await renderWithProviders(page({ brand: true }))

    expect(screen.getByText(BAR)).toBeTruthy() // témoin
    expect(await scrollsWithPage(barRoot())).toBe(true)
  })
})

describe('Screen pinned top bar, the room it keeps', () => {
  it('reserves the measured height of the bar above the content', async () => {
    setDesktopWindow()
    await renderWithProviders(page())
    const before = reservedTop()

    await measureBar(80)

    expect(reservedTop()).toBeGreaterThanOrEqual(80)
    expect(reservedTop()).toBeGreaterThan(before)
  })

  it('gives a page that mounts the room of the bar measured before, from its first drawing', async () => {
    // Le saut vu par Louis (2/11) : sur le web, une page ouverte pour la première fois (Explorer
    // depuis le Fil) se dessinait d'abord avec la place d'une barre vide, puis descendait d'environ
    // 75 points quand la barre était mesurée.
    setDesktopWindow()
    const first = await renderWithProviders(page())
    await measureBar(80)
    const measured = reservedTop()

    // Une page neuve : une autre clé démonte l'écran et en monte un autre.
    await act(async () => first.rerender(<View key="suivante">{page()}</View>))

    expect(reservedTop()).toBe(measured)
  })

  it('does not reuse it in a window of another width, where the bar may wrap', async () => {
    setDesktopWindow()
    const first = await renderWithProviders(page())
    const unmeasured = reservedTop()
    await measureBar(80)

    await act(async () => setWindow(900, 900))
    await act(async () => first.rerender(<View key="suivante">{page()}</View>))

    expect(reservedTop()).toBe(unmeasured)
  })

  it('keeps the last height that was not zero, when the page is hidden (ui-6)', async () => {
    setDesktopWindow()
    await renderWithProviders(page())

    await measureBar(80)
    await measureBar(0)

    expect(reservedTop()).toBeGreaterThanOrEqual(80)
  })

  it('stops a focused control below the bar and belowBar, on the web (jur-RF3)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setDesktopWindow()
    await renderWithProviders(
      page({ belowBar: <Button label={NEWS} variant="glass" onPress={() => {}} /> }),
    )

    await measureBarAndBelow(80, screen.getByRole('button', { name: NEWS }), 44)

    // Le navigateur fait défiler le contrôle qui reçoit le focus (Tab et Maj+Tab) sous cette marge.
    const padding = styleOf(scroller()).scrollPaddingTop
    expect(padding).toEqual(expect.any(Number))
    expect(padding as number).toBeGreaterThanOrEqual(80 + 44)
  })
})

describe('Screen pinned top bar, a quarter of the window at most (ui-3, jur-RF4)', () => {
  it('stays pinned on a computer while it takes a quarter of the height or less', async () => {
    setDesktopWindow() // 900 points de haut : un quart, 225
    await renderWithProviders(page())

    await measureBar(200)

    expect(await scrollsWithPage(barRoot())).toBe(false)
  })

  it('goes back into the page when it takes more than a quarter of the window', async () => {
    setDesktopWindow()
    await renderWithProviders(page())

    await measureBar(240)

    expect(await scrollsWithPage(barRoot())).toBe(true)
  })

  it('goes back into the page on a phone turned sideways, where the window is low', async () => {
    setWindow(760, 360) // une tablette par la largeur, mais un quart de hauteur de 90 points
    await renderWithProviders(page())

    await measureBar(120)

    expect(await scrollsWithPage(barRoot())).toBe(true)
  })
})

describe('Screen pinned top bar, in the tree', () => {
  it('puts the bar and belowBar before the scrolling page, read and reached by Tab first (ui-4)', async () => {
    setDesktopWindow()
    await renderWithProviders(
      page({ belowBar: <Button label={NEWS} variant="glass" onPress={() => {}} /> }),
    )

    const order = everyNode(root())
    const news = asNode(screen.getByRole('button', { name: NEWS }))
    expect(isInside(news, scroller())).toBe(false)
    expect(order.indexOf(barRoot())).toBeLessThan(order.indexOf(scroller()))
    expect(order.indexOf(news)).toBeLessThan(order.indexOf(scroller()))
    expect(order.indexOf(barRoot())).toBeLessThan(order.indexOf(news))
  })

  it('lets touches beside the bar pass to the page and its scroll bar (ui-4)', async () => {
    setDesktopWindow()
    await renderWithProviders(page())

    // Les cadres entre la barre et le premier ancêtre qu'elle partage avec la zone qui défile : la
    // bande posée par-dessus la page.
    const scroll = scroller()
    const band: Node[] = []
    for (let node = barRoot().parent; node && !isInside(scroll, node); node = node.parent) {
      band.push(node)
    }
    expect(band.length).toBeGreaterThan(0) // témoin : la barre est hors de la page
    for (const node of band) {
      expect(node.props.pointerEvents).toBe('box-none')
      expect(styleOf(node).pointerEvents).toBeUndefined()
    }
  })

  it('pins the whole header, the suspension banner with the capsule (S4)', async () => {
    setDesktopWindow()
    mockSession({ user: { id: 'u5', name: 'Inès' } })
    jest.mocked(useUnreadCount).mockReturnValue(0)
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(page({ header: <TopNav /> }))

    const banner = await screen.findByText(containing(fr.t(($) => $.suspension.title)))
    const feedLink = screen.getByRole('link', { name: fr.t(($) => $.nav.feed) })
    expect(isInside(asNode(feedLink), scroller())).toBe(false)
    expect(isInside(asNode(banner), scroller())).toBe(false)
    expect(await scrollsWithPage(banner)).toBe(false)
  })

  it('keeps the scrolling page free of mask, filter and transparency (ui-9)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    setDesktopWindow()
    await renderWithProviders(page())

    expect(isInside(barRoot(), scroller())).toBe(false) // témoin : la barre est fixe
    for (let node: Node | null = scroller(); node; node = node.parent) {
      const style = styleOf(node)
      for (const key of ['maskImage', 'WebkitMaskImage', 'mask', 'filter', 'backdropFilter']) {
        expect(style[key]).toBeUndefined()
      }
      if (typeof style.opacity === 'number') expect(style.opacity).toBe(1)
    }
  })
})

describe('Screen pinned top bar, switching', () => {
  // La barre compte ses montages : un nouveau montage perdrait le focus de son champ de recherche.
  let mounts = 0
  function CountedBar() {
    useEffect(() => {
      mounts += 1
    }, [])
    return (
      <View>
        <Text>{BAR}</Text>
      </View>
    )
  }

  beforeEach(() => {
    mounts = 0
  })

  it('keeps the bar mounted when it grows past a quarter of the window (ui-10)', async () => {
    setDesktopWindow()
    await renderWithProviders(page({ header: <CountedBar /> }))
    await measureBar(80)
    expect(await scrollsWithPage(barRoot())).toBe(false)

    await measureBar(240)

    // Témoin : elle est bien passée dans la page…
    expect(await scrollsWithPage(barRoot())).toBe(true)
    // … sans être remontée.
    expect(mounts).toBe(1)
  })

  it('keeps the bar mounted when the window narrows to a phone (ui-10)', async () => {
    setDesktopWindow()
    await renderWithProviders(page({ header: <CountedBar /> }))
    expect(await scrollsWithPage(barRoot())).toBe(false)

    await act(async () => setWindow(600, 900))

    expect(await scrollsWithPage(barRoot())).toBe(true) // témoin
    expect(mounts).toBe(1)
  })
})

describe('Screen sticky header (ui-2)', () => {
  /** Le premier cadre de la barre, hors de la page, qui porte un fond. */
  const backgroundBehind = (element: unknown) => {
    for (let node = asNode(element).parent; node; node = node.parent) {
      const background = styleOf(node).backgroundColor
      if (typeof background === 'string' && background !== 'transparent') return background
    }
    return undefined
  }

  it.each([
    ['a phone', () => {}],
    ['a computer', () => setDesktopWindow()],
  ])('keeps the opaque sheet behind a sticky header on %s', async (_, setUp) => {
    setUp()
    await renderWithProviders(
      <Screen width="form" stickyHeader header={bar}>
        <Text>{CONTENT}</Text>
      </Screen>,
    )

    expect(isInside(barRoot(), scroller())).toBe(false)
    expect(backgroundBehind(barRoot())).toBe(palettes.day.sheet)
  })
})

describe('Screen scroll channel, toTop (ui-5)', () => {
  function TopButton() {
    const scroll = useContext(ScreenScrollContext)
    return <Button label="Remonter" onPress={() => scroll?.toTop()} />
  }

  it('brings the page back to the top, with motion', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    await renderWithProviders(
      <Screen width="page" header={bar}>
        <TopButton />
      </Screen>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Remonter' }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 0, animated: true }))
  })

  it('jumps to the top without motion when animations are reduced', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    await renderWithProviders(
      <Screen width="page" header={bar}>
        <TopButton />
      </Screen>,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Remonter' }))

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 0, animated: false }))
  })
})
