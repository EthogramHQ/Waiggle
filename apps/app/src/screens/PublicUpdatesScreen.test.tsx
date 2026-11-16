// Tests de la frise des mises à jour d'un projet public vue par un visiteur sans compte (tranche
// R12, relecture du plan, décision 10 : UI B3). Aujourd'hui, `/projects/<id>/updates` répond « Se
// connecter » à un visiteur ; l'adresse `/fr/projects/<id>/updates` montre les mises à jour d'un
// projet public, comme « Voir les 3 mises à jour » le promet sur la page du projet.
//
// L'interface attendue (plan R12, UI-C) : `screens/PublicUpdatesScreen.tsx`,
// `PublicUpdatesScreen({ id }: { id: string })` (l'identifiant du projet), qui lit
// GET /v1/public/projects/<id>/updates (`usePublicUpdates`, `public/api.ts`), et le projet pour son
// titre. Le faux serveur, les données et le faux routeur : Public.testkit.tsx.
import { screen } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  countdownUpdate,
  decollageId,
  onlyPublicRoutes,
  publicServer,
  requested,
  resetPublic,
} from './Public.testkit'
import { PublicUpdatesScreen } from './PublicUpdatesScreen'

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

const [firstLine, secondLine] = countdownUpdate.lines.map((line) => line.text)

beforeEach(() => {
  resetPublic(`/fr/projects/${decollageId}/updates`, { id: decollageId, lang: 'fr' })
  mockSession(null)
})

describe('the updates of a public project seen by a visitor (R12)', () => {
  it('shows the updates of a public project to a visitor', async () => {
    await renderWithProviders(<PublicUpdatesScreen id={decollageId} />)

    expect(await screen.findByText(containing(firstLine ?? ''))).toBeTruthy()
    expect(screen.getByText(containing(secondLine ?? ''))).toBeTruthy()
    expect(screen.getAllByText(containing('v1.2')).length).toBeGreaterThan(0)
  })

  it('reads them from the public routes only', async () => {
    await renderWithProviders(<PublicUpdatesScreen id={decollageId} />)

    await screen.findByText(containing(firstLine ?? ''))
    expect(requested()).toContain(`GET /v1/public/projects/${decollageId}/updates`)
    expect(onlyPublicRoutes()).toBe(true)
  })

  it('shows « Se connecter », and no update, when the project is not public', async () => {
    publicServer.projects.clear()
    await renderWithProviders(<PublicUpdatesScreen id={decollageId} />)

    expect(
      await screen.findByRole('header', { name: fr.t(($) => $.states.signedOutTitle) }),
    ).toBeTruthy()
    expect(screen.queryByText(containing(firstLine ?? ''))).toBeNull()
  })
})
