// Tests de « Mon profil public » (tranche R12, docs/scenarios/refonte.md, « Rendre sa page
// publique », planche R12-Profil-Public) : « Rendre ma page publique », non coché, avec l'aide
// « Visible par tous, et trouvable sur Google » ; une fois activée, « Ce que voit un visiteur » :
// « Mon nom et ma photo » (toujours, non décochable), « Ma bio », « Mes outils favoris », « Mes
// projets publics » (cochés), « Mon nombre d'abonnés » (décoché), le compte « 2 sur 4 : les autres
// restent entre membres » ; « Jamais montrés : … » ; « Voir ma page comme un visiteur » (UI C4 : un
// aperçu de la page publique, lue sans cookie, jamais la vue de membre) ; le pseudo jamais montré ;
// un membre suspendu peut seulement fermer sa page (Q6).
//
// Ce que ces tests supposent de l'écran (plan R12, UI-F, choix 11, décision 15 ; à corriger si le
// code en décide autrement, en le disant) :
// - `screens/PublicPageSettingsScreen.tsx`, `PublicPageSettingsScreen()` sans prop (route
//   `app/settings/public-page.tsx`) ; le membre vient de GET /v1/me ;
// - les réglages : GET /v1/me/public-page (`MyPublicPage`) ; chaque geste envoie PATCH
//   /v1/me/public-page avec le seul champ changé ; la réponse (`MyPublicPage`) fait foi ;
// - « Rendre ma page publique » est un `switch` ; chaque case, une `checkbox` nommée par son
//   libellé (son aide peut suivre dans le nom) ; « Mon nom et ma photo » cochée et inactive ;
// - « Voir ma page comme un visiteur » ouvre l'aperçu **dans l'écran** (une feuille, ou une couche),
//   rendu par `PublicMemberScreen` (`usePublicMember`, GET /v1/public/members/<id>) : une adresse
//   `/fr/members/<id>` montrerait au membre connecté sa vue de membre (C4).
// Le réseau est un faux `fetch` : la forme des hooks de `profile/api.ts` et `public/api.ts` est libre.
import type { Me, MyPublicPage, PublicMember, PublicPageSettings } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { PublicPageSettingsScreen } from './PublicPageSettingsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  dismiss: jest.fn(),
  dismissTo: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
}
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/settings/public-page',
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useSegments: () => [],
  useFocusEffect: () => {},
  useIsFocused: () => true,
  useNavigation: () => ({
    addListener: () => () => {},
    removeListener: () => {},
    isFocused: () => true,
    setOptions: () => {},
    canGoBack: () => true,
    getParent: () => undefined,
  }),
}))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))

const T = {
  title: fr.t(($) => $.profile.publicPage.title),
  toggle: fr.t(($) => $.profile.publicPage.toggle),
  toggleHint: fr.t(($) => $.profile.publicPage.toggleHint),
  visitorSees: fr.t(($) => $.profile.publicPage.visitorSees),
  nameAndPhoto: fr.t(($) => $.profile.publicPage.nameAndPhoto),
  bio: fr.t(($) => $.profile.publicPage.bio),
  tools: fr.t(($) => $.profile.publicPage.tools),
  projects: fr.t(($) => $.profile.publicPage.projects),
  followerCount: fr.t(($) => $.profile.publicPage.followerCount),
  projectsCount: (count: number, total: number) =>
    fr.t(($) => $.profile.publicPage.projectsCount, { count, total }),
  projectsAll: (count: number, total: number) =>
    fr.t(($) => $.profile.publicPage.projectsAll, { count, total }),
  projectsNone: fr.t(($) => $.profile.publicPage.projectsNone),
  never: fr.t(($) => $.profile.publicPage.never),
  preview: fr.t(($) => $.profile.publicPage.preview),
  suspended: fr.t(($) => $.profile.publicPage.suspended),
  error: fr.t(($) => $.profile.publicPage.error),
}

// --- Le faux serveur ---

const closed: PublicPageSettings = {
  publicPage: false,
  showBio: true,
  showFavoriteTools: true,
  showProjects: true,
  showFollowerCount: false,
}

type Sent = {
  method: string
  path: string
  body: unknown
  credentials: RequestCredentials | undefined
}

