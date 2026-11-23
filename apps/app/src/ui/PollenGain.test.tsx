// Tests de la pastille de gain (R19, planche R19-Pastille) : « +2 pollen » monte un instant près du
// bouton du geste qui l'a rapporté, puis s'efface. La pastille se voit sans être lue (elle est
// cachée aux lecteurs d'écran) ; ce qu'ils entendent, c'est une annonce polie, une phrase entière :
// « 2 pollen gagnés. ». Elle passe en file (`queue: true`, relecture d'interface UI-5) : jamais
// par-dessus la phrase en cours.
//
// `trigger` est la clé de rejeu : la pastille joue (mouvement et annonce) à son arrivée et chaque
// fois que la clé change, jamais quand l'écran se redessine avec la même clé.
//
// « Réduire les animations » : la pastille apparaît et s'efface sur place (un fondu), sans monter.
// Le mouvement se lit ici par le style (`jestAnimatedStyle`) : c'est la règle même du composant.
import { act, screen, within } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { PollenGain } from './PollenGain'

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
  jest.useFakeTimers()
  reducedMotion.mockReturnValue(false)
})
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

// --- Les textes ----------------------------------------------------------------------------------

/** La pastille dessinée, « +2 pollen ». */
const pastille = (amount: number) => fr.t(($) => $.game.gain, { amount })
/** L'annonce polie, « 2 pollen gagnés. » (pluriel selon le nombre). */
const gained = (count: number) => fr.t(($) => $.game.gained, { count })

const gain = (amount: number, trigger: number): ReactElement => (
  <PollenGain amount={amount} trigger={trigger} placement="above" />
)

// --- Les outils ----------------------------------------------------------------------------------

type Node = {
  props: Record<string, unknown>
  children: ReadonlyArray<Node | string>
}
const flat = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>
/** Le style qu'une vue de Reanimated a en ce moment, sous Jest. */
const animated = (node: Node) =>
  ((node.props.jestAnimatedStyle as { value?: Record<string, unknown> } | undefined)?.value ??
    {}) as Record<string, unknown>
const nodesOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]

/** Vrai si une vue de la pastille est déplacée en ce moment (une translation non nulle). */
const translated = () =>
  nodesOf(screen.root as unknown as Node).some((node) => {
    const transform = { ...flat(node), ...animated(node) }.transform
    if (!Array.isArray(transform)) return false
    return transform.some((step: Record<string, unknown>) =>
      ['translateX', 'translateY'].some(
        (axis) => axis in step && Number.parseFloat(String(step[axis])) !== 0,
      ),
    )
  })

/** Regarde la pastille à plusieurs instants de son mouvement ; vrai si elle a bougé à l'un d'eux. */
const movedDuringPlay = async () => {
  let moved = translated()
  for (const step of [16, 50, 100, 200, 400, 800]) {
    await act(async () => {
      jest.advanceTimersByTime(step)
    })
    moved = moved || translated()
  }
  return moved
}

/** Les annonces faites à VoiceOver (les deux façons de demander une lecture). */
const spyAnnouncements = () => {
  const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
  const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
  plain.mockClear()
  queued.mockClear()
  return { plain, queued }
}

// --- Les tests -----------------------------------------------------------------------------------

describe('PollenGain', () => {
  it('shows « +2 pollen » to the eye and hides it from screen readers', async () => {
    await renderWithProviders(gain(2, 1))

    // Dessinée…
    expect(screen.getByText(pastille(2), { includeHiddenElements: true })).toBeTruthy()
    // … mais absente de l'arbre lu : l'annonce dit déjà la même chose, en phrase.
    expect(screen.queryByText(pastille(2))).toBeNull()
  })

  it('announces « 2 pollen gagnés. » politely, after the sentence being read (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const { queued } = spyAnnouncements()

    await renderWithProviders(gain(2, 1))

    expect(queued).toHaveBeenCalledTimes(1)
    expect(queued).toHaveBeenCalledWith(gained(2), { queue: true })
  })

  it('says « 1 pollen gagné. » for a single pollen (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const { queued } = spyAnnouncements()

    await renderWithProviders(gain(1, 1))

    expect(queued).toHaveBeenCalledWith(gained(1), { queue: true })
  })

  it('announces the gain in a polite status region on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    await renderWithProviders(gain(2, 1))

    // La région annoncée (ui/LiveStatus) porte la phrase entière.
    const regions = screen.getAllByRole('status')
    expect(regions.some((region) => within(region).queryByText(gained(2)) !== null)).toBe(true)
  })

  it('plays again only when its trigger changes', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const { plain, queued } = spyAnnouncements()
    const view = await renderWithProviders(gain(2, 1))

    // Redessinée avec la même clé (l'écran relit ses données) : rien de neuf à dire.
    await view.rerender(gain(2, 1))
    expect(queued).toHaveBeenCalledTimes(1)

    // Un nouveau geste rapporte du pollen : nouvelle clé, nouvelle annonce.
    await view.rerender(gain(2, 2))
    expect(queued).toHaveBeenCalledTimes(2)
    // Une seule façon d'annoncer : jamais deux lectures du même gain.
    expect(plain).not.toHaveBeenCalled()
  })

  it('rises near its button when motion is allowed', async () => {
    // Le témoin du test suivant : la même mesure voit bien la pastille monter.
    await renderWithProviders(gain(2, 1))

    expect(await movedDuringPlay()).toBe(true)
  })

  it('appears and fades in place, without moving, when the device asks for less motion', async () => {
    reducedMotion.mockReturnValue(true)

    await renderWithProviders(gain(2, 1))

    expect(await movedDuringPlay()).toBe(false)
    // Toujours dessinée : seul le mouvement s'efface.
    expect(screen.getByText(pastille(2), { includeHiddenElements: true })).toBeTruthy()
  })
})
