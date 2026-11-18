// Tests de la vague de miel à l'entrée dans l'appli (R17, scénario « La vague de miel à l'entrée »),
// côté écrans : après « Me connecter » réussi (la page de connexion) ou « Continuer » (la page
// « Adresse vérifiée »), l'écran lance la vague (`useHoneyWave().play`), et la navigation vers le
// Fil ne part que quand la vague le dit (`then`, quand elle couvre l'écran).
//
// - Choix 7 du plan : la vague passe aussi après une connexion avec `next` ; elle découvre la page
//   demandée.
// - Relecture de sécurité S4 : un `next` étranger (`https://…`, `//…`) est filtré par `safeNext` :
//   la vague mène au Fil.
// - Relecture de l'interface U1 : seul l'hôte de la vague annonce le passage ; les écrans ne font
//   que `router.replace`.
// - U2 : le formulaire reste occupé jusqu'à la navigation (la vague la retarde d'environ 600 ms) :
//   le bouton reste en chargement et une seconde Entrée n'appelle pas `signIn` une seconde fois.
//
// La vague elle-même est remplacée par un faux hôte, qui garde ce qu'on lui demande sans rien jouer.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { signIn } from '../accounts/api'
import { renderWithI18n, renderWithProviders } from '../testing/render'
import type { WavePlay } from '../ui/HoneyWaveHost'
import { announcePassage } from '../ui/pageTransition'
import { SignInScreen } from './SignInScreen'
import { VerifiedScreen } from './VerifiedScreen'

jest.mock('../accounts/api', () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
  useSession: jest.fn(),
}))

const mockReplace = jest.fn()
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/sign-in',
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => mockParams,
}))

// Le faux hôte : chaque vague demandée est gardée, rien ne joue.
const mockPlay = jest.fn<void, [WavePlay]>()
jest.mock('../ui/HoneyWaveHost', () => ({
  HoneyWaveHost: ({ children }: { children: unknown }) => children,
  useHoneyWave: () => ({ play: mockPlay }),
}))
jest.mock('../ui/pageTransition', () => ({
  ...jest.requireActual('../ui/pageTransition'),
  announcePassage: jest.fn(),
}))

const signInMock = jest.mocked(signIn)

const fill = async () => {
  await fireEvent.changeText(screen.getByLabelText('Adresse e‑mail'), 'lea@example.com')
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'correct-horse-battery')
}
const signInButton = () => screen.getByRole('button', { name: 'Me connecter' })

/** Se connecte avec succès : la vague est demandée, la navigation attend. */
const signInWell = async () => {
  signInMock.mockResolvedValue({ ok: true } as never)
  await renderWithI18n(<SignInScreen />)
  await fill()
  await fireEvent.press(signInButton())
}

/** La vague a couvert l'écran : la navigation part. */
const waveCovers = async () => {
  const wave = mockPlay.mock.calls.at(-1)?.[0]
  if (!wave) throw new Error('no wave played')
  await act(async () => wave.then())
}

beforeEach(() => {
  signInMock.mockReset()
  mockReplace.mockClear()
  mockPlay.mockClear()
  jest.mocked(announcePassage).mockClear()
  mockParams = {}
})

afterEach(() => jest.restoreAllMocks())

describe('the honey wave after « Me connecter »', () => {
  it('plays the wave, and goes to the feed only when the wave covers the screen', async () => {
    await signInWell()

    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()

    await waveCovers()
    expect(mockReplace.mock.calls).toEqual([['/feed']])
  })

  it('plays the wave toward the page asked by next too', async () => {
    mockParams = { next: '/projects/p1' }
    await signInWell()

    expect(mockPlay).toHaveBeenCalledTimes(1)
    await waveCovers()
    expect(mockReplace.mock.calls).toEqual([['/projects/p1']])
  })

  it.each(['https://exemple.invalid', '//exemple.invalid'])(
    'goes to the feed after the wave when next is foreign (%s, S4)',
    async (next) => {
      mockParams = { next }
      await signInWell()

      expect(mockPlay).toHaveBeenCalledTimes(1)
      await waveCovers()
      expect(mockReplace.mock.calls).toEqual([['/feed']])
    },
  )

  it('stays busy until the navigation, and a second Enter does not sign in again (U2)', async () => {
    await signInWell()

    expect(signInButton()).toBeBusy()
    await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing')
    await fireEvent.press(signInButton())
    expect(signInMock).toHaveBeenCalledTimes(1)
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('leaves the passage announcement to the wave host (U1)', async () => {
    await signInWell()
    await waveCovers()

    expect(announcePassage).not.toHaveBeenCalled()
  })

  it('plays no wave when the sign-in fails (témoin)', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'invalidCredentials' } as never)
    await renderWithI18n(<SignInScreen />)
    await fill()
    await fireEvent.press(signInButton())

    expect(mockPlay).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

describe('the honey wave after « Continuer » on « Adresse vérifiée »', () => {
  it('plays the wave, and goes to the feed only when the wave covers the screen', async () => {
    await renderWithProviders(<VerifiedScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Continuer' }))

    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
    await waveCovers()
    expect(mockReplace.mock.calls).toEqual([['/feed']])
    expect(announcePassage).not.toHaveBeenCalled()
  })
})
