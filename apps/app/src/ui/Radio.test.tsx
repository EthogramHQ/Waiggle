// Tests du bouton radio rond et de son groupe (refonte, tranche R1). Un groupe se comporte comme
// tout groupe de boutons radio : un seul choix coché, annoncé aux lecteurs d'écran ; au clavier
// (web), Tab n'arrive que sur un choix (« tabIndex itinérant »), les flèches passent au voisin en
// le cochant, la barre d'espace coche. `RadioMark` n'est que le rond dessiné, réutilisé par
// ListGroup : c'est la ligne qui porte le rôle, pas lui.
import { fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { RadioGroup, RadioMark } from './Radio'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Une touche du clavier, telle que react-native-web la passe à onKeyDown. */
const key = (name: string) => ({ key: name, repeat: false, preventDefault: () => {} })

type Size = 'small' | 'medium' | 'large'
const options: { value: Size; label: string; disabled?: boolean }[] = [
  { value: 'small', label: 'Petite ruche' },
  { value: 'medium', label: 'Ruche moyenne' },
  { value: 'large', label: 'Grande ruche' },
]

/** Un groupe qui garde son choix, comme dans un vrai formulaire. */
const Sample = ({
  start = null,
  choices = options,
}: {
  start?: Size | null
  choices?: typeof options
}) => {
  const [value, setValue] = useState<Size | null>(start)
  return <RadioGroup label="Taille" options={choices} value={value} onChange={setValue} />
}

/** Le tabIndex de chaque choix, dans l'ordre (des valeurs simples : voir code-appli.md). */
const tabIndexes = () =>
  screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined)

describe('RadioGroup', () => {
  it('is a radio group named by its label, with one radio per choice', async () => {
    await renderWithProviders(<Sample />)

    // Pas de getByRole : RNTL ne trouve un rôle que sur un élément « accessible », qui, sur iOS,
    // cacherait les radios à VoiceOver (charte design). On lit le rôle de l'élément nommé.
    expect(screen.getByLabelText('Taille').props.accessibilityRole).toBe('radiogroup')
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByRole('radio', { checked: true })).toBeNull()
  })

  it('announces the checked choice', async () => {
    await renderWithProviders(<Sample start="medium" />)

    expect(screen.getByRole('radio', { name: 'Ruche moyenne', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Petite ruche', checked: false })).toBeTruthy()
  })

  it('checks a choice when touched, and only that one', async () => {
    await renderWithProviders(<Sample start="small" />)

    await fireEvent.press(screen.getByRole('radio', { name: 'Grande ruche' }))

    expect(screen.getByRole('radio', { name: 'Grande ruche', checked: true })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('gives the chosen value to the screen that uses it', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <RadioGroup label="Taille" options={options} value={null} onChange={onChange} />,
    )

    await fireEvent.press(screen.getByRole('radio', { name: 'Ruche moyenne' }))

    expect(onChange).toHaveBeenCalledWith('medium')
  })

  it('cannot check a disabled choice, and says it is disabled', async () => {
    const onChange = jest.fn()
    const choices = options.map((option) =>
      option.value === 'large' ? { ...option, disabled: true } : option,
    )
    await renderWithProviders(
      <RadioGroup label="Taille" options={choices} value={null} onChange={onChange} />,
    )

    const large = screen.getByRole('radio', { name: 'Grande ruche' })
    expect(large).toBeDisabled()
    await fireEvent.press(large)
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('on the web, with the keyboard', () => {
    it('checks a choice with the space bar', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(<Sample />)

        await fireEvent(screen.getByRole('radio', { name: 'Ruche moyenne' }), 'keyDown', key(' '))

        expect(screen.getByRole('radio', { name: 'Ruche moyenne', checked: true })).toBeTruthy()
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('moves to the next or previous choice with the arrows, going round', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(<Sample start="small" />)

        await fireEvent(
          screen.getByRole('radio', { name: 'Petite ruche' }),
          'keyDown',
          key('ArrowDown'),
        )
        expect(screen.getByRole('radio', { name: 'Ruche moyenne', checked: true })).toBeTruthy()

        await fireEvent(
          screen.getByRole('radio', { name: 'Ruche moyenne' }),
          'keyDown',
          key('ArrowRight'),
        )
        expect(screen.getByRole('radio', { name: 'Grande ruche', checked: true })).toBeTruthy()

        // Après le dernier, la flèche revient au premier ; avant le premier, au dernier.
        await fireEvent(
          screen.getByRole('radio', { name: 'Grande ruche' }),
          'keyDown',
          key('ArrowDown'),
        )
        expect(screen.getByRole('radio', { name: 'Petite ruche', checked: true })).toBeTruthy()

        await fireEvent(
          screen.getByRole('radio', { name: 'Petite ruche' }),
          'keyDown',
          key('ArrowUp'),
        )
        expect(screen.getByRole('radio', { name: 'Grande ruche', checked: true })).toBeTruthy()

        await fireEvent(
          screen.getByRole('radio', { name: 'Grande ruche' }),
          'keyDown',
          key('ArrowLeft'),
        )
        expect(screen.getByRole('radio', { name: 'Ruche moyenne', checked: true })).toBeTruthy()
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('skips a disabled choice with the arrows', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        const choices = options.map((option) =>
          option.value === 'medium' ? { ...option, disabled: true } : option,
        )
        await renderWithProviders(<Sample start="small" choices={choices} />)

        await fireEvent(
          screen.getByRole('radio', { name: 'Petite ruche' }),
          'keyDown',
          key('ArrowDown'),
        )

        expect(screen.getByRole('radio', { name: 'Grande ruche', checked: true })).toBeTruthy()
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('is a single stop for Tab: the checked choice, or the first one when none is', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        await renderWithProviders(<Sample />)

        expect(tabIndexes()).toEqual([0, -1, -1])

        await fireEvent.press(screen.getByRole('radio', { name: 'Grande ruche' }))
        expect(tabIndexes()).toEqual([-1, -1, 0])
      } finally {
        jest.restoreAllMocks()
      }
    })

    it('never stops Tab on a disabled choice', async () => {
      jest.replaceProperty(Platform, 'OS', 'web')
      try {
        const choices = options.map((option) =>
          option.value === 'small' ? { ...option, disabled: true } : option,
        )
        await renderWithProviders(<Sample choices={choices} />)

        expect(tabIndexes()).toEqual([-1, 0, -1])
      } finally {
        jest.restoreAllMocks()
      }
    })
  })
})

describe('RadioMark', () => {
  it('draws the round mark without being a radio itself', async () => {
    // Le rond seul, pour ListGroup : la ligne qui le contient porte déjà le rôle « radio » ; un
    // second rôle ferait annoncer chaque choix deux fois.
    // Le rond est posé dans une vue repérée, pour vérifier qu'il dessine bien quelque chose.
    await renderWithProviders(
      <View testID="row">
        <RadioMark selected />
      </View>,
    )

    expect(screen.getByTestId('row').children.length).toBeGreaterThan(0) // témoin
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
