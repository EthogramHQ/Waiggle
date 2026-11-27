// L'Activité ouverte en temps réel (R21, décision de Louis du 27/11/2026). Ouvrir la page marque
// tout comme vu : la cloche revient à zéro. Si une notification arrive pendant la lecture, la cloche
// la recompte (signal `me:notifications`), mais la liste ne bouge pas sous le doigt. Comme pour les
// commentaires, un bouton « 1 nouvelle notification » paraît ; le toucher relit la liste, où la
// nouvelle est en tête, et la marque vue à son tour.
//
// Les hooks de l'Activité sont simulés : le test choisit le nombre de la cloche et la liste.
import type { NotificationPage } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { useEmailPreferences } from '../email/api'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { repliesNowPreferences } from '../testing/email'
import {
  commentNotification,
  notificationPageOf,
  notificationsAsOf,
  replyNotification,
} from '../testing/notifications'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NotificationsScreen } from './NotificationsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../email/api', () => ({ useEmailPreferences: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../notifications/api', () => ({
  useNotifications: jest.fn(),
  useMarkSeen: jest.fn(),
  useUnreadCount: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const markSeen = jest.fn()
let unread = 0
let refetch: jest.Mock

/** Ce que rend useNotifications (useInfiniteQuery) avec ces pages déjà reçues. */
const showPages = (pages: NotificationPage[]) => {
  refetch = jest.fn().mockResolvedValue(undefined)
  jest.mocked(useNotifications).mockReturnValue({
    data: { pages, pageParams: pages.map(() => undefined) },
    status: 'success',
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch,
    fetchNextPage: jest.fn(),
  } as unknown as ReturnType<typeof useNotifications>)
}

beforeEach(() => {
  // Comme le vrai hook : « vu » remet la cloche à zéro dans le même instant.
  markSeen.mockReset().mockImplementation(() => {
    unread = 0
  })
  unread = 0
  mockSession({ user: { id: 'u5', name: 'Inès' } })
  jest.mocked(useMarkSeen).mockReturnValue({ markSeen })
  jest.mocked(useUnreadCount).mockImplementation(() => unread)
  jest.mocked(useEmailPreferences).mockReturnValue({
    data: repliesNowPreferences,
    isSuccess: true,
    isError: false,
  } as unknown as ReturnType<typeof useEmailPreferences>)
  showPages([notificationPageOf([replyNotification])])
})

const fresh = (count: number) => fr.t(($) => $.notifications.newNotifications, { count })

/** Le serveur recompte la cloche (signal `me:notifications`) : l'écran se redessine. */
const bellCounts = async (count: number, rerender: (ui: ReactElement) => unknown) => {
  unread = count
  await act(async () => {
    rerender(<NotificationsScreen />)
  })
}

describe('the open Activity in real time', () => {
  it('says nothing new for the notifications that were already waiting when it opened', async () => {
    // Trois nouveautés attendaient : elles sont dans la liste, la page les marque vues.
    unread = 3
    await renderWithProviders(<NotificationsScreen />)

    expect(markSeen).toHaveBeenCalledWith(notificationsAsOf)
    expect(screen.queryByRole('button', { name: fresh(3) })).toBeNull()
    // Le premier dessin lit encore le nombre d'avant « vu » : il ne compte pas.
    expect(screen.queryByRole('button', { name: /^\d+ nouvelles? notifications?$/ })).toBeNull()
  })

  it('shows a button when a notification arrives, and leaves the list where it is', async () => {
    const { rerender } = await renderWithProviders(<NotificationsScreen />)

    await bellCounts(1, rerender)

    expect(screen.getByRole('button', { name: fresh(1) })).toBeTruthy()
    // La liste n'est pas relue toute seule : rien ne bouge sous le doigt.
    expect(refetch).not.toHaveBeenCalled()
  })

  it('brings the new notifications into the list, and marks them seen, when the button is touched', async () => {
    const { rerender } = await renderWithProviders(<NotificationsScreen />)
    await bellCounts(2, rerender)

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: fresh(2) }))
    })
    expect(refetch).toHaveBeenCalledTimes(1)

    // La liste relue : la nouvelle en tête, avec l'heure du serveur de cette lecture.
    const later = '2026-10-20T12:45:00.000Z'
    showPages([
      notificationPageOf([{ ...commentNotification, at: later }, replyNotification], null, later),
    ])
    await bellCounts(2, rerender)
    expect(markSeen).toHaveBeenLastCalledWith(later)

    // Vu : la cloche revient à zéro, et le bouton s'en va.
    await bellCounts(0, rerender)
    expect(screen.queryByRole('button', { name: fresh(2) })).toBeNull()
  })
})
