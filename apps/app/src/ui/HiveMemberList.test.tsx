// Tests de la liste des membres d'une ruche (tranche R10, planche R10-Membres ; options 2 et 5 des
// planches ; relecture du plan, interface 13 ; choix de Louis du 14/11/2026, Q3). Sur le modèle de la
// liste des testeurs (`ui/TestersList`) :
// - chaque membre : sa photo, son nom en lien vers sa page, son pseudo, « Animateur » pour
//   l'animateur, « toi » pour soi ;
// - chez l'animateur (`canRemove`), un bouton « Retirer Tante Odile de la ruche » juste après le
//   nom-lien de chaque autre membre, jamais sur sa propre ligne (la confirmation est posée par
//   l'écran, qui reçoit le membre par `onRemove`) ;
// - un membre « réduit » (il a bloqué l'animateur) : son nom seul, sans photo, ni pseudo, ni lien,
//   mais l'animateur peut toujours le retirer ;
// - après un retrait (la liste reçue raccourcit), le focus va au membre suivant, au lieu de
//   retomber en haut de la page : au clavier (web) comme pour le lecteur d'écran (téléphone).
//
// L'API (plan R10, « API au contrat ») :
//   HiveMemberList({ members: HiveMember[]; canRemove: boolean;
//     onOpen: (member: HiveMember) => void; onRemove: (member: HiveMember) => void }).
import { layout } from '@ruche/brand'
import type { HiveMember } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import { lendWebPage } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HiveMemberList } from './HiveMemberList'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

