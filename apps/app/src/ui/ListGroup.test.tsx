// Tests d'une liste de choix au clavier (tranche 6d) : sur le web, un choix (bouton radio) se coche
// avec la barre d'espace. Sans cela, la page « Signaler » ne pouvait pas s'envoyer au clavier.
// À part de components.test.tsx, partagé avec l'autre agent de la tranche.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow } from './ListGroup'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const press = (key: string) => ({ key, repeat: false, preventDefault: () => {} })

describe('ListRow, a choice on the web', () => {
  it('is checked with the space bar', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <ListGroup title="Pourquoi le signales-tu ?" radio>
          <ListRow label="Arnaque ou spam" selected={false} onPress={onPress} />
        </ListGroup>,
      )

      await fireEvent(screen.getByRole('radio', { name: 'Arnaque ou spam' }), 'keyDown', press(' '))
      expect(onPress).toHaveBeenCalledTimes(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('ignores the space bar while disabled', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <ListGroup radio>
          <ListRow label="Arnaque ou spam" selected={false} onPress={onPress} disabled />
        </ListGroup>,
      )

      await fireEvent(screen.getByRole('radio', { name: 'Arnaque ou spam' }), 'keyDown', press(' '))
      expect(onPress).not.toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
