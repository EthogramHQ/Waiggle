// Tests des barres par famille (R19, `FamilyBars`) : une famille sans pollen cette semaine n'a pas
// de ligne, et les lignes vont de la plus fournie à la moins fournie (planche R19-Recolte).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FamilyBars } from './FamilyBars'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Family = 'forager' | 'builder' | 'keeper' | 'dancer'
const familyName = (family: Family) => fr.t(($) => $.game.families[family])
const barName = (family: Family, amount: number) =>
  fr.t(($) => $.game.harvest.week.family, { family: familyName(family), amount })

describe('FamilyBars, rows', () => {
  it('leaves out a family without pollen this week', async () => {
    await renderWithProviders(
      <FamilyBars byFamily={{ forager: 18, builder: 6, keeper: 12, dancer: 0 }} />,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText(familyName('dancer'))).toBeNull()
  })

  it('lists the families from the most pollen to the least', async () => {
    await renderWithProviders(
      <FamilyBars byFamily={{ forager: 18, builder: 6, keeper: 47, dancer: 0 }} />,
    )

    expect(screen.getAllByRole('listitem').map((row) => row.props.accessibilityLabel)).toEqual([
      barName('keeper', 47),
      barName('forager', 18),
      barName('builder', 6),
    ])
  })

  it('shows nothing in a week without pollen', async () => {
    await renderWithProviders(
      <FamilyBars byFamily={{ forager: 0, builder: 0, keeper: 0, dancer: 0 }} />,
    )

    expect(screen.queryByRole('list')).toBeNull()
  })
})
