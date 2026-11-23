// Tests des barres par famille (R19, `FamilyBars`, rubrique « Cette semaine » de « Ma récolte ») :
// le pollen de la semaine, une barre par famille de gestes. Option a15 des planches : sur « Ma
// récolte », les familles se nomment par leurs gestes (« Tests et retours »), jamais par leur titre
// (« Gardienne », qui reste au profil). Chaque barre est lue « Tests et retours, 12 pollen » : la
// longueur seule ne dirait rien à un lecteur d'écran.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { FamilyBars } from './FamilyBars'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// `Harvest.week.byFamily` du contrat, tel que l'API le rend.
const byFamily = { forager: 18, builder: 6, keeper: 12, dancer: 0 }

const barName = (family: 'forager' | 'builder' | 'keeper' | 'dancer', amount: number) =>
  fr.t(($) => $.game.harvest.week.family, {
    family: fr.t(($) => $.game.families[family]),
    amount,
  })

describe('FamilyBars', () => {
  it('names each bar by the gestures of its family and its pollen', async () => {
    await renderWithProviders(<FamilyBars byFamily={byFamily} />)

    // Le nom d'une barre est son seul texte lu (elle n'a pas toujours de rôle commun aux deux
    // plateformes) : on la trouve par ce nom.
    expect(screen.getByLabelText(barName('forager', 18))).toBeTruthy()
    expect(screen.getByLabelText(barName('builder', 6))).toBeTruthy()
    expect(screen.getByLabelText(barName('keeper', 12))).toBeTruthy()
  })

  it('never names a family by its title on « Ma récolte »', async () => {
    await renderWithProviders(<FamilyBars byFamily={byFamily} />)

    // Témoin : la barre de « Tests et retours » est là.
    expect(screen.getByLabelText(barName('keeper', 12))).toBeTruthy()
    for (const title of ['Butineuse', 'Bâtisseuse', 'Gardienne', 'Danseuse']) {
      expect(screen.queryByText(new RegExp(title))).toBeNull()
      expect(screen.queryByLabelText(new RegExp(title))).toBeNull()
    }
  })

  it('reads a new amount when the week moves on', async () => {
    const { rerender } = await renderWithProviders(<FamilyBars byFamily={byFamily} />)

    await rerender(<FamilyBars byFamily={{ ...byFamily, keeper: 20 }} />)

    expect(screen.getByLabelText(barName('keeper', 20))).toBeTruthy()
    expect(screen.queryByLabelText(barName('keeper', 12))).toBeNull()
  })
})
