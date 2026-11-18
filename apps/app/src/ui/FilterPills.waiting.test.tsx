// Tests de la rangée de pastilles dont les choix ne sont pas encore lus (R16, planche
// R16-Explorer-Listes) : le vrai « Toutes », qui se touche déjà, puis des pastilles vides, sans
// rôle ni nom. La place gardée se mesure dans le navigateur (Jest ne calcule aucune position).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { FilterPills } from './FilterPills'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const waiting = (props: { value?: string | null; scroll?: boolean; onChange?: jest.Mock }) =>
  renderWithProviders(
    <FilterPills
      label="Catégories des projets récents"
      allLabel="Toutes"
      value={props.value ?? null}
      options={[]}
      waiting={8}
      scroll={props.scroll ?? false}
      onChange={props.onChange ?? jest.fn()}
    />,
  )

describe('FilterPills while its choices are being read', () => {
  it('shows the real “All” pill, checked, as the only radio of the named group', async () => {
    await waiting({})
    expect(screen.getByLabelText('Catégories des projets récents').props.accessibilityRole).toBe(
      'radiogroup',
    )
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Toutes', checked: true })).toBeTruthy()
  })

  it('lets “All” be pressed already', async () => {
    const onChange = jest.fn()
    await waiting({ value: 'animals', onChange })
    fireEvent.press(screen.getByRole('radio', { name: 'Toutes', checked: false }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('keeps the empty pills out of the radios, in the scrolling strip too', async () => {
    await waiting({ scroll: true })
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })
})
