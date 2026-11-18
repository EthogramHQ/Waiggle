// Tests du carrousel (refonte, tranche R3, « Ils cherchent des testeurs » d'Explorer) : une bande
// horizontale de cartes, aimantée carte par carte ; une région nommée (« Projets qui cherchent des
// testeurs ») ; sur ordinateur, deux flèches nommées « Projets précédents » et « Projets
// suivants » qui font défiler la bande, absentes sur téléphone (le doigt suffit) ; au clavier,
// chaque carte se rejoint par Tab ; et la bande ne défile jamais seule (relecture juridique,
// jur-J7 : aucun minuteur, aucun défilement sans geste). Il ressemble à Thumbnails, le seul autre
// ScrollView horizontal de l'appli.

import { layout, space } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform, ScrollView, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { Carousel, shadowReachBelow } from './Carousel'
import { Pressed } from './Pressed'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const label = fr.t(($) => $.explore.carousel)
const previous = fr.t(($) => $.explore.previous)
const next = fr.t(($) => $.explore.next)

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = {
  type: unknown
  props: Record<string, unknown>
  parent: Node | null
  children: (Node | string)[]
}

/** La bande elle-même : l'élément natif du ScrollView horizontal (RCTScrollView en test). */
const bandNode = (): Node => {
  let found: Node | null = null
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === 'RCTScrollView' && node.props.horizontal === true) found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error('no horizontal ScrollView rendered')
  return found
}
const scrollViewProps = (): Record<string, unknown> => bandNode().props

/**
 * R16 : la bande est mesurée, comme le navigateur le fait après le premier dessin. La fausse
 * ScrollView de Jest ne mesure rien : on lui fait dire sa largeur visible (`onLayout`), puis celle
 * de tout son contenu (`onContentSizeChange`). Avant, ni la page pré-rendue ni un test ne savent si
 * les cartes tiennent.
 */
const measureViewport = (viewport: number) =>
  fireEvent(bandNode() as never, 'layout', {
    persist: () => {},
    nativeEvent: { layout: { x: 0, y: 0, width: viewport, height: 240 } },
  })
const measureContent = (content: number) =>
  fireEvent(bandNode() as never, 'contentSizeChange', content, 240)
const measureBand = async (viewport: number, content: number) => {
  await measureViewport(viewport)
  await measureContent(content)
}

/** Une bande plus large que sa colonne : 1 500 points de cartes dans 600 de place. */
const overflowing = () => measureBand(600, 1500)

const titles = ['Carnet de cafés', 'Mon agent de recettes', 'Jardin partagé']

/** Trois cartes-liens, comme les cartes de testeurs : chacune doit rester atteignable. */
const cards = titles.map((title) => (
  <Pressed key={title} label={title} role="link" onPress={() => {}}>
    <Text>{title}</Text>
  </Pressed>
))

const band = () => (
  <Carousel label={label} previousLabel={previous} nextLabel={next}>
    {cards}
  </Carousel>
)

/**
 * `scrollTo` du faux ScrollView de React Native : une fonction simulée partagée par toutes les
 * bandes (sur le prototype). Remise à zéro avant chaque test : Jest garde ses appels d'un test à
 * l'autre (code-appli.md).
 */
const scrollTo = () =>
  (ScrollView.prototype as unknown as { scrollTo: jest.Mock }).scrollTo as jest.Mock

beforeEach(() => scrollTo().mockClear())

