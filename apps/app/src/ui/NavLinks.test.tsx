// Tests des liens de la barre du haut sur ordinateur (refonte, tranche R3, « La barre du haut ») :
// Fil, Explorer, Ruches, le lien actif posé dans sa goutte (statique : sur ordinateur, la page
// change d'un coup). Une région de navigation nommée, un lien par entrée avec sa vraie adresse,
// l'actif dit « page actuelle » (web) et « sélectionné » (téléphone, relecture de l'interface du
// plan, ui-2 et ui-10), une zone de 44 points, une seule navigation pour une double tape, et aucune
// pour le lien de la page où l'on est déjà.
//
// Le composant ne navigue pas lui-même : navigation/TopNav.tsx le branche sur le routeur et la
// table des chemins. La goutte elle-même est l'affaire des captures.
import { layout } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NavLinks } from './NavLinks'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

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
