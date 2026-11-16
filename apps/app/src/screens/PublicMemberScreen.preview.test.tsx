// Tests de l'aperçu de la page publique (tranche R12, plan R12, décision 15) : « Voir ma page comme
// un visiteur » rend `PublicMemberScreen` avec `preview`. Le membre y voit ce qu'un inconnu verrait,
// lu à la route publique, sans ce qui ferait quitter l'aperçu : ni la barre d'un visiteur (« Se
// connecter »), ni lien vers un projet, ni « Signaler ce profil ».
import { screen } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { inesId, inesPublic, onlyPublicRoutes, requested, resetPublic } from './Public.testkit'
import { PublicMemberScreen } from './PublicMemberScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('expo-router', () => {
  const kit = () => require('./Public.testkit').mockNav
  return {
    useRouter: () => kit().router,
    usePathname: () => kit().pathname,
    useNavigation: () => kit().navigation,
    useLocalSearchParams: () => kit().params,
    useGlobalSearchParams: () => kit().params,
    useSegments: () => [],
    useFocusEffect: () => {},
    useIsFocused: () => true,
  }
})

const projectTitle = inesPublic.projects?.[0]?.title ?? ''
const T = {
  report: fr.t(($) => $.report.member),
  signIn: fr.t(($) => $.visitor.signIn),
  followers: fr.t(($) => $.follow.followers, { count: 12 }),
}

beforeEach(() => {
  resetPublic('/settings/public-page', {})
  mockSession(null)
})

const open = async (preview: boolean) => {
  await renderWithProviders(<PublicMemberScreen id={inesId} preview={preview} />)
  await screen.findByRole('header', { name: containing(inesPublic.name) })
}

describe('the preview of a public member page (R12)', () => {
  it('shows what a visitor sees, read from the public route', async () => {
    await open(true)

    expect(screen.getByText(containing(projectTitle))).toBeTruthy()
    expect(screen.getByText(containing(T.followers))).toBeTruthy()
    expect(requested()).toContain(`GET /v1/public/members/${inesId}`)
    expect(onlyPublicRoutes()).toBe(true)
  })

  it('offers no way out: no « Se connecter », no project link, no « Signaler ce profil »', async () => {
    await open(true)

    expect(screen.queryByRole('link', { name: T.signIn })).toBeNull()
    expect(screen.queryByRole('button', { name: T.signIn })).toBeNull()
    expect(screen.queryByRole('link', { name: containing(projectTitle) })).toBeNull()
    expect(screen.queryByRole('button', { name: containing(projectTitle) })).toBeNull()
    expect(screen.queryByText(containing(T.report))).toBeNull()
  })

  it('keeps all of them on the page of a real visitor (witness)', async () => {
    await open(false)

    expect(screen.getAllByRole('link', { name: containing(projectTitle) }).length).toBe(1)
    expect(screen.getByText(containing(T.report))).toBeTruthy()
  })
})
