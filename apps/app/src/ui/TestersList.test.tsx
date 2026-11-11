// Tests de la liste des testeurs du coin (R7b ; planche validée 1, relecture du plan ui-B8, juridique
// J5). En haut du coin des testeurs, « 12 testeurs » :
// - pour un testeur (`testers` null : les testeurs ne se voient pas entre eux), un simple texte ;
// - pour l'auteur, un bouton qui déplie la liste (`Disclosure` sans pastille) : les 4 inscrits les
//   plus récents, puis « Afficher les 8 autres ». Après ce bouton, le focus va au premier testeur
//   nouvellement montré (le bouton disparu, il retomberait sinon en haut de la page) ;
// - chaque testeur : sa photo, son nom, « depuis le 3 nov. », et un menu « Actions pour Inès Morel »
//   qui propose « Retirer des testeurs » (la confirmation est posée par l'écran).
//
// L'API (plan R7b, « Briques du fil et du coin, API fixée ») :
// `TestersList({ count: number, testers: { id: string, name: string, avatar: ImageSource | null,
//   since: string }[] | null, onRemove?: (id: string) => void })`.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { lendWebPage } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TestersList } from './TestersList'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const NAMES = [
  'Inès Morel',
  'Sam Petit',
  'Hugo Lefèvre',
  'Zoé Martin',
  'Nora Benali',
  'Max Durand',
  'Lina Costa',
  'Yanis Roux',
  'Chloé Faure',
  'Théo Garnier',
  'Emma Lopez',
  'Paul Vidal',
] as const

/** Douze testeurs, du plus récent inscrit au plus ancien (l'ordre du contrat). */
const twelve = NAMES.map((name, index) => ({
  id: `t${index + 1}`,
  name,
  avatar: null,
  since: new Date(Date.UTC(2026, 10, 10 - index, 9)).toISOString(),
}))

const text = {
  count: (count: number) => fr.t(($) => $.project.testers.count, { count }),
  showMore: (count: number) => fr.t(($) => $.project.testers.list.showMore, { count }),
  menu: (name: string) => fr.t(($) => $.project.testers.list.menu, { name }),
  remove: fr.t(($) => $.project.testers.remove),
}

// --- Les outils ----------------------------------------------------------------------------------

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Le texte et les noms lus d'un élément et de tout ce qu'il contient, cachés compris. */
const contentOf = (node: unknown): string => {
  const props = (node as { props?: Record<string, unknown> } | null)?.props
  if (!props) return ''
  const own = [props.accessibilityLabel, props['aria-label']].filter(
    (name): name is string => typeof name === 'string',
  )
  const visit = (child: unknown): string => {
    if (typeof child === 'string') return child
    if (Array.isArray(child)) return child.map(visit).join(' ')
    const inner = (child as { props?: Record<string, unknown> } | null)?.props
    if (!inner) return ''
    const named = [inner.accessibilityLabel, inner['aria-label']].filter(
      (name): name is string => typeof name === 'string',
    )
    return [...named, visit(inner.children)].join(' ')
  }
  return [...own, visit(props.children)].join(' ')
}

/** Le testeur dont parle un élément : le seul des douze noms qu'il contient, sinon null. */
const testerIn = (node: unknown): string | null => {
  const found = NAMES.filter((name) => contentOf(node).includes(name))
  return found.length === 1 ? (found[0] ?? null) : null
}

/** L'état replié ou déplié, tel que le lit le web (`aria-expanded`) et le téléphone. */
const expandedOf = (node: unknown) => {
  const { props } = node as Host
  const phone = (props.accessibilityState as { expanded?: boolean } | undefined)?.expanded
  // Sous Jest, le Pressable reste celui de React Native même avec Platform.OS = 'web' : il range
  // aria-expanded dans accessibilityState sans le poser sur la vue (comme Disclosure.test.tsx).
  return { web: props['aria-expanded'] ?? phone, phone }
}

const countButton = (count = 12) => screen.getByRole('button', { name: text.count(count) })

/** Les testeurs montrés : ceux dont le menu est là. */
const shownTesters = () =>
  NAMES.filter((name) => screen.queryByRole('button', { name: text.menu(name) }) !== null)

const author = (onRemove: (id: string) => void = () => {}) => (
  <TestersList count={12} testers={twelve} onRemove={onRemove} />
)

// --- Les tests -----------------------------------------------------------------------------------

