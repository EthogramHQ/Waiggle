// Tests de la liste d'un classement (R19, `RankingList`, page « Classement de la semaine ») : une
// ligne par membre, qui mène à sa page. Seuls les trois premiers ont leur rang, à l'œil comme au
// lecteur d'écran (option b4 des planches) ; chaque ligne se lit d'un trait (« 1er, Léa, 340
// pollen », relecture d'interface du plan UI-2, au lieu d'une liste ordonnée qui numéroterait tout
// le monde) ; « toi » n'existe que pour le lecteur d'écran, sur sa propre ligne.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { RankingList } from './RankingList'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const row = (rank: number, name: string, pollen: number, self = false) => ({
  rank,
  name,
  avatar: null,
  pollen,
  self,
  href: `/members/${name.toLowerCase()}`,
})

// Léa lit le classement de ses proches : elle est 2e, à égalité avec Sam ; Nora vient ensuite.
const rows = [
  row(1, 'Malik', 340),
  row(2, 'Léa', 120, true),
  row(2, 'Sam', 120),
  row(4, 'Nora', 80),
  row(5, 'Inès', 12),
]

const RANKS = {
  1: fr.t(($) => $.game.rankings.rank.first),
  2: fr.t(($) => $.game.rankings.rank.second),
  3: fr.t(($) => $.game.rankings.rank.third),
} as const
const ranked = (rank: 1 | 2 | 3, name: string, amount: number) =>
  fr.t(($) => $.game.rankings.rowRanked, { rank: RANKS[rank], name, amount })
const unranked = (name: string, amount: number) =>
  fr.t(($) => $.game.rankings.row, { name, amount })
const you = (name: string) => fr.t(($) => $.game.rankings.you, { name })

describe('RankingList', () => {
  it('reads each of the first three rows with its rank, its name and its pollen', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    expect(screen.getByRole('link', { name: ranked(1, 'Malik', 340) })).toBeTruthy()
    expect(screen.getByRole('link', { name: ranked(2, 'Sam', 120) })).toBeTruthy()
  })

  it('reads the third rank as « 3e »', async () => {
    await renderWithProviders(
      <RankingList rows={[row(1, 'Malik', 340), row(2, 'Sam', 120), row(3, 'Nora', 80)]} />,
    )

    expect(screen.getByRole('link', { name: ranked(3, 'Nora', 80) })).toBeTruthy()
  })

  it('gives no rank past the third, to the eye or to the reader', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    expect(screen.getByRole('link', { name: unranked('Nora', 80) })).toBeTruthy()
    expect(screen.getByRole('link', { name: unranked('Inès', 12) })).toBeTruthy()
    // Aucun « 4 » ni « 5 » écrit à l'écran : ces rangs n'existent pas.
    expect(screen.queryByText('4')).toBeNull()
    expect(screen.queryByText('5')).toBeNull()
    expect(screen.queryByText(/4e|5e/)).toBeNull()
  })

  it('gives the same rank to members tied on pollen', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    expect(screen.getByRole('link', { name: ranked(2, you('Léa'), 120) })).toBeTruthy()
    expect(screen.getByRole('link', { name: ranked(2, 'Sam', 120) })).toBeTruthy()
  })

  it('says « toi » to the reader on the own row only', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    expect(screen.getByRole('link', { name: ranked(2, you('Léa'), 120) })).toBeTruthy()
    // Les autres lignes ne le disent pas.
    expect(screen.getAllByRole('link', { name: /toi/ })).toHaveLength(1)
  })

  it('never writes « toi » on the screen', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    // Témoin : la ligne de Léa est bien là, son nom écrit.
    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.queryByText(/toi/)).toBeNull()
  })

  it('shows the pollen of each member', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    const pollen = (amount: number) => fr.t(($) => $.game.rankings.pollen, { amount })
    expect(screen.getByText(pollen(340))).toBeTruthy()
    expect(screen.getAllByText(pollen(120))).toHaveLength(2)
  })

  it('leads each row to the page of its member', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    expect(screen.getByRole('link', { name: unranked('Nora', 80) }).props.href).toBe(
      '/members/nora',
    )
    expect(screen.getAllByRole('link')).toHaveLength(rows.length)
  })

  it('reads the rows in their ranking order', async () => {
    await renderWithProviders(<RankingList rows={rows} />)

    expect(screen.getAllByRole('link').map((link) => link.props.accessibilityLabel)).toEqual([
      ranked(1, 'Malik', 340),
      ranked(2, you('Léa'), 120),
      ranked(2, 'Sam', 120),
      unranked('Nora', 80),
      unranked('Inès', 12),
    ])
  })
})
