// Tests du magasin du dernier pollen gagné (R19) : un gain se montre à son ancrage tant qu'un
// porteur y est monté, sinon dans l'hôte global ; un seul gain à la fois ; jamais « +0 » ; une clé
// neuve à chaque gain (même montant) ; plus rien une fois la pastille jouée.
import { act, renderHook } from '@testing-library/react-native'
import {
  POLLEN_GAIN_MS,
  type PollenAnchor,
  reportPollen,
  resetPollen,
  usePollenGain,
} from './pollen'

beforeEach(() => {
  jest.useFakeTimers()
  resetPollen()
})
afterEach(() => {
  jest.useRealTimers()
})

const mount = (anchor: PollenAnchor) => renderHook(() => usePollenGain(anchor))

describe('the last pollen gain', () => {
  it('shows a gain at the anchor of the gesture', async () => {
    const reaction = await mount('reaction')
    const global = await mount('global')

    await act(() => reportPollen(2, 'reaction', 'useful'))

    expect(reaction.result.current).toEqual({
      amount: 2,
      key: expect.any(Number),
      target: 'useful',
    })
    expect(global.result.current).toBeNull()
  })

  it('sends the gain to the global host when nothing carries its anchor', async () => {
    // Une réaction posée depuis une carte du Fil : pas de pastille à cet endroit.
    const global = await mount('global')

    await act(() => reportPollen(2, 'reaction', 'useful'))

    expect(global.result.current).toEqual({ amount: 2, key: expect.any(Number) })
  })

  it('gives a new key to each gain, even of the same amount', async () => {
    const comment = await mount('comment')

    await act(() => reportPollen(3, 'comment'))
    const first = comment.result.current?.key
    await act(() => reportPollen(3, 'comment'))

    expect(comment.result.current?.amount).toBe(3)
    expect(comment.result.current?.key).not.toBe(first)
  })

  it('shows one gain at a time, the latest', async () => {
    const tester = await mount('tester')
    const global = await mount('global')

    await act(() => reportPollen(5, 'tester'))
    await act(() => reportPollen(10, 'global'))

    expect(tester.result.current).toBeNull()
    expect(global.result.current?.amount).toBe(10)
  })

  it.each([0, -3, 2.5, Number.NaN])('shows nothing for %p pollen', async (amount) => {
    const global = await mount('global')

    await act(() => reportPollen(amount, 'global'))

    expect(global.result.current).toBeNull()
  })

  it('forgets the gain once the badge has played', async () => {
    const global = await mount('global')
    await act(() => reportPollen(2, 'global'))

    await act(() => jest.advanceTimersByTime(POLLEN_GAIN_MS))

    expect(global.result.current).toBeNull()
  })

  it('does not replay a past gain to a carrier mounted later', async () => {
    const first = await mount('reaction')
    await act(() => reportPollen(2, 'reaction'))
    await first.unmount()
    await act(() => jest.advanceTimersByTime(POLLEN_GAIN_MS))

    expect((await mount('reaction')).result.current).toBeNull()
  })

  it('goes back to the global host once the carrier is gone', async () => {
    await (await mount('feedback')).unmount()
    const global = await mount('global')

    await act(() => reportPollen(4, 'feedback'))

    expect(global.result.current?.amount).toBe(4)
  })
})
