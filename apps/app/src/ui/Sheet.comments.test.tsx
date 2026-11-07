// Tests de la feuille venus de la relecture des commentaires (R5b), à côté de ceux de
// Sheet.test.tsx et Sheet.r5b.test.tsx :
// - des-C1 : Tab ne retient pas les éléments d'une zone `inert` (les copies mesurées de `ReadMore`),
//   où `focus()` échoue et laissait le focus sur place ;
// - des-C2 : avec un nombre (`titleCount`), le titre prend toute la largeur : « Fermer » est dessus ;
// - des-A8 : la tête garde de l'air sous le titre, le texte de la liste défilée ne le touche pas ;
// - des-C4 : la feuille amène un élément dans sa zone qui défile (`revealRef`), et l'y garde quand la
//   zone rétrécit (le pied qui grandit, le clavier qui sort), jusqu'à ce que le membre défile.
import { space } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Sheet, SheetPanel } from './Sheet'
import { revealOffset, type SheetReveal } from './sheetReveal'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Node = {
  type: unknown
  props: Record<string, unknown>
  children: (Node | string)[]
  parent: Node | null
}
const hosts = (node: Node | string = screen.root as unknown as Node): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(hosts)]
const flat = (node: Node) =>
  (StyleSheet.flatten(node.props.style as object) ?? {}) as Record<string, unknown>

describe('Tab inside a sheet (web, des-C1)', () => {
  /** Un élément de la page prêté à la feuille : `inert` s'il est dans une zone inerte. */
  const element = (name: string, inert = false) => ({
    name,
    tabIndex: 0,
    hasAttribute: () => false,
    getClientRects: () => ({ length: 1 }),
    closest: (selector: string) => (selector === '[inert]' && inert ? {} : null),
    focus: jest.fn(),
  })

  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('skips what sits in an inert zone and reaches the next control', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const pill = element('pastille')
    const copy = element('copie mesurée', true)
    const reply = element('Répondre')
    const nodes = [pill, copy, reply]
    // Une page prêtée, complète en apparence (un `document` partiel fait tomber ThemeProvider). Le
    // focus est sur la pastille : la page le dit par `document.activeElement`.
    const loose = (): unknown =>
      new Proxy(() => {}, {
        get: (_target, name) =>
          name === Symbol.toPrimitive ? () => '' : name === 'then' ? undefined : loose(),
        set: () => true,
        apply: () => loose(),
      })
    Object.defineProperty(globalThis, 'document', {
      value: new Proxy({ activeElement: pill } as Record<string | symbol, unknown>, {
        get: (target, name) => (name in target ? target[name] : loose()),
        set: () => true,
      }),
      configurable: true,
    })

    // Une vue témoin : toutes les vues natives du rendu partagent son prototype, à qui l'on prête
    // `querySelectorAll`, par lequel la feuille cherche ses éléments.
    const probe = createRef<View>()
    await renderWithProviders(<View ref={probe} />)
    const proto = Object.getPrototypeOf(probe.current) as { querySelectorAll?: unknown }
    const querySelectorAll = jest.fn(() => nodes)
    proto.querySelectorAll = querySelectorAll
    try {
      await renderWithProviders(
        <Sheet open title="Commentaires" onClose={() => {}}>
          <Text>Super idée</Text>
        </Sheet>,
      )
      const panel = hosts().find((node) => typeof node.props.onKeyDown === 'function')
      if (!panel) throw new Error('feuille attendue')
      await fireEvent(panel as never, 'keyDown', {
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => {},
        target: pill,
      })
    } finally {
      delete proto.querySelectorAll
    }

    expect(querySelectorAll).toHaveBeenCalled()
    expect(reply.focus).toHaveBeenCalledTimes(1)
    expect(copy.focus).not.toHaveBeenCalled()
  })
})

describe('The head of a sheet', () => {
  const titleRowOf = (title: string) => {
    const heading = screen.getByRole('header', { name: title })
    let node = heading as unknown as Node | null
    while (node && flat(node).flexDirection !== 'row') node = node.parent
    if (!node) throw new Error('rangée du titre attendue')
    return node
  }

  it('gives a counted title the whole width: « Fermer » sits above it (des-C2)', async () => {
    await renderWithProviders(
      <SheetPanel
        layout="phone"
        title="Commentaires"
        titleCount={{ count: 6, spoken: '6 commentaires' }}
        onClose={() => {}}
      >
        <Text>Super idée</Text>
      </SheetPanel>,
    )

    expect(flat(titleRowOf('Commentaires, 6 commentaires')).paddingRight).toBeUndefined()
  })

  it('keeps the room of « Fermer » beside a title without a count (témoin)', async () => {
    await renderWithProviders(
      <SheetPanel layout="phone" title="Nouvelle adresse" onClose={() => {}}>
        <Text>Super idée</Text>
      </SheetPanel>,
    )

    expect(flat(titleRowOf('Nouvelle adresse')).paddingRight).toBeGreaterThan(0)
  })

  it('leaves air under the title, without moving the content at rest (des-A8)', async () => {
    await renderWithProviders(
      <SheetPanel layout="phone" title="Commentaires" onClose={() => {}}>
        <Text>Super idée</Text>
      </SheetPanel>,
    )
    const heading = screen.getByRole('header', { name: 'Commentaires' })
    let head = heading as unknown as Node | null
    while (head && flat(head).paddingTop !== space.md) head = head.parent
    if (!head) throw new Error('tête attendue')

    expect(flat(head).paddingBottom).toBe(space.sm)
    // Le contenu au repos reste à sa place : ce que la tête prend, le haut du contenu le rend.
    const content = hosts().find(
      (node) =>
        (StyleSheet.flatten(node.props.contentContainerStyle as object) as
          | Record<string, unknown>
          | undefined) !== undefined,
    )
    const style = StyleSheet.flatten(content?.props.contentContainerStyle as object) as {
      paddingTop?: number
    }
    expect(style.paddingTop).toBe(space.xl - space.sm)
  })
})