const server = {
  sent: [] as Sent[],
  me: leaMe as Me,
  settings: closed,
  webProjectCount: 2,
  projectCount: 4,
  /** Vrai : PATCH répond 503 (le changement ne s'enregistre pas). */
  failPatch: false,

  page(): MyPublicPage {
    return {
      settings: this.settings,
      webProjectCount: this.webProjectCount,
      projectCount: this.projectCount,
    }
  },

  /** La page publique telle que l'API la donne à un visiteur : seulement ce qui est coché. */
  publicMember(): PublicMember | null {
    if (!this.settings.publicPage) return null
    return {
      id: this.me.id,
      name: this.me.name,
      avatarUrl: null,
      ...(this.settings.showBio ? { bio: this.me.bio } : null),
      ...(this.settings.showFavoriteTools
        ? {
            favoriteTools: this.me.favoriteTools.map((label) => ({
              label,
              slug: label.toLowerCase(),
              inCatalogue: true,
            })),
          }
        : null),
      ...(this.settings.showProjects ? { projects: [] } : null),
    }
  },

  reply(method: string, path: string, body: unknown): { status: number; body?: unknown } {
    if (method === 'GET' && path === '/v1/me') return { status: 200, body: this.me }
    if (path === '/v1/me/public-page') {
      if (method === 'GET') return { status: 200, body: this.page() }
      if (method === 'PATCH') {
        if (this.failPatch) return { status: 503 }
        this.settings = { ...this.settings, ...(body as Partial<PublicPageSettings>) }
        return { status: 200, body: this.page() }
      }
    }
    if (method === 'GET' && path === `/v1/public/members/${this.me.id}`) {
      const member = this.publicMember()
      return member
        ? { status: 200, body: member }
        : { status: 404, body: { error: { code: 'not_found' } } }
    }
    return { status: 404, body: { error: { code: 'not_found' } } }
  },

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const { pathname } = new URL(url)
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    this.sent.push({ method, path: pathname, body, credentials: init.credentials })
    const reply = this.reply(method, pathname, body)
    return reply.body === undefined
      ? new Response(null, { status: reply.status })
      : new Response(JSON.stringify(reply.body), {
          status: reply.status,
          headers: { 'Content-Type': 'application/json' },
        })
  },
}

const patches = () =>
  server.sent.filter((one) => one.method === 'PATCH' && one.path === '/v1/me/public-page')

beforeEach(() => {
  server.sent = []
  server.me = leaMe
  server.settings = closed
  server.webProjectCount = 2
  server.projectCount = 4
  server.failPatch = false
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    server.fetch(String(input), init),
  ) as typeof fetch
  for (const fn of Object.values(mockRouter)) fn.mockClear()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
})

// --- Les aides ---

const startsWith = (label: string) => new RegExp(`^${label.replace(/\s+/g, '\\s+')}`)
const toggle = () => screen.findByRole('switch', { name: startsWith(T.toggle) })
const box = (label: string) => screen.getByRole('checkbox', { name: startsWith(label) })
const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0

const open = async (settings: Partial<PublicPageSettings> = {}) => {
  server.settings = { ...closed, ...settings }
  await renderWithProviders(<PublicPageSettingsScreen />)
  return toggle()
}

// --- Les tests ---

describe('« Mon profil public », a closed page (R12)', () => {
  it('offers « Rendre ma page publique », unchecked, with « Visible par tous, et trouvable sur Google »', async () => {
    const control = await open()

    expect(control).not.toBeChecked()
    expect(shown(T.toggleHint)).toBe(true)
  })

  it('shows none of the boxes while the page is closed', async () => {
    await open()

    expect(screen.queryByRole('checkbox', { name: startsWith(T.bio) })).toBeNull()
  })

  it('opens the page, sending only { publicPage: true }', async () => {
    await fireEvent.press(await open())

    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]?.body).toEqual({ publicPage: true })
    await waitFor(async () => expect(await toggle()).toBeChecked())
  })
})

describe('« Mon profil public », an open page (R12)', () => {
  it('shows what a visitor sees: name and photo always, bio, tools and projects checked, followers unchecked', async () => {
    await open({ publicPage: true })
    await screen.findByRole('checkbox', { name: startsWith(T.bio) })

    expect(shown(T.visitorSees)).toBe(true)
    expect(box(T.nameAndPhoto)).toBeChecked()
    expect(box(T.nameAndPhoto)).toBeDisabled()
    expect(box(T.bio)).toBeChecked()
    expect(box(T.tools)).toBeChecked()
    expect(box(T.projects)).toBeChecked()
    expect(box(T.followerCount)).not.toBeChecked()
  })

  it('says how many projects are public: « 2 sur 4 : les autres restent entre membres »', async () => {
    await open({ publicPage: true })

    await waitFor(() => expect(shown(T.projectsCount(2, 4))).toBe(true))
  })

  it('says « 4 sur 4 » alone when every project is public', async () => {
    server.webProjectCount = 4
    await open({ publicPage: true })

    await waitFor(() => expect(shown(T.projectsAll(4, 4))).toBe(true))
    expect(shown(T.projectsCount(4, 4))).toBe(false)
  })

  it('says « Aucun projet public pour l’instant » without a public project', async () => {
    server.webProjectCount = 0
    await open({ publicPage: true })

    await waitFor(() => expect(shown(T.projectsNone)).toBe(true))
  })

  it('says what is never shown', async () => {
    await open({ publicPage: true })

    await waitFor(() => expect(shown(T.never)).toBe(true))
  })

  it('unchecks the bio, sending only { showBio: false }', async () => {
    await open({ publicPage: true })

    await fireEvent.press(await screen.findByRole('checkbox', { name: startsWith(T.bio) }))

    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]?.body).toEqual({ showBio: false })
    await waitFor(() => expect(box(T.bio)).not.toBeChecked())
  })

  it('checks the follower count, sending only { showFollowerCount: true }', async () => {
    await open({ publicPage: true })

    await fireEvent.press(
      await screen.findByRole('checkbox', { name: startsWith(T.followerCount) }),
    )

    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]?.body).toEqual({ showFollowerCount: true })
  })

  it('never shows the handle (Q8)', async () => {
    await open({ publicPage: true })
    await screen.findByRole('checkbox', { name: startsWith(T.bio) })

    expect(screen.queryByText(containing(`@${leaMe.handle}`))).toBeNull()
  })

  it('says when a change could not be saved, and keeps the box as it was', async () => {
    server.failPatch = true
    await open({ publicPage: true })

    await fireEvent.press(await screen.findByRole('checkbox', { name: startsWith(T.bio) }))

    expect(await screen.findByText(containing(T.error))).toBeTruthy()
    await waitFor(() => expect(box(T.bio)).toBeChecked())
  })
})

