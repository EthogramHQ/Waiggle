// Tests de l'impulsion d'entrée (R17, scénario « La vague de miel à l'entrée » : « la lumière
// d'ambiance reçoit une impulsion ») : l'hôte de la vague lève `entrancePulse` juste avant la
// navigation ; la première page à lumière qui s'affiche ensuite la prend, une seule fois. Rien ne
// la lève à l'ouverture de l'appli ni en revenant sur le Fil.
import { durations } from '@ruche/brand'
import { useEffect } from 'react'
import { renderWithProviders } from '../../testing/render'
import { AmbientHostProvider, entrancePulse, ScreenAmbient, useAmbientSource } from './ambient'

// Ce que la lumière reçoit : chaque impulsion, avec sa force.
const received = jest.fn()

/** Une lumière factice, abonnée aux impulsions comme AmbientLight. */
function Light() {
  const { onPulse } = useAmbientSource()
  useEffect(() => onPulse(received), [onPulse])
  return null
}

const screen = ({ light = true, focused = true } = {}) => (
  <ScreenAmbient light={light} focused={focused}>
    <Light />
  </ScreenAmbient>
)

beforeEach(() => {
  received.mockClear()
  // Rien ne reste levé d'un test à l'autre.
  entrancePulse.take()
})

afterEach(() => jest.useRealTimers())

describe('the entrance pulse of the ambient light', () => {
  it('pulses the light of the first page that arrives after the wave, once', async () => {
    entrancePulse.raise()
    await renderWithProviders(screen())

    expect(received.mock.calls).toEqual([[1]])
    expect(entrancePulse.take()).toBe(false)
  })

  it('does not pulse a page opened without the wave (témoin)', async () => {
    await renderWithProviders(screen())

    expect(received).not.toHaveBeenCalled()
  })

  it('waits for a page with a light, and leaves it raised for it', async () => {
    entrancePulse.raise()
    await renderWithProviders(screen({ light: false }))

    expect(entrancePulse.take()).toBe(true)
  })

  it('is lost when no page with a light arrives in time', async () => {
    jest.useFakeTimers()
    entrancePulse.raise()
    jest.advanceTimersByTime(durations.wave * 3)

    expect(entrancePulse.take()).toBe(false)
  })

  it('pulses the shared light of the web host when the page is the one drawn', async () => {
    entrancePulse.raise()
    await renderWithProviders(
      <AmbientHostProvider>
        <Light />
        {screen()}
      </AmbientHostProvider>,
    )

    expect(received.mock.calls).toEqual([[1]])
  })
})
