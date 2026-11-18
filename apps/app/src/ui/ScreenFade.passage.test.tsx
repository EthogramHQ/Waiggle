// Tests du fondu des pages pendant un passage de page (R17, scénario « Avancer et revenir, sur le
// web ») : `ScreenFade` lit, au rendu qui reconnaît l'arrivée de sa route, ce que le moteur des
// passages lui demande (`arrivalStyle()`, ui/pageTransition) :
// - `vt` : le navigateur anime (View Transitions), la page est là tout de suite, sans opacité 0 ni
//   bouclier (sinon il photographierait une page vide) ;
// - `none` : le retour, le bouton retour du navigateur, la première page : là tout de suite ;
// - `fade-up` : sans l'API, la page plus profonde fond en 320 ms en montant de 12 points ;
// - `fade` : un onglet voisin fond sur place, en 180 ms ;
// - sous « Réduire les animations », jamais de déplacement : un fondu seul.
//
// Le signal d'arrivée vient d'un faux `ui/screenFocus` (comme dans ScreenFade.test.tsx), la sorte
// de l'arrivée d'un faux `arrivalStyle`. Opacité et déplacement se lisent sur la page et tous ses
// ancêtres (styles fixes et styles animés de Reanimated).
import { durations, space } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import type { ComponentType, ReactNode } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { type ArrivalStyle, arrivalStyle } from './pageTransition'
import { ScreenFade } from './ScreenFade'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./pageTransition', () => ({
  ...jest.requireActual('./pageTransition'),
  arrivalStyle: jest.fn(() => 'none'),
}))
jest.mock('./screenFocus', () => {
  const { createContext, useContext } = require('react')
  const Route = createContext({ focused: true, shown: 1 })
  return {
    MockRoute: Route.Provider,
    useScreenFocused: () => useContext(Route).focused,
    useScreenShownCount: () => useContext(Route).shown,
  }
})
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

type RouteState = { focused: boolean; shown: number }
const { MockRoute } = jest.requireMock<{
  MockRoute: ComponentType<{ value: RouteState; children: ReactNode }>
}>('./screenFocus')

type Node = { parent: Node | null; props: Record<string, unknown> }
type Look = { opacity?: number; transform?: Record<string, number>[] }

/** Le style d'un nœud : son style animé (Reanimated) s'il en a un, sinon son style fixe. */
const looks = (node: Node): Look[] => {
  const fixed = (StyleSheet.flatten(node.props.style as never) ?? {}) as Look
  const animated = node.props.jestAnimatedStyle
    ? (getAnimatedStyle(node as never) as Look)
    : undefined
  return animated ? [fixed, animated] : [fixed]
}

/** L'opacité vue : le produit de celles de la page et de ses ancêtres. */
const seenOpacity = (element: unknown) => {
  let opacity = 1
  for (let node = element as Node | null; node; node = node.parent) {
    const [fixed, animated] = looks(node)
    opacity *= Number(animated?.opacity ?? fixed?.opacity ?? 1)
  }
  return opacity
}

/** Le déplacement vertical vu : la somme des `translateY` de la page et de ses ancêtres. */
const seenShift = (element: unknown) => {
  let shift = 0
  for (let node = element as Node | null; node; node = node.parent) {
    const [fixed, animated] = looks(node)
    const transform = animated?.transform ?? fixed?.transform ?? []
    for (const step of transform) shift += Number(step.translateY ?? 0)
  }
  return shift
}

const content = () => screen.getByText('Les projets de la semaine')
const shield = () => screen.queryByTestId('fade-shield', { includeHiddenElements: true })

const page = (shown: number) => (
  <MockRoute value={{ focused: shown > 0, shown }}>
    <ScreenFade>
      <Text>Les projets de la semaine</Text>
    </ScreenFade>
  </MockRoute>
)

/** Une page neuve montée, puis son arrivée, annoncée par le moteur de cette sorte. */
const arrive = async (style: ArrivalStyle) => {
  jest.mocked(arrivalStyle).mockReturnValue(style)
  const view = await renderWithProviders(page(0))
  await view.rerender(page(1))
  return view
}

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('ScreenFade during a page passage (web)', () => {
  // Premier du fichier : une page arrivée, comme celle qui ouvre la visite.
  it('shows the page at once when the browser animates the passage, without a shield', async () => {
    await arrive('vt')

    expect(seenOpacity(content())).toBe(1)
    expect(seenShift(content())).toBe(0)
    expect(shield()).toBeNull()
  })

  it('never hides a new page waiting for its arrival when the browser animates the passage', async () => {
    jest.mocked(arrivalStyle).mockReturnValue('vt')
    await renderWithProviders(page(0))

    // Le navigateur photographie la page d'arrivée : jamais vide.
    expect(seenOpacity(content())).toBe(1)
    expect(shield()).toBeNull()
  })

  it('shows the page before at once on the browser Back, without a fade', async () => {
    await arrive('none')

    expect(seenOpacity(content())).toBe(1)
    expect(shield()).toBeNull()
  })

  it('fades the deeper page in, rising from 12 points to its place, without the API', async () => {
    await arrive('fade-up')

    expect(seenOpacity(content())).toBe(0)
    expect(seenShift(content())).toBe(space.md)

    // 320 ms, pas 180 : encore en route après le fondu court.
    await wait(durations.page + 20)
    expect(seenOpacity(content())).toBeLessThan(1)

    await wait(durations.base)
    expect(seenOpacity(content())).toBe(1)
    expect(seenShift(content())).toBe(0)
  })

  it('cross-fades a sibling tab in place', async () => {
    await arrive('fade')

    expect(seenOpacity(content())).toBe(0)
    expect(seenShift(content())).toBe(0)

    await wait(durations.page + 50)
    expect(seenOpacity(content())).toBe(1)
  })

  it('fades without moving with reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    await arrive('fade-up')

    expect(seenOpacity(content())).toBe(0)
    expect(seenShift(content())).toBe(0)

    await wait(durations.page + 50)
    expect(seenOpacity(content())).toBe(1)
    expect(seenShift(content())).toBe(0)
  })
})