describe('« Voir ma page comme un visiteur » (UI C4)', () => {
  it('previews the page without the unchecked bio', async () => {
    await open({ publicPage: true })
    await fireEvent.press(await screen.findByRole('checkbox', { name: startsWith(T.bio) }))
    await waitFor(() => expect(patches()).toHaveLength(1))

    await fireEvent.press(screen.getByRole('button', { name: containing(T.preview) }))

    // L'aperçu : le nom en titre, lu par la route d'un visiteur ; plus la bio décochée.
    expect(await screen.findByRole('header', { name: containing(leaMe.name) })).toBeTruthy()
    expect(
      server.sent.some(
        ({ method, path }) => method === 'GET' && path === `/v1/public/members/${leaMe.id}`,
      ),
    ).toBe(true)
    expect(screen.queryByText(containing(leaMe.bio))).toBeNull()
  })

  it('shows the checked bio in the preview (témoin)', async () => {
    await open({ publicPage: true })

    await fireEvent.press(await screen.findByRole('button', { name: containing(T.preview) }))

    expect(await screen.findByText(containing(leaMe.bio))).toBeTruthy()
  })

  it('never reads the page of a member for the preview, nor opens its address', async () => {
    await open({ publicPage: true })

    await fireEvent.press(await screen.findByRole('button', { name: containing(T.preview) }))
    await screen.findByText(containing(leaMe.bio))

    expect(server.sent.some(({ path }) => path === `/v1/members/${leaMe.id}`)).toBe(false)
    expect(mockRouter.push).not.toHaveBeenCalled()
    expect(mockRouter.navigate).not.toHaveBeenCalled()
  })
})

describe('« Voir ma page comme un visiteur », the focus (design review R12, point 2)', () => {
  /** Les textes des vues où le lecteur d'écran a été posé (téléphone), dans l'ordre. */
  const readerStops = (sent: jest.SpyInstance) =>
    sent.mock.calls
      .filter(([, event]) => event === 'focus')
      .map(([node]) => (node as { props: { children?: unknown } }).props.children)

  it('moves the reader to the name, the title of the preview, when it opens', async () => {
    await open({ publicPage: true })
    const sent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    sent.mockClear()
    try {
      await fireEvent.press(await screen.findByRole('button', { name: containing(T.preview) }))
      await screen.findByRole('header', { name: containing(leaMe.name) })

      await waitFor(() => expect(readerStops(sent).at(-1)).toBe(leaMe.name))
    } finally {
      sent.mockRestore()
    }
  })

  it('moves nothing before the preview opens (témoin)', async () => {
    const sent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    sent.mockClear()
    try {
      await open({ publicPage: true })
      await screen.findByRole('button', { name: containing(T.preview) })

      expect(readerStops(sent)).not.toContain(leaMe.name)
    } finally {
      sent.mockRestore()
    }
  })
})

describe('« Mon profil public » for a suspended member (Q6)', () => {
  beforeEach(() => {
    server.me = suspendedMe
  })

  it('cannot open the page, and says why', async () => {
    const control = await open()

    await waitFor(() => expect(shown(T.suspended)).toBe(true))
    expect(control).toBeDisabled()
  })

  it('can still close an open page', async () => {
    await open({ publicPage: true })
    await waitFor(() => expect(shown(T.suspended)).toBe(true))

    await fireEvent.press(await toggle())

    await waitFor(() => expect(patches()).toHaveLength(1))
    expect(patches()[0]?.body).toEqual({ publicPage: false })
  })

  it('cannot change what a visitor sees', async () => {
    await open({ publicPage: true })
    await waitFor(() => expect(shown(T.suspended)).toBe(true))

    expect(box(T.bio)).toBeDisabled()
    expect(box(T.followerCount)).toBeDisabled()
  })
})
