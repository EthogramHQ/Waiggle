// Tests des onglets (refonte, tranche R2) : sur ordinateur, « Se connecter » et « Créer un compte »
// sont deux onglets d'un même panneau. Les rôles sont ceux des onglets d'une page web (tablist, tab,
// tabpanel), un seul panneau est affiché (celui de l'onglet choisi), et au clavier (web) : les
// flèches gauche et droite passent à l'onglet voisin, Début et Fin aux extrêmes, et Tab ne
// s'arrête que sur l'onglet choisi (« tabIndex itinérant », comme RadioGroup). Que l'adresse de la
// page suive l'onglet est l'affaire de l'écran (AuthPanel), pas du composant.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from './focus'
import { iconPaths } from './icons.generated'
import { type Tab, Tabs } from './Tabs'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Où le composant pose le focus du clavier (web) : le test compte les appels.
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

type TabKey = 'signIn' | 'signUp' | 'help'
const tabs: { key: TabKey; label: string; content: React.ReactNode }[] = [
  { key: 'signIn', label: 'Se connecter', content: <Text>Formulaire de connexion</Text> },
  { key: 'signUp', label: 'Créer un compte', content: <Text>Formulaire d’inscription</Text> },
  { key: 'help', label: 'Aide', content: <Text>Comment ça marche</Text> },
]

/** Des onglets qui gardent leur choix, comme dans un vrai panneau. */
const Sample = ({ start = 'signIn', onSelect }: { start?: TabKey; onSelect?: jest.Mock }) => {
  const [selected, setSelected] = useState<TabKey>(start)
  return (
    <Tabs
      label="Compte"
      tabs={tabs}
      selected={selected}
      onSelect={(next) => {
        onSelect?.(next)
        setSelected(next)
      }}
    />
  )
}

