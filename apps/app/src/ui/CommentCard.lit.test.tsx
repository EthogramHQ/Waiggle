// Tests de la carte éclairée (R8, « Voir en contexte », planche `R8-Contexte`) : quand on arrive
// d'une notification, le commentaire visé est éclairé de miel un court instant (`lit`), puis la
// teinte s'efface en 1,5 s ; avec « Réduire les animations », la teinte reste puis disparaît, sans
// aucun mouvement. Et `focusSelf()` pose le focus sur la carte elle-même (clavier sur le web,
// lecteur d'écran sur téléphone), pas sur une de ses actions.
//
// Le fond se lit ici par le style : c'est la règle même du composant (un écran, lui, ne lit jamais
// un style). Une teinte qui s'efface peut le faire par son opacité (une couche animée) ou en
// retirant son fond : `honeyShown()` accepte les deux.
import { palettes } from '@ruche/brand'
import type { CommentAuthor, CommentReply } from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, screen } from '@testing-library/react-native'
import { type ComponentProps, createRef, type ReactElement } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { labelOf, lendWebPage } from '../testing/arrivedFocus'
import { replyOf } from '../testing/comments'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { CommentCard, type CommentCardHandle } from './CommentCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » choisi par
// chaque test (useCalmMotion le lit).
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  // __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

// --- Les données ---------------------------------------------------------------------------------

const jean: CommentAuthor = {
  id: 'u8',
  name: 'Papi Jean',
  handle: 'papi_jean',
  avatarUrl: null,
  isTester: false,
}
const NOW = new Date('2026-11-12T14:00:00.000Z')
const BODY = 'On le regarde avec Yanis ce soir, garde-nous du café !'

const jeanReply: CommentReply = replyOf({
  id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
  author: jean,
  body: BODY,
  createdAt: new Date(NOW.getTime() - 12 * 60 * 1000).toISOString(),
})

const MENU = fr.t(($) => $.project.comments.menu, { nameOf: nameOf('fr', jean.name) })
const REPLY = fr.t(($) => $.project.comments.reply)

type CardProps = ComponentProps<typeof CommentCard>

/** La réponse de Papi Jean, vue par Léa, avec « Répondre » et « … » ; chaque test ajoute. */
const card = (props: Partial<CardProps> = {}): ReactElement => (
  <CommentCard
    comment={jeanReply}
    kind="reply"
    isMine={false}
    isProjectAuthor={false}
    menu={[{ label: 'Signaler', onPress: jest.fn() }]}
    onReply={jest.fn()}
    hiddenNote={null}
    onAuthorPress={jest.fn()}
    onMemberPress={jest.fn()}
    now={NOW}
    {...props}
  />
)

// --- Les outils ----------------------------------------------------------------------------------

type Node = {
  props: Record<string, unknown>
  parent: Node | null
  children: ReadonlyArray<Node | string>
}
const flat = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
/** Le style qu'une vue de Reanimated a en ce moment, sous Jest (ce que lit `getAnimatedStyle`). */
const animated = (node: Node) =>
  ((node.props.jestAnimatedStyle as { value?: Record<string, unknown> } | undefined)?.value ??
    {}) as Record<string, unknown>
const styleOf = (node: Node) => ({ ...flat(node), ...animated(node) })
const nodesOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]
const allNodes = () => nodesOf(screen.root as unknown as Node)
const chainOf = (node: Node): Node[] => {
  const chain: Node[] = []
  for (let at: Node | null = node; at; at = at.parent) chain.push(at)
  return chain
}
/** L'opacité vue à l'écran : le produit de celles de la vue et de ses ancêtres. */
const seenOpacity = (node: Node) =>
  chainOf(node).reduce((product, at) => product * Number(styleOf(at).opacity ?? 1), 1)

/** Vrai si un fond miel pâle (`highlightSoft`) se voit dans la carte. */
const honeyShown = () =>
  allNodes().some(
    (node) => styleOf(node).backgroundColor === palettes.day.highlightSoft && seenOpacity(node) > 0,
  )

/**
 * Les vues de la carte qui bougent ou pourraient bouger (une transformation, une animation d'entrée
 * ou de place). Une carte d'avant R8 en a déjà (l'avatar ajuste ses initiales, un bouton garde
 * `scale: 1` pour l'effet d'appui) : on compare donc à une carte non éclairée, rendue de même.
 */
const movingCount = () =>
  allNodes().filter((node) => {
    const transform = styleOf(node).transform
    return (
      (Array.isArray(transform) && transform.length > 0) ||
      node.props.entering !== undefined ||
      node.props.layout !== undefined
    )
  }).length

/** Le temps passe (faux minuteurs), et avec lui les animations de Reanimated. */
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

// --- La teinte -----------------------------------------------------------------------------------

