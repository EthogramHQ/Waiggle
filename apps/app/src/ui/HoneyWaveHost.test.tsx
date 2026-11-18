// Tests de l'hôte de la vague de miel (R17, scénario « La vague de miel à l'entrée ») : la vague
// monte depuis le bouton touché, couvre l'écran à mi-parcours (600 ms sur 1 200) et c'est alors
// seulement que la navigation vers le Fil part ; puis elle se retire et disparaît à 1 200 ms.
// Pendant ce temps, rien ne se touche, et le lecteur d'écran ne la lit pas. Sous « Réduire les
// animations », pas de vague : la navigation part tout de suite, en fondu.
//
// Relecture de l'interface du plan, U1 : seul l'hôte annonce la sorte du passage, juste avant la
// navigation (`none` après la vague, qui couvre déjà l'écran ; `sibling` sous réduction, un fondu).
//
// La couche de la vague se retrouve par son identifiant de test (`honey-wave`) : muette pour le
// lecteur d'écran, elle n'a ni rôle ni nom.
import { durations } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { HoneyWaveHost, useHoneyWave } from './HoneyWaveHost'
import { announcePassage } from './pageTransition'
import * as motion from './theme/motion'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./pageTransition', () => ({
  ...jest.requireActual('./pageTransition'),
  announcePassage: jest.fn(),
}))

// L'ordre des appels : l'annonce du passage doit précéder la navigation.
let order: string[] = []
const then = jest.fn(() => {
  order.push('then')
})

/** Le bouton « Me connecter », qui lance la vague. */
let currentWave: ReturnType<typeof useHoneyWave> | undefined
function Launcher() {
  const wave = useHoneyWave()
  currentWave = wave
  return <Button label="Me connecter" onPress={() => wave.play({ from: null, then })} />
}

const page = () => (
  <HoneyWaveHost>
    <Launcher />
  </HoneyWaveHost>
)

const layer = () => screen.queryByTestId('honey-wave', { includeHiddenElements: true })
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}
const press = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'Me connecter' }))
}

beforeEach(() => {
  order = []
  then.mockClear()
  jest.mocked(announcePassage).mockReset()
  jest.mocked(announcePassage).mockImplementation((kind) => {
    order.push(`announce ${kind}`)
  })
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('HoneyWaveHost', () => {
  it('shows no wave to a member who did not just sign in (témoin)', async () => {
    await renderWithProviders(page())
    await wait(durations.wave)

    expect(layer()).toBeNull()
    expect(then).not.toHaveBeenCalled()
  })

  it('lays the wave over the screen when it is played', async () => {
    await renderWithProviders(page())

    await press()

    expect(layer()).not.toBeNull()
  })

  it('navigates once, when the wave covers the screen, around 600 ms', async () => {
    await renderWithProviders(page())
    await press()

    await wait(durations.wave / 2 - 100)
    expect(then).not.toHaveBeenCalled()

    await wait(200)
    expect(then).toHaveBeenCalledTimes(1)

    await wait(durations.wave * 2)
    expect(then).toHaveBeenCalledTimes(1)
  })

  it('announces no passage just before navigating, as the wave already covers the screen (U1)', async () => {
    await renderWithProviders(page())
    await press()

    await wait(durations.wave)

    expect(order).toEqual(['announce none', 'then'])
  })

  it('takes every touch and stays silent for screen readers', async () => {
    await renderWithProviders(page())
    await press()

    const wave = layer()
    const props = (wave?.props ?? {}) as Record<string, unknown>
    // Muette : cachée aux lecteurs d'écran, sur le web (`aria-hidden`) comme sur téléphone.
    expect(
      props['aria-hidden'] === true || props.importantForAccessibility === 'no-hide-descendants',
    ).toBe(true)
    // Elle prend les touchers : rien ne passe à travers vers la page dessous.
    expect(['none', 'box-none']).not.toContain(props.pointerEvents)
  })

  it('removes the wave at 1.2 s', async () => {
    await renderWithProviders(page())
    await press()

    await wait(durations.wave - 100)
    expect(layer()).not.toBeNull()

    await wait(200)
    expect(layer()).toBeNull()
  })

  it('ignores a second play while the wave runs', async () => {
    await renderWithProviders(page())
    await press()
    // Le bouton est sous la vague : le second appel vient d'ailleurs (une touche Entrée).
    const second = jest.fn()
    await act(async () => {
      // `then` en raccourci : Biome refuse une propriété `then: …` écrite (noThenProperty).
      const then = second
      currentWave?.play({ from: null, then })
    })

    expect(screen.queryAllByTestId('honey-wave', { includeHiddenElements: true })).toHaveLength(1)
    await wait(durations.wave * 2)

    expect(then).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('navigates at once with reduced motion, without a wave, as a cross-fade', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    await renderWithProviders(page())

    await press()

    expect(then).toHaveBeenCalledTimes(1)
    expect(layer()).toBeNull()
    expect(order).toEqual(['announce sibling', 'then'])
  })
})
