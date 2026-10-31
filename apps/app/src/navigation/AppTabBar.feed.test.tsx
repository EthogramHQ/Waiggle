// Tests de la barre d'onglets face aux nouveautés du fil (refonte, tranche R4, relecture juridique
// jur-J6) : le fil « s'arrête » (« Tu es à jour ») et ne rappelle pas le membre. Aucun badge de
// non-lus sur l'onglet Fil, ni chiffre, ni point, même quand de nouveaux projets attendent.
//
// Pour que le test prouve quelque chose, l'API est remplacée par une fausse qui répond à toute
// lecture du fil par des nouveautés (trois projets plus récents que la dernière lecture) : une barre
// qui irait les compter, par n'importe quel chemin du client, trouverait de quoi poser un badge.
import type { FollowingFeedPage } from '@ruche/contracts'
import { act, screen, within } from '@testing-library/react-native'
import { request } from '../api/client'
import { getFollowingPage } from '../feed/api'
import { createI18n } from '../i18n'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { TabBarHost } from '../ui/TabBar'
import { Text } from '../ui/Text'
import { useHydrated } from '../ui/theme/hydration'
import { AppTabBar } from './AppTabBar'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))
// Le client de l'API : `request` est remplacé (la réponse est choisie plus bas, selon l'adresse) ;
// le reste du module garde son vrai code.
jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  request: jest.fn(),
}))

jest.mock('expo-router', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))

const { t } = createI18n('fr')

/** Trois projets de Léa publiés après la dernière lecture du fil : trois nouveautés. */
const news: FollowingFeedPage = {
  items: ['10', '11', '12'].map((hour, i) => ({
    kind: 'project' as const,
    at: `2026-06-15T${hour}:00:00.000Z`,
    project: { ...summaryOf(recipesProject), id: `1111111${i}-1111-4111-8111-111111111111` },
  })),
  nextCursor: null,
  followsAnyone: true,
  lastReadAt: '2026-06-15T08:00:00.000Z',
}

beforeEach(() => {
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
  // Toute lecture d'un fil reçoit les nouveautés ; toute autre adresse, une erreur.
  // Les deux fils passent par le schéma demandé (« Découvrir » veut en plus followedAuthorIds).
  jest.mocked(request).mockImplementation(async (path, _init, schema) => {
    const parsed = schema.safeParse({ ...news, followedAuthorIds: [] })
    return path.startsWith('/v1/feed/') && parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, error: 'internal' }
  })
})

describe('the tab bar and the news of the feed (jur-J6)', () => {
  it('puts no unread badge on the feed tab, even with news waiting', async () => {
    // Le membre est sur Explorer : un badge, s'il existait, signalerait le fil d'à côté.
    await renderWithProviders(
      <TabBarHost bar={<AppTabBar />}>
        <Text>page</Text>
      </TabBarHost>,
    )
    // Le profil, puis une éventuelle lecture du fil : on laisse passer plusieurs tours.
    for (let i = 0; i < 4; i++) await act(async () => {})

    const bar = screen.getByLabelText(t(($) => $.nav.label))
    // L'onglet porte son seul nom, sans « 3 nouveautés » ni chiffre (nom exact, comparé en entier).
    const feed = within(bar).getByRole('link', { name: t(($) => $.nav.feed) })
    expect(feed).toBeTruthy()
    // Aucun nombre affiché dans la barre (les initiales de Léa, « LÉ », restent permises).
    expect(within(bar).queryByText(/\d/)).toBeNull()
    expect(within(bar).queryByLabelText(/\d/)).toBeNull()
  })

  it('serves news to any reading of the feed (witness of the fake API)', async () => {
    // Sans ce témoin, le test du dessus passerait aussi avec une fausse API qui ne rend rien.
    const page = await getFollowingPage()
    expect(page.items).toHaveLength(3)
    expect(page.lastReadAt).toBe(news.lastReadAt)
  })
})