afterEach(() => {
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const member = (
  id: string,
  name: string,
  handle: string | null,
  extra: Partial<HiveMember> = {},
): HiveMember => ({
  face: { id, name, avatarUrl: null },
  handle,
  role: 'member',
  isMe: false,
  reduced: false,
  ...extra,
})

/** La ruche « Famille » de la planche, vue par Papi Jean, son animateur (l'animateur d'abord). */
const JEAN = member('u-jean', 'Papi Jean', 'papi_jean', { role: 'animator', isMe: true })
const LEA = member('u-lea', 'Léa Moreau', 'lea_moreau')
const ODILE = member('u-odile', 'Tante Odile', 'tante_odile')
const INES = member('u-ines', 'Inès Haddad', 'ines_h')
const family = [JEAN, LEA, ODILE, INES]
const NAMES = family.map((one) => one.face.name)

const text = {
  animator: fr.t(($) => $.hives.page.animator),
  you: fr.t(($) => $.hives.page.you),
  remove: (name: string) => fr.t(($) => $.hives.page.removeNamed, { name }),
}

// --- Les outils ----------------------------------------------------------------------------------

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

/** Le membre dont parle un élément : le seul des quatre noms qu'il contient, sinon null. */
const memberIn = (node: unknown): string | null => {
  const found = NAMES.filter((name) => contentOf(node).includes(name))
  return found.length === 1 ? (found[0] ?? null) : null
}

/** Les liens et les boutons, dans l'ordre de l'arbre (celui du lecteur d'écran et de Tab). */
const controlsInOrder = () => {
  const controls = new Set<unknown>([
    ...screen.queryAllByRole('link'),
    ...screen.queryAllByRole('button'),
  ])
  const order: unknown[] = []
  const walk = (node: unknown) => {
    if (controls.has(node)) order.push(node)
    for (const child of (node as { children: unknown[] }).children) {
      if (typeof child !== 'string') walk(child)
    }
  }
  walk(screen.root)
  return order.map((node) => {
    const props = (node as { props: Record<string, unknown> }).props
    return String(props.accessibilityLabel ?? props['aria-label'] ?? contentOf(node))
  })
}

/** La hauteur qu'on peut toucher (taille minimale ou fixe, débord). */
const touchHeight = (node: ReturnType<typeof screen.getByRole>) => {
  const style = StyleSheet.flatten(node.props.style) as Record<string, unknown>
  const size = Math.max(
    typeof style?.minHeight === 'number' ? style.minHeight : 0,
    typeof style?.height === 'number' ? style.height : 0,
  )
  const slop: unknown = node.props.hitSlop
  const extra =
    typeof slop === 'number'
      ? 2 * slop
      : slop && typeof slop === 'object'
        ? Number((slop as Record<string, number>).top ?? 0) +
          Number((slop as Record<string, number>).bottom ?? 0)
        : 0
  return size + extra
}

const list = (members: HiveMember[], props: Partial<Parameters<typeof HiveMemberList>[0]> = {}) => (
  <HiveMemberList
    members={members}
    canRemove={false}
    onOpen={() => {}}
    onRemove={() => {}}
    {...props}
  />
)

// --- Les tests -----------------------------------------------------------------------------------

describe('HiveMemberList', () => {
  it('opens a member’s page from their name', async () => {
    const onOpen = jest.fn()
    await renderWithProviders(list(family, { onOpen }))

    await fireEvent.press(screen.getByRole('link', { name: containing('Tante Odile') }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(ODILE)
  })

  it('shows each handle, « Animateur » for the animator and « toi » for oneself', async () => {
    expect(text.you).toBe('toi')
    await renderWithProviders(list([{ ...JEAN, isMe: false }, LEA, { ...INES, isMe: true }]))

    expect(screen.getByText(containing('lea_moreau'))).toBeTruthy()
    expect(screen.getByText(containing('papi_jean'))).toBeTruthy()
    // Seuls dans leur texte, ou à côté du pseudo (« @ines_h · toi ») : un mot entier, une fois.
    expect(screen.getAllByText(new RegExp(`\\b${text.animator}\\b`))).toHaveLength(1)
    expect(screen.getAllByText(new RegExp(`\\b${text.you}\\b`))).toHaveLength(1)
  })

  it('names "Retirer Tante Odile de la ruche" beside the member link', async () => {
    expect(text.remove('Tante Odile')).toBe('Retirer Tante Odile de la ruche')
    const onRemove = jest.fn()
    await renderWithProviders(list(family, { canRemove: true, onRemove }))

    // Le bouton suit le nom-lien de son membre, avant celui du membre suivant.
    const order = controlsInOrder()
    // Le dernier contrôle qui nomme Tante Odile avant son bouton : son nom-lien.
    const link = order.findLastIndex(
      (name) => name.includes('Tante Odile') && !name.startsWith('Retirer'),
    )
    expect(link).toBeGreaterThanOrEqual(0)
    expect(order[link + 1]).toBe('Retirer Tante Odile de la ruche')

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Tante Odile de la ruche' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(ODILE)
  })

  it('offers to remove every other member, never oneself', async () => {
    await renderWithProviders(list(family, { canRemove: true }))

    for (const other of [LEA, ODILE, INES]) {
      expect(screen.getByRole('button', { name: text.remove(other.face.name) })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: text.remove('Papi Jean') })).toBeNull()
  })

  it('offers no removal to a member who is not the animator', async () => {
    await renderWithProviders(list([{ ...JEAN, isMe: false }, LEA, { ...INES, isMe: true }]))

    expect(screen.getByRole('link', { name: containing('Léa Moreau') })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull()
  })

  it('keeps « Retirer » at least 44 points high', async () => {
    await renderWithProviders(list(family, { canRemove: true }))

    expect(
      touchHeight(screen.getByRole('button', { name: text.remove('Léa Moreau') })),
    ).toBeGreaterThanOrEqual(layout.touchTarget)
  })

  it('shows a reduced member by name only, still removable by the animator', async () => {
    const reduced = member('u-max', 'Max Durand', null, { reduced: true })
    const onRemove = jest.fn()
    await renderWithProviders(list([JEAN, LEA, reduced], { canRemove: true, onRemove }))

    // Son nom seul : ni lien vers sa page, ni pseudo, ni photo.
    expect(screen.getByText('Max Durand')).toBeTruthy()
    expect(screen.getByRole('link', { name: containing('Léa Moreau') })).toBeTruthy() // témoin
    expect(screen.queryByRole('link', { name: containing('Max Durand') })).toBeNull()
    expect(screen.queryByLabelText('Max Durand')).toBeNull()
    expect(screen.getByText(containing('lea_moreau'))).toBeTruthy() // témoin : un pseudo est là
    expect(screen.queryByText(/null/)).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: text.remove('Max Durand') }))
    expect(onRemove).toHaveBeenCalledWith(reduced)
  })

  it('moves the focus to the next member after one is removed', async () => {
    // Sur le web, le focus du clavier ; une vue témoin donne le prototype des vues natives, dont on
    // écoute `focus` (comme TestersList.test.tsx).
    const restore = lendWebPage()
    const probe = createRef<View>()
    try {
      const page = (members: HiveMember[]) => (
        <>
          <View ref={probe} />
          {list(members, { canRemove: true })}
        </>
      )
      const view = await renderWithProviders(page(family))
      const proto = Object.getPrototypeOf(probe.current) as { focus?: () => void }
      const hadFocus = Object.hasOwn(proto, 'focus')
      if (typeof proto.focus !== 'function') proto.focus = () => {}
      const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
      try {
        const remove = screen.getByRole('button', { name: text.remove('Léa Moreau') })
        await fireEvent(remove, 'focus')
        await fireEvent.press(remove)
        focus.mockClear()

        // L'écran a confirmé, l'API a répondu : la liste reçue n'a plus Léa.
        await view.rerender(page([JEAN, ODILE, INES]))
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

        const focused = focus.mock.contexts.map(memberIn).filter(Boolean)
        // Un seul membre reçoit le focus : Tante Odile, qui suivait Léa.
        expect(focused).toEqual(['Tante Odile'])
      } finally {
        focus.mockRestore()
        if (!hadFocus) delete proto.focus
      }
    } finally {
      restore()
    }
  })

  it('moves the screen reader to the next member after one is removed, on a phone', async () => {
    const send = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {})
    const view = await renderWithProviders(list(family, { canRemove: true }))
    await fireEvent.press(screen.getByRole('button', { name: text.remove('Léa Moreau') }))
    send.mockClear()

    await view.rerender(list([JEAN, ODILE, INES], { canRemove: true }))
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

    const reached = send.mock.calls
      .filter(([, event]) => event === 'focus')
      .map(([node]) => memberIn(node))
    expect(reached).toEqual(['Tante Odile'])
  })

  it('moves no focus when the list first appears (témoin)', async () => {
    const send = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => {})
    send.mockClear()
    await renderWithProviders(list(family, { canRemove: true }))
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))

    expect(screen.getByRole('link', { name: containing('Léa Moreau') })).toBeTruthy()
    expect(send.mock.calls.filter(([, event]) => event === 'focus')).toEqual([])
  })
})