describe('Carousel', () => {
  it('is a region named by its label, with every card inside', async () => {
    await renderWithProviders(band())

    // Pas de getByRole sur le conteneur : il n'est pas « accessible » (il cacherait ses cartes à
    // VoiceOver). On lit le rôle de l'élément nommé, comme pour SettingsNav.
    expect(roleOf(screen.getByLabelText(label).props)).toBe('region')
    for (const title of titles) {
      expect(screen.getByRole('link', { name: title })).toBeTruthy()
    }
  })

  it('scrolls sideways, snapping from card to card', async () => {
    await renderWithProviders(band())

    const props = scrollViewProps()
    // Aimanté : la bande s'arrête sur une carte, par l'un des réglages de React Native.
    expect(
      props.snapToInterval !== undefined ||
        props.snapToOffsets !== undefined ||
        props.pagingEnabled === true,
    ).toBe(true)
  })

  it('has no arrows on a phone', async () => {
    await renderWithProviders(band())

    // Témoin : la bande et ses cartes sont là ; seules les flèches manquent.
    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: previous })).toBeNull()
    expect(screen.queryByRole('button', { name: next })).toBeNull()
  })

  it('offers « Projets précédents » and « Projets suivants » on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(band())
      // R16 : les flèches attendent de savoir que la bande déborde.
      await overflowing()

      expect(screen.getByRole('button', { name: previous })).toBeTruthy()
      expect(screen.getByRole('button', { name: next })).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('scrolls the band when an arrow is touched', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithProviders(band())
      await overflowing()
      expect(scrollTo()).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByRole('button', { name: next }))

      expect(scrollTo()).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })

  it('lets Tab reach every card on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(band())

      for (const title of titles) {
        const link = screen.getByRole('link', { name: title })
        // Dans le parcours de Tab : ni retiré (tabIndex -1), ni caché aux technologies d'assistance
        // par un parent.
        expect((link.props as Record<string, unknown>).tabIndex).not.toBe(-1)
        let parent = (link as unknown as Node).parent
        while (parent) {
          const props = parent.props
          expect(props['aria-hidden']).not.toBe(true)
          expect(props.importantForAccessibility).not.toBe('no-hide-descendants')
          parent = parent.parent
        }
      }
    } finally {
      jest.restoreAllMocks()
    }
  })

  // jur-J7 : un carrousel qui défile seul est un « motif sombre » ; celui-ci ne bouge que sous un
  // geste (le doigt, une flèche, le clavier).
  describe('left alone', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('never scrolls by itself', async () => {
      const setInterval = jest.spyOn(globalThis, 'setInterval')
      const frame = jest.spyOn(globalThis, 'requestAnimationFrame')
      await renderWithProviders(band())
      // Témoin : la bande est bien rendue, avec ses cartes (sinon le test passerait à vide).
      expect(screen.getByRole('link', { name: 'Jardin partagé' })).toBeTruthy()
      // Les images demandées au montage (l'enfoncement des cartes, Reanimated) ne comptent pas :
      // seules celles qui viendraient ensuite, sans geste, trahiraient une animation.
      frame.mockClear()

      await act(() => jest.advanceTimersByTime(10 * 60 * 1000))

      expect(scrollTo()).not.toHaveBeenCalled()
      expect(setInterval).not.toHaveBeenCalled()
      expect(frame).not.toHaveBeenCalled()
    })
  })
})

// Relecture de design R12, point 3 : l'ombre des cartes de la vitrine était coupée d'un trait
// droit sous la bande, qui ne lui laissait que `space.xs`.
describe('Carousel, the shadow of its cards (design review R12, point 3)', () => {
  /** Le style aplati de la bande, et celui de son contenu (son premier enfant). */
  const bandStyles = () => {
    let found: Node | null = null
    const visit = (node: Node | string) => {
      if (typeof node === 'string' || found) return
      if (node.type === 'RCTScrollView' && node.props.horizontal === true) found = node
      for (const child of node.children) visit(child)
    }
    visit(screen.root as unknown as Node)
    const scroller = found as unknown as Node
    // Le faux ScrollView de Jest garde `contentContainerStyle` en propriété de la bande.
    return {
      band: StyleSheet.flatten(scroller.props.style as StyleProp<ViewStyle>) ?? {},
      content:
        StyleSheet.flatten(scroller.props.contentContainerStyle as StyleProp<ViewStyle>) ?? {},
    }
  }
  const shadowed = () => (
    <Carousel label={label} previousLabel={previous} nextLabel={next} cardShadow="card">
      {cards}
    </Carousel>
  )

  it('keeps room under the cards for their whole shadow, read from the token', async () => {
    await renderWithProviders(shadowed())

    const { content } = bandStyles()
    // L'ombre `card` : 18 points de décalage et 40 de flou, lus dans le jeton.
    expect(shadowReachBelow('card')).toBe(58)
    expect(Number(content.paddingBottom)).toBeGreaterThanOrEqual(shadowReachBelow('card'))
  })

  it('moves nothing below the band: the extra room is taken back by its margin', async () => {
    await renderWithProviders(shadowed())

    const { band, content } = bandStyles()
    expect(Number(content.paddingBottom) + Number(band.marginBottom ?? 0)).toBe(space.xs)
  })

  it('keeps the band as it was without a card shadow (témoin, « Ils cherchent des testeurs »)', async () => {
    await renderWithProviders(band())

    const { band: scroller, content } = bandStyles()
    expect(content.paddingBottom).toBe(space.xs)
    expect(content.paddingTop).toBe(space.xs)
    expect(Number(scroller.marginBottom ?? 0)).toBe(0)
  })
})

