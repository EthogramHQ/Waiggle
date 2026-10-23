// La page « Tu quittes… » et l'adresse de contact (tranche 7a). Test changé après la relecture de
// design de 4966555 : « Nous écrire », dans Mon compte, ouvre la messagerie directement (voir
// AccountScreen.test.tsx), car les textes de cette page parlent d'un site tiers. Elle redevient
// réservée aux liens https : un « mailto: », même vers notre adresse, y est refusé.
// À part de LeavingScreen.test.tsx, écrit avant.
import { contactEmail } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { LeavingScreen } from './LeavingScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/out',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
})
afterEach(() => openURL.mockRestore())

describe('LeavingScreen and e-mail addresses', () => {
  it('refuses an e-mail link, even to our contact address', async () => {
    await renderWithProviders(<LeavingScreen url={`mailto:${contactEmail}`} />)

    expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: /^Continuer vers/ })).toBeNull()
    expect(openURL).not.toHaveBeenCalled()
  })

  it('refuses an e-mail link with something added', async () => {
    await renderWithProviders(<LeavingScreen url={`mailto:${contactEmail}?bcc=x@example.com`} />)

    expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: /^Continuer vers/ })).toBeNull()
  })
})
