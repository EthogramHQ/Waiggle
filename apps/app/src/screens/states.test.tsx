// Tests de la page « Réservé aux membres » (SignedOutScreen, states.tsx) : « Me connecter » mène à
// la connexion, qui ramène ensuite sur la page où l'on était, paramètres de l'adresse compris
// (?announce=…), comme le lien « Me reconnecter » (navigation/signInAgain.ts). Relecture de 6c.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NotFoundState, SessionErrorScreen, SignedOutScreen } from './states'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// Sur le web, la page adopte la langue du navigateur au premier dessin : on la veut française.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
}))

/** L'adresse affichée par le navigateur (web), le temps d'un test. */
const browserAt = (search: string) =>
  Object.defineProperty(globalThis, 'location', { value: { search }, configurable: true })

const signIn = () => fireEvent.press(screen.getByRole('button', { name: 'Me connecter' }))

beforeEach(() => {
  mockSession(null)
  mockPush.mockReset()
  mockReplace.mockReset()
  mockBack.mockReset()
})
afterEach(() => {
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'location')
})

describe('SignedOutScreen', () => {
  it('comes back to the page after signing in', async () => {
    await renderWithProviders(<SignedOutScreen />)

    await signIn()

    expect(visited(mockPush)).toEqual(['/sign-in?next=/projects/abc'])
  })

  it('keeps the parameters of the address on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    browserAt('?announce=testable')
    await renderWithProviders(<SignedOutScreen />)

    await signIn()

    expect(visited(mockPush)).toEqual(['/sign-in?next=/projects/abc?announce=testable'])
  })

  it('comes back to the page without its parameters when the sign-in page would refuse them', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    browserAt(`?q=${'a'.repeat(3000)}`)
    await renderWithProviders(<SignedOutScreen />)

    await signIn()

    expect(visited(mockPush)).toEqual(['/sign-in?next=/projects/abc'])
  })
})

// --- Tranche « adresse » (des-3) : la session ne se lit pas (serveur en panne) ---

describe('SessionErrorScreen', () => {
  it('says the account could not load and retries on demand, without « Réservé aux membres »', async () => {
    const onRetry = jest.fn()
    await renderWithProviders(<SessionErrorScreen onRetry={onRetry} />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.states.errorTitle) })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.states.signedOutTitle))).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    // Toujours une issue de plus : revenir.
    expect(screen.getByRole('button', { name: fr.t(($) => $.states.back) })).toBeTruthy()
  })
})

// --- Tranche R5a (F-404) : l'introuvable d'un projet ---
//
// La même page pour un projet supprimé, retiré, privé d'un autre ou d'un membre bloqué : des
// alvéoles, la mascotte à la loupe, « Ce projet est introuvable », un Retour en haut et « Retour au
// fil » en bas. La page 404 générale garde son texte et son action.
describe('NotFoundState', () => {
  const projectNotFound = () =>
    renderWithProviders(
      <NotFoundState
        variant="project"
        title={fr.t(($) => $.project.page.notFoundTitle)}
        message={fr.t(($) => $.project.page.notFound)}
      />,
    )

  /** « Retour au fil », lien ou bouton. */
  const toFeed = () =>
    screen.queryByRole('link', { name: 'Retour au fil' }) ??
    screen.getByRole('button', { name: 'Retour au fil' })

  it('says the project cannot be found, and leads back to the feed', async () => {
    await projectNotFound()

    expect(screen.getByRole('header', { name: 'Ce projet est introuvable' })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.page.notFound))).toBeTruthy()
    await fireEvent.press(toFeed())

    expect(visited(mockPush, mockReplace)).toContain('/')
  })

  it('offers « Retour » at the top, which leads back to the page left', async () => {
    await projectNotFound()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.back) }))

    expect(mockBack).toHaveBeenCalled()
  })

  it('replaces « Retour à l’accueil » rather than adding to it', async () => {
    await projectNotFound()

    expect(toFeed()).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: fr.t(($) => $.states.home) })).toBeNull()
  })

  it('keeps the text and the action of the general « page not found »', async () => {
    await renderWithProviders(<NotFoundState title={fr.t(($) => $.states.notFoundTitle)} />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.states.notFoundTitle) })).toBeTruthy()
    expect(screen.getByRole('button', { name: fr.t(($) => $.states.home) })).toBeTruthy()
    expect(screen.queryByText('Retour au fil')).toBeNull()
  })
})
