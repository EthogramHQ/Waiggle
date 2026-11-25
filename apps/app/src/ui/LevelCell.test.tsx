// Tests de l'alvéole du niveau (R19, planches R19-Profil et R19-Niveau) : une alvéole scellée qui
// porte le numéro du niveau. Au passage d'un niveau (`rise={{ from: 4 }}`), la cire coule une fois
// dans l'alvéole et le nouveau numéro apparaît ; une annonce polie dit « Niveau 5 », une seule fois,
// puis `onRisen` prévient l'écran (qui marque le niveau comme vu, `PATCH levelSeen`).
//
// « Réduire les animations » : pas de cire qui coule, un fondu de 320 ms vers le nouveau numéro ;
// l'annonce et `onRisen` restent. Sans `rise`, l'alvéole est immobile et ne dit rien de plus.
import { act, screen, within } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LevelCell } from './LevelCell'

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

type CellProps = ComponentProps<typeof LevelCell>

/** « Niveau 5 », l'annonce du passage. */
const levelText = (level: number) => fr.t(($) => $.game.level, { level })

const cell = (props: Partial<CellProps> = {}) => <LevelCell level={5} size="regular" {...props} />

/** Le temps passe (faux minuteurs), et avec lui les animations de Reanimated. */
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

/**
 * Les annonces faites à VoiceOver qui disent `text`, par l'une ou l'autre façon de demander une
 * lecture : le composant choisit la sienne, le test compte les annonces.
 */
const spyAnnouncements = () => {
  const plain = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
  const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
  plain.mockClear()
  queued.mockClear()
  return (text: string) =>
    [...plain.mock.calls, ...queued.mock.calls].filter(([said]) => said === text).length
}

describe('LevelCell', () => {
  it('shows the number of its level', async () => {
    await renderWithProviders(cell({ level: 4 }))

    expect(screen.getByText('4', { includeHiddenElements: true })).toBeTruthy()
  })

  it('announces « Niveau 5 » once when the level rises (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const said = spyAnnouncements()

    await renderWithProviders(cell({ rise: { from: 4 }, onRisen: jest.fn() }))
    await wait(5000)

    expect(said(levelText(5))).toBe(1)
  })

  it('announces the new level in a polite status region on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')

    await renderWithProviders(cell({ rise: { from: 4 }, onRisen: jest.fn() }))
    await wait(5000)

    const regions = screen.getAllByRole('status')
    expect(regions.some((region) => within(region).queryByText(levelText(5)) !== null)).toBe(true)
  })

  it('announces nothing when the level does not rise', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const said = spyAnnouncements()

    await renderWithProviders(cell())
    await wait(5000)

    expect(said(levelText(5))).toBe(0)
  })

  it('tells the screen once the rise is over, and only once', async () => {
    const onRisen = jest.fn()
    const view = await renderWithProviders(cell({ rise: { from: 4 }, onRisen }))

    await wait(5000)
    expect(onRisen).toHaveBeenCalledTimes(1)

    // L'écran se redessine (la relecture après `PATCH levelSeen`) : la cire ne coule pas deux fois.
    await view.rerender(cell({ rise: { from: 4 }, onRisen }))
    await wait(5000)
    expect(onRisen).toHaveBeenCalledTimes(1)
  })

  it('does not announce twice when the screen redraws during the visit (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const said = spyAnnouncements()
    const view = await renderWithProviders(cell({ rise: { from: 4 }, onRisen: jest.fn() }))
    await wait(5000)

    await view.rerender(cell({ rise: { from: 4 }, onRisen: jest.fn() }))
    await wait(5000)

    expect(said(levelText(5))).toBe(1)
  })

  it('never calls onRisen without a rise', async () => {
    const onRisen = jest.fn()

    await renderWithProviders(cell({ onRisen }))
    await wait(5000)

    expect(onRisen).not.toHaveBeenCalled()
  })

  it('fades to the new level within 320 ms when the device asks for less motion', async () => {
    reducedMotion.mockReturnValue(true)
    const onRisen = jest.fn()

    await renderWithProviders(cell({ rise: { from: 4 }, onRisen }))

    // Le fondu dure 320 ms : pas encore fini à mi-chemin, fini peu après.
    await wait(100)
    expect(onRisen).not.toHaveBeenCalled()
    await wait(300)
    expect(onRisen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('5', { includeHiddenElements: true })).toBeTruthy()
  })

  it('shows the new level once the rise is over', async () => {
    await renderWithProviders(cell({ rise: { from: 4 }, onRisen: jest.fn() }))
    await wait(5000)

    expect(screen.getByText('5', { includeHiddenElements: true })).toBeTruthy()
    // L'ancien numéro ne reste pas dessiné à côté du nouveau.
    expect(screen.queryByText('4', { includeHiddenElements: true })).toBeNull()
  })

  it('draws a small cell for the Activity and the rankings', async () => {
    // La taille `small` (relecture d'interface UI-1) : l'icône d'un avis « Niveau 5 ».
    await renderWithProviders(cell({ size: 'small' }))

    expect(screen.getByText('5', { includeHiddenElements: true })).toBeTruthy()
  })
})
