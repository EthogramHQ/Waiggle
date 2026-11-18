// R14 (« Entrer dans un projet et en sortir ») : au retour d'un projet ouvert par une carte, la page
// restée dans la pile ne rejoue aucun de ses fondus. Screen en pose plusieurs (le contenu, le pied
// collé, la place collée) : la carte n'est que dans l'un d'eux, mais le drapeau « une carte a ouvert
// un projet » est celui de tout l'écran (`CoverReturnScope`), si bien que le pied ne refond pas non
// plus pendant que le contenu est déjà là.
//
// Comme dans Screen.fade.test.tsx, la route de l'écran vient d'un faux module piloté par un
// contexte, et l'opacité vue d'un élément est le produit de celles de ses ancêtres.
import { durations } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import type { ComponentType, ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { CoverArrival, CoverTransitionProvider, useCoverSource } from './coverTransition'
import { arrivalStyle } from './pageTransition'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// R17 : ScreenFade demande au moteur des passages comment la page arrive (`arrivalStyle`). Jest
// charge la version du téléphone, qui répond toujours `none` ; ces tests du web simulent un
// navigateur sans l'API View Transitions, où la page fond sur place (`fade`), comme
// ScreenFade.test.tsx.
jest.mock('./pageTransition', () => ({
  ...jest.requireActual('./pageTransition'),
  arrivalStyle: jest.fn(() => 'fade'),
}))

// La route de l'écran (voir l'en-tête). `require` dans la fabrique : Jest la remonte en tête.
jest.mock('./screenFocus', () => {
  const { createContext, useContext } = require('react')
  const Route = createContext({ focused: true, shown: 1 })
  return {
    MockRoute: Route.Provider,
    useScreenFocused: () => useContext(Route).focused,
    useScreenShownCount: () => useContext(Route).shown,
  }
})
type RouteState = { focused: boolean; shown: number }
const { MockRoute } = jest.requireMock<{
  MockRoute: ComponentType<{ value: RouteState; children: ReactNode }>
}>('./screenFocus')

jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit. */
type Node = { parent: Node | null; props: Record<string, unknown> }

const ownOpacity = (node: Node): number => {
  const fixed = StyleSheet.flatten(node.props.style as never) as { opacity?: number } | undefined
  const animated = node.props.jestAnimatedStyle
    ? (getAnimatedStyle(node as never) as { opacity?: number }).opacity
    : undefined
  return Number(animated ?? fixed?.opacity ?? 1)
}

const seenOpacity = (element: unknown): number => {
  let opacity = 1
  for (let node = element as Node | null; node; node = node.parent) opacity *= ownOpacity(node)
  return opacity
}

let source: ReturnType<typeof useCoverSource> | undefined

/** La carte du projet, dans le contenu de l'écran. */
function Card() {
  const cover = useCoverSource('p1')
  source = cover
  return (
    <View
      ref={(view) =>
        cover.ref(view ? { measureInWindow: (callback) => callback(16, 240, 358, 220) } : null)
      }
    />
  )
}

/** L'écran du membre (un contenu avec la carte, un pied collé) et, au-dessus, le projet ou rien. */
const stage = (route: RouteState, project: boolean) => (
  <CoverTransitionProvider>
    <MockRoute value={route}>
      <Screen title="Léa" footer={<Text>Pied de la page</Text>}>
        <Text>Les projets de Léa</Text>
        <Card />
      </Screen>
    </MockRoute>
    {project ? (
      <CoverArrival id="p1">
        <View />
      </CoverArrival>
    ) : null}
  </CoverTransitionProvider>
)

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

const footer = () => screen.getByText('Pied de la page')
const content = () => screen.getByText('Les projets de Léa')

/** Quitte l'écran (par la carte ou non), attend, puis revient : l'écran est de nouveau affiché. */
const leaveThenBack = async (byCard: boolean) => {
  const view = await renderWithProviders(stage({ focused: true, shown: 1 }, false))
  if (byCard) {
    await act(async () => {
      source?.capture(() => {})
    })
  }
  await view.rerender(stage({ focused: false, shown: 1 }, byCard))
  await wait(3000)
  await view.rerender(stage({ focused: true, shown: 2 }, false))
  return view
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  jest.mocked(useReducedMotion).mockReturnValue(false)
  jest.mocked(arrivalStyle).mockReturnValue('fade')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('Screen, back from a project opened by one of its cards (R14, web)', () => {
  it('replays none of its fades, the pinned footer included', async () => {
    await leaveThenBack(true)

    expect(seenOpacity(content())).toBe(1)
    expect(seenOpacity(footer())).toBe(1)
    await wait(durations.page / 2)
    expect(seenOpacity(footer())).toBe(1)
  })

  it('fades the content and the pinned footer in on a return by another way (témoin)', async () => {
    await leaveThenBack(false)

    expect(seenOpacity(content())).toBe(0)
    expect(seenOpacity(footer())).toBe(0)
  })
})
