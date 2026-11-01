// Tests du carrousel (refonte, tranche R3, « Ils cherchent des testeurs » d'Explorer) : une bande
// horizontale de cartes, aimantée carte par carte ; une région nommée (« Projets qui cherchent des
// testeurs ») ; sur ordinateur, deux flèches nommées « Projets précédents » et « Projets
// suivants » qui font défiler la bande, absentes sur téléphone (le doigt suffit) ; au clavier,
// chaque carte se rejoint par Tab ; et la bande ne défile jamais seule (relecture juridique,
// jur-J7 : aucun minuteur, aucun défilement sans geste). Il ressemble à Thumbnails, le seul autre
// ScrollView horizontal de l'appli.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform, ScrollView } from 'react-native'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { Carousel } from './Carousel'
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
const scrollViewProps = (): Record<string, unknown> => {
  let found: Node | null = null
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found) return
    if (node.type === 'RCTScrollView' && node.props.horizontal === true) found = node
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  if (!found) throw new Error('no horizontal ScrollView rendered')
  return (found as Node).props
}

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