describe('CommentCard lit', () => {
  it('stays plain without lit, as before R8', async () => {
    await renderWithProviders(card())

    expect(screen.getByText(BODY)).toBeTruthy() // témoin
    expect(honeyShown()).toBe(false)
  })

  it('lights the card with honey when it arrives lit', async () => {
    jest.useFakeTimers()
    await renderWithProviders(card({ lit: true }))

    expect(honeyShown()).toBe(true)
  })

  it('fades the honey away in about 1.5 s', async () => {
    jest.useFakeTimers()
    await renderWithProviders(card({ lit: true }))
    await wait(500)
    expect(honeyShown()).toBe(true)

    await wait(2000)

    expect(honeyShown()).toBe(false)
    // Le commentaire, lui, reste là, et ses actions aussi.
    expect(screen.getByText(BODY)).toBeTruthy()
    expect(screen.getByRole('button', { name: REPLY })).toBeTruthy()
  })

  it('keeps the tint then removes it without any movement when animations are reduced', async () => {
    reducedMotion.mockReturnValue(true)
    jest.useFakeTimers()
    const { unmount } = await renderWithProviders(card())
    const plain = movingCount()
    await unmount()
    await renderWithProviders(card({ lit: true }))

    expect(honeyShown()).toBe(true)
    // L'éclairage n'ajoute aucune vue qui bouge.
    expect(movingCount()).toBe(plain)

    await wait(2500)

    expect(honeyShown()).toBe(false)
    expect(movingCount()).toBe(plain)
  })

  it('does not take more room once lit: the text does not jump', async () => {
    jest.useFakeTimers()
    const { unmount } = await renderWithProviders(card({ lit: true }))

    // Chaque vue entre le texte et le haut de l'arbre : ni retrait ni marge verticale de plus
    // qu'une carte non éclairée (la teinte déborde sans pousser le texte, comme `highlighted`).
    const lit = chainOf(screen.getByText(BODY) as unknown as Node).map((node) => {
      const style = flat(node)
      return Number(style.paddingTop ?? style.padding ?? 0) + Number(style.marginTop ?? 0)
    })
    const litTotal = lit.reduce((sum, value) => sum + value, 0)
    await unmount()

    await renderWithProviders(card())
    const plain = chainOf(screen.getByText(BODY) as unknown as Node).map((node) => {
      const style = flat(node)
      return Number(style.paddingTop ?? style.padding ?? 0) + Number(style.marginTop ?? 0)
    })
    expect(litTotal).toBe(plain.reduce((sum, value) => sum + value, 0))
  })
})

// --- focusSelf -----------------------------------------------------------------------------------

describe('CommentCard focusSelf', () => {
  describe('on the web', () => {
    let restore: () => void
    beforeEach(() => {
      restore = lendWebPage()
    })
    afterEach(() => {
      restore()
    })

    it('puts the keyboard focus on the card itself, not on one of its actions', async () => {
      const probe = createRef<View>()
      const handle = createRef<CommentCardHandle>()
      await renderWithProviders(
        <>
          <View ref={probe} />
          {card({ handle })}
        </>,
      )
      const proto = Object.getPrototypeOf(probe.current) as { focus?: unknown }
      const hadFocus = Object.hasOwn(proto, 'focus')
      const original = proto.focus
      if (typeof proto.focus !== 'function') proto.focus = () => {}
      const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
      focus.mockClear()
      try {
        const result = handle.current?.focusSelf()

        expect(result).toBe(true)
        expect(focus).toHaveBeenCalledTimes(1)
        const target = focus.mock.contexts[0] as { props?: Record<string, unknown> } | undefined
        const label = labelOf(target)
        expect([MENU, REPLY, jean.name]).not.toContain(label)
        // La vue focalisée est celle qui contient le commentaire : on la retrouve dans l'arbre par
        // ses enfants (la `ref` d'une vue garde les mêmes `children` que l'élément rendu).
        const children = target?.props?.children
        const element = allNodes().find(
          (node) => children !== undefined && node.props.children === children,
        )
        expect(element).toBeDefined()
        const body = screen.getByText(BODY) as unknown as Node
        expect(chainOf(body).includes(element as Node)).toBe(true)
        // Une vue qu'on focalise par le code, sans entrer dans l'ordre de Tab.
        expect(element?.props.tabIndex).toBe(-1)
      } finally {
        focus.mockRestore()
        if (hadFocus) proto.focus = original
        else delete proto.focus
      }
    })
  })

  it('moves the screen reader to the card on phone', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const sent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    const handle = createRef<CommentCardHandle>()
    await renderWithProviders(card({ handle }))
    sent.mockClear()

    handle.current?.focusSelf()

    const toCard = sent.mock.calls.filter(([, kind]) => kind === 'focus')
    expect(toCard).toHaveLength(1)
    // Le cadre de la carte, qui contient le commentaire, et pas une de ses actions. (Sur téléphone,
    // `labelOf` d'une vue sans nom rend son premier texte, le nom de l'auteur : on ne s'y fie pas.)
    const target = toCard[0]?.[0] as unknown as { props?: Record<string, unknown> } | undefined
    expect([MENU, REPLY]).not.toContain(labelOf(target))
    const children = target?.props?.children
    const element = allNodes().find(
      (node) => children !== undefined && node.props.children === children,
    )
    expect(element).toBeDefined()
    expect(chainOf(screen.getByText(BODY) as unknown as Node).includes(element as Node)).toBe(true)
    expect(element?.props.accessibilityRole).not.toBe('button')
  })
})
