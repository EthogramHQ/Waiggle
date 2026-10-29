// Tests d'une liste de choix au clavier (tranche 7a) : sur le web, un choix (bouton radio) se coche
// avec la barre d'espace. Sans cela, la page « Signaler » ne pouvait pas s'envoyer au clavier.
// À part de components.test.tsx, partagé avec l'autre agent de la tranche.
// R1 : en mode radio, le groupe entier se parcourt au clavier (flèches, un seul arrêt de Tab).
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
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

  // R1 : Entrée choisit aussi, comme dans Segmented.
  it('is checked with Enter', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      const onPress = jest.fn()
      await renderWithProviders(
        <ListGroup title="Pourquoi le signales-tu ?" radio>
          <ListRow label="Arnaque ou spam" selected={false} onPress={onPress} />
        </ListGroup>,
      )

      await fireEvent(
        screen.getByRole('radio', { name: 'Arnaque ou spam' }),
        'keyDown',
        press('Enter'),
      )
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

// R1, point de liste « ListGroup en radio : 7 arrêts de Tab » : la page « Signaler » obligeait à
// passer sept fois par Tab pour traverser ses motifs. En mode radio, le groupe se parcourt comme
// Segmented et Choices : un seul arrêt de Tab, puis les flèches haut et bas, qui font le tour.
describe('ListGroup as a radio group, on the web', () => {
  const reasons = ['Arnaque ou spam', 'Harcèlement', 'Autre chose'] as const
  type Reason = (typeof reasons)[number]

  function Reasons({ start = null }: { start?: Reason | null }) {
    const [value, setValue] = useState<Reason | null>(start)
    return (
      <ListGroup title="Pourquoi le signales-tu ?" radio>
        {reasons.map((reason) => (
          <ListRow
            key={reason}
            label={reason}
            selected={value === reason}
            onPress={() => setValue(reason)}
          />
        ))}
      </ListGroup>
    )
  }

  const tabIndexes = () =>
    screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)

  it('is a single stop for Tab: the first choice while none is checked', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Reasons />)
      expect(tabIndexes()).toEqual([0, -1, -1])
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('moves its single Tab stop to the checked choice', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Reasons />)

      await fireEvent.press(screen.getByRole('radio', { name: 'Autre chose' }))

      expect(screen.getByRole('radio', { name: 'Autre chose', checked: true })).toBeTruthy()
      expect(tabIndexes()).toEqual([-1, -1, 0])
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('checks the next choice with the down arrow, going round after the last', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Reasons start="Harcèlement" />)

      await fireEvent(
        screen.getByRole('radio', { name: 'Harcèlement' }),
        'keyDown',
        press('ArrowDown'),
      )
      expect(screen.getByRole('radio', { name: 'Autre chose', checked: true })).toBeTruthy()

      await fireEvent(
        screen.getByRole('radio', { name: 'Autre chose' }),
        'keyDown',
        press('ArrowDown'),
      )
      expect(screen.getByRole('radio', { name: 'Arnaque ou spam', checked: true })).toBeTruthy()
      expect(tabIndexes()).toEqual([0, -1, -1])
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('checks the previous choice with the up arrow, going round before the first', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Reasons start="Arnaque ou spam" />)

      await fireEvent(
        screen.getByRole('radio', { name: 'Arnaque ou spam' }),
        'keyDown',
        press('ArrowUp'),
      )
      expect(screen.getByRole('radio', { name: 'Autre chose', checked: true })).toBeTruthy()
      expect(screen.getByRole('radio', { name: 'Arnaque ou spam', checked: false })).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('checks a choice with Enter or the space bar', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Reasons />)

      await fireEvent(screen.getByRole('radio', { name: 'Harcèlement' }), 'keyDown', press('Enter'))
      expect(screen.getByRole('radio', { name: 'Harcèlement', checked: true })).toBeTruthy()

      await fireEvent(screen.getByRole('radio', { name: 'Autre chose' }), 'keyDown', press(' '))
      expect(screen.getByRole('radio', { name: 'Autre chose', checked: true })).toBeTruthy()
    } finally {
      jest.restoreAllMocks()
    }
  })
})
