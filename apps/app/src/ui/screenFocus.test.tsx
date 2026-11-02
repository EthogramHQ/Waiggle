// Tests du signal « la route devient affichée » (tranche RF, ui-1 et ui-11) : `useScreenShownCount`
// compte les arrivées d'une route, pas les montages d'un composant. Les routes sont simulées par
// `ScreenRouteScope` (la route de démonstration du catalogue), qui passe par le même chemin que la
// clé d'une route d'Expo Router.
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ScreenRouteScope, useScreenFocused, useScreenShownCount } from './screenFocus'

/** Écrit à l'écran ce que le composant lit, et note chaque nombre rendu. */
const seen: number[] = []
function Probe({ name }: { name: string }) {
  const count = useScreenShownCount()
  const focused = useScreenFocused()
  seen.push(count)
  return <Text>{`${name} ${count} ${focused ? 'shown' : 'hidden'}`}</Text>
}

beforeEach(() => {
  seen.length = 0
})

describe('useScreenShownCount', () => {
  it('counts one arrival outside of a navigator', async () => {
    await render(<Probe name="alone" />)
    expect(screen.getByText('alone 1 shown')).toBeTruthy()
  })

  it('reads 0 on the first render of a new route, then 1 before anything is drawn', async () => {
    await render(
      <ScreenRouteScope focused>
        <Probe name="page" />
      </ScreenRouteScope>,
    )
    // Le premier rendu lit 0, l'effet de mise en page fait monter le nombre, et React redessine.
    expect(seen.slice(0, 2)).toEqual([0, 1])
    expect(screen.getByText('page 1 shown')).toBeTruthy()
  })

  it('counts each arrival, going and coming back', async () => {
    const tree = (focused: boolean) => (
      <ScreenRouteScope focused={focused}>
        <Probe name="page" />
      </ScreenRouteScope>
    )
    const view = await render(tree(true))
    await view.rerender(tree(false))
    expect(screen.getByText('page 1 hidden')).toBeTruthy()

    await view.rerender(tree(true))

    expect(screen.getByText('page 2 shown')).toBeTruthy()
  })

  it('gives a screen mounted later in the same visit the same number, without raising it', async () => {
    const tree = (late: boolean) => (
      <ScreenRouteScope focused>
        <Probe name="first" />
        {late ? <Probe name="late" /> : null}
      </ScreenRouteScope>
    )
    const view = await render(tree(false))

    await view.rerender(tree(true))

    expect(screen.getByText('first 1 shown')).toBeTruthy()
    expect(screen.getByText('late 1 shown')).toBeTruthy()
  })

  it('counts one arrival when two screens of a route see it in the same render', async () => {
    await render(
      <ScreenRouteScope focused>
        <Probe name="a" />
        <Probe name="b" />
      </ScreenRouteScope>,
    )
    expect(screen.getByText('a 1 shown')).toBeTruthy()
    expect(screen.getByText('b 1 shown')).toBeTruthy()
  })

  it('gives a new route its own count', async () => {
    const tree = (key: string) => (
      <ScreenRouteScope key={key} focused>
        <Probe name={key} />
      </ScreenRouteScope>
    )
    const view = await render(tree('one'))

    await view.rerender(tree('two'))

    expect(screen.getByText('two 1 shown')).toBeTruthy()
  })
})
