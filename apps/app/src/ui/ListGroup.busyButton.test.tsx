// Tests d'une ligne-bouton occupée (R18, plan, choix 6) : une ligne qu'on touche (`onPress`) et
// dont l'action est en cours (`busy`) garde son rôle et son nom, est annoncée occupée, ignore un
// second toucher, et n'est pas « inactive » pour autant (elle garde sa place dans le parcours).
// Les choix d'un groupe radio : `ListGroup.busyChoice.test.tsx`.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const onExport = jest.fn()
const onFrench = jest.fn()

beforeEach(() => {
  onExport.mockClear()
  onFrench.mockClear()
})

describe('ListRow busy with an action', () => {
  it('announces the button as busy and ignores a second touch', async () => {
    await renderWithProviders(
      <ListGroup>
        <ListRow label="Exporter mes données" busy onPress={onExport} />
      </ListGroup>,
    )

    const row = screen.getByRole('button', { name: 'Exporter mes données' })
    expect(row).toBeBusy()
    expect(row).not.toBeDisabled()
    await fireEvent.press(row)
    expect(onExport).not.toHaveBeenCalled()
  })

  it('ignores Space and Enter on a busy choice (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <ListGroup radio>
          <ListRow label="Français" selected={false} busy onPress={onFrench} />
          <ListRow label="English" selected onPress={jest.fn()} />
        </ListGroup>,
      )

      const french = screen.getByRole('radio', { name: 'Français' })
      await fireEvent(french, 'keyDown', { key: ' ', preventDefault: () => {} })
      await fireEvent(french, 'keyDown', { key: 'Enter', preventDefault: () => {} })
      expect(onFrench).not.toHaveBeenCalled()
      // Le choix coché reste le seul arrêt de Tab ; le choix occupé n'en sort pas inactif.
      expect(french).not.toBeDisabled()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
