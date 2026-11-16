// Tests de la ligne d'Activité « … est sur l'accueil de Waiggle » (tranche R12, docs/scenarios/
// refonte.md, « La vitrine » : l'auteur est prévenu dans Activité et peut la quitter par « Retirer
// de l'accueil », Q9 ; planche R12-Vitrine, encadré « Chez l'auteur, dans Activité » ; relecture
// juridique 6 : le refus est gardé). La ligne nomme le projet ; tant que le projet est sur l'accueil
// (`onShowcase`), elle offre « Retirer de l'accueil », qui envoie DELETE
// /v1/projects/<id>/showcase, puis dit « Ton projet a quitté l'accueil. Il reste public. ».
//
// Ce que ces tests supposent de l'écran (plan R12, UI-G, choix 10 ; « API des modules partagés »,
// `useLeaveShowcase(projectId)` de `showcase/api.ts` ; à corriger si le code en décide autrement,
// en le disant) :
// - la ligne est un lien vers le projet, comme les autres lignes d'un projet ;
// - « Retirer de l'accueil » est un bouton nommé, à part du lien (une action sœur) ;
// - l'écriture passe par `api/client` (`request` ou `requestWithoutBody`), remplacé ici ;
// - le message de réussite et celui d'échec sont des toasts (ou un texte dans la page).
import type { NotificationPage } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request, requestWithoutBody } from '../api/client'
import type { ApiResult } from '../api/errors'
import { useEmailPreferences } from '../email/api'
import { createI18n } from '../i18n'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { repliesNowPreferences } from '../testing/email'
import { leaMe } from '../testing/fixtures'
import {
  decollageProject,
  hiddenNotification,
  notificationPageOf,
  type Of,
} from '../testing/notifications'
import { mockSession, renderWithProviders } from '../testing/render'
import { ToastProvider } from '../ui/theme/toast'
import { NotificationsScreen } from './NotificationsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../email/api', () => ({ useEmailPreferences: jest.fn() }))
jest.mock('../categories/api', () => {
  const actual = jest.requireActual('../categories/api')
  const { categoryList } = jest.requireActual('../testing/categories')
  return {
    ...actual,
    useCategories: () => ({ data: categoryList('fr'), isSuccess: true, refetch: jest.fn() }),
  }
})
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../notifications/api', () => ({
  ...jest.requireActual('../notifications/api'),
  useNotifications: jest.fn(),
  useMarkSeen: jest.fn(),
  useUnreadCount: jest.fn(),
}))
// Le réseau : « Retirer de l'accueil » écrit par le client de l'API, remplacé.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const { t: translate } = createI18n('fr')
/** La phrase sans ses marques de gras (`<b>…</b>`), telle qu'on la lit. */
const plain = (text: string): string => text.replace(/<\/?[bv]>/g, '')
const containing = (text: string) =>
  new RegExp(text.replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

const T = {
  added: plain(translate(($) => $.notifications.showcaseAdded, { title: decollageProject.title })),
  was: plain(translate(($) => $.notifications.showcaseWas, { title: decollageProject.title })),
  leave: translate(($) => $.notifications.showcaseLeave),
  left: translate(($) => $.notifications.showcaseLeft),
  leaveError: translate(($) => $.notifications.showcaseLeaveError),
}

/** « Décollage ! est sur l'accueil de Waiggle », aujourd'hui, encore sur l'accueil. */
const showcaseAdded: Of<'showcase_added'> = {
  kind: 'showcase_added',
  id: `showcase_added:${decollageProject.id}`,
  at: '2026-10-20T10:00:00.000Z',
  isNew: true,
  project: decollageProject,
  onShowcase: true,
}

const mockPages = (pages: NotificationPage[]) =>
  jest.mocked(useNotifications).mockReturnValue({
    data: { pages, pageParams: pages.map(() => undefined) },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isRefetching: false,
    fetchNextPage: jest.fn().mockResolvedValue(undefined),
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useNotifications>)

/** La réponse de l'API à « Retirer de l'accueil » ; un test la change. */
let leaveAnswer: ApiResult<null> = { ok: true, data: null }

/** Les écritures envoyées : « DELETE /v1/projects/<id>/showcase ». */
const writes = () =>
  [...jest.mocked(request).mock.calls, ...jest.mocked(requestWithoutBody).mock.calls]
    .map(([path, init]) => `${(init?.method ?? 'GET').toUpperCase()} ${String(path)}`)
    .filter((line) => !line.startsWith('GET '))

beforeEach(() => {
  mockPush.mockReset()
  leaveAnswer = { ok: true, data: null }
  mockSession({ user: { id: 'u7', name: 'Papi Jean' } })
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(useMarkSeen).mockReset().mockReturnValue({ markSeen: jest.fn() })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  mockPages([notificationPageOf([showcaseAdded])])
  jest
    .mocked(useEmailPreferences)
    .mockReset()
    .mockReturnValue({
      data: repliesNowPreferences,
      isSuccess: true,
      isError: false,
    } as unknown as ReturnType<typeof useEmailPreferences>)
  // Toute écriture reçoit `leaveAnswer` ; `request` rend le projet nul (le schéma décide).
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation(async () => leaveAnswer)
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async () =>
      leaveAnswer.ok ? { ok: true, data: null } : leaveAnswer) as typeof request)
})

