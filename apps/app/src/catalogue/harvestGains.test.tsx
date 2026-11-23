// La section « La récolte : le pollen au geste » du catalogue (R19) se dessine sans erreur, de jour
// et de nuit : chaque composant y paraît sans gain, puis la pastille n'arrive qu'au premier appui
// de son bouton « Rejouer » (sinon elle aurait fini de jouer avant qu'on la regarde).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { HarvestGainsCatalogue } from './harvestGains'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('HarvestGainsCatalogue', () => {
  it('shows each gain badge only once its replay button is pressed, day and night', async () => {
    await renderWithProviders(<HarvestGainsCatalogue />)
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    const two = fr.t(($) => $.game.gain, { amount: 2 })
    const twentyFive = fr.t(($) => $.game.gain, { amount: 25 })
    expect(screen.queryAllByText(two, { includeHiddenElements: true })).toHaveLength(0)

    // Capsule, éventail et « above » de PollenGainSpot, par thème : six boutons « Rejouer +2 ».
    const replays = screen.getAllByRole('button', { name: 'Rejouer +2' })
    expect(replays).toHaveLength(6)
    for (const replay of replays) await fireEvent.press(replay)
    expect(screen.getAllByText(two, { includeHiddenElements: true })).toHaveLength(6)

    const [end] = screen.getAllByRole('button', { name: 'Rejouer +25' })
    if (!end) throw new Error('no replay button for the end placement')
    await fireEvent.press(end)
    expect(screen.getByText(twentyFive, { includeHiddenElements: true })).toBeTruthy()
  })

  it('replays the comb spending from 7 cells to 3', async () => {
    await renderWithProviders(<HarvestGainsCatalogue />)
    const [replay] = screen.getAllByRole('button', { name: 'Rejouer la dépense' })
    if (!replay) throw new Error('no replay button for the drain')
    await fireEvent.press(replay)
    // La valeur lue est tout de suite la vraie : 3 alvéoles.
    const combs = screen.getAllByLabelText('Mon rayon')
    expect(combs).toHaveLength(2)
    for (const comb of combs) expect(comb).toHaveAccessibilityValue({ text: '3 alvéoles sur 10' })
  })
})
