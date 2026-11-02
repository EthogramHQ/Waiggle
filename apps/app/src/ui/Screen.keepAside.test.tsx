// Tests de `keepAsideInView` de Screen (tranche RF, relecture du plan ui-5) : sur tablette et
// ordinateur, la barre du haut est fixe ; quand la rangée du titre passe sous elle, l'élément posé à
// côté du titre (`titleAside`, le bouton des nouveautés du Fil) la quitte pour la place sous la
// barre, sans être copié ; il revient quand le titre redescend. La rangée garde sa hauteur pendant
// son absence : rien ne remonte sous le doigt.
//
// Jest ne calcule aucune position : on appelle les `onLayout` et le `onScroll` comme l'appareil le
// ferait, puis on lit l'arbre.
import { act, screen } from '@testing-library/react-native'
import { createRef, type RefObject } from 'react'
import { Dimensions, Platform, StyleSheet, View } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

const everyNode = (): Node[] => {
  const all: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    all.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return all
}

const scroller = (): Node => {
  const found = everyNode().find((node) => node.type === 'RCTScrollView')
  if (!found) throw new Error('No scrolling page')
  return found
}

const insideScroll = (element: unknown) => {
  for (let node = element as Node | null; node; node = node.parent) {
    if (node === scroller()) return true
  }
  return false
}

const NEWS = '3 nouveautés'
const news = () => screen.getAllByRole('button', { name: NEWS })
const heading = () => screen.getByRole('header', { name: 'Fil' }) as unknown as Node

/** La rangée du titre et l'en-tête reçoivent leur place (y 40, 44 points de haut). */
const layOutTitle = async () => {
  const layout = { nativeEvent: { layout: { x: 0, y: 40, width: 800, height: 44 } }, persist() {} }
  const scroll = scroller()
  for (let node = heading().parent; node && node !== scroll; node = node.parent) {
    const handler = node.props.onLayout
    if (typeof handler === 'function') await act(async () => handler(layout))
  }
}

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

/** La rangée du titre : le cadre en rangée qui contient le titre. */
const titleRow = (): Node => {
  for (let node = heading().parent; node; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style as never) as { flexDirection?: string }
    if (style?.flexDirection === 'row') return node
  }
  throw new Error('No title row')
}

const page = (keep = true, probe?: RefObject<View | null>) => (
  <Screen
    width="page"
    title="Fil"
    header={<Text>Barre du haut</Text>}
    titleAside={<Button label={NEWS} variant="glass" onPress={() => {}} />}
    keepAsideInView={keep}
  >
    <Text>Le fil</Text>
    {probe ? <View ref={probe} /> : null}
  </Screen>
)

// Le focus du clavier (RF, correction après relecture : le bouton changé de place est remonté, et
// le focus tombait sur toute la page). Jest n'a pas de navigateur : on prête à la page web le peu
// que Screen en lit (l'élément qui a le focus, et « cette place le contient-elle ? »), et on écoute
// `focus` sur les vues natives, qui partagent toutes la même classe (comme FeedEnd.test.tsx).
type Patched = { contains?: unknown; focus?: unknown }
let lent: { proto: Patched; hadContains: boolean; contains: unknown; hadFocus: boolean } | null =
  null

/** Une page web prêtée, complète en apparence : tout ce qu'on y lit accepte tout. */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })

/**
 * Passe sur le web, prête la page (`holds` : la place du bouton contient-elle le focus ?) et rend
 * l'espion de `focus`. `probe` : une vue du rendu, pour trouver la classe des vues natives.
 */
