// Tests de la grille de cartes commune (R16, « Ruches, Recherche et Outils en grand ») : autant de
// colonnes qu'il tient de cartes de la largeur minimale donnée dans la largeur de sa colonne
// (publiée par `Screen` ou `Columns`), en rangées ; une carte seule sur sa rangée garde la largeur
// des autres (sa rangée a toutes ses cases) ; une liste lue avec un élément par carte. Et le seuil
// du gabarit large (`useWideTemplate`) : 1 280 points.
//
// Jest ne mesure rien : on lit l'arbre (rangées, cases), jamais une position.
import { screen } from '@testing-library/react-native'
import { Text, View } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { atWindow, inOrder, linesOf } from '../testing/wideLayout'
import { CardGrid, useWideTemplate } from './CardGrid'
import { ContentWidthContext } from './theme/layout'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

/** Des cartes nommées « Carte 1 », « Carte 2 »… */
const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => `Carte ${index + 1}`).map((name) => (
    <Text key={name} testID="card">
      {name}
    </Text>
  ))

/**
 * Les vues qui portent ce rôle (`role`, lu sur le web). Lues dans l'arbre : une vue de liste n'est
 * pas un élément « accessible » au sens de RNTL, qui ne la trouverait pas par `getByRole`.
 */
const withRole = (role: string) => inOrder().filter((node) => node.props.role === role)

/** La grille, posée dans une colonne de cette largeur. */
const inColumn = (width: number, grid: React.ReactNode) =>
  renderWithProviders(
    <ContentWidthContext.Provider value={width}>{grid}</ContentWidthContext.Provider>,
  )

describe('CardGrid', () => {
  it.each([
    // 4 × 400 + 3 × 24 ≤ 1 728 (1 920 en grand) ; 3 à 1 376 (1 440) ; une seule à 600.
    [1728, [4, 1]],
    [1376, [3, 2]],
    [600, [1, 1, 1, 1, 1]],
  ])(
    'fits as many cards of the given width as the column of %i holds (%j per row)',
    async (width, rows) => {
      await inColumn(
        width,
        <CardGrid minWidth={400} gap="xxl">
          {cards(5)}
        </CardGrid>,
      )

      expect(linesOf(screen.getAllByTestId('card')).sizes).toEqual(rows)
    },
  )

  it('keeps every cell of the last row, so that a card alone is never stretched', async () => {
    await inColumn(
      1728,
      <CardGrid minWidth={400} gap="xxl">
        {cards(5)}
      </CardGrid>,
    )

    // La rangée de la cinquième carte a ses quatre cases, comme la première.
    const { groups } = linesOf(screen.getAllByTestId('card'))
    expect(groups.map((group) => group.line.children.length)).toEqual([4, 4])
  })

  it('is read as a list with one item per card, and no item for an empty cell', async () => {
    await inColumn(1728, <CardGrid minWidth={400}>{cards(5)}</CardGrid>)

    expect(withRole('list')).toHaveLength(1)
    expect(withRole('listitem')).toHaveLength(5)
  })

  it('is no list when told so', async () => {
    await inColumn(
      1728,
      <CardGrid minWidth={400} list={false}>
        {cards(2)}
      </CardGrid>,
    )

    expect(withRole('list')).toHaveLength(0)
    expect(withRole('listitem')).toHaveLength(0)
  })

  it('takes the number of columns imposed, whatever the room', async () => {
    await inColumn(
      600,
      <CardGrid minWidth={400} columns={5}>
        {cards(6)}
      </CardGrid>,
    )

    expect(linesOf(screen.getAllByTestId('card')).sizes).toEqual([5, 1])
  })

  it('draws nothing without a card', async () => {
    await inColumn(
      1728,
      <View testID="host">
        <CardGrid minWidth={400}>{[]}</CardGrid>
      </View>,
    )

    expect(screen.getByTestId('host').children).toHaveLength(0)
  })
})

describe('useWideTemplate', () => {
  function Probe() {
    return <Text>{useWideTemplate() ? 'wide' : 'narrow'}</Text>
  }

  it.each([
    [1920, 'wide'],
    [1280, 'wide'],
    [1279, 'narrow'],
    [390, 'narrow'],
  ])('at %i, says %s', (width, expected) =>
    atWindow(width, 900, async () => {
      await renderWithProviders(<Probe />)
      expect(screen.getByText(expected)).toBeTruthy()
    }),
  )
})
