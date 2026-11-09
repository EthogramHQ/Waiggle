// Tests de la danse de publication (tranche R6a, planche `R6-Danse`) : quand un projet visible des
// membres vient d'être publié, l'abeille du logo dessine son huit par-dessus le fil, avec une
// traînée de miel, puis file vers la nouvelle carte (`target`) ; `onDone` part à la fin, et l'écran
// montre alors « Projet publié ».
// - C'est un décor : caché aux lecteurs d'écran (l'avis « Projet publié » dit tout), et il laisse
//   passer les tapes vers le fil dessous.
// - Avec « Réduire les animations », rien ne vole : `onDone` part tout de suite (la carte, elle,
//   paraît par un fondu, dans le fil).
// - `onDone` part une fois, même si la carte bouge pendant le vol, et jamais après le démontage.
//
// L'API (découpage de R6a, U4) : PublishDance({ playing: boolean; target: { x; y } | null;
// onDone(): void }). Le dessin du huit et la traînée ne se mesurent pas ici : captures et essai
// --explore.
import { act, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { PublishDance } from './PublishDance'
import * as motion from './theme/motion'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Bien plus que le tour de danse et le vol : toute la danse a eu le temps de finir. */
const LONG_AFTER = 20_000

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

/** Tous les éléments sous un élément, lui compris, en profondeur. */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** La danse posée sur une scène, comme sur le fil : la scène est la vue qui la contient. */
const Stage = (props: Parameters<typeof PublishDance>[0]) => (
  <View testID="stage">
    <PublishDance {...props} />
  </View>
)

describe('PublishDance', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('is hidden from screen readers and lets taps through', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    await renderWithProviders(<Stage playing target={{ x: 120, y: 300 }} onDone={jest.fn()} />)

    // La première vue de la danse : un décor qui couvre le fil.
    const stage = screen.getByTestId('stage') as unknown as Host
    const dance = stage.children.find((child): child is Host => typeof child !== 'string')
    expect(dance).toBeDefined() // témoin : la danse se dessine pendant qu'elle joue
    const top = dance as Host
    // Les tapes la traversent (en propriété, comme le veut react-native-web).
    expect(top.props.pointerEvents).toBe('none')
    // Cachée aux lecteurs d'écran, sur le web comme sur téléphone, avec tout ce qu'elle contient.
    expect(
      top.props['aria-hidden'] === true ||
        (top.props.accessibilityElementsHidden === true &&
          top.props.importantForAccessibility === 'no-hide-descendants'),
    ).toBe(true)
    // Rien dedans n'est un bouton, un lien ou un texte à lire.
    for (const node of hostsOf(top)) {
      expect(node.props.accessible).not.toBe(true)
      expect(node.props.accessibilityRole ?? node.props.role).toBeUndefined()
    }
  })

  it('calls onDone once the dance is over, not before', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    await renderWithProviders(<Stage playing target={{ x: 120, y: 300 }} onDone={onDone} />)

    // Au début du vol, rien n'est fini.
    await act(() => jest.advanceTimersByTime(100))
    expect(onDone).not.toHaveBeenCalled()

    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls onDone at once, without flying, in reduced motion', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    const onDone = jest.fn()
    await renderWithProviders(<Stage playing target={{ x: 120, y: 300 }} onDone={onDone} />)

    // Aucun temps écoulé : la carte paraît par son fondu, l'abeille ne vole pas.
    expect(onDone).toHaveBeenCalledTimes(1)
    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('waits while it is not playing', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    await renderWithProviders(<Stage playing={false} target={null} onDone={onDone} />)

    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).not.toHaveBeenCalled()

    // Témoin : la même danse, lancée, finit.
    await screen.rerender(<Stage playing target={{ x: 120, y: 300 }} onDone={onDone} />)
    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls onDone once, even if the target moves during the flight', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    await renderWithProviders(<Stage playing target={{ x: 120, y: 300 }} onDone={onDone} />)

    // La carte bouge (le fil se remet en page) au milieu de la danse, puis encore une fois.
    await act(() => jest.advanceTimersByTime(800))
    await screen.rerender(<Stage playing target={{ x: 120, y: 340 }} onDone={onDone} />)
    await act(() => jest.advanceTimersByTime(800))
    await screen.rerender(<Stage playing target={{ x: 140, y: 360 }} onDone={onDone} />)
    await act(() => jest.advanceTimersByTime(LONG_AFTER))

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('never calls onDone after being unmounted', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    const kept = jest.fn()
    // Deux danses côte à côte : la seconde est démontée, la première sert de témoin.
    const Pair = ({ second }: { second: boolean }) => (
      <>
        <Stage playing target={{ x: 120, y: 300 }} onDone={kept} />
        {second ? <Stage playing target={{ x: 120, y: 300 }} onDone={onDone} /> : null}
      </>
    )
    await renderWithProviders(<Pair second />)

    // Le membre quitte le fil pendant la danse : la page n'est plus là pour montrer l'avis.
    await act(() => jest.advanceTimersByTime(500))
    await screen.rerender(<Pair second={false} />)
    await act(() => jest.advanceTimersByTime(LONG_AFTER))

    expect(onDone).not.toHaveBeenCalled()
    expect(kept).toHaveBeenCalledTimes(1) // témoin : la danse restée montée a fini
  })

  // Correction C2 de R6a (relecture de l'interface, ui-C2) : la carte visée, la danse la mesure
  // elle-même (`aim`), et l'écran n'a plus à lire les durées de la danse pour la mesurer.
  it('flies to the view it aims at, measured in the window during the dance', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    // La carte, d'abord en bas de l'écran ; le fil remonté, elle passe plus haut.
    let frame = [40, 700, 300, 200]
    const measureInWindow = jest.fn(
      (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(frame[0] ?? 0, frame[1] ?? 0, frame[2] ?? 0, frame[3] ?? 0),
    )
    const aim = { current: { measureInWindow } }
    await renderWithProviders(<Stage playing target={null} aim={aim} onDone={jest.fn()} />)

    /** Le point d'arrivée du vol : la fin du chemin `M… Q… x y` de la traînée. */
    const landing = () => {
      const stage = screen.getByTestId('stage') as unknown as Host
      const flight = hostsOf(stage)
        .map((node) => node.props.d)
        .find((d): d is string => typeof d === 'string' && d.includes('Q'))
      return flight?.trim().split(/\s+/).slice(-2).join(' ')
    }
    await act(() => jest.advanceTimersByTime(0))
    expect(landing()).toBe('40.0 700.0')

    frame = [40, 180, 300, 200]
    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    // Mesurée de nouveau pendant le huit : l'abeille suit la carte remontée.
    expect(measureInWindow.mock.calls.length).toBeGreaterThan(1)
    expect(landing()).toBe('40.0 180.0')
  })
})
