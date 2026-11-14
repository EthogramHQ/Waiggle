// Tests du champ à menu (R9, la fenêtre « Retirer ») : son nom lu commence par le libellé et dit
// le choix actuel, il ouvre un menu de choix où le choix actuel est coché, et un choix pris part à
// l'écran. Et la phrase d'un bouton radio (RadioGroup `detail`), lue après son nom.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { choiceRole } from '../testing/text'
import { MenuField } from './MenuField'
import { RadioGroup } from './Radio'

const options = [
  { value: 'illegal' as const, label: 'La loi' },
  { value: 'rules' as const, label: 'Les règles' },
]

describe('MenuField', () => {
  it('names itself by its label then the placeholder while nothing is chosen', async () => {
    await renderWithProviders(
      <MenuField
        label="Fondement"
        value={null}
        options={options}
        onChange={() => {}}
        placeholder="À choisir"
      />,
    )

    expect(screen.getByRole('button', { name: 'Fondement, À choisir' })).toBeTruthy()
  })

  it('opens its choices, the current one checked, and gives the one chosen', async () => {
    const onChange = jest.fn()
    await renderWithProviders(
      <MenuField
        label="Fondement"
        value="illegal"
        options={options}
        onChange={onChange}
        placeholder="À choisir"
      />,
    )

    await fireEvent.press(screen.getByRole('button', { name: 'Fondement, La loi' }))
    const law = await screen.findByRole(choiceRole(), { name: /La loi/ })
    expect(law.props.accessibilityState?.checked ?? law.props['aria-checked']).toBe(true)
    await fireEvent.press(screen.getByRole(choiceRole(), { name: /Les règles/ }))

    expect(onChange).toHaveBeenCalledWith('rules')
  })

  it('shows the missing answer under the field', async () => {
    await renderWithProviders(
      <MenuField
        label="Fondement"
        value={null}
        options={options}
        onChange={() => {}}
        placeholder="À choisir"
        error="Choisis un fondement."
      />,
    )

    expect(screen.getByText('Choisis un fondement.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Fondement/ }).props.accessibilityHint).toBe(
      Platform.OS === 'web' ? undefined : 'Choisis un fondement.',
    )
  })
})

describe('RadioGroup detail', () => {
  it('shows the sentence of a choice and reads it after its name', async () => {
    await renderWithProviders(
      <RadioGroup
        label="Que retirer ?"
        value="part"
        onChange={() => {}}
        options={[
          { value: 'part', label: 'Seulement cette partie', detail: 'Le reste reste affiché.' },
          { value: 'whole', label: 'Tout le projet' },
        ]}
      />,
    )

    const part = screen.getByRole('radio', { name: 'Seulement cette partie' })
    expect(part).toBeChecked()
    expect(part.props.accessibilityHint).toBe('Le reste reste affiché.')
    expect(screen.getByText('Le reste reste affiché.')).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: 'Tout le projet' }).props.accessibilityHint,
    ).toBeUndefined()
  })
})
