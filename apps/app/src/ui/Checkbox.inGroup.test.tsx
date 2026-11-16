// Tests de la case à cocher posée comme ligne d'un groupe (R12, « Mon profil public ») : elle garde
// son rôle, son nom et son état, et prend la hauteur d'une ligne de réglage (`inGroup`).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { Checkbox } from './Checkbox'
import { ListGroup } from './ListGroup'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('Checkbox in a group', () => {
  it('stays a named checkbox with its state, and still toggles', async () => {
    const onValueChange = jest.fn()
    await renderWithProviders(
      <ListGroup>
        <Checkbox inGroup label="Ma bio" value onValueChange={onValueChange} />
        <Checkbox inGroup label="Mon nom" value={false} disabled onValueChange={() => {}} />
      </ListGroup>,
    )

    const bio = screen.getByRole('checkbox', { name: 'Ma bio' })
    expect(bio).toBeChecked()
    await fireEvent.press(bio)
    expect(onValueChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('checkbox', { name: 'Mon nom' })).toBeDisabled()
  })

  it('takes the margins of a settings row, which a free checkbox does not', async () => {
    await renderWithProviders(
      <>
        <Checkbox inGroup label="Dans le groupe" value onValueChange={() => {}} />
        <Checkbox label="Seule" value onValueChange={() => {}} />
      </>,
    )

    const padding = (name: string) =>
      screen.getByRole('checkbox', { name }).props.style?.paddingHorizontal
    expect(padding('Dans le groupe')).toBeGreaterThan(0)
    expect(padding('Seule')).toBeUndefined()
  })
})
