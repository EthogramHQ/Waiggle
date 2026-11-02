// Tests des illustrations des écrans de passage (ui/Illustrations.tsx) : l'emblème, le portail de
// la page de sortie et les alvéoles d'un projet introuvable. Elles respirent ou tournent ; avec
// « Réduire les animations », elles restent immobiles (relecture du plan R5a, ui-14 ; WCAG 2.2.2 :
// un mouvement qui démarre seul et dure plus de 5 secondes doit pouvoir s'arrêter). Elles décorent :
// le texte de la page dit tout, elles n'ont rien à lire. Le dessin se vérifie sur les captures.
import { screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { useReducedMotion, withRepeat, withTiming } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { Emblem, Honeycomb, PortalRings } from './Illustrations'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Reanimated, tel que le prépare jest.setup.ts, avec trois remplacements (comme HoneySphere.test) :
// le réglage « Réduire les animations » de l'appareil (que lit useCalmMotion), choisi par chaque
// test, et deux fonctions qu'on observe : la mise en boucle (withRepeat) et le fondu (withTiming).
// __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn(actual.withRepeat),
    withTiming: jest.fn(actual.withTiming),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)
const repeat = jest.mocked(withRepeat)
const timing = jest.mocked(withTiming)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les nœuds sous `node`, lui compris. */
const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

/** Vrai si un bloc caché aux lecteurs d'écran (iOS, Android ou web) est dessiné : le témoin. */
const drawnHidden = () =>
  everyNode(screen.root as unknown as Node).some(
    (node) =>
      node.props.accessibilityElementsHidden === true ||
      node.props.importantForAccessibility === 'no-hide-descendants',
  )

/**
 * L'illustration bouge-t-elle ? Un souffle ou une rotation passe soit par une boucle de Reanimated
 * (withRepeat), soit par des images demandées au navigateur (requestAnimationFrame), que Reanimated
 * utilise aussi pour animer.
 */
let frames: jest.SpyInstance
const looping = () => repeat.mock.calls.length > 0
const moving = () => looping() || frames.mock.calls.length > 0

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  repeat.mockClear()
  timing.mockClear()
  frames = jest.spyOn(globalThis, 'requestAnimationFrame')
  frames.mockClear()
})
afterEach(() => jest.restoreAllMocks())

const illustrations: [string, ReactElement][] = [
  ['Emblem', <Emblem key="emblem" icon="envelope-simple" />],
  ['PortalRings', <PortalRings key="portal" />],
  ['Honeycomb', <Honeycomb key="honeycomb" />],
]

describe.each(illustrations)('%s', (_name, illustration) => {
  // Témoin du test suivant : sans réglage, l'illustration bouge.
  it('moves when motion is allowed', async () => {
    await renderWithProviders(illustration)

    expect(drawnHidden()).toBe(true)
    expect(looping()).toBe(true)
  })

  it('stays still with reduced motion', async () => {
    reducedMotion.mockReturnValue(true)
    await renderWithProviders(illustration)

    expect(drawnHidden()).toBe(true) // témoin : elle est bien dessinée
    expect(looping()).toBe(false)
  })

  it('has nothing to read', async () => {
    await renderWithProviders(illustration)

    expect(drawnHidden()).toBe(true) // témoin
    expect(screen.queryByText(/./)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('Emblem and Honeycomb', () => {
  // Leur souffle (useBreath) : immobile, il ne demande même aucune image au navigateur.
  it.each([
    ['Emblem', <Emblem key="emblem" icon="check" />],
    ['Honeycomb', <Honeycomb key="honeycomb" />],
  ])('%s asks for no frame at all with reduced motion', async (_name, illustration) => {
    reducedMotion.mockReturnValue(true)
    await renderWithProviders(illustration)

    expect(drawnHidden()).toBe(true) // témoin
    expect(moving()).toBe(false)
  })
})

describe('PortalRings', () => {
  it('stays still when the calm look is asked for, whatever the device says', async () => {
    // Le catalogue montre l'allure calme à côté de l'autre, sur un appareil qui permet le mouvement.
    await renderWithProviders(<PortalRings calm />)

    expect(drawnHidden()).toBe(true) // témoin
    expect(looping()).toBe(false)
  })

  it('opens with a fade with reduced motion, which Reanimated does not skip', async () => {
    // Le fondu n'est pas un déplacement : sans `reduceMotion: Never`, Reanimated le sauterait
    // quand l'appareil demande moins de mouvement, et le portail apparaîtrait d'un coup.
    reducedMotion.mockReturnValue(true)
    await renderWithProviders(<PortalRings />)

    const fades = timing.mock.calls.filter(([to]) => to === 1)
    expect(fades.length).toBeGreaterThan(0)
    expect(fades.every(([, config]) => config?.reduceMotion === 'never')).toBe(true)
  })
})
