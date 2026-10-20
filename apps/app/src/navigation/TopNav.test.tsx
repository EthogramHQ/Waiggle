// Tests de la barre du haut (tablettes et ordinateurs), pour la cloche des notifications
// (tranche 6b) : son nom dit le nombre de nouveautés, sa pastille s'arrête à « 9+ », et rien ne
// s'affiche à zéro. Le nombre vient de useUnreadCount, remplacé ici par un faux hook.
import { fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
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
})

afterEach(() => {
  restoreWindow()
})

describe('the bell of the top bar', () => {
  it('says how many groups are new, and shows the number', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(3)
    await renderWithProviders(<TopNav />)

    expect(
      screen.getByRole('button', { name: t('notifications.bellNew', { count: 3 }) }),
    ).toBeTruthy()
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeTruthy()
  })

  it('stops at « 9+ » beyond nine', async () => {
    // L'API s'arrête à 10 (UNREAD_COUNT_MAX) : c'est son « plus de 9 ».
    jest.mocked(useUnreadCount).mockReturnValue(10)
    await renderWithProviders(<TopNav />)

    expect(
      screen.getByRole('button', { name: t('notifications.bellNewMany', { max: 9 }) }),
    ).toBeTruthy()
    // Le nom lu dit le même nombre que la pastille.
    expect(screen.getByRole('button', { name: /plus de 9 nouvelles/ })).toBeTruthy()
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.queryByText('10', { includeHiddenElements: true })).toBeNull()
  })

  it('shows no badge when nothing is new', async () => {
    await renderWithProviders(<TopNav />)

    // Témoin : la cloche est là, avec son seul nom…
    expect(screen.getByRole('button', { name: t('notifications.bell') })).toBeTruthy()
    // … sans pastille.
    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it('opens the notifications', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(1)
    await renderWithProviders(<TopNav />)

    await fireEvent.press(
      screen.getByRole('button', { name: t('notifications.bellNew', { count: 1 }) }),
    )

    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('is not there for a visitor', async () => {
    mockSession(null)
    await renderWithProviders(<TopNav />)

    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull()
    expect(screen.queryByRole('button', { name: t('notifications.bell') })).toBeNull()
  })
})
