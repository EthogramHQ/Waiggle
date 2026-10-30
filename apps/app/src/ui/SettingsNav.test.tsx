// Tests de la colonne des rubriques des réglages (refonte, tranche R2), celle de l'ordinateur : une
// zone de navigation nommée, un lien par rubrique, et la rubrique ouverte dite « page actuelle »
// aux lecteurs d'écran (aria-current). Sur téléphone, les réglages sont une liste (ListGroup), pas
// ce composant.
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { SettingsNav } from './SettingsNav'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La navigation d'Expo Router, remplacée : qu'elle passe par `useRouter().push` ou par `Link`, le
// test voit la même fausse fonction recevoir l'adresse. `require` dans la fabrique : Jest la
// remonte en tête du fichier, avant les imports.
const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    useRouter: () => ({ push: mockPush, replace: mockPush }),
    usePathname: () => '/settings/security',
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string
      children: unknown
      [prop: string]: unknown
    }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

const items = [
  { key: 'profile', label: 'Mon profil', href: '/settings/profile' },
  { key: 'notifications', label: 'Notifications', href: '/settings/notifications' },
  { key: 'security', label: 'Sécurité', href: '/settings/security' },
  { key: 'about', label: 'À propos', href: '/settings/about' },
]

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole

describe('SettingsNav', () => {
  beforeEach(() => mockPush.mockClear())

  it('is a navigation landmark named by its label, with one link per section', async () => {
    await renderWithProviders(<SettingsNav label="Réglages" items={items} current="security" />)

    // Pas de getByRole sur le conteneur : il n'est pas « accessible » (il cacherait ses liens à
    // VoiceOver). On lit le rôle de l'élément nommé, comme pour RadioGroup.
    expect(roleOf(screen.getByLabelText('Réglages').props)).toBe('navigation')
    expect(screen.getAllByRole('link')).toHaveLength(4)
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label })).toBeTruthy()
    }
  })

  it('tells screen readers which section is the current page, and only that one', async () => {
    await renderWithProviders(<SettingsNav label="Réglages" items={items} current="security" />)

    expect(screen.getByRole('link', { name: 'Sécurité' }).props['aria-current']).toBe('page')
    for (const label of ['Mon profil', 'Notifications', 'À propos']) {
      expect(screen.getByRole('link', { name: label }).props['aria-current']).not.toBe('page')
    }
  })

  it('gives each link the address of its section', async () => {
    await renderWithProviders(<SettingsNav label="Réglages" items={items} current="profile" />)

    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label }).props.href).toBe(item.href)
    }
  })

  it('opens the section touched', async () => {
    await renderWithProviders(<SettingsNav label="Réglages" items={items} current="profile" />)

    await fireEvent.press(screen.getByRole('link', { name: 'À propos' }))

    expect(mockPush).toHaveBeenCalledWith('/settings/about')
  })

  it('marks no section when none is current', async () => {
    await renderWithProviders(<SettingsNav label="Réglages" items={items} current={null} />)

    expect(screen.getAllByRole('link')).toHaveLength(4) // témoin
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label }).props['aria-current']).not.toBe('page')
    }
  })
})
