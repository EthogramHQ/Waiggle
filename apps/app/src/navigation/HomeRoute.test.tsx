// Tests de la page de l'adresse `/` (tranche R12, scénario « Qui arrive où », plan, choix 8) :
// l'accueil et sa vitrine pour tout le monde ; sur téléphone seulement, l'appli qui s'ouvre avec
// une session va au Fil, une seule fois par lancement. Sur le web, c'est le serveur qui s'en charge.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useSession } from '../accounts/api'
import { mockSession, renderWithProviders } from '../testing/render'
import { HomeRoute, launch } from './HomeRoute'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La vitrine elle-même a ses propres tests : ici, un simple repère.
jest.mock('../screens/ShowcaseScreen', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return { ShowcaseScreen: () => <Text>vitrine</Text> }
})
// `Redirect` d'Expo Router : un repère qui dit où il mène.
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return { Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text> }
})
jest.mock('../ui/LoadingLogo', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
  return { LaunchScreen: () => <Text>lancement</Text> }
})

const lea = { user: { id: 'u1', name: 'Léa' } }

beforeEach(() => {
  launch.decided = false
})

describe('the page at / on a phone (R12)', () => {
  it('opens the feed when the app starts with a session', async () => {
    mockSession(lea)
    await renderWithProviders(<HomeRoute />)

    expect(screen.getByText('redirect:/feed')).toBeTruthy()
    expect(screen.queryByText('vitrine')).toBeNull()
  })

  it('shows the showcase to a visitor', async () => {
    mockSession(null)
    await renderWithProviders(<HomeRoute />)

    expect(screen.getByText('vitrine')).toBeTruthy()
    expect(screen.queryByText(/^redirect:/)).toBeNull()
  })

  it('keeps the launch screen while the session is being read, then goes to the feed', async () => {
    mockSession(null, true)
    const view = await renderWithProviders(<HomeRoute />)
    expect(screen.getByText('lancement')).toBeTruthy()
    expect(screen.queryByText('vitrine')).toBeNull()

    mockSession(lea)
    await view.rerender(<HomeRoute />)

    expect(screen.getByText('redirect:/feed')).toBeTruthy()
  })

  it('shows the showcase when the session read fails (no guess)', async () => {
    jest.mocked(useSession).mockReturnValue({
      data: null,
      isPending: false,
      error: { status: 503 },
      refetch: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useSession>)
    await renderWithProviders(<HomeRoute />)

    expect(screen.getByText('vitrine')).toBeTruthy()
  })

  it('decides the opening once, as soon as the session is read', async () => {
    mockSession(lea)
    await renderWithProviders(<HomeRoute />)

    expect(launch.decided).toBe(true)
  })

  it('shows the showcase to a member who comes back to the home page later', async () => {
    // Le lancement a déjà été décidé (le Fil s'est ouvert) ; plus tard, un lien vers l'accueil :
    // une nouvelle page `/`, dans le même lancement.
    launch.decided = true
    mockSession(lea)
    await renderWithProviders(<HomeRoute />)

    expect(screen.getByText('vitrine')).toBeTruthy()
    expect(screen.queryByText(/^redirect:/)).toBeNull()
  })
})

describe('the page at / on the web (R12)', () => {
  it('shows the showcase to a member: the server sends an arrival to the feed', async () => {
    const replaced = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      mockSession(lea)
      await renderWithProviders(<HomeRoute />)

      expect(screen.getByText('vitrine')).toBeTruthy()
      expect(screen.queryByText(/^redirect:/)).toBeNull()
    } finally {
      replaced.restore()
    }
  })
})
