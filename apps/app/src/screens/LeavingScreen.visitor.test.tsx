// Tests de la page de sortie (`/out`) ouverte par un visiteur sans compte (tranche R12, relecture de
// sécurité du plan, I5) : « Tester la démo » d'un projet public passe par cette page. Pour un membre,
// la page relit le projet (GET /v1/projects/<id>) pour dire « La démo de …, ajoutée par … », mais
// seulement si sa démo est exactement l'adresse de la page (R5a, sec-B4). Un visiteur ne peut pas lire
// cette route : la page lit alors le projet public (GET /v1/public/projects/<id>,
// `usePublicProject`), avec la même règle, après `publicHttpsUrl` des deux côtés.
//
// Le faux serveur et les données : Public.testkit.tsx (« Décollage ! », démo
// https://decollage.lovable.app/).
import { act, screen, waitFor } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LeavingScreen } from './LeavingScreen'
import { decollage, decollageId, publicServer, requested, resetPublic } from './Public.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
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

const fromLine = fr.t(($) => $.leaving.from, {
  title: decollage.title,
  name: decollage.author.name,
})
const OPEN = 'Ouvrir le site'

beforeEach(() => {
  resetPublic('/out')
  mockSession(null)
})

/** Attend que la lecture du projet soit partie et que sa réponse soit affichée. */
const settled = async () => {
  await waitFor(() => expect(publicServer.sent.length).toBeGreaterThan(0))
  await act(async () => {})
}

describe('the exit page seen by a visitor (R12, I5)', () => {
  it('names the project to a visitor only when the public project has this exact demo address', async () => {
    await renderWithProviders(
      <LeavingScreen url="https://decollage.lovable.app/" project={decollageId} />,
    )

    expect(await screen.findByText(fromLine)).toBeTruthy()
    expect(requested()).toContain(`GET /v1/public/projects/${decollageId}`)
    expect(requested()).not.toContain(`GET /v1/projects/${decollageId}`)
  })

  it('compares both addresses the same way (a host in capitals is the same site)', async () => {
    await renderWithProviders(
      <LeavingScreen url="https://DECOLLAGE.lovable.app" project={decollageId} />,
    )

    expect(await screen.findByText(fromLine)).toBeTruthy()
  })

  it.each([
    ['another page of the same site', 'https://decollage.lovable.app/login'],
    ['a site that only starts with the same name', 'https://decollage.lovable.app.evil.net'],
    ['the same page with something added', 'https://decollage.lovable.app/?x=1'],
  ])('says nothing about the project for %s', async (_case, url) => {
    await renderWithProviders(<LeavingScreen url={url} project={decollageId} />)

    await settled()
    // Témoin : la page est là, prête à ouvrir le site.
    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(screen.queryByText(/La démo de/)).toBeNull()
  })

  it('says nothing about a project whose demo was withdrawn', async () => {
    publicServer.projects.set(decollageId, { ...decollage, demo: null })
    await renderWithProviders(
      <LeavingScreen url="https://decollage.lovable.app/" project={decollageId} />,
    )

    await settled()
    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(screen.queryByText(/La démo de/)).toBeNull()
  })

  it('shows the same page, without the line, when the project is not public', async () => {
    publicServer.projects.clear()
    await renderWithProviders(
      <LeavingScreen url="https://decollage.lovable.app/" project={decollageId} />,
    )

    await settled()
    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    expect(screen.queryByText(/La démo de/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks nothing of the API when « project » is not a project id', async () => {
    await renderWithProviders(
      <LeavingScreen url="https://decollage.lovable.app/" project="../members/u1" />,
    )

    expect(screen.getByRole('button', { name: OPEN })).toBeTruthy()
    await act(async () => {})
    expect(publicServer.sent).toHaveLength(0)
  })

  it('still reads the members route for a signed-in member', async () => {
    mockSession({ user: { id: 'u-max', name: 'Max' } })
    await renderWithProviders(
      <LeavingScreen url="https://decollage.lovable.app/" project={decollageId} />,
    )

    await settled()
    expect(requested()).toContain(`GET /v1/projects/${decollageId}`)
    expect(requested()).not.toContain(`GET /v1/public/projects/${decollageId}`)
  })
})
