// Un choix d'un groupe radio donne aussi sa vue à l'écran qui la demande (`ref`, R9) : la feuille
// « Signaler » y rend le focus quand on revient à « Quelle partie ? ». Le groupe la garde toujours
// pour ses flèches (témoin : la flèche coche et donne le focus au voisin).
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, type View } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ListRow ref on a choice', () => {
  it('gives the view of a choice to the screen through its ref', async () => {
    const ref = createRef<View>()
    await renderWithProviders(
      <ListGroup radio label="Quelle partie ?">
        <ListRow label="Tout le projet" selected={false} onPress={jest.fn()} />
        <ListRow label="La 2e photo" selected onPress={jest.fn()} ref={ref} />
      </ListGroup>,
    )

    // La vue reçue est celle du choix lui-même : son nom (témoin, le choix est là).
    expect(screen.getByRole('radio', { name: 'La 2e photo' })).toBeTruthy()
    expect(labelOf(ref.current)).toBe('La 2e photo')
  })

  it('still lets the group move the focus to the next choice with an arrow', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onSecond = jest.fn()
      const ref = createRef<View>()
      await renderWithProviders(
        <ListGroup radio label="Quelle partie ?">
          <ListRow label="Tout le projet" selected onPress={jest.fn()} ref={ref} />
          <ListRow label="La 2e photo" selected={false} onPress={onSecond} />
        </ListGroup>,
      )

      await fireEvent(screen.getByRole('radio', { name: 'Tout le projet' }), 'keyDown', {
        key: 'ArrowDown',
        preventDefault: () => {},
      })

      expect(onSecond).toHaveBeenCalledTimes(1)
      expect(ref.current).not.toBeNull()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