describe('TestersList', () => {
  it('shows « 12 testeurs » as plain text to a tester', async () => {
    await renderWithProviders(<TestersList count={12} testers={null} />)

    expect(text.count(12)).toBe('12 testeurs')
    expect(screen.getByText('12 testeurs')).toBeTruthy()
    // Rien à toucher : ni bouton, ni état replié, ni nom de testeur.
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    for (const name of NAMES) expect(screen.queryByText(name)).toBeNull()
  })

  it('says « 1 testeur » for a single tester', async () => {
    await renderWithProviders(<TestersList count={1} testers={null} />)

    expect(screen.getByText('1 testeur')).toBeTruthy()
  })

  it('expands the testers list from « 12 testeurs », state read on web and phone', async () => {
    for (const os of ['ios', 'web'] as const) {
      jest.replaceProperty(Platform, 'OS', os)
      const view = await renderWithProviders(author())

      // Replié : le bouton le dit, et aucun testeur n'est montré.
      const collapsed = expandedOf(countButton())
      expect({ os, state: os === 'web' ? collapsed.web : collapsed.phone }).toEqual({
        os,
        state: false,
      })
      expect(shownTesters()).toEqual([])

      await fireEvent.press(countButton())

      const expanded = expandedOf(countButton())
      expect({ os, state: os === 'web' ? expanded.web : expanded.phone }).toEqual({
        os,
        state: true,
      })
      // Les 4 plus récents, dans l'ordre reçu, puis « Afficher les 8 autres ».
      expect(shownTesters()).toEqual(NAMES.slice(0, 4))
      expect(screen.getByRole('button', { name: text.showMore(8) })).toBeTruthy()

      await view.unmount()
      jest.restoreAllMocks()
    }
  })

  it('writes the name and « depuis le … » of each shown tester', async () => {
    await renderWithProviders(author())
    await fireEvent.press(countButton())

    for (const name of NAMES.slice(0, 4)) expect(screen.getByText(name)).toBeTruthy()
    expect(screen.getAllByText(/^depuis le\s/)).toHaveLength(4)
  })

  it('shows every tester after « Afficher les 8 autres », and the button goes', async () => {
    await renderWithProviders(author())
    await fireEvent.press(countButton())

    expect(text.showMore(8)).toBe('Afficher les 8 autres')
    await fireEvent.press(screen.getByRole('button', { name: text.showMore(8) }))

    expect(shownTesters()).toEqual([...NAMES])
    expect(screen.queryByRole('button', { name: text.showMore(8) })).toBeNull()
  })

  it('offers no « Afficher » button when four testers or fewer are listed', async () => {
    await renderWithProviders(
      <TestersList count={4} testers={twelve.slice(0, 4)} onRemove={() => {}} />,
    )
    await fireEvent.press(countButton(4))

    expect(shownTesters()).toEqual(NAMES.slice(0, 4))
    expect(screen.queryByRole('button', { name: /^Afficher/ })).toBeNull()
  })

  it('says « Afficher l’autre testeur » when one more is left', async () => {
    await renderWithProviders(
      <TestersList count={5} testers={twelve.slice(0, 5)} onRemove={() => {}} />,
    )
    await fireEvent.press(countButton(5))

    expect(screen.getByRole('button', { name: text.showMore(1) })).toBeTruthy()
  })

  it('moves the focus to the first newly shown tester after « Afficher les 8 autres »', async () => {
    // Sur le web, le focus du clavier ; sur téléphone, le lecteur d'écran (`moveReaderTo`). Une vue
    // témoin donne le prototype des vues natives, dont on écoute `focus`.
    const restore = lendWebPage()
    const probe = createRef<View>()
    try {
      await renderWithProviders(
        <>
          <View ref={probe} />
          {author()}
        </>,
      )
      const proto = Object.getPrototypeOf(probe.current) as { focus?: () => void }
      const hadFocus = Object.hasOwn(proto, 'focus')
      if (typeof proto.focus !== 'function') proto.focus = () => {}
      const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
      try {
        await fireEvent.press(countButton())
        const more = screen.getByRole('button', { name: text.showMore(8) })
        await fireEvent(more, 'focus')
        focus.mockClear()
        await fireEvent.press(more)
        // Le focus peut attendre l'image suivante, le temps que les nouvelles lignes soient là.
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

        const focused = focus.mock.contexts.map(testerIn).filter(Boolean)
        // Un seul testeur reçoit le focus : le cinquième, premier des nouveaux venus.
        expect(focused).toEqual([NAMES[4]])
      } finally {
        focus.mockRestore()
        if (!hadFocus) delete proto.focus
      }
    } finally {
      restore()
    }
  })

  it('moves the screen reader to the first newly shown tester on a phone', async () => {
    const send = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {})
    await renderWithProviders(author())
    await fireEvent.press(countButton())
    send.mockClear()

    await fireEvent.press(screen.getByRole('button', { name: text.showMore(8) }))
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

    const reached = send.mock.calls
      .filter(([, event]) => event === 'focus')
      .map(([node]) => testerIn(node))
    expect(reached).toEqual([NAMES[4]])
  })

  it('offers « Retirer des testeurs » in the menu of each tester', async () => {
    const onRemove = jest.fn()
    await renderWithProviders(author(onRemove))
    await fireEvent.press(countButton())

    expect(text.menu('Sam Petit')).toBe('Actions pour Sam Petit')
    await fireEvent.press(screen.getByRole('button', { name: text.menu('Sam Petit') }))
    await fireEvent.press(screen.getByRole('menuitem', { name: text.remove }))

    expect(onRemove).toHaveBeenCalledWith('t2')
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('offers no menu when the author cannot remove anyone', async () => {
    // Sans `onRemove` (coin fermé, lecture seule), la liste se lit sans action.
    await renderWithProviders(<TestersList count={12} testers={twelve} />)
    await fireEvent.press(countButton())

    expect(screen.getByText(NAMES[0])).toBeTruthy() // témoin
    expect(shownTesters()).toEqual([])
  })

  it('gives the focus to « 0 testeur » when the screen asks, the list now empty (R7b, K5)', async () => {
    // Sur téléphone, le lecteur d'écran est amené sur le bouton qui déplie la liste.
    const reader = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    reader.mockClear()
    const handle = createRef<import('./TestersList').TestersListHandle>()
    await renderWithProviders(
      <TestersList count={0} testers={[]} onRemove={() => {}} initiallyOpen handle={handle} />,
    )

    let given = false
    await act(async () => {
      given = handle.current?.focusToggle() ?? false
    })

    expect(given).toBe(true)
    const [node] = reader.mock.calls.at(-1) ?? []
    expect(contentOf(node)).toContain(text.count(0))
  })
})