const openActivity = () =>
  renderWithProviders(
    <ToastProvider>
      <NotificationsScreen />
    </ToastProvider>,
  )

describe('« … est sur l’accueil » in the Activity (R12)', () => {
  it('shows a line of another kind in this same setting (témoin of the harness)', async () => {
    mockPages([notificationPageOf([hiddenNotification])])
    await openActivity()

    const hidden = plain(translate(($) => $.notifications.hidden, { title: 'Météo' }))
    expect(await screen.findAllByText(containing(hidden))).not.toHaveLength(0)
  })

  it('tells the author that the project is on the home page', async () => {
    await openActivity()

    expect(await screen.findAllByText(containing(T.added))).not.toHaveLength(0)
  })

  it('opens the project when the line is touched', async () => {
    await openActivity()

    await fireEvent.press(screen.getByRole('link', { name: containing(T.added) }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: decollageProject.id },
    })
  })

  it('offers « Retirer de l’accueil » while the project is on it', async () => {
    await openActivity()

    expect(await screen.findByRole('button', { name: T.leave })).toBeTruthy()
  })

  // Relecture juridique R12, point 1 : hors de l'accueil, la ligne passe au passé (« a été sur
  // l'accueil ») ; le présent ferait croire à l'auteur qui a refusé que son refus est perdu.
  it('says « a été sur l’accueil », and offers nothing, once the project has left the home page', async () => {
    mockPages([notificationPageOf([{ ...showcaseAdded, onShowcase: false }])])
    await openActivity()

    // Témoin : la ligne est là, au passé.
    expect(await screen.findAllByText(containing(T.was))).not.toHaveLength(0)
    expect(screen.queryAllByText(containing(T.added))).toHaveLength(0)
    expect(screen.queryByRole('button', { name: T.leave })).toBeNull()
  })

  it('takes the project off the home page, once, then says it stays public', async () => {
    await openActivity()

    await fireEvent.press(await screen.findByRole('button', { name: T.leave }))

    await waitFor(() =>
      expect(writes()).toEqual([`DELETE /v1/projects/${decollageProject.id}/showcase`]),
    )
    expect(await screen.findAllByText(containing(T.left))).not.toHaveLength(0)
    // Ni l'ouverture du projet : le bouton n'est pas le lien de la ligne.
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('says when the project could not leave the home page', async () => {
    leaveAnswer = { ok: false, error: 'unavailable' }
    await openActivity()

    await fireEvent.press(await screen.findByRole('button', { name: T.leave }))

    expect(await screen.findAllByText(containing(T.leaveError))).not.toHaveLength(0)
    expect(screen.queryAllByText(containing(T.left))).toHaveLength(0)
  })
})
