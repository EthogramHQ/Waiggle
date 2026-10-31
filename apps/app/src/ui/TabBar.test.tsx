// Tests de la barre d'onglets du téléphone (refonte, tranche R3, « La barre d'onglets ») : une
// région de navigation nommée, un lien par onglet (Fil, Explorer, Ruches, Moi) avec sa vraie adresse,
// l'onglet actif dit « page actuelle » aux lecteurs d'écran (web) et « sélectionné » (téléphone),
// le rond miel « + » est un bouton nommé « Publier », absent pour un compte suspendu, et « Moi »
// montre la photo du membre ou ses initiales. Les gestes : toucher un autre onglet appelle onPress
// une seule fois (même en double tape), toucher l'onglet déjà actif appelle onReselect.
//
// Le composant ne navigue pas lui-même : navigation/AppTabBar.tsx le branche sur le routeur. La
// goutte qui glisse d'un onglet à l'autre est l'affaire des captures, pas de Jest.
//
// TabBarHost est le cadre qui place la barre sous les pages et mesure sa hauteur, que les écrans
// lisent par useTabBarSpace() pour réserver la place en bas (ui/tabBarSpace.ts).
import { layout } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { TabBar, TabBarHost } from './TabBar'
import { Text } from './Text'
import { type TabKey, useTabBarSpace } from './tabBarSpace'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const { t } = createI18n('fr')

const tabs = [
  { key: 'feed', label: t(($) => $.nav.feed), href: '/' },
  { key: 'explore', label: t(($) => $.nav.explore), href: '/explore' },
  { key: 'hives', label: t(($) => $.nav.hives), href: '/hives' },
  { key: 'me', label: t(($) => $.nav.me), href: '/me' },
] as const satisfies readonly { key: TabKey; label: string; href: string }[]

const publish = { href: '/projects/new', label: t(($) => $.nav.publish) }

type BarProps = Partial<Parameters<typeof TabBar>[0]>

/** La barre avec des valeurs par défaut : Léa sans photo, Fil actif, « + » présent. */
const bar = (props: BarProps = {}) => (
  <TabBar
    tabs={tabs}
    active="feed"
    avatar={{ source: null, name: 'Léa Martin' }}
    publish={publish}
    onPress={() => {}}
    onReselect={() => {}}
    {...props}
  />
)

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

