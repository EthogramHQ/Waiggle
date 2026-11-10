// Tests des liens de la barre du haut sur ordinateur (refonte, tranche R3, « La barre du haut ») :
// Fil, Explorer, Ruches, le lien actif posé dans sa goutte. Une région de navigation nommée, un lien
// par entrée avec sa vraie adresse, l'actif dit « page actuelle » (web) et « sélectionné »
// (téléphone, relecture de l'interface du plan, ui-2 et ui-10), une zone de 44 points, une seule
// navigation pour une double tape, et aucune pour le lien de la page où l'on est déjà.
//
// Tranche RF (« La barre du haut reste en place ») : la goutte n'est plus statique. La barre est
// remontée à chaque page (une par écran, les pages quittées restent montées, cachées, sur le web) ;
// la goutte garde, dans le module, le cadre du dernier lien actif et glisse depuis lui quand sa page
// **devient affichée** (relecture du plan, ui-7) : ni à son montage, ni depuis une mesure à 0 d'une
// page cachée, et au retour sur une page restée montée aussi. Calme : elle apparaît directement.
//
// Le composant ne navigue pas lui-même : navigation/TopNav.tsx le branche sur le routeur et la
// table des chemins. L'aspect de la goutte est l'affaire des captures.
import { layout } from '@ruche/brand'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import type { Context } from 'react'
import { StyleSheet } from 'react-native'
import { getAnimatedStyle, useReducedMotion, withSpring, withTiming } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NavLinks, NavPhotoLink } from './NavLinks'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La page qui porte la barre est-elle affichée ? Chaque barre lit la réponse de son propre cadre
// (un contexte du test), comme deux pages montées l'une sous l'autre sur le web. `useIsFocused` et
// `useFocusEffect` d'Expo Router suivent ce même cadre : le signal « la page devient affichée »
// (ui/screenFocus.ts, U3) s'appuie sur l'un ou l'autre.
jest.mock('expo-router', () => {
  const { createContext, useContext, useEffect } = require('react')
  const mockFocus = createContext(true)
  return {
    MockFocus: mockFocus,
    useIsFocused: () => useContext(mockFocus),
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = useContext(mockFocus)
      useEffect(() => (focused ? effect() : undefined), [focused, effect])
    },
  }
})
const Focus = (jest.requireMock('expo-router') as { MockFocus: Context<boolean> }).MockFocus

// Reanimated, tel que le prépare jest.setup.ts, avec trois fonctions qu'on observe : le ressort
// (withSpring, la goutte qui glisse), le fondu (withTiming) et « Réduire les animations ».
// __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  }
})

const label = fr.t(($) => $.nav.label)

const links = [
  { key: 'feed', label: fr.t(($) => $.nav.feed), href: '/' },
  { key: 'explore', label: fr.t(($) => $.nav.explore), href: '/explore' },
  { key: 'hives', label: fr.t(($) => $.nav.hives), href: '/hives' },
] as const

type Key = (typeof links)[number]['key']

/** Les liens avec des valeurs par défaut : Fil actif. */
const nav = (props: { active?: Key | null; onPress?: (key: Key) => void } = {}) => (
  <NavLinks
    label={label}
    links={links}
    active={props.active === undefined ? 'feed' : props.active}
    onPress={props.onPress ?? (() => {})}
  />
)

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

const link = (name: string) => screen.getByRole('link', { name })

/**
 * La hauteur de la zone qu'on peut toucher : celle de l'élément touchable (sa hauteur minimale),
 * plus le débord invisible (hitSlop) en haut et en bas. Même mesure que TabBar.test.tsx.
 */
const touchHeight = (node: ReturnType<typeof screen.getByRole>): number => {
  const style = StyleSheet.flatten(node.props.style) as { minHeight?: unknown; height?: unknown }
  const own = Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
  const slop: unknown = node.props.hitSlop
  const extra =
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as { top?: number }).top ?? 0) +
          Number((slop as { bottom?: number }).bottom ?? 0)
        : 0
  return own + extra
}

