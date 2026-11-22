// Tests d'une ligne de choix « occupée » (R18, « Le premier chargement plus léger » ; plan, choix 6) :
// dans un groupe de choix (`ListGroup radio`), la ligne touchée dont l'action prend du temps (la
// langue anglaise qui se charge, dans les Réglages) reçoit `busy` en gardant son `onPress`. Elle est
// annoncée occupée, garde son rôle (radio) et son nom ; la ligne cochée reste cochée ; un second
// choix est ignoré pendant ce temps (toucher, ou flèches du clavier sur le web).
// Aujourd'hui, `busy` ne s'annonce que sur une ligne sans `onPress` (une attente, rôle progressbar).
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const chooseFrench = jest.fn()
const chooseEnglish = jest.fn()

const languages = (englishBusy: boolean) =>
  renderWithProviders(
    <ListGroup radio>
      <ListRow label="Français" selected onPress={chooseFrench} />
      <ListRow label="English" selected={false} busy={englishBusy} onPress={chooseEnglish} />
    </ListGroup>,
  )

beforeEach(() => {
  chooseFrench.mockClear()
  chooseEnglish.mockClear()
})

describe('ListRow busy in a group of choices', () => {
  it('announces the touched choice as busy and ignores a second choice meanwhile', async () => {
    await languages(true)

    const english = screen.getByRole('radio', { name: 'English' })
    expect(english).toBeBusy()
    expect(english).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked()

    // Pendant l'attente, ni l'autre choix ni un second toucher sur le choix occupé ne partent.
    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }))
    await fireEvent.press(english)
    expect(chooseFrench).not.toHaveBeenCalled()
    expect(chooseEnglish).not.toHaveBeenCalled()
  })

  it('ignores the arrow keys too while a choice is busy (web)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await languages(true)

      await fireEvent(screen.getByRole('radio', { name: 'Français' }), 'keyDown', {
        key: 'ArrowDown',
        preventDefault: () => {},
      })
      expect(chooseEnglish).not.toHaveBeenCalled()
      expect(chooseFrench).not.toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('lets the choices be touched again once nothing is busy', async () => {
    // Témoin : sans attente, l'autre choix part bien au toucher et aux flèches.
    await languages(false)

    expect(screen.getByRole('radio', { name: 'English' })).not.toBeBusy()
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))
    expect(chooseEnglish).toHaveBeenCalledTimes(1)
  })
})
