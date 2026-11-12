// La photo de l'en-tête d'un fil (R7b) est un décor : le nom écrit à côté dit déjà de qui il s'agit.
// Les lecteurs d'écran ne la lisent pas, avec une photo comme avec les initiales (sans cela, on
// entendrait le nom deux fois, une fois en image et une fois en titre).
import { screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { ThreadHeader } from './ThreadHeader'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

describe('ThreadHeader photo', () => {
  it.each([
    ['a photo', { uri: 'https://media.example/avatars/ines.webp' }],
    ['the initials', null],
  ] as const)('does not read %s to screen readers', async (_case, avatar) => {
    await renderWithProviders(
      <ThreadHeader name="Inès Morel" avatar={avatar} project="Décollage !" />,
    )

    expect(screen.getByRole('header', { name: 'Inès Morel' })).toBeTruthy() // témoin
    expect(screen.queryByRole('image')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByLabelText('Inès Morel')).toBeNull()
  })
})
