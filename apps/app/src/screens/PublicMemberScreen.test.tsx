// Tests de la page publique d'un membre vue par un visiteur sans compte (tranche R12, scénario « Une
// page publique », planches R12-Profil-Public et R12-Visiteur-Profil) : son nom et sa photo, puis
// seulement ce qu'il a coché (bio, outils favoris, projets publics, nombre d'abonnés) ; jamais son
// pseudo, ses ruches, qui il suit, ses commentaires ni ses réactions ; « Signaler ce profil » en bas ;
// une page fermée répond « Se connecter », comme un projet qui n'est pas public.
//
// L'interface attendue (plan R12, UI-D) : `screens/PublicMemberScreen.tsx`,
// `PublicMemberScreen({ id }: { id: string })`, qui lit GET /v1/public/members/<id>
// (`usePublicMember`, `public/api.ts`). Une case décochée donne un champ absent (contrat
// `PublicMember`). Le faux serveur, les données et le faux routeur : Public.testkit.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  cielId,
  inesId,
  inesNameOnly,
  inesPublic,
  mockNav,
  onlyPublicRoutes,
  publicServer,
  requested,
  resetPublic,
} from './Public.testkit'
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

const T = {
  report: fr.t(($) => $.report.member),
  follow: fr.t(($) => $.follow.follow),
  followers: fr.t(($) => $.follow.followers, { count: 12 }),
  noProjects: fr.t(($) => $.visitor.noProjects),
  signedOutTitle: fr.t(($) => $.states.signedOutTitle),
}
const bio = inesPublic.bio ?? ''
const projectTitle = inesPublic.projects?.[0]?.title ?? ''

const path = `/fr/members/${inesId}`
const pushed = () =>
  visited(mockNav.router.push, mockNav.router.navigate, mockNav.router.replace).map(pathOf)

beforeEach(() => {
  resetPublic(path, { id: inesId, lang: 'fr' })
  mockSession(null)
})

const open = async () => {
  await renderWithProviders(<PublicMemberScreen id={inesId} />)
  return screen.findByRole('header', { name: containing(inesPublic.name) })
}

describe('a public member page seen by a visitor (R12)', () => {
  it('shows the name, then the bio, the favourite tools, the public projects and the follower count', async () => {
    await open()

    expect(screen.getByText(containing(bio))).toBeTruthy()
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByText('Midjourney')).toBeTruthy()
    expect(screen.getByText(containing(projectTitle))).toBeTruthy()
    expect(screen.getByText(containing(T.followers))).toBeTruthy()
  })

  it('reads the page from the public route only', async () => {
    await open()

    expect(requested()).toContain(`GET /v1/public/members/${inesId}`)
    expect(onlyPublicRoutes()).toBe(true)
  })

  it('shows only the name and the photo when nothing else is checked', async () => {
    publicServer.members.set(inesId, inesNameOnly)
    await open()

    expect(screen.queryByText(containing(bio))).toBeNull()
    expect(screen.queryByText('Claude')).toBeNull()
    expect(screen.queryByText(containing(projectTitle))).toBeNull()
    expect(screen.queryByText(/abonné/)).toBeNull()
    // Une case décochée ne dit pas « pas de projet » : rien du tout.
    expect(screen.queryByText(containing(T.noProjects))).toBeNull()
  })

  it('says « Pas encore de projet public. » when the projects are shown but there is none', async () => {
    publicServer.members.set(inesId, { ...inesPublic, projects: [] })
    await open()

    expect(screen.getByText(containing(T.noProjects))).toBeTruthy()
  })

  it('never shows the handle, « Suivre », the hives, the follows, comments or reactions', async () => {
    await open()

    // Témoin : la page est là.
    expect(screen.getByText(containing(bio))).toBeTruthy()
    expect(screen.queryByText(/@/)).toBeNull()
    expect(screen.queryByRole('button', { name: T.follow })).toBeNull()
    expect(screen.queryByText(/ruche/i)).toBeNull()
    expect(screen.queryByText(/abonnements|commentaires|réactions/i)).toBeNull()
  })

  it('shows the favourite tools without a link to their page', async () => {
    await open()

    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.queryByRole('link', { name: containing('Claude') })).toBeNull()
    expect(screen.queryByRole('button', { name: containing('Claude') })).toBeNull()
  })

  it('opens a public project at the address of the page language', async () => {
    await open()

    const card =
      screen.queryAllByRole('link', { name: containing(projectTitle) })[0] ??
      screen.getAllByRole('button', { name: containing(projectTitle) })[0]
    await fireEvent.press(card as never)

    expect(pushed()).toContain(`/fr/projects/${cielId}`)
  })

  it('offers « Signaler ce profil » at the bottom, which opens the report sheet', async () => {
    await open()

    const report =
      screen.queryByRole('link', { name: containing(T.report) }) ??
      screen.getByRole('button', { name: containing(T.report) })
    await fireEvent.press(report)

    const sheet = pushed().find((p) => p.startsWith('/report'))
    expect(sheet).toBeDefined()
    const params = new URLSearchParams(sheet?.slice(sheet.indexOf('?')))
    expect(params.get('kind')).toBe('member')
    expect(params.get('id')).toBe(inesId)
  })

  it('shows « Se connecter », and nothing of the member, when the page is not public', async () => {
    publicServer.members.clear()
    await renderWithProviders(<PublicMemberScreen id={inesId} />)

    expect(await screen.findByRole('header', { name: T.signedOutTitle })).toBeTruthy()
    expect(screen.queryByText(containing(inesPublic.name))).toBeNull()
  })
})
