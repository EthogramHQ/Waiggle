// Tests des deux props de catalogue de la danse de publication (R6a, U4) : `calm`, qui force le
// mode calme ou le mouvement complet quel que soit le réglage de l'appareil, et `moment`, qui fige
// la danse à un instant pour les captures. Les règles de la danse elle-même sont dans
// PublishDance.test.tsx.
import { act, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { PublishDance } from './PublishDance'
import * as motion from './theme/motion'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const LONG_AFTER = 20_000

describe('PublishDance, catalogue props', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('ends at once when calm is forced, even if the device does not reduce motion', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    await renderWithProviders(<PublishDance playing target={null} calm onDone={onDone} />)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('plays the whole dance when motion is forced, even if the device reduces motion', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    const onDone = jest.fn()
    await renderWithProviders(
      <PublishDance playing target={{ x: 10, y: 10 }} calm={false} onDone={onDone} />,
    )
    expect(onDone).not.toHaveBeenCalled()
    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('draws a frozen moment and never ends it', async () => {
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    await renderWithProviders(
      <PublishDance playing target={{ x: 10, y: 10 }} moment={0.5} onDone={onDone} />,
    )
    // Témoin : la danse est dessinée (sa couche cachée aux lecteurs d'écran est là).
    expect(screen.toJSON()).not.toBeNull()
    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('does not end twice when calm turns on after the end', async () => {
    const calm = jest.spyOn(motion, 'useCalmMotion').mockReturnValue(false)
    const onDone = jest.fn()
    await renderWithProviders(<PublishDance playing target={null} onDone={onDone} />)
    await act(() => jest.advanceTimersByTime(LONG_AFTER))
    expect(onDone).toHaveBeenCalledTimes(1)
    calm.mockReturnValue(true)
    await screen.rerender(<PublishDance playing target={null} onDone={onDone} />)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
