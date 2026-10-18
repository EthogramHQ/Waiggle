// Tests de la page d'avertissement qui précède l'ouverture d'un site extérieur.
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { LeavingScreen } from './LeavingScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
}))

let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  mockBack.mockReset()
})
afterEach(() => openURL.mockRestore())

describe('LeavingScreen', () => {
  it('shows where the link really leads, then opens it', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com/demo?x=1" />)

    expect(screen.getByText('https://recettes.example.com/demo?x=1')).toBeTruthy()
    await fireEvent.press(
      screen.getByRole('button', { name: 'Continuer vers recettes.example.com' }),
    )

    expect(openURL).toHaveBeenCalledWith('https://recettes.example.com/demo?x=1')
  })

  it('never opens a link that is not https', async () => {
    await renderWithProviders(<LeavingScreen url="javascript:alert(1)" />)

    expect(
      screen.getByText(
        'Ce lien ne peut pas être ouvert : seules les adresses https vers un site public sont acceptées.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Continuer/ })).toBeNull()
  })

  it('goes back without opening anything', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" />)

    await fireEvent.press(screen.getByRole('button', { name: 'Revenir' }))

    expect(mockBack).toHaveBeenCalled()
    expect(openURL).not.toHaveBeenCalled()
  })

  it('refuses local machines and disguised addresses', async () => {
    for (const url of ['https://192.168.1.1/admin', 'https://waiggle.io@pirate.example.com']) {
      await renderWithProviders(<LeavingScreen url={url} />)
      expect(screen.queryByRole('button', { name: /Continuer/ })).toBeNull()
    }
  })

  it('on a phone, refuses a name in another alphabet that could imitate a known site', async () => {
    // Sur iOS et Android, Expo remplace l'outil URL par une version minimale qui laisse les noms
    // Unicode tels quels (« аpple.com » avec un « а » cyrillique). On la charge pour reproduire ça.
    // require.resolve (fourni par Jest) trouve le chemin d'un module ; on cherche celui-ci depuis le
    // dossier d'Expo, qui en dépend. Le « as » décrit seulement ce dont on se sert.
    const resolve = (
      require as unknown as { resolve: (id: string, o?: { paths: string[] }) => string }
    ).resolve
    const expoPackage = resolve('expo/package.json')
    const expoDir = expoPackage.slice(0, expoPackage.lastIndexOf('/'))
    const { URL: PhoneURL } = require(resolve('whatwg-url-minimum', { paths: [expoDir] }))
    const realURL = globalThis.URL
    globalThis.URL = PhoneURL
    try {
      await renderWithProviders(<LeavingScreen url={'https://\u0430pple.com/login'} />)
      expect(screen.queryByRole('button', { name: /Continuer/ })).toBeNull()
    } finally {
      globalThis.URL = realURL
    }
  })
})
