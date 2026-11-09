// Le titre d'une feuille n'est jamais coupé par « … » (R6b, des-C6) : « Ranger « La cabane à
// oiseaux » » nomme l'objet de la décision, il passe à la ligne autant qu'il faut (390 points).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { SheetHeader } from './SheetHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('SheetHeader title', () => {
  it('has no line limit, so a long title wraps instead of being cut', async () => {
    await renderWithProviders(
      <SheetHeader
        title="Ranger « La cabane à oiseaux du jardin de mes grands-parents »"
        cancel={{ label: 'Annuler', onPress: () => {} }}
        action={{ label: 'Ranger', onPress: () => {} }}
      />,
    )

    const title = screen.getByRole('header')
    expect(title.props.numberOfLines).toBeUndefined()
  })
})
