// Tests de la pile d'avatars (refonte, tranche R1) : quelques ronds chevauchés pour montrer « des
// membres » (une ruche, des testeurs), jamais pour dire qui a réagi ni qui suit. Elle se lit comme
// une seule image, nommée par l'écran (« 5 membres ») : les lecteurs d'écran n'égrènent pas les
// visages un par un. Trois avatars au plus, puis une pastille « +N » pour les autres.
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { AvatarStack } from './AvatarStack'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const member = (name: string) => ({ name, source: null })
const five = ['Léa Martin', 'Sam Petit', 'Max Durand', 'Inès Roy', 'Noé Blanc'].map(member)

describe('AvatarStack', () => {
  it('is one image, named by the screen that shows it', async () => {
    await renderWithProviders(<AvatarStack members={five} label="5 membres" />)

    expect(screen.getByRole('img', { name: '5 membres' })).toBeTruthy()
  })

  it('shows three faces at most, and counts the others in a « +N » badge', async () => {
    await renderWithProviders(<AvatarStack members={five} label="5 membres" />)

    // La pastille est cachée des lecteurs d'écran (l'image a déjà son nom) : on la cherche quand même.
    expect(screen.getByText('+2', { includeHiddenElements: true })).toBeTruthy()
  })

  it('has no « + » badge when every member fits', async () => {
    await renderWithProviders(<AvatarStack members={five.slice(0, 3)} label="3 membres" />)

    expect(screen.getByRole('img', { name: '3 membres' })).toBeTruthy() // témoin
    expect(screen.queryByText(/^\+/, { includeHiddenElements: true })).toBeNull()
  })

  it('reads as a single image, not as one name per face', async () => {
    await renderWithProviders(<AvatarStack members={five} label="5 membres" />)

    // Une seule image pour toute la pile : ni un rond nommé par membre, ni le « +2 » lu à part.
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.queryByText('+2')).toBeNull()
    expect(screen.queryByLabelText(/Léa Martin/)).toBeNull()
  })
})