// Un nœud de l'arbre rendu, le peu qu'on en lit : on en parcourt les enfants pour connaître l'ordre
// de lecture, et pour trouver un élément natif par son type (RNTL 14 ne cherche que par rôle ou
// texte).
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Les éléments natifs de ce type (« Image ») dans l'arbre. */
const hostsOfType = (type: string): Node[] => {
  const found: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    if (node.type === type) found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** La position d'un élément dans l'ordre de lecture (un parcours de l'arbre, en profondeur). */
const readingOrder = (element: unknown): number => {
  let index = 0
  let found = -1
  const visit = (node: Node | string) => {
    if (typeof node === 'string' || found >= 0) return
    if (node === element) found = index
    index += 1
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

const link = (label: string) => screen.getByRole('link', { name: label })

/**
 * La hauteur de la zone qu'on peut toucher : celle de l'élément touchable (sa hauteur minimale),
 * plus le débord invisible (hitSlop) en haut et en bas. Même mesure que components.test.tsx.
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

describe('TabBar', () => {
  it('is a navigation landmark named « Navigation principale », with one link per tab', async () => {
    await renderWithProviders(bar())

    // Pas de getByRole sur le conteneur : il n'est pas « accessible » (il cacherait ses liens à
    // VoiceOver). On lit le rôle de l'élément nommé, comme pour SettingsNav.
    const region = screen.getByLabelText(t(($) => $.nav.label))
    expect(roleOf(region.props)).toBe('navigation')
    expect(screen.getAllByRole('link')).toHaveLength(4)
    for (const tab of tabs) {
      expect(link(tab.label).props.href).toBe(tab.href)
    }
  })

  it('tells screen readers which tab is current, on the web and on the phone', async () => {
    await renderWithProviders(bar({ active: 'explore' }))

    // Web : « page actuelle » (aria-current) ; téléphone : « sélectionné » (accessibilityState),
    // que le téléphone lit à la place d'aria-current (relecture de l'interface, ui-2).
    const active = link(t(($) => $.nav.explore))
    expect(active.props['aria-current']).toBe('page')
    expect(screen.getByRole('link', { name: t(($) => $.nav.explore), selected: true })).toBeTruthy()
    for (const label of [t(($) => $.nav.feed), t(($) => $.nav.hives), t(($) => $.nav.me)]) {
      expect(link(label).props['aria-current']).not.toBe('page')
      expect(screen.queryByRole('link', { name: label, selected: true })).toBeNull()
    }
  })

  it('marks no tab when none is active', async () => {
    await renderWithProviders(bar({ active: null }))

    expect(screen.getAllByRole('link')).toHaveLength(4) // témoin
    for (const tab of tabs) {
      expect(link(tab.label).props['aria-current']).not.toBe('page')
      expect(screen.queryByRole('link', { name: tab.label, selected: true })).toBeNull()
    }
  })

  it('shows « + » as a button named « Publier », which asks to publish', async () => {
    const onPress = jest.fn()
    await renderWithProviders(bar({ onPress }))

    await fireEvent.press(screen.getByRole('button', { name: t(($) => $.nav.publish) }))

    expect(onPress).toHaveBeenCalledWith('publish')
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('hides « + » for a suspended member, and keeps the four tabs', async () => {
    await renderWithProviders(bar({ publish: null }))

    expect(screen.queryByRole('button', { name: t(($) => $.nav.publish) })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(4) // témoin
  })

  it('shows the initials of the member on « Moi » without a photo', async () => {
    await renderWithProviders(bar({ avatar: { source: null, name: 'Léa Martin' } }))

    expect(screen.getByText('LM')).toBeTruthy()
    expect(hostsOfType('Image')).toHaveLength(0)
    // Le nom du lien reste « Moi », pas celui du membre.
    expect(link(t(($) => $.nav.me))).toBeTruthy()
  })

  it('shows the photo of the member on « Moi » when there is one', async () => {
    await renderWithProviders(
      bar({ avatar: { source: { uri: 'https://cdn.example/lea.jpg' }, name: 'Léa Martin' } }),
    )

    expect(hostsOfType('Image')[0]?.props.source).toEqual({
      uri: 'https://cdn.example/lea.jpg',
    })
    expect(screen.queryByText('LM')).toBeNull()
    expect(link(t(($) => $.nav.me))).toBeTruthy()
  })

  it('gives every tab and « + » a touch zone of at least 44 points', async () => {
    await renderWithProviders(bar())

    for (const tab of tabs) {
      expect(touchHeight(link(tab.label))).toBeGreaterThanOrEqual(layout.touchTarget)
    }
    const plus = screen.getByRole('button', { name: t(($) => $.nav.publish) })
    expect(touchHeight(plus)).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('calls onPress with the tab touched, and not onReselect', async () => {
    const onPress = jest.fn()
    const onReselect = jest.fn()
    await renderWithProviders(bar({ active: 'feed', onPress, onReselect }))

    await fireEvent.press(link(t(($) => $.nav.hives)))

    expect(onPress).toHaveBeenCalledWith('hives')
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onReselect).not.toHaveBeenCalled()
  })

  it('calls onPress once for a double tap on the same tab', async () => {
    const onPress = jest.fn()
    await renderWithProviders(bar({ active: 'feed', onPress }))

    // La seconde tape arrive avant que la page ait changé (la barre ignore encore le même onglet).
    const explore = link(t(($) => $.nav.explore))
    await fireEvent.press(explore)
    await fireEvent.press(explore)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('calls onReselect, not onPress, when the active tab is touched', async () => {
    const onPress = jest.fn()
    const onReselect = jest.fn()
    await renderWithProviders(bar({ active: 'explore', onPress, onReselect }))

    await fireEvent.press(link(t(($) => $.nav.explore)))

    expect(onReselect).toHaveBeenCalledWith('explore')
    expect(onReselect).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })
})

// Un composant témoin : il affiche la hauteur réservée en bas, lue par le contexte.
const Probe = () => {
  const { height } = useTabBarSpace()
  return <Text>{`height ${height}`}</Text>
}

describe('TabBarHost', () => {
  it('reserves no space when there is no bar', async () => {
    await renderWithProviders(
      <TabBarHost bar={null}>
        <Probe />
      </TabBarHost>,
    )

    expect(screen.getByText('height 0')).toBeTruthy()
    expect(screen.queryByLabelText(t(($) => $.nav.label))).toBeNull()
  })

  it('gives the screens the measured height of the bar', async () => {
    await renderWithProviders(
      <TabBarHost bar={bar()}>
        <Probe />
      </TabBarHost>,
    )

    // La barre est posée, mais rien n'est mesuré : Jest ne calcule aucune position.
    expect(screen.getByLabelText(t(($) => $.nav.label))).toBeTruthy()
    // L'appareil mesure la barre (onLayout) : fireEvent remonte jusqu'au cadre qui écoute.
    await fireEvent(screen.getByLabelText(t(($) => $.nav.label)), 'layout', {
      nativeEvent: { layout: { x: 0, y: 780, width: 390, height: 64 } },
    })

    // Au moins la hauteur mesurée (plus la zone du geste de l'appareil, nulle en test).
    const probe = screen.getByText(/^height \d+$/)
    const height = Number(String(probe.props.children).replace('height ', ''))
    expect(height).toBeGreaterThanOrEqual(64)
  })

  it('keeps the bar before the pages in the reading order', async () => {
    await renderWithProviders(
      <TabBarHost bar={bar()}>
        <Button label="Ouvrir le projet" onPress={() => {}} />
      </TabBarHost>,
    )

    // La barre vient avant le contenu dans l'ordre du clavier (relecture de l'interface) : le
    // premier onglet précède le bouton de la page dans l'arbre.
    const tab = readingOrder(link(t(($) => $.nav.feed)))
    const page = readingOrder(screen.getByRole('button', { name: 'Ouvrir le projet' }))
    expect(tab).toBeGreaterThanOrEqual(0)
    expect(page).toBeGreaterThan(tab)
  })
})
