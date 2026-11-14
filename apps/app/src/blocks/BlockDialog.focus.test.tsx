// Le focus d'ouverture de la fenêtre « Bloquer Nom (@x) ? » (R6a, correction C8, H3) : elle s'ouvre
// sur « Annuler », comme les autres fenêtres de geste lourd, pas sur « Bloquer ». R9 : le membre
// visé porte aussi son nom (titre de la planche R9-Bloquer).
import { waitFor } from '@testing-library/react-native'
import { watchOpeningFocus } from '../testing/openingFocus'
import { renderWithProviders } from '../testing/render'
import { BlockDialog } from './BlockDialog'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('BlockDialog opening focus', () => {
  it.each(['block', 'unblock'] as const)('opens on « Annuler » to %s', async (gesture) => {
    const focused = watchOpeningFocus()
    await renderWithProviders(
      <BlockDialog
        asking={{ gesture, member: { id: 'u2', name: 'Sam', handle: 'sam' } }}
        send={jest.fn()}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await waitFor(() => expect(focused()).toBe('Annuler'))
  })
})
