// Tests des avis de la récolte dans l'Activité (R19, docs/scenarios/refonte.md, « Ce qui fait
// revenir, sans insister » ; planche R19-Activite, option b14) : un niveau passé (« Tu passes au
// niveau 5 », l'alvéole numérotée), un sceau gagné (« Nouveau sceau : Premier retour réglé », le
// petit sceau), le défi d'une ruche réussi (« La ruche Famille a réussi son défi », et pour qui y a
// participé « 5 retours entre vous · +10 miel »), du miel offert (« Papi Jean t'a offert du miel
// pour Décollage ! », avec son avatar), et l'avis unique de l'arrivée de la récolte (relecture
// juridique du plan, J1). Jamais de félicitation en plus.
//
// Les hooks des notifications sont remplacés, comme dans NotificationsScreen.test.tsx : chaque test
// choisit la page reçue.
import type { Notification, NotificationPage } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { useEmailPreferences } from '../email/api'
import { createI18n } from '../i18n'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { repliesNowPreferences } from '../testing/email'
import { decollageProject, notificationPageOf, papiJeanAuthor } from '../testing/notifications'
import { mockSession, renderWithProviders } from '../testing/render'
import { NotificationsScreen } from './NotificationsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
const mockMediaSource = jest.fn((url: string | null | undefined) => (url ? { uri: url } : null))
jest.mock('../api/media', () => ({ useMediaSources: () => mockMediaSource }))
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
  useNotifications: jest.fn(),
  useMarkSeen: jest.fn(),
  useUnreadCount: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const { t: translate } = createI18n('fr')
/** Les phrases portent des marques (`<b>…</b>`) que l'écran découpe : on lit la phrase sans elles. */
const t = ((...args: Parameters<typeof translate>) =>
  String(translate(...args)).replace(/<\/?[bv]>/g, '')) as unknown as typeof translate

/** Ce texte, n'importe où dans un texte plus long (blancs, insécables compris, ramenés à un espace). */
const containing = (text: string) =>
  new RegExp(text.replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

/** Le texte, visible ou lu comme le nom d'un élément (la ligne peut être un lien nommé par lui). */
const shown = (text: string) =>
  screen.queryAllByText(containing(text)).length > 0 ||
  screen.queryAllByLabelText(containing(text)).length > 0

/** Ce que renvoie useNotifications (un useInfiniteQuery) : la page reçue, sans suite. */
const mockPages = (pages: NotificationPage[]) => {
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
}

const familleId = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c01'
type NotifiedHive = Extract<Notification, { kind: 'game_hive_challenge' }>['hive']
const famille: NotifiedHive = { id: familleId, name: 'Famille', icon: 'house-line' }

const level: Notification = {
  kind: 'game_level',
  id: 'game_level:5',
  at: '2026-11-23T08:00:00.000Z',
  isNew: true,
  level: 5,
}
const seal: Notification = {
  kind: 'game_seal',
  id: 'game_seal:first_settled',
  at: '2026-11-22T08:00:00.000Z',
  isNew: false,
  code: 'first_settled',
}
const hiveChallenge = (honey: 0 | 10, hive = famille): Notification => ({
  kind: 'game_hive_challenge',
  id: `game_hive_challenge:${familleId}:2026-11-16`,
  at: '2026-11-21T08:00:00.000Z',
  isNew: false,
  hive,
  code: 'feedback_5',
  honey,
})
const honeyGift: Notification = {
  kind: 'game_honey_gift',
  id: `game_honey_gift:${decollageProject.id}:u7`,
  at: '2026-11-20T08:00:00.000Z',
  isNew: false,
  actor: papiJeanAuthor,
  project: decollageProject,
}
const intro: Notification = {
  kind: 'game_intro',
  id: 'game_intro',
  at: '2026-11-19T08:00:00.000Z',
  isNew: false,
}

const T = {
  level: t(($) => $.notifications.gameLevel, { level: 5 }),
  seal: t(($) => $.notifications.gameSeal, { seal: t(($) => $.game.seals.first_settled) }),
  hive: t(($) => $.notifications.gameHiveChallenge, { hive: 'Famille' }),
  hiveUnnamed: t(($) => $.notifications.gameHiveChallengeUnnamed),
  challenge: t(($) => $.game.challenges.hive.feedback_5),
  hiveHoney: t(($) => $.notifications.gameHiveChallengeHoney, {
    challenge: t(($) => $.game.challenges.hive.feedback_5),
    honey: 10,
  }),
  gift: t(($) => $.notifications.gameHoneyGift, { name: 'Papi Jean', title: 'Décollage !' }),
  intro: t(($) => $.notifications.gameIntro),
}

const open = async (items: Notification[]) => {
  mockPages([notificationPageOf(items)])
  return renderWithProviders(<NotificationsScreen />)
}

beforeEach(() => {
  mockSession({ user: { id: 'u5', name: 'Inès' } })
  jest.mocked(useMarkSeen).mockReset().mockReturnValue({ markSeen: jest.fn() })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  mockMediaSource.mockClear()
  jest.mocked(useEmailPreferences).mockReturnValue({
    data: repliesNowPreferences,
    isSuccess: true,
    isError: false,
  } as unknown as ReturnType<typeof useEmailPreferences>)
})

describe('the harvest notices in the Activity', () => {
  it('reads a new level', async () => {
    await open([level])

    expect(shown(T.level)).toBe(true)
  })

  it('reads a new seal by its name', async () => {
    await open([seal])

    expect(shown(T.seal)).toBe(true)
  })

  it('reads the challenge of a hive done, with the honey for a participant', async () => {
    await open([hiveChallenge(10)])

    expect(shown(T.hive)).toBe(true)
    expect(shown(T.hiveHoney)).toBe(true)
  })

  // Le contrat : la ligne ne dit jamais qui n'a rien fait. Le non-participant lit le défi seul.
  it('reads the challenge alone, without honey, to a member who did not take part', async () => {
    await open([hiveChallenge(0)])

    expect(shown(T.hive)).toBe(true)
    expect(shown(T.challenge)).toBe(true)
    expect(screen.queryByText(/miel/)).toBeNull()
  })

  // Relecture juridique du plan (J2) : le nom de la ruche se lit à l'affichage ; retirée, la ligne
  // ne la nomme plus.
  it('names no hive once its name is gone', async () => {
    await open([hiveChallenge(10, { id: null, name: null, icon: null })])

    expect(shown(T.hiveUnnamed)).toBe(true)
    expect(shown('Famille')).toBe(false)
  })

  it('reads a honey gift with the face of the giver', async () => {
    await open([honeyGift])

    expect(shown(T.gift)).toBe(true)
    expect(mockMediaSource).toHaveBeenCalledWith(papiJeanAuthor.avatarUrl)
  })

  it('reads the notice of the harvest arrival once', async () => {
    await open([intro])

    expect(screen.queryAllByText(containing(T.intro)).length).toBe(1)
  })

  it('reads the five kinds together in one list', async () => {
    await open([level, seal, hiveChallenge(10), honeyGift, intro])

    for (const text of [T.level, T.seal, T.hive, T.gift, T.intro]) expect(shown(text)).toBe(true)
  })
})