describe('NavLinks', () => {
  it('is a navigation landmark with its name, and one link per entry with its address', async () => {
    await renderWithProviders(nav())

    // Pas de getByRole sur le conteneur : il n'est pas « accessible » (il cacherait ses liens à
    // VoiceOver). On lit le rôle de l'élément nommé, comme pour SettingsNav et TabBar.
    const region = screen.getByLabelText(label)
    expect(roleOf(region.props)).toBe('navigation')
    expect(screen.getAllByRole('link')).toHaveLength(links.length)
    for (const entry of links) {
      expect(link(entry.label).props.href).toBe(entry.href)
    }
  })

  it('tells screen readers which link is the current page, on the web and on the phone', async () => {
    await renderWithProviders(nav({ active: 'explore' }))

    const active = link(fr.t(($) => $.nav.explore))
    expect(active.props['aria-current']).toBe('page')
    expect(
      screen.getByRole('link', { name: fr.t(($) => $.nav.explore), selected: true }),
    ).toBeTruthy()
    for (const name of [fr.t(($) => $.nav.feed), fr.t(($) => $.nav.hives)]) {
      expect(link(name).props['aria-current']).not.toBe('page')
      expect(screen.queryByRole('link', { name, selected: true })).toBeNull()
    }
  })

  // Sur une page qui n'est d'aucun lien (une rubrique des réglages, une notification), aucun n'est
  // actif.
  it('marks no link when none is active', async () => {
    await renderWithProviders(nav({ active: null }))

    expect(screen.getAllByRole('link')).toHaveLength(links.length) // témoin
    for (const entry of links) {
      expect(link(entry.label).props['aria-current']).not.toBe('page')
      expect(screen.queryByRole('link', { name: entry.label, selected: true })).toBeNull()
    }
  })

  it('gives every link a touch zone of at least 44 points', async () => {
    await renderWithProviders(nav())

    for (const entry of links) {
      expect(touchHeight(link(entry.label))).toBeGreaterThanOrEqual(layout.touchTarget)
    }
  })

  it('calls onPress with the key of the link touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(nav({ active: 'feed', onPress }))

    await fireEvent.press(link(fr.t(($) => $.nav.hives)))

    expect(onPress).toHaveBeenCalledWith('hives')
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('calls onPress once for a double tap on the same link', async () => {
    const onPress = jest.fn()
    await renderWithProviders(nav({ active: 'feed', onPress }))

    // La seconde tape arrive avant que la page ait changé (le lien actif est encore « Fil »).
    const explore = link(fr.t(($) => $.nav.explore))
    await fireEvent.press(explore)
    await fireEvent.press(explore)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not navigate when the link of the current page is touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(nav({ active: 'explore', onPress }))

    await fireEvent.press(link(fr.t(($) => $.nav.explore)))

    expect(onPress).not.toHaveBeenCalled()
    // Témoin : les autres liens, eux, naviguent.
    await fireEvent.press(link(fr.t(($) => $.nav.feed)))
    expect(onPress).toHaveBeenCalledWith('feed')
  })
})

// La photo « Moi » de la barre du haut (R4, M10) : un lien nommé « Moi » avec sa vraie adresse, qui dit
// « page actuelle » sur sa page seulement, et n'empile pas une seconde fois cette page.
describe('NavPhotoLink', () => {
  const me = fr.t(($) => $.nav.me)
  const photo = (props: { current?: boolean; onPress?: () => void } = {}) => (
    <NavPhotoLink
      label={me}
      href="/me"
      current={props.current}
      onPress={props.onPress ?? (() => {})}
      name="Léa Moreau"
      source={null}
    />
  )

  it('is a link named « Moi » with its address, and not the current page elsewhere', async () => {
    await renderWithProviders(photo())

    const photoLink = link(me)
    expect(photoLink.props.href).toBe('/me')
    expect(photoLink.props['aria-current']).not.toBe('page')
    expect(screen.queryByRole('link', { name: me, selected: true })).toBeNull()
  })

  it('says it is the current page, on the web and on the phone, when its page is open', async () => {
    await renderWithProviders(photo({ current: true }))

    expect(link(me).props['aria-current']).toBe('page')
    expect(screen.getByRole('link', { name: me, selected: true })).toBeTruthy()
  })

  it('opens the page when touched', async () => {
    const onPress = jest.fn()
    await renderWithProviders(photo({ onPress }))

    await fireEvent.press(link(me))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not open its page a second time when it is already the current page', async () => {
    const onPress = jest.fn()
    await renderWithProviders(photo({ current: true, onPress }))

    expect(link(me)).toBeTruthy() // témoin : le lien est là
    await fireEvent.press(link(me))

    expect(onPress).not.toHaveBeenCalled()
  })
})

// RF (ui-7) : la goutte qui glisse d'une page à l'autre. Deux barres montées, comme sur le web : la
// page A (Fil actif) et la page B (Explorer actif), chacune dans son cadre « affichée ou non ».
//
// Ce que le test suppose du composant (noms choisis au plan des tests) :
// - chaque lien mesure son cadre par son propre `onLayout` (x relatif à la région, comme la goutte) ;
// - la goutte est une vue animée de la région, `testID="nav-drop"`, muette et intouchable ; sa
//   place se lit dans son style (`translateX`, ou `left`).
// Les tests de ce bloc partagent la mémoire du module (le cadre du dernier lien actif) : le premier
// part sans elle, et chacun la laisse sur le cadre du Fil.
describe('NavLinks drop between pages (RF, ui-7)', () => {
  type Frame = { x: number; y: number; width: number; height: number }
  const frames: Record<Key, Frame> = {
    feed: { x: 12, y: 4, width: 80, height: 44 },
    explore: { x: 96, y: 4, width: 110, height: 44 },
    hives: { x: 210, y: 4, width: 90, height: 44 },
  }
  const hidden: Frame = { x: 0, y: 0, width: 0, height: 0 }

  const spring = jest.mocked(withSpring)
  const timing = jest.mocked(withTiming)

  /** Les deux pages : A toujours montée, B montée quand on la demande. */
  const pages = ({ shown, withB }: { shown: 'a' | 'b'; withB: boolean }) => (
    <>
      <Focus.Provider value={shown === 'a'}>
        <NavLinks label={label} links={links} active="feed" onPress={() => {}} />
      </Focus.Provider>
      {withB ? (
        <Focus.Provider value={shown === 'b'}>
          <NavLinks label={label} links={links} active="explore" onPress={() => {}} />
        </Focus.Provider>
      ) : null}
    </>
  )

  /** La région de la page A (0) ou B (1). */
  const region = (page: 0 | 1) => {
    const found = screen.getAllByLabelText(label)[page]
    if (!found) throw new Error(`no navigation for page ${page}`)
    return found
  }

  /** Chaque lien d'une page mesure son cadre (ou 0 : la page est cachée). */
  const measureLinks = async (page: 0 | 1, frameOf: (key: Key) => Frame = (key) => frames[key]) => {
    for (const entry of links) {
      const onLayout = within(region(page)).getByRole('link', { name: entry.label }).props.onLayout
      if (typeof onLayout !== 'function') throw new Error('A link does not measure its frame')
      await act(async () => onLayout({ nativeEvent: { layout: frameOf(entry.key) } }))
    }
  }

  /** La place de la goutte d'une page, une fois son mouvement fini. */
  const dropX = (page: 0 | 1): number | undefined => {
    const drop = screen.getAllByTestId('nav-drop', { includeHiddenElements: true })[page]
    if (!drop) throw new Error(`no drop for page ${page}`)
    let animated: Record<string, unknown> = {}
    try {
      animated = getAnimatedStyle(drop) as Record<string, unknown>
    } catch {
      // Une vue sans style animé : sa place est dans son style simple.
    }
    const style = {
      ...((StyleSheet.flatten(drop.props.style) as Record<string, unknown> | undefined) ?? {}),
      ...animated,
    }
    const transform = Array.isArray(style.transform)
      ? (style.transform as Record<string, unknown>[])
      : []
    const shift = transform.find((step) => typeof step.translateX === 'number')?.translateX
    return typeof shift === 'number'
      ? shift
      : typeof style.left === 'number'
        ? style.left
        : undefined
  }

  /** Le ressort a-t-il été lancé vers cette place ? */
  const glidedTo = (x: number) => spring.mock.calls.some(([to]) => to === x)

  beforeEach(() => {
    spring.mockClear()
    timing.mockClear()
    jest.mocked(useReducedMotion).mockReturnValue(false)
  })

  it('places its drop under the active link without gliding, on the first page shown', async () => {
    await renderWithProviders(pages({ shown: 'a', withB: false }))

    await measureLinks(0)

    expect(dropX(0)).toBe(frames.feed.x)
    expect(glidedTo(frames.feed.x)).toBe(false)
  })

  it('waits for its page to be shown before moving, not for its mount', async () => {
    const view = await renderWithProviders(pages({ shown: 'a', withB: false }))
    await measureLinks(0)

    // La page B est montée, mesurée, mais pas encore affichée.
    await view.rerender(pages({ shown: 'a', withB: true }))
    await measureLinks(1)

    expect(screen.getAllByLabelText(label)).toHaveLength(2) // témoin : deux barres
    expect(glidedTo(frames.explore.x)).toBe(false)
  })

  it('glides from the frame of the last active link when its page becomes shown', async () => {
    const view = await renderWithProviders(pages({ shown: 'a', withB: false }))
    await measureLinks(0)
    await view.rerender(pages({ shown: 'a', withB: true }))
    await measureLinks(1)

    // B devient affichée ; A, cachée, mesure 0.
    await view.rerender(pages({ shown: 'b', withB: true }))
    await measureLinks(0, () => hidden)

    expect(glidedTo(frames.explore.x)).toBe(true)
    expect(dropX(1)).toBe(frames.explore.x)
  })

  it('ignores the zero frames of a hidden page, and glides back on return', async () => {
    const view = await renderWithProviders(pages({ shown: 'a', withB: false }))
    await measureLinks(0)
    await view.rerender(pages({ shown: 'a', withB: true }))
    await measureLinks(1)
    await view.rerender(pages({ shown: 'b', withB: true }))
    await measureLinks(0, () => hidden)
    spring.mockClear()

    // Retour sur A, restée montée : B se cache et mesure 0 ; A garde ses cadres d'avant.
    await view.rerender(pages({ shown: 'a', withB: true }))
    await measureLinks(1, () => hidden)

    expect(glidedTo(frames.feed.x)).toBe(true)
    expect(dropX(0)).toBe(frames.feed.x)
    // Une mesure à 0 n'a jamais servi de départ ni d'arrivée.
    expect(glidedTo(0)).toBe(false)
  })

  it('appears directly under the new link when animations are reduced', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const view = await renderWithProviders(pages({ shown: 'a', withB: false }))
    await measureLinks(0)
    await view.rerender(pages({ shown: 'a', withB: true }))
    await measureLinks(1)

    await view.rerender(pages({ shown: 'b', withB: true }))
    await measureLinks(0, () => hidden)

    expect(dropX(1)).toBe(frames.explore.x)
    expect(glidedTo(frames.explore.x)).toBe(false)
    expect(timing.mock.calls.some(([to]) => to === frames.explore.x)).toBe(false)
  })
})
