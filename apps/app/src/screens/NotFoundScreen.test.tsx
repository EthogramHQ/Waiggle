// Tests de la page introuvable (une adresse qui ne mène nulle part, R1) : sur le miel vif, elle
// garde la barre de navigation (« Mon compte » partout, décision de Louis du 29/10/2026), et elle
// reste l'état de toutes les pages introuvables (titre de niveau 1, issue vers l'accueil).
import { fireEvent, screen } from '@testing-library/react-native'
import { renderWithProviders } from '../testing/render'
import { NotFoundScreen } from './NotFoundScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre de navigation remplacée par un repère : on vérifie qu'elle est posée, pas son contenu
// (testé dans TopNav.test.tsx).
jest.mock('../navigation/TopNav', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return { TopNav: () => createElement(Text, null, 'Barre de navigation') }
})
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/nulle-part',
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}))

describe('NotFoundScreen', () => {
  it('keeps the navigation bar on the bright honey', async () => {
    await renderWithProviders(<NotFoundScreen />)

    expect(screen.getByText('Barre de navigation')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Page introuvable' })).toBeTruthy()
  })

  it('always offers a way home', async () => {
    await renderWithProviders(<NotFoundScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Retour à l’accueil' }))

    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})
