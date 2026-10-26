// Tests de la barre du haut (tablettes et ordinateurs), pour la cloche des notifications
// (tranche 6b) : son nom dit le nombre de nouveautés, sa pastille s'arrête à « 9+ », et rien ne
// s'affiche à zéro. Le nombre vient de useUnreadCount, remplacé ici par un faux hook.
//
// Tranche 7c : la barre porte aussi le bandeau d'un compte suspendu, une fois pour toutes les
// pages qui la montent, sur téléphone comme sur ordinateur, et n'y propose plus « Publier ».
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing } from '../testing/text'
import { TopNav } from './TopNav'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn().mockReturnValue(new Promise(() => {})) }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}))

const { t } = createI18n('fr')

let restoreWindow: () => void

beforeEach(() => {
  restoreWindow = setDesktopWindow()
  mockPush.mockReset()
  mockSession({ user: { id: 'u5', name: 'Inès' } })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  // Par défaut, le profil n'arrive jamais : la barre s'en passe (son nom vient de la session).
  jest
    .mocked(getMe)
    .mockReset()
    .mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  restoreWindow()
})

describe('the bell of the top bar', () => {
  it('says how many groups are new, and shows the number', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(3)
    await renderWithProviders(<TopNav />)

    expect(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNew, { count: 3 }) }),
    ).toBeTruthy()
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy()
  })

  it('stops at « 9+ » beyond nine', async () => {
    // L'API s'arrête à 10 (UNREAD_COUNT_MAX) : c'est son « plus de 9 ».
    jest.mocked(useUnreadCount).mockReturnValue(10)
    await renderWithProviders(<TopNav />)

    expect(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNewMany, { max: 9 }) }),
    ).toBeTruthy()
    // Le nom lu dit le même nombre que la pastille.
    expect(screen.getByRole('button', { name: /plus de 9 nouvelles/ })).toBeTruthy()
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('10', { includeHiddenElements: true })).toBeNull()
  })

  it('shows no badge when nothing is new', async () => {
    await renderWithProviders(<TopNav />)

    // Témoin : la cloche est là, avec son seul nom…
    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
    // … sans pastille.
    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it('opens the notifications', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(1)
    await renderWithProviders(<TopNav />)

    await fireEvent.press(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNew, { count: 1 }) }),
    )

    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('is not there for a visitor', async () => {
    mockSession(null)
    await renderWithProviders(<TopNav />)

    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull()
    expect(screen.queryByRole('button', { name: t(($) => $.notifications.bell) })).toBeNull()
  })
})

// Tranche 7c : « Un compte suspendu » (docs/scenarios/phase-1.md). Le bandeau est monté une fois,
// dans la barre, jamais écran par écran (plan de 7c) ; sur téléphone, où la capsule n'apparaît
// pas, la barre ne montre que lui.
describe('the top bar of a suspended member', () => {
  const title = () => screen.findByText(containing(t(($) => $.suspension.title)))

  it('shows the suspension banner on a computer', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<TopNav />)

    expect(await title()).toBeTruthy()
  })

  it('shows the suspension banner on a phone too, where the bar itself is hidden', async () => {
    restoreWindow()
    restoreWindow = () => {}
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<TopNav />)

    expect(await title()).toBeTruthy()
    // Témoin : sur téléphone, la capsule (logo, cloche, compte) reste absente.
    expect(screen.queryByRole('button', { name: t(($) => $.notifications.bell) })).toBeNull()
  })

  it('offers no « Publier un projet » to a suspended member', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderWithProviders(<TopNav />)

    await title()
    expect(screen.queryByRole('button', { name: t(($) => $.home.publish) })).toBeNull()
    // Témoin : le reste de la barre est là.
    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
  })

  it('shows no banner, and still offers to publish, to a member who is not suspended', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithProviders(<TopNav />)

    // Le profil est arrivé : la barre a eu le temps de le lire.
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByRole('button', { name: t(($) => $.home.publish) })).toBeTruthy()
    expect(screen.queryByText(containing(t(($) => $.suspension.title)))).toBeNull()
  })
})
