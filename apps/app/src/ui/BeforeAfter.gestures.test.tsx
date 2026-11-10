// Tests de l'avant / après (R7a, U2), en plus de ceux du test-writer (BeforeAfter.test.tsx) : le
// nom donné par `label`, la place de départ (`initialValue`, pour le catalogue), les seules touches
// du curseur retenues (les autres, Tab et Page suivante, passent), et le doigt : une tape pose le
// trait où l'on a touché, un glissé de côté le déplace, un glissé vers le bas ne le bouge pas.
// Les positions réelles (le trait sous le pointeur, la page qui défile) se vérifient dans le
// navigateur (`--explore`) ; ici, l'ordre des gestes et leurs effets sur la valeur.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { BeforeAfter } from './BeforeAfter'
import type { GalleryPhoto } from './PhotoGallery'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: Record<string, unknown> }

const before: GalleryPhoto = { key: 'a', source: { uri: 'https://example.test/a.webp' } }
const after: GalleryPhoto = { key: 'b', source: { uri: 'https://example.test/b.webp' } }

const slider = () => screen.getByRole('adjustable') as unknown as Host
const valueNow = () => (slider().props.accessibilityValue as { now: number }).now

/** La zone mesurée : 200 points de large. */
const measure = () =>
  fireEvent(slider() as never, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 240 } },
  })

/**
 * Un doigt posé en `from`, qui passe par `path`, puis se lève : les événements du système de
 * réponse, avec l'historique des touchers que lit PanResponder (comme dans Sheet.test.tsx).
 */
const touch = async (from: { x: number; y: number }, path: { x: number; y: number }[]) => {
  const area = slider()
  let previous = { ...from, time: 1000 }
  const at = (point: { x: number; y: number }, time: number, active: boolean) => {
    const finger = {
      identifier: 0,
      pageX: point.x,
      pageY: point.y,
      locationX: point.x,
      locationY: point.y,
      timestamp: time,
    }
    const event = {
      nativeEvent: { ...finger, touches: active ? [finger] : [], changedTouches: [finger] },
      touchHistory: {
        numberActiveTouches: active ? 1 : 0,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: time,
        touchBank: [
          {
            touchActive: active,
            startPageX: from.x,
            startPageY: from.y,
            startTimeStamp: 1000,
            currentPageX: point.x,
            currentPageY: point.y,
            currentTimeStamp: time,
            previousPageX: previous.x,
            previousPageY: previous.y,
            previousTimeStamp: previous.time,
          },
        ],
      },
      target: area,
      currentTarget: area,
      preventDefault: () => {},
      stopPropagation: () => {},
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      persist: () => {},
    }
    previous = { ...point, time }
    return event
  }
  const call = (name: string, event: object) =>
    (area.props[name] as ((event: object) => unknown) | undefined)?.(event)

  await act(async () => {
    const down = at(from, 1000, true)
    expect(call('onStartShouldSetResponder', down)).toBe(true)
    call('onResponderGrant', down)
    call('onResponderStart', down)
    let time = 1000
    let last = from
    for (const point of path) {
      time += 16
      last = point
      call('onResponderMove', at(point, time, true))
    }
    call('onResponderEnd', at(last, time + 16, false))
    call('onResponderRelease', at(last, time + 16, false))
  })
}

describe('BeforeAfter, beyond the test-writer', () => {
  it('names the slider after `label` and starts at `initialValue`', async () => {
    await renderWithProviders(
      <BeforeAfter
        before={before}
        after={after}
        label="Comparer les deux fusées"
        initialValue={30}
      />,
    )

    expect(screen.getByRole('adjustable', { name: 'Comparer les deux fusées' })).toBeTruthy()
    expect(valueNow()).toBe(30)
  })

  it('holds back the keys of the slider only, never Tab or Page Down', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} />)

    const press = async (key: string) => {
      const event = { key, preventDefault: jest.fn() }
      await fireEvent(slider() as never, 'keyDown', event)
      return event.preventDefault.mock.calls.length
    }
    expect(await press('ArrowLeft')).toBe(1)
    expect(await press('End')).toBe(1)
    // Au bord, la flèche reste retenue : sinon la page défilerait d'un coup.
    expect(await press('ArrowRight')).toBe(1)
    expect(await press('Tab')).toBe(0)
    expect(await press('PageDown')).toBe(0)
    expect(valueNow()).toBe(100)
  })

  it('places the line where a tap lands, without a drag', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} />)
    await measure()

    await touch({ x: 50, y: 100 }, [])

    expect(valueNow()).toBe(25)
  })

  it('follows a sideways drag', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} />)
    await measure()

    await touch({ x: 100, y: 100 }, [
      { x: 120, y: 102 },
      { x: 150, y: 98 },
      { x: 180, y: 101 },
    ])

    expect(valueNow()).toBe(90)
  })

  it('does not move when the finger goes down the page', async () => {
    await renderWithProviders(<BeforeAfter before={before} after={after} />)
    await measure()

    await touch({ x: 100, y: 100 }, [
      { x: 102, y: 130 },
      { x: 110, y: 170 },
      { x: 130, y: 220 },
    ])

    expect(valueNow()).toBe(50)
  })
})