// R16 (« La page ne bouge plus en arrivant », plan, choix 16) : sur ordinateur, les flèches se
// montraient tant que la bande n'était pas mesurée, puis disparaissaient quand les cartes tenaient
// (« À la une » sautait de 9 puis de 18 points). Désormais, tant que la bande n'est pas mesurée
// (la page pré-rendue comprise, qui ne mesure jamais rien), les flèches sont absentes de l'arbre :
// ni vues, ni lues, ni atteignables au clavier. Elles n'apparaissent que si la bande déborde, et
// l'en-tête garde la hauteur d'une flèche avec ou sans elles : rien ne bouge.
describe('Carousel, its arrows wait for the band to be measured (R16)', () => {
  let restoreWindow: () => void
  beforeEach(() => {
    restoreWindow = setDesktopWindow()
  })
  afterEach(() => {
    restoreWindow()
    jest.restoreAllMocks()
  })

  /** La bande d'« À la une » : un titre à gauche, les flèches à droite. */
  const featured = () => (
    <Carousel
      label={label}
      previousLabel={previous}
      nextLabel={next}
      header={<Text variant="headline">À la une</Text>}
    >
      {cards}
    </Carousel>
  )

  /** Les flèches présentes dans l'arbre, même cachées aux lecteurs d'écran. */
  const arrowsInTree = () =>
    [previous, next].filter(
      (name) =>
        screen.queryByRole('button', { name, includeHiddenElements: true }) !== null ||
        screen.queryByLabelText(name, { includeHiddenElements: true }) !== null,
    )

  it('shows no arrow before the band is measured, prerendered page included', async () => {
    // La page web pré-rendue : rien n'y est jamais mesuré.
    jest.replaceProperty(Platform, 'OS', 'web')
    await renderWithProviders(featured())

    // Témoin : la bande, son titre et ses cartes sont là.
    expect(screen.getByText('À la une')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
    expect(arrowsInTree()).toEqual([])

    // La largeur visible seule ne dit pas encore si les cartes tiennent.
    await measureViewport(600)
    expect(arrowsInTree()).toEqual([])
  })

  it('shows both arrows once the band overflows its column', async () => {
    await renderWithProviders(featured())
    // « Une fois » : pas avant que la bande soit mesurée.
    expect(arrowsInTree()).toEqual([])

    await overflowing()

    // Au début de la bande : on ne peut qu'avancer.
    expect(screen.getByRole('button', { name: previous })).toBeDisabled()
    expect(screen.getByRole('button', { name: next })).not.toBeDisabled()
  })

  it('shows no arrow when every card fits', async () => {
    await renderWithProviders(featured())
    // À aucun moment : ni avant la mesure, ni entre les deux mesures, ni après.
    expect(arrowsInTree()).toEqual([])
    await measureViewport(1200)
    expect(arrowsInTree()).toEqual([])
    await measureContent(900)
    expect(arrowsInTree()).toEqual([])

    // Témoin : la même bande, devenue plus large que sa colonne, montre ses flèches.
    await measureContent(1500)
    expect(arrowsInTree()).toEqual([previous, next])
  })

  it('keeps the header as tall as an arrow, with or without its arrows', async () => {
    await renderWithProviders(featured())

    // L'en-tête (le titre et la place des flèches) : la première pièce de la région. Il n'a ni rôle
    // ni nom ; seule sa hauteur compte ici. Au moins la taille d'une flèche, jamais une hauteur
    // fixe (à 200 %, un titre sur deux lignes serait coupé).
    const header = () => {
      const region = screen.getByLabelText(label) as unknown as Node
      const first = region.children.find((child): child is Node => typeof child !== 'string')
      if (!first) throw new Error('no header in the carousel')
      return StyleSheet.flatten(first.props.style as StyleProp<ViewStyle>) ?? {}
    }
    expect(screen.getByText('À la une')).toBeTruthy()
    expect(header().minHeight).toBe(layout.touchTarget)
    expect(header().height).toBeUndefined()

    await overflowing()
    expect(screen.getByRole('button', { name: next })).toBeTruthy()
    expect(header().minHeight).toBe(layout.touchTarget)
    expect(header().height).toBeUndefined()
  })
})