// Un nœud de l'arbre rendu, le peu qu'on en lit. RNTL ne trouve un rôle par getByRole que sur un
// élément « accessible », ce que le conteneur d'un groupe (tablist, tabpanel) ne doit pas être sur
// iOS (il cacherait ses enfants à VoiceOver) : on parcourt l'arbre nous-mêmes (RNTL 14 n'a plus
// findAll, voir code-appli.md).
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Les éléments natifs (type en texte : View, Text…) qui portent ce rôle. */
const hostsWithRole = (role: string): Node[] => {
  const found: Node[] = []
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    const { props } = node
    if (typeof node.type === 'string' && (props.role === role || props.accessibilityRole === role))
      found.push(node)
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** Le rôle d'un élément, qu'il soit écrit `role` (web) ou `accessibilityRole`. */
const roleOf = (props: Record<string, unknown>) => props.role ?? props.accessibilityRole
/** L'identifiant d'un élément, pour aria-controls et aria-labelledby (`id` devient `nativeID`). */
const idOf = (props: Record<string, unknown>) => props.nativeID ?? props.id

/** Le tabIndex de chaque onglet, dans l'ordre (des valeurs simples : voir code-appli.md). */
const tabIndexes = () =>
  screen.getAllByRole('tab').map((tab) => tab.props.tabIndex as number | undefined)

describe('Tabs', () => {
  it('is a tab list named by its label, with one tab per entry', async () => {
    await renderWithProviders(<Sample />)

    expect(roleOf(screen.getByLabelText('Compte').props)).toBe('tablist')
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Se connecter' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Créer un compte' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Aide' })).toBeTruthy()
  })

  it('announces the selected tab and shows only its panel', async () => {
    await renderWithProviders(<Sample />)

    expect(screen.getByRole('tab', { name: 'Se connecter', selected: true })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Créer un compte', selected: false })).toBeTruthy()
    expect(screen.getByText('Formulaire de connexion')).toBeTruthy()
    expect(screen.queryByText('Formulaire d’inscription')).toBeNull()
    expect(hostsWithRole('tabpanel')).toHaveLength(1)
  })

  it('links each tab to its panel, for screen readers', async () => {
    await renderWithProviders(<Sample start="signUp" />)

    const tab = screen.getByRole('tab', { name: 'Créer un compte' })
    const [panel] = hostsWithRole('tabpanel')
    expect(panel).toBeDefined()
    // L'onglet dit quel panneau il commande ; le panneau dit quel onglet le nomme.
    expect(tab.props['aria-controls']).toBeTruthy()
    expect(tab.props['aria-controls']).toBe(idOf(panel?.props ?? {}))
    expect(panel?.props['aria-labelledby']).toBeTruthy()
    expect(panel?.props['aria-labelledby']).toBe(idOf(tab.props))
  })

  it('shows the panel of the tab touched, and tells the screen which one', async () => {
    const onSelect = jest.fn()
    await renderWithProviders(<Sample onSelect={onSelect} />)

    await fireEvent.press(screen.getByRole('tab', { name: 'Créer un compte' }))

    expect(onSelect).toHaveBeenCalledWith('signUp')
    expect(screen.getByRole('tab', { name: 'Créer un compte', selected: true })).toBeTruthy()
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1)
    expect(screen.getByText('Formulaire d’inscription')).toBeTruthy()
    expect(screen.queryByText('Formulaire de connexion')).toBeNull()
  })

  // R7b, le coin des testeurs (planche validée 9, relecture du plan ui-B3) : « Appels » (mégaphone) et
  // « Retours » (bulle) portent une icône avant leur libellé. L'icône est un décor : l'onglet reste
  // nommé par son seul texte, et le lecteur d'écran ne lit rien de plus.
  describe('with icons (R7b)', () => {
    type CornerTab = 'calls' | 'feedback'
    const cornerTabs: readonly Tab<CornerTab>[] = [
      {
        key: 'calls',
        label: fr.t(($) => $.project.testers.tabs.calls),
        icon: 'megaphone-simple',
        content: <Text>Les appels</Text>,
      },
      {
        key: 'feedback',
        label: fr.t(($) => $.project.testers.tabs.feedback),
        icon: 'chat-circle-dots',
        content: <Text>Les retours</Text>,
      },
    ]

    /** Tous les éléments sous `node`, lui compris, dans l'ordre de lecture (en profondeur). */
    const inside = (node: Node): Node[] => [
      node,
      ...node.children.flatMap((child) => (typeof child === 'string' ? [] : inside(child))),
    ]
    /** La place du tracé de cette icône parmi les éléments de l'onglet (-1 : pas dessinée). */
    const iconAt = (nodes: Node[], icon: keyof typeof iconPaths) =>
      nodes.findIndex((node) => node.props.d === iconPaths[icon][0])
    /** La place du texte affiché de l'onglet parmi ses éléments. */
    const labelAt = (nodes: Node[], label: string) =>
      nodes.findIndex((node) => node.children.includes(label))

    it('shows an icon before each tab label, the tab still named by its text', async () => {
      await renderWithProviders(
        <Tabs
          label={fr.t(($) => $.project.testers.tabs.label)}
          tabs={cornerTabs}
          selected="calls"
          onSelect={() => {}}
        />,
      )

      for (const [label, icon] of [
        ['Appels', 'megaphone-simple'],
        ['Retours', 'chat-circle-dots'],
      ] as const) {
        // Le nom lu reste le texte seul, mot pour mot (pas « Appels, image »).
        const tab = screen.getByRole('tab', { name: label })
        expect(tab.props.accessibilityLabel ?? tab.props['aria-label']).toBe(label)
        const nodes = inside(tab as unknown as Node)
        // L'icône est dessinée dans l'onglet, avant son libellé.
        expect(iconAt(nodes, icon)).toBeGreaterThanOrEqual(0)
        expect(labelAt(nodes, label)).toBeGreaterThan(iconAt(nodes, icon))
      }
      // L'icône est cachée aux lecteurs d'écran : aucune image nommée dans la rangée.
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.queryByRole('image')).toBeNull()
      // Chaque onglet n'a que son icône : celle de l'autre onglet n'y est pas.
      const calls = inside(screen.getByRole('tab', { name: 'Appels' }) as unknown as Node)
      expect(iconAt(calls, 'chat-circle-dots')).toBe(-1)
    })

    it('draws no icon for a tab that has none (témoin)', async () => {
      await renderWithProviders(<Sample />)

      const nodes = inside(screen.getByRole('tab', { name: 'Se connecter' }) as unknown as Node)
      expect(nodes.some((node) => typeof node.props.d === 'string')).toBe(false)
      expect(labelAt(nodes, 'Se connecter')).toBeGreaterThanOrEqual(0)
    })
  })

  describe('on the web, with the keyboard', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      jest.mocked(focusWithoutScroll).mockClear()
    })
    afterEach(() => jest.restoreAllMocks())

    it('moves to the next or previous tab with the arrows, going round', async () => {
      const onSelect = jest.fn()
      await renderWithProviders(<Sample onSelect={onSelect} />)

      await fireEvent(
        screen.getByRole('tab', { name: 'Se connecter' }),
        'keyDown',
        key('ArrowRight'),
      )
      expect(screen.getByRole('tab', { name: 'Créer un compte', selected: true })).toBeTruthy()
      expect(onSelect).toHaveBeenLastCalledWith('signUp')

      await fireEvent(
        screen.getByRole('tab', { name: 'Créer un compte' }),
        'keyDown',
        key('ArrowRight'),
      )
      expect(screen.getByRole('tab', { name: 'Aide', selected: true })).toBeTruthy()

      // Après le dernier, la flèche revient au premier ; avant le premier, au dernier.
      await fireEvent(screen.getByRole('tab', { name: 'Aide' }), 'keyDown', key('ArrowRight'))
      expect(screen.getByRole('tab', { name: 'Se connecter', selected: true })).toBeTruthy()

      await fireEvent(
        screen.getByRole('tab', { name: 'Se connecter' }),
        'keyDown',
        key('ArrowLeft'),
      )
      expect(screen.getByRole('tab', { name: 'Aide', selected: true })).toBeTruthy()
      expect(onSelect).toHaveBeenLastCalledWith('help')
    })

    it('jumps to the first tab with Home and to the last with End', async () => {
      await renderWithProviders(<Sample start="signUp" />)

      await fireEvent(screen.getByRole('tab', { name: 'Créer un compte' }), 'keyDown', key('End'))
      expect(screen.getByRole('tab', { name: 'Aide', selected: true })).toBeTruthy()

      await fireEvent(screen.getByRole('tab', { name: 'Aide' }), 'keyDown', key('Home'))
      expect(screen.getByRole('tab', { name: 'Se connecter', selected: true })).toBeTruthy()
    })

    it('moves the keyboard focus onto the tab it selects with the arrows', async () => {
      await renderWithProviders(<Sample />)
      expect(focusWithoutScroll).not.toHaveBeenCalled()

      await fireEvent(
        screen.getByRole('tab', { name: 'Se connecter' }),
        'keyDown',
        key('ArrowRight'),
      )

      // Le focus suit l'onglet choisi : la personne qui tape Entrée ou Tab est bien sur lui.
      expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
      expect(jest.mocked(focusWithoutScroll).mock.calls[0]?.[0]).toBeTruthy()
    })

    it('is a single stop for Tab: the selected tab', async () => {
      await renderWithProviders(<Sample />)

      expect(tabIndexes()).toEqual([0, -1, -1])

      await fireEvent.press(screen.getByRole('tab', { name: 'Aide' }))
      expect(tabIndexes()).toEqual([-1, -1, 0])
    })

    it('leaves the other keys alone', async () => {
      const onSelect = jest.fn()
      await renderWithProviders(<Sample onSelect={onSelect} />)

      await fireEvent(
        screen.getByRole('tab', { name: 'Se connecter' }),
        'keyDown',
        key('ArrowDown'),
      )
      await fireEvent(screen.getByRole('tab', { name: 'Se connecter' }), 'keyDown', key('a'))

      // Les flèches haut et bas servent au défilement de la page : les onglets sont en ligne.
      expect(onSelect).not.toHaveBeenCalled()
      expect(screen.getByRole('tab', { name: 'Se connecter', selected: true })).toBeTruthy()
    })

    // react-native-web n'active à la barre d'espace que role="button" : sans aide, Espace sur un
    // onglet ne fait rien et fait défiler la page (relecture R2, C2).
    it('selects the tab with the space bar, without scrolling the page', async () => {
      const onSelect = jest.fn()
      const preventDefault = jest.fn()
      await renderWithProviders(<Sample onSelect={onSelect} />)

      await fireEvent(screen.getByRole('tab', { name: 'Aide' }), 'keyDown', {
        key: ' ',
        repeat: false,
        preventDefault,
      })

      expect(onSelect).toHaveBeenCalledWith('help')
      expect(preventDefault).toHaveBeenCalled()
      expect(screen.getByRole('tab', { name: 'Aide', selected: true })).toBeTruthy()
    })
  })
})
