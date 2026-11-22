// Tests du titre de Screen au focus à l'arrivée (R18, scénario « Le focus à l'arrivée sur une
// page ») : Screen donne son titre au module du focus à l'arrivée (`useArrivalTitle`,
// navigation/arrivalFocus.ts), qu'il soit affiché ou caché (`titleHidden` : Ruches, Fil). Après un
// passage (`focusArrival`), ce titre reçoit le focus sans devenir une étape de Tab (`tabIndex: -1`) ;
// le Tab suivant mène au premier contrôle sous lui. Seule la page affichée compte, pas une page
// restée montée dessous ; et la `titleRef` qu'un écran passe à Screen marche toujours.
//
// Jest n'a pas de navigateur : la page web prêtée n'a que `body` (qui a le focus) et répond à tout
// le reste sans rien trouver ; on écoute `focus` sur les vues natives (testing/arrivedFocus.tsx).
import { act, screen } from '@testing-library/react-native'
import { createRef, type ReactElement } from 'react'
import { Platform, View } from 'react-native'
import { focusArrival, rememberOrigin, resetArrivalFocus } from '../navigation/arrivalFocus'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import type { Focusable } from './focus'
import { Screen } from './Screen'
import { ScreenRouteScope } from './screenFocus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Un objet qui accepte tout : ce que la page prêtée rend pour ce qu'elle n'a pas. */
const loose = (): unknown =>
  new Proxy(() => {}, {
    get: (_target, key) =>
      key === Symbol.toPrimitive ? () => '' : key === 'then' ? undefined : loose(),
    set: () => true,
    apply: () => loose(),
  })

// `style` : le thème y écrit la couleur du fond de la page.
const body = { tagName: 'BODY', style: {}, contains: () => false }

/** Passe en « web », avec une page dont `body` a le focus. */
const lendPage = () => {
  jest.replaceProperty(Platform, 'OS', 'web')
  ;(globalThis as { document?: unknown }).document = new Proxy(
    { activeElement: body, body } as Record<string | symbol, unknown>,
    { get: (target, key) => (key in target ? target[key] : loose()), set: () => true },
  )
}

/** Les titres de la page (rôle `header` sur téléphone ; `heading` est son nom sur le web). */
const headingNamed = (name: string): Node => {
  const found = [...screen.queryAllByRole('header'), ...screen.queryAllByRole('heading')].filter(
    (node) => labelOf(node) === name,
  )
  expect(found).toHaveLength(1)
  return found[0] as unknown as Node
}

/** Les nœuds de l'arbre, dans l'ordre du document. */
const inOrder = (): Node[] => {
  const all: Node[] = []
  const walk = (node: Node | string) => {
    if (typeof node === 'string') return
    all.push(node)
    for (const child of node.children) walk(child)
  }
  walk(screen.root as unknown as Node)
  return all
}

/** Vrai pour un contrôle que Tab atteint : un bouton, un lien ou un champ, hors `tabIndex: -1`. */
const tabbable = (node: Node): boolean => {
  const role = node.props.role ?? node.props.accessibilityRole
  const control =
    role === 'button' || role === 'link' || typeof node.props.onChangeText === 'function'
  return control && node.props.tabIndex !== -1 && node.props.focusable !== false
}

/** Le premier contrôle que Tab atteint après `title`, dans l'ordre du document. */
const nextTabStop = (title: Node): string | undefined => {
  const nodes = inOrder()
  const inside = (node: Node) => {
    const below = new Set<Node>()
    const walk = (at: Node | string) => {
      if (typeof at === 'string') return
      below.add(at)
      for (const child of at.children) walk(child)
    }
    walk(title)
    return below.has(node)
  }
  const after = nodes
    .slice(nodes.indexOf(title) + 1)
    .find((node) => !inside(node) && tabbable(node))
  return after ? labelOf(after) : undefined
}

/** Le focus de chaque vue native, écouté sur leur prototype commun. */
const listenFocus = (probe: View | null) => {
  const proto = Object.getPrototypeOf(probe) as { focus?: () => void }
  const had = Object.hasOwn(proto, 'focus')
  const original = proto.focus
  if (typeof proto.focus !== 'function') proto.focus = () => {}
  const spy = jest.spyOn(proto as { focus: () => void }, 'focus')
  spy.mockClear()
  return {
    spy,
    restore: () => {
      spy.mockRestore()
      if (had) proto.focus = original
      else delete proto.focus
    },
  }
}

/** Rend `ui` avec une vue témoin, joue un passage, et dit quelles vues ont reçu le focus. */
const arriveOn = async (ui: ReactElement) => {
  const probe = createRef<View>()
  await renderWithProviders(
    <>
      <View ref={probe} />
      {ui}
    </>,
  )
  const focus = listenFocus(probe.current)
  try {
    rememberOrigin()
    await act(async () => {
      focusArrival()
      await jest.advanceTimersByTimeAsync(1000)
    })
    return { contexts: [...focus.spy.mock.contexts] as unknown[] }
  } finally {
    focus.restore()
  }
}

const follow = <Button label="Suivre" onPress={() => {}} />

beforeEach(() => {
  jest.useFakeTimers()
  resetArrivalFocus()
  lendPage()
})

afterEach(() => {
  resetArrivalFocus()
  delete (globalThis as { document?: unknown }).document
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('Screen and the arrival focus (web)', () => {
  it('gives the arrival focus to the shown title, outside the Tab order', async () => {
    const { contexts } = await arriveOn(
      <Screen width="page" title="Carnet de cafés">
        {follow}
      </Screen>,
    )

    const title = headingNamed('Carnet de cafés')
    expect(contexts.map(labelOf)).toEqual(['Carnet de cafés'])
    // Le titre prend le focus sans être une étape de Tab…
    expect(title.props.tabIndex).toBe(-1)
    // … et le Tab suivant mène au premier contrôle sous lui.
    expect(nextTabStop(title)).toBe('Suivre')
  })

  it('gives the arrival focus to the hidden title (titleHidden), outside the Tab order', async () => {
    const { contexts } = await arriveOn(
      <Screen width="page" title="Ruches" titleHidden>
        {follow}
      </Screen>,
    )

    const title = headingNamed('Ruches')
    expect(contexts.map(labelOf)).toEqual(['Ruches'])
    expect(title.props.tabIndex).toBe(-1)
    expect(nextTabStop(title)).toBe('Suivre')
  })

  it('keeps the titleRef given by the screen working with the arrival focus', async () => {
    const titleRef = createRef<Focusable>()
    const { contexts } = await arriveOn(
      <Screen width="page" title="Fil" titleRef={titleRef}>
        {follow}
      </Screen>,
    )

    // La ref de l'écran tient toujours la vue du titre (le Fil y pose le focus après « Nouveautés »)…
    expect(labelOf(titleRef.current)).toBe('Fil')
    expect(headingNamed('Fil')).toBeTruthy()
    // … et c'est cette même vue que le focus à l'arrivée a visée, une seule fois.
    expect(contexts).toEqual([titleRef.current])
  })

  it('focuses the title of the page shown, not that of a page kept underneath', async () => {
    const { contexts } = await arriveOn(
      <>
        <ScreenRouteScope focused={false}>
          <Screen width="page" title="Fil">
            {follow}
          </Screen>
        </ScreenRouteScope>
        <ScreenRouteScope focused>
          <Screen width="page" title="Carnet de cafés">
            {follow}
          </Screen>
        </ScreenRouteScope>
      </>,
    )

    expect(contexts.map(labelOf)).toEqual(['Carnet de cafés'])
  })
})