const lendWebPage = (probe: RefObject<View | null>, holds: boolean) => {
  const view = probe.current as unknown as Patched | null
  if (!view) throw new Error('The probe is not mounted')
  const proto = Object.getPrototypeOf(view) as Patched
  lent = {
    proto,
    hadContains: Object.hasOwn(proto, 'contains'),
    contains: proto.contains,
    hadFocus: Object.hasOwn(proto, 'focus'),
  }
  proto.contains = () => holds
  if (typeof proto.focus !== 'function') proto.focus = () => {}
  jest.replaceProperty(Platform, 'OS', 'web')
  ;(globalThis as { document?: unknown }).document = new Proxy(
    { activeElement: { focused: true } } as Record<string | symbol, unknown>,
    { get: (target, key) => (key in target ? target[key] : loose()), set: () => true },
  )
  // `spyOn` rend l'espion déjà posé par un test précédent, avec ses appels : on les efface.
  const focus = jest.spyOn(proto as { focus: (options?: object) => void }, 'focus')
  focus.mockClear()
  return focus
}

const phoneWindow = { width: 390, height: 844, scale: 3, fontScale: 1 }
afterEach(async () => {
  jest.restoreAllMocks()
  if (lent) {
    if (lent.hadContains) lent.proto.contains = lent.contains
    else delete lent.proto.contains
    if (!lent.hadFocus) delete lent.proto.focus
    lent = null
  }
  delete (globalThis as { document?: unknown }).document
  await act(async () => Dimensions.set({ window: phoneWindow, screen: phoneWindow }))
})

describe('Screen keepAsideInView (RF, ui-5)', () => {
  it('moves the one aside under the pinned bar once the title row is under it', async () => {
    setDesktopWindow()
    await renderWithProviders(page())
    await layOutTitle()
    await scrollTo(0)
    expect(insideScroll(news()[0])).toBe(true) // témoin : en haut, à côté du titre

    await scrollTo(2000)

    expect(news()).toHaveLength(1)
    expect(insideScroll(news()[0])).toBe(false)
  })

  it('keeps the height of the title row while the aside is away', async () => {
    setDesktopWindow()
    await renderWithProviders(page())
    await layOutTitle()

    await scrollTo(2000)

    const style = StyleSheet.flatten(titleRow().props.style as never) as { minHeight?: number }
    expect(style.minHeight).toBe(44)
  })

  it('brings the aside back beside the title when the title comes down again', async () => {
    setDesktopWindow()
    await renderWithProviders(page())
    await layOutTitle()
    await scrollTo(2000)
    expect(insideScroll(news()[0])).toBe(false) // témoin : parti sous la barre

    await scrollTo(0)

    expect(news()).toHaveLength(1)
    expect(insideScroll(news()[0])).toBe(true)
  })

  it('leaves the aside beside the title without keepAsideInView', async () => {
    setDesktopWindow()
    await renderWithProviders(page(false))
    await layOutTitle()

    await scrollTo(2000)

    expect(insideScroll(news()[0])).toBe(true)
  })

  it('gives the focus back to the aside when it moves under the bar while it had the focus', async () => {
    setDesktopWindow()
    const probe = createRef<View>()
    await renderWithProviders(page(true, probe))
    await layOutTitle()
    await scrollTo(0)
    const focus = lendWebPage(probe, true)

    await scrollTo(2000)

    expect(insideScroll(news()[0])).toBe(false) // témoin : parti sous la barre
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  })

  it('gives the focus back to the aside when it comes back beside the title', async () => {
    setDesktopWindow()
    const probe = createRef<View>()
    await renderWithProviders(page(true, probe))
    await layOutTitle()
    await scrollTo(2000)
    const focus = lendWebPage(probe, true)

    await scrollTo(0)

    expect(insideScroll(news()[0])).toBe(true) // témoin : revenu à côté du titre
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
  })

  it('leaves the focus where it is when the aside did not have it', async () => {
    setDesktopWindow()
    const probe = createRef<View>()
    await renderWithProviders(page(true, probe))
    await layOutTitle()
    await scrollTo(0)
    const focus = lendWebPage(probe, false)

    await scrollTo(2000)

    expect(insideScroll(news()[0])).toBe(false) // témoin : parti sous la barre
    expect(focus).not.toHaveBeenCalled()
  })

  it('leaves the aside beside the title on a phone, where the bar is not pinned', async () => {
    await renderWithProviders(page())
    await layOutTitle()

    await scrollTo(2000)

    expect(news()).toHaveLength(1)
    expect(insideScroll(news()[0])).toBe(true)
  })
})
