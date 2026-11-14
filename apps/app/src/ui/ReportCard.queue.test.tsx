// Tests ajoutés avec l'élément de la file (R9) : ce que la ligne « de qui, où », la pastille
// « Compte récent » et l'heure exacte donnent au nom lu du lien. Les tests de la commande sont dans
// `ReportCard.test.tsx`.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ReportCard } from './ReportCard'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const item = {
  kind: 'Commentaire',
  snapshot: 'Gagne 500 € par jour avec mon robot de trading.',
  reasons: ['Arnaque ou spam'],
  count: 2,
  reportedAt: { relative: 'il y a 12 min', exact: 'aujourd’hui à 17:48' },
  when: 'Premier signalement le 20 oct.',
  href: '/moderation?item=scam',
  onSelect: jest.fn(),
}

describe('ReportCard, an item of the queue', () => {
  it('names the link with the reason first, then who and where, the count and the exact time', async () => {
    await renderWithProviders(
      <ReportCard {...item} context="Gains Rapides (@gains_rapides), sur Décollage !" />,
    )

    const link = screen.getByRole('link', { name: /^Arnaque ou spam, Commentaire/ })
    const name = String(link.props.accessibilityLabel)
    expect(name).toContain('Gains Rapides (@gains_rapides), sur Décollage !')
    expect(name).toContain(fr.t(($) => $.moderation.reportedTimes, { count: 2 }))
    expect(name).toContain('aujourd’hui à 17:48')
    // La ligne se voit aussi.
    expect(screen.getByText('Gains Rapides (@gains_rapides), sur Décollage !')).toBeTruthy()
  })

  it('shows « Compte récent » only for a recent account', async () => {
    const recent = fr.t(($) => $.moderation.authorCard.recent)
    const { rerender } = await renderWithProviders(<ReportCard {...item} recentAccount />)
    expect(screen.getByText(recent)).toBeTruthy()
    expect(screen.getByRole('link', { name: containing(recent) })).toBeTruthy()

    await rerender(<ReportCard {...item} recentAccount={false} />)
    expect(screen.getByRole('link', { name: /^Arnaque ou spam/ })).toBeTruthy() // témoin
    expect(screen.queryByText(recent)).toBeNull()
  })
})
