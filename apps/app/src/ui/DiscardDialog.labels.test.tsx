// La fenêtre « Abandonner ? » prend les libellés de ses boutons quand la feuille a les siens (R9 : le
// signalement dit « Continue » / « Abandon » en anglais, pas « Keep editing » / « Discard »). Sans
// eux, ceux de `common` (témoin).
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { DiscardDialog } from './DiscardDialog'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('DiscardDialog labels', () => {
  it('names its buttons with the labels it is given, each doing its own gesture', async () => {
    const onKeep = jest.fn()
    const onDiscard = jest.fn()
    await renderWithProviders(
      <DiscardDialog
        visible
        onKeep={onKeep}
        onDiscard={onDiscard}
        keepLabel="Garder le signalement"
        discardLabel="Jeter le signalement"
      />,
    )
    await passTapGuard()

    expect(screen.queryByRole('button', { name: fr.t(($) => $.common.discard) })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Garder le signalement' }))
    expect(onKeep).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Jeter le signalement' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('keeps the common labels without them', async () => {
    await renderWithProviders(<DiscardDialog visible onKeep={jest.fn()} onDiscard={jest.fn()} />)

    expect(screen.getByRole('button', { name: fr.t(($) => $.common.keepEditing) })).toBeTruthy()
    expect(screen.getByRole('button', { name: fr.t(($) => $.common.discard) })).toBeTruthy()
  })
})
