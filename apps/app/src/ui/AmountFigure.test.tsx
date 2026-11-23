// Tests du montant en grand (R19, « Cette semaine » et « Mon miel » de « Ma récolte ») : la phrase
// se lit d'un trait, le nombre est un morceau à part, et une phrase sans le nombre reste entière.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { AmountFigure } from './AmountFigure'

const show = (text: string, amount: number) =>
  renderWithProviders(<AmountFigure text={text} amount={amount} />)

describe('AmountFigure', () => {
  it('reads the whole phrase in one piece', async () => {
    await show('85 pollen', 85)

    expect(screen.getByText('85 pollen')).toBeTruthy()
  })

  it('sets the number apart from its unit', async () => {
    await show('35 miel', 35)

    // Le nombre est son propre morceau de texte (écrit en grand), l'unité reste autour.
    expect(screen.getByText('35')).toBeTruthy()
    expect(screen.queryByText('miel')).toBeNull()
  })

  it('keeps a phrase without the number whole', async () => {
    await show('Aucun miel', 0)

    expect(screen.getByText('Aucun miel')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })
})
