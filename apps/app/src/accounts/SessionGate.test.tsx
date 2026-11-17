// Tests de la garde de session commune aux écrans réservés aux membres (R16, scénario « La garde de
// session et les pages lisibles sans compte » : « même attente, même renvoi vers la connexion
// qu'aujourd'hui, même page quand la session ne se vérifie pas » ; plan, choix 2 ; relecture de
// sécurité C3 et A1).
//
// `<SessionGate loading={…} signedOut={…}>{(session) => <Écran session={session} />}</SessionGate>` :
// - en attente : le squelette de la page seul (`loading`), rien de l'écran ;
// - en erreur (la session ne se lit pas : réseau, 429, serveur) : « Réessayer », jamais
//   « Me connecter » à un membre peut-être bien connecté (`SessionErrorScreen`) ;
// - sans session (401 compris) : « Réservé aux membres », dont « Me connecter » revient ici
//   (`next` de `nextAfterSignIn`), ou ce que l'écran donne à la place (`signedOut`) ;
// - connecté : l'écran, à qui la fonction passe la session (une fonction qui rend un composant,
//   sans hook à elle : A1).
// Le repère `waiggle_member` (R12) ne décide de rien ici : seule la session compte.
import { fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useUnreadCount } from '../notifications/api'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Text } from '../ui/Text'
import { useSession } from './api'
import { SessionGate } from './SessionGate'
import type { SessionData } from './session'

jest.mock('./api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut des pages d'état lit le profil et les notifications : ils n'arrivent jamais.
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => new Promise(() => {})) }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
// L'adresse de la page gardée, que « Me connecter » passe à la connexion pour y revenir.
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/members/u7',
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useIsFocused: () => true,
  useRoute: () => ({ key: 'gate', name: 'gate' }),
}))

const t = fr.t
const SKELETON = 'Le squelette de la page'
const ines = { user: { id: 'u5', name: 'Inès' } }

/** L'écran gardé : il écrit le nom du membre que la garde lui passe. */
const screenOf = jest.fn((session: SessionData) => <Text>{`Bonjour ${session.user.name}`}</Text>)

const gate = (signedOut?: string) => (
  <SessionGate
    loading={<Text>{SKELETON}</Text>}
    {...(signedOut ? { signedOut: <Text>{signedOut}</Text> } : null)}
  >
    {screenOf}
  </SessionGate>
)

/** La session telle que Better Auth la rend quand sa lecture échoue (statut HTTP). */
const mockSessionError = (status: number) => {
  const refetch = jest.fn().mockResolvedValue(undefined)
  jest.mocked(useSession).mockReturnValue({
    data: null,
    isPending: false,
    error: { status },
    refetch,
  } as unknown as ReturnType<typeof useSession>)
  return { refetch }
}

const signedOutTitle = () =>
  screen.queryByRole('header', { name: t(($) => $.states.signedOutTitle) })
const signIn = () => screen.queryByRole('button', { name: t(($) => $.home.signIn) })

beforeEach(() => {
  mockPush.mockReset()
  screenOf.mockClear()
  jest.mocked(useUnreadCount).mockReturnValue(0)
})

describe('SessionGate (R16)', () => {
  it('shows only the skeleton of the page while the session is read', async () => {
    mockSession(null, true)
    await renderWithProviders(gate())

    expect(screen.getByText(SKELETON)).toBeTruthy()
    expect(screenOf).not.toHaveBeenCalled()
    expect(signedOutTitle()).toBeNull()
    expect(signIn()).toBeNull()
    expect(screen.queryByRole('button', { name: t(($) => $.common.retry) })).toBeNull()
  })

  it('offers to try again when the session cannot be read, never to sign in', async () => {
    const { refetch } = mockSessionError(500)
    await renderWithProviders(gate())

    expect(screen.getByRole('header', { name: t(($) => $.states.errorTitle) })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: t(($) => $.common.retry) }))
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(signIn()).toBeNull()
    expect(signedOutTitle()).toBeNull()
    expect(screenOf).not.toHaveBeenCalled()
  })

  it('offers to sign in to a visitor, and comes back to this page afterwards', async () => {
    mockSession(null, false)
    await renderWithProviders(gate())

    expect(signedOutTitle()).toBeTruthy()
    await fireEvent.press(signIn() as never)
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { next: '/members/u7' },
    })
    expect(screen.queryByText(SKELETON)).toBeNull()
    expect(screenOf).not.toHaveBeenCalled()
  })

  it('treats a refused session (401) as a visitor, not as an error', async () => {
    mockSessionError(401)
    await renderWithProviders(gate())

    expect(signedOutTitle()).toBeTruthy()
    expect(screen.queryByRole('button', { name: t(($) => $.common.retry) })).toBeNull()
  })

  it('shows what the screen gives a visitor instead, when it gives something', async () => {
    // Les feuilles, et les pages qui disent « Page introuvable » à un visiteur (R7b, L5).
    mockSession(null, false)
    await renderWithProviders(gate('Page introuvable'))

    expect(screen.getByText('Page introuvable')).toBeTruthy()
    expect(signedOutTitle()).toBeNull()
    expect(screenOf).not.toHaveBeenCalled()
  })

  it('shows the screen of a member, given her session', async () => {
    mockSession(ines)
    await renderWithProviders(gate())

    expect(screen.getByText('Bonjour Inès')).toBeTruthy()
    expect(screenOf).toHaveBeenCalledWith(expect.objectContaining(ines))
    expect(screen.queryByText(SKELETON)).toBeNull()
    expect(signedOutTitle()).toBeNull()
  })

  it('shows the sign-in screen to a visitor even when the member marker is set', async () => {
    // Sur le web, un repère `waiggle_member=1` resté sur l'appareil, ou fabriqué : il ne donne rien.
    jest.replaceProperty(Platform, 'OS', 'web')
    const style = { setProperty: () => {}, colorScheme: '', backgroundColor: '' }
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        cookie: 'waiggle_member=1',
        documentElement: { style, setAttribute: () => {}, removeAttribute: () => {} },
        body: { style },
      },
    })
    try {
      mockSession(null, false)
      await renderWithProviders(gate())

      expect(signedOutTitle()).toBeTruthy()
      expect(signIn()).toBeTruthy()
      expect(screenOf).not.toHaveBeenCalled()
    } finally {
      jest.restoreAllMocks()
      Reflect.deleteProperty(globalThis, 'document')
    }
  })

  it('goes from the screen to the sign-in screen when the session ends', async () => {
    mockSession(ines)
    const view = await renderWithProviders(gate())
    expect(screen.getByText('Bonjour Inès')).toBeTruthy() // témoin

    // La session prend fin (déconnexion dans un autre onglet, session expirée).
    mockSession(null, false)
    await view.rerender(gate())

    expect(screen.queryByText('Bonjour Inès')).toBeNull()
    expect(signedOutTitle()).toBeTruthy()
  })
})
