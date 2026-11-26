// Tests de la Goutte posée sur l'appli (R20, docs/scenarios/refonte.md, « La Goutte ») : elle flotte
// en bas à droite de chaque écran pour une Éclaireuse pendant le mois, si « Afficher la Goutte » est
// coché ; jamais pour un autre membre, une Éclaireuse retirée, sans compte, après le mois, sur les
// pages de connexion, d'inscription et des règles, ni pendant qu'une feuille est ouverte. Un appui
// ouvre la feuille « Ton retour » (`/scout-report?from=<l'écran>`, l'adresse sans ses paramètres) ;
// un appui long la replie en languette, qui la rouvre.
//
// Ce que ces tests supposent (plan R20, « Appli ») : `ScoutDrop` (sans propriété), monté dans
// `app/_layout.tsx` ; il lit le membre par `useMe` (profil/hooks, donc `getMe`, remplacé ici) et
// l'écran par `usePathname` ; il dessine `ui/HoneyDrop` (son nom lu vient de `scout.drop.*`).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ScoutDrop } from './ScoutDrop'
import { endedScoutMe, memberMe, removedScoutMe, scoutMe } from './scout.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockNav = { pathname: '/feed' }
jest.mock('expo-router', () => ({
  usePathname: () => mockNav.pathname,
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useSegments: () => [],
}))

const LABEL = fr.t(($) => $.scout.drop.label)
const LABEL_2 = fr.t(($) => $.scout.drop.labelMissions, { count: 2 })
const UNFOLD = fr.t(($) => $.scout.drop.unfold)
/** Le bouton de la Goutte, quel que soit le nombre de missions dans son nom. */
const DROP = new RegExp(`^${LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

beforeEach(() => {
  mockNav.pathname = '/feed'
  mockPush.mockReset()
  mockNavigate.mockReset()
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(scoutMe())
})

/** Affiche la Goutte sur `pathname`, et attend que le profil soit lu. */
const renderOn = async (pathname: string) => {
  mockNav.pathname = pathname
  const view = await renderWithProviders(<ScoutDrop />)
  await act(async () => {})
  await act(async () => {})
  return view
}

/** Redessine la Goutte sur une autre page (le même cache : le profil est déjà lu). */
const moveTo = async (view: Awaited<ReturnType<typeof renderOn>>, pathname: string) => {
  mockNav.pathname = pathname
  await view.rerender(<ScoutDrop />)
  await act(async () => {})
}

describe('ScoutDrop', () => {
  it('shows the drop to an active scout who shows it, read « Faire un retour sur Waiggle »', async () => {
    jest.mocked(getMe).mockResolvedValue(scoutMe({ missionsLeft: 0 }))
    await renderOn('/feed')

    expect(await screen.findByRole('button', { name: LABEL })).toBeTruthy()
  })

  it('says the missions left in its name', async () => {
    await renderOn('/feed')

    expect(await screen.findByRole('button', { name: LABEL_2 })).toBeTruthy()
  })

  it('hides the drop when « Afficher la Goutte » is off', async () => {
    jest.mocked(getMe).mockResolvedValue(scoutMe({ showDrop: false }))
    await renderOn('/feed')

    expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    expect(screen.queryByRole('button', { name: UNFOLD })).toBeNull()
    // Témoin : la Goutte a bien lu le profil.
    expect(jest.mocked(getMe)).toHaveBeenCalled()
  })

  it('shows no drop to a member who is not a scout', async () => {
    jest.mocked(getMe).mockResolvedValue(memberMe)
    await renderOn('/feed')

    expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    // Témoin : la Goutte a bien lu le profil.
    expect(jest.mocked(getMe)).toHaveBeenCalled()
  })

  it('shows no drop to a removed scout', async () => {
    jest.mocked(getMe).mockResolvedValue(removedScoutMe)
    await renderOn('/feed')

    expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    expect(screen.queryByRole('button', { name: UNFOLD })).toBeNull()
    // Témoin : la Goutte a bien lu le profil.
    expect(jest.mocked(getMe)).toHaveBeenCalled()
  })

  it('shows no drop once the month is over', async () => {
    jest.mocked(getMe).mockResolvedValue(endedScoutMe)
    await renderOn('/feed')

    expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    expect(screen.queryByRole('button', { name: UNFOLD })).toBeNull()
    // Témoin : la Goutte a bien lu le profil.
    expect(jest.mocked(getMe)).toHaveBeenCalled()
  })

  it('shows no drop without an account', async () => {
    mockSession(null)
    const view = await renderWithProviders(<ScoutDrop />)
    await act(async () => {})

    expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    // Témoin : la même Éclaireuse, une fois connectée, voit la Goutte.
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await view.rerender(<ScoutDrop />)
    expect(await screen.findByRole('button', { name: DROP })).toBeTruthy()
  })

  it.each(['/sign-in', '/sign-up', '/rules', '/accept-rules'])(
    'shows no drop on %s, and shows it back on the feed',
    async (pathname) => {
      const view = await renderOn(pathname)

      expect(screen.queryByRole('button', { name: DROP })).toBeNull()
      // Témoin : la même Éclaireuse la retrouve sur le fil.
      await moveTo(view, '/feed')
      expect(screen.getByRole('button', { name: DROP })).toBeTruthy()
    },
  )

  it.each(['/report', '/projects/42/edit', '/hives/new', '/scout-report'])(
    'hides the drop while the sheet %s is open',
    async (pathname) => {
      const view = await renderOn('/projects/42')
      expect(screen.getByRole('button', { name: DROP })).toBeTruthy()

      await moveTo(view, pathname)

      expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    },
  )

  it('opens the sheet « Ton retour » with the screen it was on', async () => {
    await renderOn('/projects/42')

    fireEvent.press(await screen.findByRole('button', { name: DROP }))

    expect(visited(mockPush, mockNavigate)).toEqual(['/scout-report?from=/projects/42'])
  })

  it('opens the sheet with the screen address without its parameters', async () => {
    await renderOn('/projects/42?comment=9#top')

    fireEvent.press(await screen.findByRole('button', { name: DROP }))

    expect(visited(mockPush, mockNavigate)).toEqual(['/scout-report?from=/projects/42'])
  })

  // Le dernier du fichier : la Goutte repliée le reste pour la session de l'appli (en mémoire) ;
  // le test la rouvre avant de finir.
  it('folds into a tab on a long press, which unfolds it, and remembers it between screens', async () => {
    const view = await renderOn('/feed')

    await fireEvent(await screen.findByRole('button', { name: DROP }), 'longPress')

    expect(screen.getByRole('button', { name: UNFOLD })).toBeTruthy()
    expect(screen.queryByRole('button', { name: DROP })).toBeNull()
    expect(visited(mockPush, mockNavigate)).toEqual([])

    // Une autre page : la languette reste.
    await moveTo(view, '/projects/42')
    expect(screen.getByRole('button', { name: UNFOLD })).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: UNFOLD }))

    expect(screen.getByRole('button', { name: DROP })).toBeTruthy()
    expect(screen.queryByRole('button', { name: UNFOLD })).toBeNull()
  })
})
