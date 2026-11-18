// Tests de la liste en colonnes (R16, planches R16-Outils) : les lignes se répartissent en colonnes
// lues de haut en bas, la première colonne pleine avant la deuxième ; le nombre de colonnes suit la
// place (5 dans une page large à 1 920, 4 à 1 440, une seule dans une colonne étroite) ; l'ordre de
// lecture reste l'ordre donné. Jest ne mesure rien : on lit l'arbre (`linesOf`).
import { screen } from '@testing-library/react-native'
import { View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { atWindow, linesOf } from '../testing/wideLayout'
import { ColumnList } from './ColumnList'
import { ListRow } from './ListGroup'
import { Screen } from './Screen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const names = (count: number) => Array.from({ length: count }, (_, i) => `Outil ${i + 1}`)

const rowsOf = (list: string[]) =>
  list.map((name) => <ListRow key={name} label={name} onPress={() => {}} />)

/** Les noms des lignes, groupés par colonne. */
const columnsRead = (list: string[]) => {
  const buttons = list.map((name) => screen.getByRole('button', { name }))
  return linesOf(buttons).groups.map((group) =>
    group.members.map((member) => list[buttons.indexOf(member as never)]),
  )
}

describe('ColumnList', () => {
  it('reads top to bottom, column after column, with the columns imposed', async () => {
    const list = names(7)
    await renderWithProviders(<ColumnList columns={3}>{rowsOf(list)}</ColumnList>)

    // 7 lignes sur 3 colonnes : 3, 3, puis le reste.
    expect(columnsRead(list)).toEqual([
      ['Outil 1', 'Outil 2', 'Outil 3'],
      ['Outil 4', 'Outil 5', 'Outil 6'],
      ['Outil 7'],
    ])
    // L'ordre de lecture est l'ordre donné.
    expect(screen.getAllByRole('button').map((row) => row.props.accessibilityLabel)).toEqual(list)
  })

  it.each([
    [1920, 1080, 5],
    [1440, 900, 4],
  ])('takes as many columns as the wide page allows at %i', (width, height, columns) =>
    atWindow(width, height, async () => {
      const list = names(20)
      await renderWithProviders(
        <Screen title="Outils" width="wide">
          <ColumnList>{rowsOf(list)}</ColumnList>
        </Screen>,
      )

      expect(linesOf(list.map((name) => screen.getByRole('button', { name }))).sizes).toEqual(
        Array.from({ length: columns }, () => 20 / columns),
      )
    }),
  )

  it('keeps a single column in a narrow page', async () => {
    const list = names(4)
    await renderWithProviders(
      <Screen title="Outils">
        <ColumnList>{rowsOf(list)}</ColumnList>
      </Screen>,
    )

    // Une seule colonne : les lignes sont les enfants directs de leur parent commun, chacune sa
    // propre « ligne » pour `linesOf` (comme une colonne de `ListGroup`).
    expect(columnsRead(list)).toEqual(list.map((name) => [name]))
  })

  // Relecture de design R16, point 1 : « Clau » trouvait 2 outils sur 5 colonnes, et la liste
  // dessinait 3 colonnes vides, filets compris.
  it.each([
    [2, 5, [1, 1]],
    [6, 5, [2, 2, 2]],
    [20, 6, [4, 4, 4, 4, 4]],
  ])('draws only the columns its %i rows fill on %i columns', async (count, columns, sizes) => {
    const list = names(count)
    await renderWithProviders(<ColumnList columns={columns}>{rowsOf(list)}</ColumnList>)

    const read = linesOf(list.map((name) => screen.getByRole('button', { name })))
    expect(read.sizes).toEqual(sizes)
    // Aucune colonne de plus, vide, à côté des colonnes remplies.
    const row = read.groups[0]?.line.parent
    expect(row?.children).toHaveLength(sizes.length)
  })

  it('draws nothing without a row', async () => {
    await renderWithProviders(
      <View testID="host">
        <ColumnList columns={4}>{[]}</ColumnList>
      </View>,
    )

    expect(screen.getByTestId('host').children).toHaveLength(0)
  })
})
