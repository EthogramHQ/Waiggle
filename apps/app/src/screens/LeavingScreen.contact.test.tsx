// La page « Tu quittes… » et l'adresse de contact (tranche 6d) : « Nous écrire », dans Mon compte,
// passe par cette page avec un lien « mailto: ». Seule notre adresse passe ; tout autre « mailto: »
// reste refusé, comme tout lien qui n'est pas https. À part de LeavingScreen.test.tsx, écrit avant.
import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
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

describe('LeavingScreen and the contact address', () => {
  it('opens an e-mail to our contact address', async () => {
    await renderWithProviders(<LeavingScreen url={`mailto:${contactEmail}`} />)

    await fireEvent.press(screen.getByRole('button', { name: `Continuer vers ${contactEmail}` }))

    expect(openURL).toHaveBeenCalledWith(`mailto:${contactEmail}`)
  })

  it('never opens an e-mail to another address, nor one with something added', async () => {
    await renderWithProviders(<LeavingScreen url={`mailto:${contactEmail}?bcc=x@example.com`} />)

    expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: /^Continuer vers/ })).toBeNull()
  })
})
