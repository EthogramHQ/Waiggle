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

// R14 : les propriétés reçues par chaque ProjectCard, rangées par titre (la dernière reçue) ; le
// faux module dessine la vraie carte.
const mockCardProps = new Map<string, Record<string, unknown>>()
jest.mock('../ui/ProjectCard', () => {
  const actual = jest.requireActual('../ui/ProjectCard')
  const { createElement } = require('react')
  return {
    ...actual,
    ProjectCard: (props: Record<string, unknown>) => {
      mockCardProps.set(String(props.title), props)
      return createElement(actual.ProjectCard, props)
    },
  }
})
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

// --- R14 : la mosaïque, vue par un visiteur ---------------------------------------------------------
//
// Scénario « La mosaïque » : la même mosaïque que pour un membre, avec ce que la page publique sait
// de chaque projet (`PublicProjectCard` : photo, titre, accroche, statut). Ni réactions ni
// « Tester » : la page publique du projet les montre. Aucune carte ne répète le nom d'Inès. Dans
// l'aperçu (« Voir ma page comme un visiteur »), les cartes sont seulement dessinées, sans lien.

/** Une photo telle que la page publique la décrit (`PublicVisual`). */
const visual = (id: string) => ({
  id,
  kind: 'image' as const,
  url: `http://localhost:3000/media/visuals/${id}.webp`,
  width: 1600,
  height: 900,
  thumbhash: '3OcRJYB4d3h/iIeHeEh3eIhw+j3A', // gitleaks:allow (un résumé d'image, pas une clé)
  description: null,
})
const etoiles = {
  id: 'b5c6d7e8-9f01-4a12-8b34-e5f607182930',
  title: 'L’atlas des étoiles filantes',
  pitch: 'Les nuits où regarder, ville par ville, avec un rappel la veille.',
  status: 'testable' as const,
  cover: visual('c6d7e8f9-0a12-4b23-9c45-f60718293a41'),
}
const lune = {
  id: 'c6d7e8f9-0a12-4b23-8c45-071829304a52',
  title: 'La lune pour les petits',
  pitch: 'Une histoire du soir qui suit la phase de la lune.',
  status: 'building' as const,
  cover: visual('d7e8f9a0-1b23-4c34-8d56-18293a4b5c63'),
}
const ciel = inesPublic.projects?.[0]
/** Trois projets publics : deux avec photo, puis « Le ciel de ce soir », sans photo. */
const threeProjects = { ...inesPublic, projects: [etoiles, lune, ...(ciel ? [ciel] : [])] }

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const roleOf = (node: Host) => node.props.role ?? node.props.accessibilityRole
/** Les cases de la mosaïque (une par projet), dans l'ordre de l'arbre. */
const cells = () => hostsOf(screen.root as unknown as Host).filter((n) => roleOf(n) === 'listitem')
const textOf = (node: Host): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join(' ')
/** La taille reçue par la carte d'un projet (`full` par défaut) ; rien si aucune carte. */
const sizeOf = (title: string) => {
  const props = mockCardProps.get(title)
  return props ? (props.size ?? 'full') : 'no card'
}

describe('a public member page seen by a visitor, its mosaic (R14)', () => {
  beforeEach(() => {
    publicServer.members.set(inesId, threeProjects)
    mockCardProps.clear()
  })

  it('shows her public projects as a list of cards, in order', async () => {
    await open()

    const found = cells()
    expect(found).toHaveLength(3)
    const titles = [etoiles.title, lune.title, ciel?.title ?? '']
    expect(found.map((cell) => titles.find((title) => textOf(cell).includes(title)))).toEqual(
      titles,
    )
  })

  it('draws the newest project as the big card and the others as compact cards', async () => {
    await open()

    expect(cells()).toHaveLength(3) // témoin : la mosaïque est là
    expect([etoiles.title, lune.title, ciel?.title ?? ''].map(sizeOf)).toEqual([
      'full',
      'compact',
      'compact',
    ])
  })

  it('shows the pitch on the big card, and on a compact card only without a photo', async () => {
    await open()

    expect(screen.getByText(etoiles.pitch)).toBeTruthy()
    expect(screen.queryByText(lune.pitch, { includeHiddenElements: true })).toBeNull()
    expect(screen.getByText(ciel?.pitch ?? 'no pitch')).toBeTruthy()
  })

  it('shows the status of each project', async () => {
    await open()

    expect(screen.getByText(fr.t(($) => $.project.status.testable))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.status.building))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.status.done))).toBeTruthy()
  })

  it('shows neither reactions nor « Tester » on the cards', async () => {
    await open()

    expect(cells()).toHaveLength(3) // témoin : la mosaïque est là
    const testName = fr.t(($) => $.explore.testProject, { title: etoiles.title })
    expect(screen.queryByRole('link', { name: testName })).toBeNull()
    expect(
      screen.queryByText(
        fr.t(($) => $.explore.test),
        { includeHiddenElements: true },
      ),
    ).toBeNull()
    expect(screen.queryByText(/réaction/i, { includeHiddenElements: true })).toBeNull()
  })

  it('shows no name of the member on the cards', async () => {
    await open()

    expect(cells()).toHaveLength(3) // témoin
    for (const cell of cells()) expect(textOf(cell)).not.toContain(inesPublic.name)
  })

  it('keeps the cards without a link in the preview of her page', async () => {
    await renderWithProviders(<PublicMemberScreen id={inesId} preview />)
    await screen.findByRole('header', { name: containing(inesPublic.name) })

    expect(cells()).toHaveLength(3) // témoin : la mosaïque est dessinée dans l'aperçu aussi
    for (const title of [etoiles.title, lune.title]) {
      expect(screen.queryByRole('link', { name: containing(title) })).toBeNull()
      expect(screen.queryByRole('button', { name: containing(title) })).toBeNull()
    }
  })
})
