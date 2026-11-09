// Le focus d'ouverture de la fenêtre « Bloquer @x ? » (R6a, correction C8, H3) : elle s'ouvre sur
// « Annuler », comme les autres fenêtres de geste lourd, pas sur « Bloquer ».
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
        asking={{ gesture, member: { id: 'u2', handle: 'sam' } }}
        send={jest.fn()}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await waitFor(() => expect(focused()).toBe('Annuler'))
  })
})
