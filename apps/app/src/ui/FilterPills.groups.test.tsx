// Tests de deux réglages de la rangée de pastilles (tranche R6b), en plus de FilterPills.test.tsx :
// - `groups` : le statut puis les catégories sur la même rangée (page d'un outil, ordinateur).
//   Chaque groupe reste un groupe de radios à part, avec son nom, sa valeur, son rappel et son
//   propre arrêt de Tab ; le trait qui les sépare n'est pas lu ;
// - `scroll` : la bande qui défile d'un téléphone garde les mêmes radios, dans le même ordre.
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { FilterPills } from './FilterPills'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const statusOptions = [
  { value: 'testable', label: 'Testables' },
  { value: 'done', label: 'Terminés' },
] as const
const categoryOptions = [
  { value: 'cooking', label: 'Cuisine' },
  { value: 'animals', label: 'Animaux' },
] as const

function Row({
  onStatus = () => {},
  onCategory = () => {},
}: {
  onStatus?: (value: 'testable' | 'done' | null) => void
  onCategory?: (value: string | null) => void
}) {
  return (
    <FilterPills
      label="Où en sont les projets"
      allLabel="Tous"
      value="testable"
      options={[...statusOptions]}
      onChange={onStatus}
      groups={[
        {
          label: 'Catégorie',
          allLabel: 'Toutes',
          value: null,
          options: [...categoryOptions],
          onChange: onCategory,
        },
      ]}
    />
  )
}

describe('FilterPills groups', () => {
  it('reads each group as its own named radiogroup, in order, with its own checked pill', async () => {
    await renderWithProviders(<Row />)

    const status = screen.getByLabelText('Où en sont les projets')
    const category = screen.getByLabelText('Catégorie')
    expect(status.props.accessibilityRole ?? status.props.role).toBe('radiogroup')
    expect(category.props.accessibilityRole ?? category.props.role).toBe('radiogroup')
    expect(
      within(status)
        .getAllByRole('radio')
        .map((radio) => radio.props.accessibilityLabel),
    ).toEqual(['Tous', 'Testables', 'Terminés'])
    expect(
      within(category)
        .getAllByRole('radio')
        .map((radio) => radio.props.accessibilityLabel),
    ).toEqual(['Toutes', 'Cuisine', 'Animaux'])
    // Une pastille cochée par groupe.
    expect(within(status).getByRole('radio', { name: 'Testables', checked: true })).toBeTruthy()
    expect(within(category).getByRole('radio', { name: 'Toutes', checked: true })).toBeTruthy()
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(2)
  })

  it('gives a touched pill to the callback of its own group only', async () => {
    const onStatus = jest.fn()
    const onCategory = jest.fn()
    await renderWithProviders(<Row onStatus={onStatus} onCategory={onCategory} />)

    await fireEvent.press(screen.getByRole('radio', { name: 'Animaux' }))
    expect(onCategory).toHaveBeenLastCalledWith('animals')
    expect(onStatus).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByRole('radio', { name: 'Tous' }))
    expect(onStatus).toHaveBeenLastCalledWith(null)
    expect(onCategory).toHaveBeenCalledTimes(1)
  })

  it('keeps one tab stop per group on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<Row />)
      expect(
        screen.getAllByRole('radio').map((radio) => radio.props.tabIndex as number | undefined),
      ).toEqual([-1, 0, -1, 0, -1, -1])
    } finally {
      jest.restoreAllMocks()
    }
  })
})

describe('FilterPills scroll', () => {
  it('keeps the same radios, in the same order, in the scrolling strip', async () => {
    await renderWithProviders(
      <FilterPills
        label="Catégories des projets récents"
        allLabel="Toutes"
        value="animals"
        options={[...categoryOptions]}
        scroll
        onChange={() => {}}
      />,
    )

    const group = screen.getByLabelText('Catégories des projets récents')
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.props.accessibilityLabel),
    ).toEqual(['Toutes', 'Cuisine', 'Animaux'])
    expect(screen.getByRole('radio', { name: 'Animaux', checked: true })).toBeTruthy()
  })
})