describe('revealOffset', () => {
  const zone = { offset: 100, height: 300 }

  it('does nothing for a card already in the zone', () => {
    expect(revealOffset({ top: 150, height: 100 }, zone, 12)).toBeNull()
  })

  it('brings up a card hidden below the zone, with its margin', () => {
    expect(revealOffset({ top: 380, height: 100 }, zone, 12)).toBe(380 + 100 + 12 - 300)
  })

  it('brings down a card hidden above the zone, with its margin', () => {
    expect(revealOffset({ top: 50, height: 100 }, zone, 12)).toBe(50 - 12)
  })

  it('shows the start of a card taller than the zone', () => {
    expect(revealOffset({ top: 500, height: 400 }, zone, 12)).toBe(500 - 12)
    // Déjà en tête : rien ne bouge.
    expect(revealOffset({ top: 112, height: 400 }, zone, 12)).toBeNull()
  })

  it('never asks for a position above the top of the list', () => {
    expect(revealOffset({ top: 4, height: 100 }, zone, 12)).toBe(0)
  })

  it('shares what is left around a card that barely fits, rather than cutting it for its margin', () => {
    // 290 points dans 300 : 5 de chaque côté ; toute la carte se voit.
    expect(revealOffset({ top: 500, height: 290 }, zone, 12)).toBe(500 + 290 + 5 - 300)
  })
})

describe('The sheet brings an element into its zone (des-C4)', () => {
  /** Une carte de la liste prêtée à la feuille : sa place dans le contenu. */
  const card = (top: number, height: number) => ({
    measureLayout: (
      _relativeTo: unknown,
      done: (x: number, y: number, width: number, height: number) => void,
    ) => done(0, top, 300, height),
  })

  const scroller = () => {
    const found = hosts().find((node) => node.props.contentContainerStyle !== undefined)
    if (!found) throw new Error('zone qui défile attendue')
    return found
  }

  /** La zone qui défile fait `height` de haut (le pied a grandi, le clavier est sorti). */
  const zoneHeight = async (height: number) => {
    await fireEvent(scroller() as never, 'layout', {
      persist: () => {},
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
    })
  }

  const renderSheet = async () => {
    const reveal = createRef<SheetReveal>()
    await renderWithProviders(
      <Sheet open title="Commentaires" onClose={() => {}} revealRef={reveal}>
        <Text>Super idée</Text>
      </Sheet>,
    )
    return reveal
  }

  afterEach(() => jest.restoreAllMocks())

  it('scrolls to the element, then follows the zone as it shrinks', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    scrollTo.mockClear()
    const reveal = await renderSheet()
    await zoneHeight(500)

    await act(() => reveal.current?.reveal(card(400, 120)))
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 400 + 120 + 12 - 500, animated: true })

    // Le clavier sort : la zone ne fait plus que 200.
    scrollTo.mockClear()
    await zoneHeight(200)
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 400 + 120 + 12 - 200, animated: true })
  })

  it('counts the margin above the content, which the card is not measured from', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    const reveal = await renderSheet()
    await zoneHeight(500)
    const inner = hosts().find(
      (node) => node.props.collapsable === false && flat(node).gap === space.xl,
    )
    if (!inner) throw new Error('vue du contenu attendue')
    await fireEvent(inner as never, 'layout', {
      nativeEvent: { layout: { x: 20, y: 12, width: 350, height: 900 } },
    })
    scrollTo.mockClear()

    await act(() => reveal.current?.reveal(card(400, 120)))

    expect(scrollTo).toHaveBeenLastCalledWith({ y: 12 + 400 + 120 + 12 - 500, animated: true })
  })

  it('leaves the list alone once the member scrolls by hand', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    const reveal = await renderSheet()
    await zoneHeight(500)
    await act(() => reveal.current?.reveal(card(400, 120)))
    scrollTo.mockClear()

    await fireEvent(scroller() as never, 'wheel', {})
    await zoneHeight(200)

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stops following when told to reveal nothing', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    const reveal = await renderSheet()
    await zoneHeight(500)
    await act(() => reveal.current?.reveal(card(400, 120)))
    scrollTo.mockClear()

    await act(() => reveal.current?.reveal(null))
    await zoneHeight(200)

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
