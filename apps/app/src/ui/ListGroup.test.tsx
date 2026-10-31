// Tests d'une liste de choix au clavier (tranche 7a) : sur le web, un choix (bouton radio) se coche
// avec la barre d'espace. Sans cela, la page « Signaler » ne pouvait pas s'envoyer au clavier.
// À part de components.test.tsx, partagé avec l'autre agent de la tranche.
// R1 : en mode radio, le groupe entier se parcourt au clavier (flèches, un seul arrêt de Tab).
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { ListGroup, ListRow } from './ListGroup'
import { Text } from './Text'

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

// Les lignes-liens des réglages (R2) : `href` en fait un lien vers une vraie adresse, `current`
// dit la page ouverte, `hint` ce que contient la rubrique (relecture de l'interface, C7).
describe('a row that leads to a page', () => {
  const propsOf = (element: { props: unknown }) => element.props as Record<string, unknown>

  it('is a link carrying its address, and the gesture goes to the screen', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <ListGroup>
        <ListRow label="Langue" href="/settings/language" trailing="chevron" onPress={onPress} />
      </ListGroup>,
    )

    const link = screen.getByRole('link', { name: 'Langue' })
    expect(propsOf(link).href).toBe('/settings/language')
    expect(propsOf(link)['aria-current']).toBeUndefined()
    await fireEvent.press(link)
    expect(onPress).toHaveBeenCalled()
  })

  it('says it leads to the open page (aria-current)', async () => {
    await renderWithProviders(
      <ListGroup>
        <ListRow label="Langue" href="/settings/language" current onPress={() => {}} />
        <ListRow label="Sécurité" href="/settings/security" onPress={() => {}} />
      </ListGroup>,
    )

    expect(propsOf(screen.getByRole('link', { name: 'Langue' }))['aria-current']).toBe('page')
    expect(propsOf(screen.getByRole('link', { name: 'Sécurité' }))['aria-current']).toBeUndefined()
  })

  it('reads its hint after its name on a phone', async () => {
    await renderWithProviders(
      <ListGroup>
        <ListRow
          label="Sécurité"
          href="/settings/security"
          hint="Mot de passe, membres bloqués"
          onPress={() => {}}
        />
      </ListGroup>,
    )

    const link = screen.getByRole('link', { name: 'Sécurité' })
    expect(propsOf(link).accessibilityHint).toBe('Mot de passe, membres bloqués')
  })

  it('links its hint as a description on the web (aria-describedby)', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <ListGroup>
          <ListRow
            label="Sécurité"
            href="/settings/security"
            hint="Mot de passe, membres bloqués"
            onPress={() => {}}
          />
        </ListGroup>,
      )

      const link = screen.getByRole('link', { name: 'Sécurité' })
      const id = propsOf(link)['aria-describedby']
      expect(id).toBeTruthy()
      expect(propsOf(link).accessibilityHint).toBeUndefined()
      // Le texte décrit existe, caché, sous l'identifiant désigné.
      const hint = screen.getByText('Mot de passe, membres bloqués', {
        includeHiddenElements: true,
      })
      expect(propsOf(hint.parent as { props: unknown }).nativeID).toBe(id)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

// R3 (relecture de l'interface, ui-10) : un résultat de recherche surligne la partie du titre qui
// correspond (HighlightedText). La ligne accepte donc un nœud à la place du texte du titre
// (`title`) ; le nom lu reste le texte (`label`), et ce texte n'est pas dessiné une seconde fois.
describe('a row whose title is a node', () => {
  // Un titre dont une partie est marquée, comme le ferait HighlightedText : un texte imbriqué.
  const marked = (
    <Text>
      Carn<Text>et de cafés</Text>
    </Text>
  )

  it('shows the node in place of its label, and is still named by the label', async () => {
    const onPress = jest.fn()
    await renderWithProviders(
      <ListGroup>
        <ListRow label="Carnet de cafés" title={marked} href="/projects/p1" onPress={onPress} />
      </ListGroup>,
    )

    const link = screen.getByRole('link', { name: 'Carnet de cafés' })
    // Le nœud est là (sa partie marquée se trouve), et il est le seul à porter ce texte : le
    // libellé n'est pas répété dessous.
    expect(screen.getByText('et de cafés')).toBeTruthy()
    expect(screen.getAllByText('Carnet de cafés')).toHaveLength(1)
    await fireEvent.press(link)
    expect(onPress).toHaveBeenCalled()
  })

  it('keeps its detail under the node', async () => {
    await renderWithProviders(
      <ListGroup>
        <ListRow label="Carnet de cafés" title={marked} detail="Sam Petit · En cours" />
      </ListGroup>,
    )

    expect(screen.getByText('et de cafés')).toBeTruthy()
    expect(screen.getAllByText('Carnet de cafés')).toHaveLength(1)
    expect(screen.getByText('Sam Petit · En cours')).toBeTruthy()
  })
})
