// L'aperçu « Voir ma page comme un visiteur » ne montre jamais l'état d'avant (R12, relecture de
// sécurité de la branche, « Écartés » : l'API répond aux visiteurs avec `max-age=60`, le navigateur
// garde donc la page une minute ; et le cache de React Query la garde plus encore). Trois cas :
// - la lecture de l'aperçu demande une copie neuve au navigateur (`cache: 'no-store'`) ;
// - rouvert après un changement fait ailleurs (la bio modifiée dans « Mon profil »), l'aperçu ne
//   montre pas, même un instant, la page lue à sa première ouverture ;
// - ouvert pendant qu'un changement de case est encore en route, il se relit quand celui-ci finit.
// Le réseau est un faux `fetch`, comme dans PublicPageSettingsScreen.test.tsx.
import type { Me, MyPublicPage, PublicMember, PublicPageSettings } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { leaMe } from '../testing/fixtures'
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
  bio: fr.t(($) => $.profile.publicPage.bio),
  preview: fr.t(($) => $.profile.publicPage.preview),
  back: fr.t(($) => $.common.back),
}

const open: PublicPageSettings = {
  publicPage: true,
  showBio: true,
  showFavoriteTools: true,
  showProjects: true,
  showFollowerCount: false,
}

type Sent = { method: string; path: string; cache: RequestCache | undefined }

const server = {
  sent: [] as Sent[],
  me: leaMe as Me,
  settings: open,
  /** Tant qu'il est posé, un PATCH attend qu'on l'appelle pour s'enregistrer et répondre. */
  holdPatch: null as null | (() => void),
  holding: false,
  /** Même chose pour la lecture de la page publique : l'aperçu reste un temps en attente. */
  releaseRead: null as null | (() => void),
  holdingReads: false,

  page(): MyPublicPage {
    return { settings: this.settings, webProjectCount: 2, projectCount: 4 }
  },

  publicMember(): PublicMember {
    return {
      id: this.me.id,
      name: this.me.name,
      avatarUrl: null,
      ...(this.settings.showBio ? { bio: this.me.bio } : null),
    }
  },

  json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const { pathname } = new URL(url)
    const method = (init.method ?? 'GET').toUpperCase()
    this.sent.push({ method, path: pathname, cache: init.cache })
    if (method === 'GET' && pathname === '/v1/me') return this.json(200, this.me)
    if (pathname === '/v1/me/public-page' && method === 'GET') return this.json(200, this.page())
    if (pathname === '/v1/me/public-page' && method === 'PATCH') {
      const patch = JSON.parse(String(init.body)) as Partial<PublicPageSettings>
      if (this.holding) await new Promise<void>((resolve) => (this.holdPatch = resolve))
      this.settings = { ...this.settings, ...patch }
      return this.json(200, this.page())
    }
    if (method === 'GET' && pathname === `/v1/public/members/${this.me.id}`) {
      if (this.holdingReads) await new Promise<void>((resolve) => (this.releaseRead = resolve))
      return this.json(200, this.publicMember())
    }
    return this.json(404, { error: { code: 'not_found' } })
  },
}

beforeEach(() => {
  server.sent = []
  server.me = leaMe
  server.settings = open
  server.holding = false
  server.holdPatch = null
  server.holdingReads = false
  server.releaseRead = null
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    server.fetch(String(input), init),
  ) as typeof fetch
  for (const fn of Object.values(mockRouter)) fn.mockClear()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
})

const previewButton = () => screen.findByRole('button', { name: containing(T.preview) })
const reads = () =>
  server.sent.filter(
    ({ method, path }) => method === 'GET' && path === `/v1/public/members/${leaMe.id}`,
  )

describe('« Voir ma page comme un visiteur » never shows the page as it was (R12)', () => {
  it('asks the browser for a fresh copy, never the one it kept', async () => {
    await renderWithProviders(<PublicPageSettingsScreen />)

    await fireEvent.press(await previewButton())

    expect(await screen.findByText(containing(leaMe.bio))).toBeTruthy()
    expect(reads().length).toBeGreaterThan(0)
    expect(reads().every(({ cache }) => cache === 'no-store')).toBe(true)
  })

  it('never shows, when opened again, the page read the first time', async () => {
    await renderWithProviders(<PublicPageSettingsScreen />)
    await fireEvent.press(await previewButton())
    expect(await screen.findByText(containing(leaMe.bio))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: T.back }))

    // La bio changée ailleurs (dans « Mon profil ») : la page publique a changé sur le serveur.
    const newBio = 'Je construis des robots qui arrosent les plantes.'
    server.me = { ...leaMe, bio: newBio }
    server.holdingReads = true
    await fireEvent.press(await previewButton())

    // Pas un instant l'ancienne bio : pendant sa nouvelle lecture, l'aperçu attend.
    await waitFor(() => expect(server.releaseRead).not.toBeNull())
    expect(screen.queryByText(containing(leaMe.bio))).toBeNull()
    server.releaseRead?.()
    expect(await screen.findByText(containing(newBio))).toBeTruthy()
    expect(screen.queryByText(containing(leaMe.bio))).toBeNull()
  })

  it('reads the page again when a change still on its way ends', async () => {
    server.holding = true
    await renderWithProviders(<PublicPageSettingsScreen />)
    await fireEvent.press(await screen.findByRole('checkbox', { name: containing(T.bio) }))
    await waitFor(() => expect(server.holdPatch).not.toBeNull())

    // L'aperçu ouvert avant que le serveur ait enregistré la bio décochée : il la montre encore.
    await fireEvent.press(await previewButton())
    expect(await screen.findByText(containing(leaMe.bio))).toBeTruthy()

    server.holdPatch?.()

    await waitFor(() => expect(screen.queryByText(containing(leaMe.bio))).toBeNull())
    expect(await screen.findByRole('header', { name: containing(leaMe.name) })).toBeTruthy()
  })
})
