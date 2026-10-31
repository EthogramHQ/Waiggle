// Tests de la sphère de miel de « Tu es à jour » (R4, F-Fil5) : le miel ondule doucement ; avec
// « Réduire les animations », il reste immobile (scénario R4 ; WCAG 2.2.2, comme la lumière
// d'ambiance). La sphère décore : le titre et le texte de « Tu es à jour » disent tout, elle n'a
// rien à lire. Le dessin lui-même se vérifie sur les captures.
import { screen } from '@testing-library/react-native'
import { useReducedMotion, withRepeat } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { HoneySphere } from './HoneySphere'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Reanimated, tel que le prépare jest.setup.ts, avec deux remplacements (comme LoadingLogo.test) :
// le réglage « Réduire les animations » de l'appareil (que lit useCalmMotion), choisi par chaque
// test, et la mise en boucle d'une animation (withRepeat), qu'on observe. __esModule et default :
// sans eux, `import Animated from …` ne retrouverait pas Animated.View.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn(actual.withRepeat),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)
const repeat = jest.mocked(withRepeat)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les nœuds sous `node`, lui compris. */
const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

/**
 * Vrai si la sphère est dessinée, en décor : un bloc caché aux lecteurs d'écran (iOS, Android ou
 * web), comme le miel de FeedEnd. Témoin des tests d'absence : un composant qui ne dessine rien
 * n'a ni mouvement, ni texte, ni image.
 */
const drawnHidden = () =>
  everyNode(screen.root as unknown as Node).some(
    (node) =>
      node.props.accessibilityElementsHidden === true ||
      node.props['aria-hidden'] === true ||
      node.props.importantForAccessibility === 'no-hide-descendants',
  )

/**
 * Le miel bouge-t-il ? Une ondulation passe soit par une boucle de Reanimated (withRepeat), soit
 * par des images demandées au navigateur (requestAnimationFrame), que Reanimated utilise aussi
 * pour animer : « aucune image demandée » interdit donc tout mouvement.
 */
let frames: jest.SpyInstance
const moving = () => repeat.mock.calls.length > 0 || frames.mock.calls.length > 0

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  repeat.mockClear()
  frames = jest.spyOn(globalThis, 'requestAnimationFrame')
  frames.mockClear()
})
afterEach(() => jest.restoreAllMocks())

describe('HoneySphere', () => {
  // Témoin du test suivant : sans réglage, le miel ondule.
  it('ripples gently when motion is allowed', async () => {
    await renderWithProviders(<HoneySphere />)

    expect(drawnHidden()).toBe(true)
    expect(moving()).toBe(true)
  })

  it('stands still with « Réduire les animations »', async () => {
    reducedMotion.mockReturnValue(true)
    await renderWithProviders(<HoneySphere />)

    expect(drawnHidden()).toBe(true) // la sphère est dessinée, immobile
    expect(moving()).toBe(false)
  })

  it('is a decoration, with nothing for a screen reader to read', async () => {
    await renderWithProviders(<HoneySphere />)

    expect(drawnHidden()).toBe(true) // témoin : la sphère est dessinée
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByText(/./)).toBeNull()
  })
})
