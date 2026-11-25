// La section « La récolte : ce qui bouge » du catalogue (R19) se dessine sans erreur, de jour et de
// nuit, et ses boutons rejouent : le passage de niveau (l'annonce « Niveau 5 » revient) et la
// pastille de gain (montée au premier appui, cachée au lecteur d'écran).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HarvestMotionCatalogue } from './harvestMotion'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

describe('HarvestMotionCatalogue', () => {
  it('replays the level rise, day and night', async () => {
    await renderWithProviders(<HarvestMotionCatalogue />)
    await wait(2000)

    // Deux alvéoles qui passent au niveau 5 par thème : la phrase est dans leurs régions polies.
    const level5 = fr.t(($) => $.game.level, { level: 5 })
    expect(screen.getAllByText(level5)).toHaveLength(4)

    const [replay] = screen.getAllByRole('button', { name: 'Rejouer le passage' })
    if (!replay) throw new Error('no replay button')
    await fireEvent.press(replay)
    // Remontées, les alvéoles repartent du 4 : leur annonce attend que le 5 apparaisse.
    expect(screen.getAllByText(level5)).toHaveLength(2)
    await wait(2000)
    expect(screen.getAllByText(level5)).toHaveLength(4)
  })

  it('shows the gain badge only once its replay button is pressed', async () => {
    await renderWithProviders(<HarvestMotionCatalogue />)
    const badge = fr.t(($) => $.game.gain, { amount: 2 })
    expect(screen.queryByText(badge, { includeHiddenElements: true })).toBeNull()

    const [replay] = screen.getAllByRole('button', { name: 'Rejouer +2' })
    if (!replay) throw new Error('no replay button')
    await fireEvent.press(replay)

    expect(screen.getByText(badge, { includeHiddenElements: true })).toBeTruthy()
    // Dessinée, mais jamais lue : l'annonce polie dit la phrase entière.
    expect(screen.queryByText(badge)).toBeNull()
  })
})
