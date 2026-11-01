// L'horloge partagée des dates relatives (R4) : toutes les dates d'un écran avancent sur un seul
// minuteur, posé avec la première et retiré avec la dernière.
//
// Pourquoi un fichier à part : chaque rendu ou `rerender` de test laisse des minuteurs « immédiats »
// (délai 0) en attente sous la fausse horloge, ceux de React et du rendu de test, quel que soit le
// composant (trois de plus par `rerender`, mesuré avec de simples `Text`). On les vide donc
// (`advanceTimersByTime(0)`) avant de compter : il ne reste que les minuteurs qui attendent vraiment.
import { act } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { RelativeTime } from './RelativeTime'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const now = new Date('2026-10-20T10:00:00.000Z')

beforeEach(() => jest.useFakeTimers({ now }))
afterEach(() => jest.useRealTimers())

/** `count` dates du fil, chacune un jour différent. */
const dates = (count: number) => (
  <>
    {Array.from({ length: count }, (_, n) => `2026-10-1${n}T08:00:00.000Z`).map((date) => (
      <RelativeTime key={date} date={date} />
    ))}
  </>
)

/** Le nombre de minuteurs qui attendent vraiment, une fois les minuteurs immédiats passés. */
const waitingTimers = async () => {
  await act(() => jest.advanceTimersByTime(0))
  return jest.getTimerCount()
}

describe('RelativeTime, the shared clock', () => {
  it('keeps as many timers for five dates as for one', async () => {
    const { rerender } = await renderWithProviders(dates(5))
    const withFive = await waitingTimers()

    await rerender(dates(1))

    expect(await waitingTimers()).toBe(withFive)
  })

  it('stops its clock once the last date is gone', async () => {
    const { rerender } = await renderWithProviders(dates(1))
    const withOne = await waitingTimers()

    await rerender(dates(0))

    expect(await waitingTimers()).toBe(withOne - 1)
  })

  it('sets no clock for a date given a fixed time', async () => {
    const { rerender } = await renderWithProviders(dates(0))
    const without = await waitingTimers()

    await rerender(<RelativeTime date="2026-10-19T08:00:00.000Z" now={now} />)

    expect(await waitingTimers()).toBe(without)
  })
})
