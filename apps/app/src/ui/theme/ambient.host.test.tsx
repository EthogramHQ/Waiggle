// Tests du registre de l'hôte de la lumière (tranche RF, theme/ambient.tsx) : quelle source la
// lumière commune dessine quand plusieurs écrans sont inscrits. Ils lisent ce que la lumière lit
// (useAmbientSource) au lieu de monter la lumière elle-même ; la lumière et l'hôte complet sont
// testés à part (AmbientHost.test.tsx, AmbientLight.web.test.tsx).
import { act, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { renderWithProviders } from '../../testing/render'
import { Text } from '../Text'
import {
  AmbientHostProvider,
  type AmbientSource,
  ScreenAmbient,
  useAmbient,
  useAmbientSource,
  useHasAmbientHost,
} from './ambient'

const butterfly: AmbientSource = { palette: ['#aa3311', '#ffcc88', '#552200'] }
const coffee: AmbientSource = { thumbhash: 'GIoKDYSlqIdPUXd3eEeHh9J/YIkI' } // gitleaks:allow
const tea: AmbientSource = { palette: ['#117733', '#88ffcc', '#003322'] }

// Les impulsions reçues par la lumière commune.
const pulses: number[] = []

/** Ce que la lumière commune dessine, en texte ; elle note aussi ses impulsions. */
function Readout() {
  const { source, wanted, onPulse } = useAmbientSource()
  useEffect(() => onPulse((force) => pulses.push(force)), [onPulse])
  return <Text>{`drawn:${wanted ? JSON.stringify(source) : 'off'}`}</Text>
}

const drawn = (source: AmbientSource) => `drawn:${JSON.stringify(source)}`

// Les gestes de chaque écran factice, gardés pour les jouer depuis le test.
const gestures: Record<string, ReturnType<typeof useAmbient>> = {}

function Grab({ name }: { name: string }) {
  const ambient = useAmbient()
  useEffect(() => {
    gestures[name] = ambient
  }, [name, ambient])
  return null
}

function HostCheck() {
  return <Text>{useHasAmbientHost() ? 'hosted' : 'alone'}</Text>
}

type Screens = { name: string; source: AmbientSource; focused: boolean; light?: boolean }[]

const app = (screens: Screens) => (
  <AmbientHostProvider>
    <Readout />
    {screens.map(({ name, source, focused, light = true }) => (
      <ScreenAmbient key={name} light={light} initialSource={source} focused={focused}>
        <Grab name={name} />
      </ScreenAmbient>
    ))}
  </AmbientHostProvider>
)

describe('the ambient host registry', () => {
  it('draws the source of the screen that became shown last', async () => {
    await renderWithProviders(
      app([
        { name: 'feed', source: butterfly, focused: true },
        { name: 'project', source: coffee, focused: true },
      ]),
    )
    expect(screen.getByText(drawn(coffee))).toBeTruthy()
  })

  it('goes back to the found-again screen when the top one leaves', async () => {
    const view = await renderWithProviders(
      app([
        { name: 'feed', source: butterfly, focused: false },
        { name: 'project', source: coffee, focused: true },
      ]),
    )
    expect(screen.getByText(drawn(coffee))).toBeTruthy()
    // Retour : la page du projet est démontée, le fil redevient affiché.
    await view.rerender(app([{ name: 'feed', source: butterfly, focused: true }]))
    expect(screen.getByText(drawn(butterfly))).toBeTruthy()
  })

  it('ignores setSource and pulse from a hidden screen', async () => {
    await renderWithProviders(
      app([
        { name: 'feed', source: butterfly, focused: false },
        { name: 'project', source: coffee, focused: true },
      ]),
    )
    pulses.length = 0
    await act(async () => gestures.feed?.setSource(tea))
    await act(async () => gestures.feed?.pulse(1))
    expect(screen.getByText(drawn(coffee))).toBeTruthy()
    expect(pulses).toEqual([])
    // Témoin : les mêmes gestes de l'écran affiché passent.
    await act(async () => gestures.project?.setSource(tea))
    await act(async () => gestures.project?.pulse(0.5))
    expect(screen.getByText(drawn(tea))).toBeTruthy()
    expect(pulses).toEqual([0.5])
  })

  it('draws no light when the shown screen does not want one, then the honey light is gone', async () => {
    await renderWithProviders(
      app([
        { name: 'feed', source: butterfly, focused: false },
        { name: 'sign-in', source: null, focused: true, light: false },
      ]),
    )
    expect(screen.getByText('drawn:off')).toBeTruthy()
  })

  it('draws no light when no registered screen is shown', async () => {
    await renderWithProviders(app([{ name: 'feed', source: butterfly, focused: false }]))
    expect(screen.getByText('drawn:off')).toBeTruthy()
  })

  it('says whether a host is around', async () => {
    await renderWithProviders(
      <>
        <HostCheck />
        <AmbientHostProvider>
          <HostCheck />
        </AmbientHostProvider>
      </>,
    )
    expect(screen.getByText('alone')).toBeTruthy()
    expect(screen.getByText('hosted')).toBeTruthy()
  })
})
