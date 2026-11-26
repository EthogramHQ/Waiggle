// Tests des avis des Éclaireuses dans l'Activité (R20, docs/scenarios/refonte.md, « Devenir
// Éclaireuse », « Les missions de la semaine », « Mes retours et « Ta danse a été entendue » » et
// « La page de tri » ; planche R20-Danse) :
// - l'entrée, par l'avis de sceau existant : « Nouveau sceau : Éclaireuse fondatrice » ;
// - « Ta danse a été entendue : « <début du retour> » est corrigé », avec « +50 pollen · +10 miel »,
//   qui mène à « Mes retours » (`/settings/scouts`) ;
// - « 3 missions cette semaine », qui mène aux missions (`/scout/missions`) ;
// - le retrait, avec son motif, ce qui reste et l'adresse de l'éditeur (relecture juridique J1).
//
// Les hooks des notifications sont remplacés, comme dans NotificationsScreen.game.test.tsx ; la
// destination de chaque ligne se lit par `presentNotification` (notifications/present.ts).
import { contactEmail } from '@ruche/brand'
import { type Notification, POLLEN_GESTURES, SCOUT_HEARD_HONEY } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { useEmailPreferences } from '../email/api'
import { createI18n } from '../i18n'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { presentNotification } from '../notifications/present'
import { repliesNowPreferences } from '../testing/email'
import { pathOf } from '../testing/navigation'
import { notificationPageOf } from '../testing/notifications'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
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

const mockPages = (items: Notification[]) => {
  const pages = [notificationPageOf(items)]
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

const reportId = '3c4d5e6f-7a8b-4c0d-9e1f-3a4b5c6d7e8f'
const heard: Notification = {
  kind: 'game_scout_heard',
  id: `game_scout_heard:${reportId}`,
  at: '2026-11-25T08:00:00.000Z',
  isNew: true,
  reportId,
  excerpt: 'Le bouton Publier se cache derrière le clavier',
  paid: true,
}
const missions: Notification = {
  kind: 'game_scout_missions',
  id: 'game_scout_missions:2026-11-23',
  at: '2026-11-23T08:00:00.000Z',
  isNew: false,
  count: 3,
}
const removed: Notification = {
  kind: 'game_scout_removed',
  id: 'game_scout_removed',
  at: '2026-11-24T08:00:00.000Z',
  isNew: false,
  reason: 'Des retours d’insultes à répétition.',
}
const founder: Notification = {
  kind: 'game_seal',
  id: 'game_seal:scout_founder',
  at: '2026-11-22T08:00:00.000Z',
  isNew: false,
  code: 'scout_founder',
}

const T = {
  heard: t(($) => $.notifications.gameScoutHeard, {
    excerpt: 'Le bouton Publier se cache derrière le clavier',
  }),
  heardGain: t(($) => $.notifications.gameScoutHeardGain, {
    pollen: POLLEN_GESTURES.scout_heard.amount,
    honey: SCOUT_HEARD_HONEY,
  }),
  missions: t(($) => $.notifications.gameScoutMissions, { count: 3 }),
  removed: t(($) => $.notifications.gameScoutRemoved, {
    reason: 'Des retours d’insultes à répétition.',
    contactEmail,
  }),
  founder: t(($) => $.notifications.gameSeal, { seal: t(($) => $.game.seals.scout_founder) }),
}

const open = async (items: Notification[]) => {
  mockPages(items)
  return renderWithProviders(<NotificationsScreen />)
}

/** Où mène une ligne, en adresse remplie (« /settings/scouts »), ou null. */
const targetOf = (notification: Notification) => {
  const { target } = presentNotification(
    notification,
    fr.t as unknown as Parameters<typeof presentNotification>[1],
    new Date('2026-11-26T08:00:00.000Z'),
  )
  return target === null ? null : pathOf(target)
}

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(useMarkSeen).mockReset().mockReturnValue({ markSeen: jest.fn() })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  jest.mocked(useEmailPreferences).mockReturnValue({
    data: repliesNowPreferences,
    isSuccess: true,
    isError: false,
  } as unknown as ReturnType<typeof useEmailPreferences>)
})

describe('the scouts notices in the Activity', () => {
  it('reads the entry among the scouts by its seal « Éclaireuse fondatrice »', async () => {
    await open([founder])

    expect(shown(T.founder)).toBe(true)
  })

  it('reads « Ta danse a été entendue » with the start of the report and its gain', async () => {
    await open([heard])

    expect(shown(T.heard)).toBe(true)
    expect(shown(T.heardGain)).toBe(true)
  })

  it('reads « Ta danse a été entendue » without a gain when nothing was paid', async () => {
    await open([{ ...heard, paid: false }])

    expect(shown(T.heard)).toBe(true)
    expect(shown(T.heardGain)).toBe(false)
  })

  it('reads the missions of the week by their number', async () => {
    await open([missions])

    expect(shown(T.missions)).toBe(true)
  })

  it('reads the removal with its reason, what remains and how to reach the editor', async () => {
    await open([removed])

    expect(shown(T.removed)).toBe(true)
    expect(shown(contactEmail)).toBe(true)
  })

  it('reads the four together in one list', async () => {
    await open([heard, removed, missions, founder])

    for (const text of [T.heard, T.removed, T.missions, T.founder]) expect(shown(text)).toBe(true)
  })
})

describe('where the scouts notices lead', () => {
  it('leads « Ta danse a été entendue » to « Mes retours »', () => {
    expect(targetOf(heard)).toBe('/settings/scouts')
  })

  it('leads the missions of the week to their page', () => {
    expect(targetOf(missions)).toBe('/scout/missions')
  })

  it('leads the removal to the scouts settings, where her reports remain', () => {
    expect(targetOf(removed)).toBe('/settings/scouts')
  })
})
