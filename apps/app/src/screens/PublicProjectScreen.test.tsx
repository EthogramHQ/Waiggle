// Tests de la page d'un projet public vue par un visiteur sans compte (tranche R12, scénario « Ce que
// voit un visiteur sans compte », planches R12-Visiteur-Projet et R12-Compte-Requis) : tout ce que
// l'auteur a écrit, le nombre de réactions « de membres », « Tester la démo » par la page de sortie ;
// jamais les commentaires, les abonnés, les testeurs, « Suivre » ni le menu de l'auteur.
//
// L'interface attendue (plan R12, « Appli » UI-C et « API des modules partagés ») :
// - `screens/PublicProjectScreen.tsx` : `PublicProjectScreen({ id }: { id: string })` ;
// - il lit GET /v1/public/projects/<id> (`usePublicProject`, `public/api.ts`), sans cookie ;
// - « Réagir » et « Créer un compte » ouvrent la feuille « Compte requis » (AccountRequiredSheet) ;
// - un 404 donne la page « Se connecter » d'aujourd'hui (choix 3 du plan).
// Le faux serveur, les données et le faux routeur : Public.testkit.tsx.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { createI18n } from '../i18n'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  decollage,
  decollageId,
  mockNav,
  now,
  onlyPublicRoutes,
  publicServer,
  requested,
  resetPublic,
} from './Public.testkit'
import { PublicProjectScreen } from './PublicProjectScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
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
  webBadge: fr.t(($) => $.project.webBadge),
  commentsMembersOnly: fr.t(($) => $.visitor.commentsMembersOnly),
  signUp: fr.t(($) => $.visitor.signUp),
  signIn: fr.t(($) => $.visitor.signIn),
  accountRequired: fr.t(($) => $.visitor.accountRequired.title),
  reactions: fr.t(($) => $.visitor.reactions, { count: 54 }),
  tryDemo: fr.t(($) => $.project.page.tryDemo),
  report: fr.t(($) => $.report.project),
  updates: fr.t(($) => $.project.updates.title),
  copy: fr.t(($) => $.project.prompts.copy),
  follow: fr.t(($) => $.follow.follow),
  moreActions: fr.t(($) => $.actionMenu.label),
  signedOutTitle: fr.t(($) => $.states.signedOutTitle),
}
// « Réagir » n'a pas de texte à lui dans fr.ts (rapport de K2) : le bouton commence par ce mot.
const REACT = /^Réagir/

const path = `/fr/projects/${decollageId}`
const pushed = () =>
  visited(mockNav.router.push, mockNav.router.navigate, mockNav.router.replace).map(pathOf)

beforeEach(() => {
  resetPublic(path, { id: decollageId, lang: 'fr' })
  mockSession(null)
})
afterEach(() => jest.useRealTimers())

/** Ouvre la page et attend son titre. */
const open = async () => {
  await renderWithProviders(<PublicProjectScreen id={decollageId} />)
  return screen.findByRole('header', { name: containing(decollage.title) })
}

describe('a public project seen by a visitor (R12)', () => {
  it('opens without an account and shows what the author wrote', async () => {
    await open()

    expect(screen.getByText(containing(decollage.pitch))).toBeTruthy()
    expect(screen.getByText(containing('Ce quiz grandit avec Yanis'))).toBeTruthy()
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(screen.getByText('Apprendre')).toBeTruthy()
    expect(screen.getByText('Papi Jean')).toBeTruthy()
    expect(screen.getByText('ChatGPT')).toBeTruthy()
    expect(screen.getByText('Lovable')).toBeTruthy()
    expect(screen.getByText(containing('mars 2026'))).toBeTruthy()
    expect(screen.getByText(containing(decollage.prompts[0] ?? ''))).toBeTruthy()
    expect(screen.getAllByRole('button', { name: containing(T.copy) }).length).toBeGreaterThan(0)
    expect(screen.getByRole('header', { name: containing(T.updates) })).toBeTruthy()
  })

  it('reads the project from the public route only, never from the members routes', async () => {
    await open()

    expect(requested()).toContain(`GET /v1/public/projects/${decollageId}`)
    expect(onlyPublicRoutes()).toBe(true)
  })

  it('reads the public project without the session cookie, on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<PublicProjectScreen id={decollageId} />)
      await waitFor(() => expect(publicServer.sent.length).toBeGreaterThan(0))
    } finally {
      jest.restoreAllMocks()
    }

    // Plan R12, « API des modules partagés » : les lectures d'un visiteur partent sans cookie.
    const read = publicServer.sent.find(({ path: p }) => p === `/v1/public/projects/${decollageId}`)
    expect(read).toBeDefined()
    expect(read?.credentials).not.toBe('include')
  })

  it('shows the « Public » badge next to the status', async () => {
    await open()

    expect(screen.getByText(T.webBadge)).toBeTruthy()
  })

  it('shows the tools without a link to their page, which is for members', async () => {
    await open()

    expect(screen.getByText('ChatGPT')).toBeTruthy()
    expect(screen.queryByRole('link', { name: containing('ChatGPT') })).toBeNull()
    expect(screen.queryByRole('button', { name: containing('ChatGPT') })).toBeNull()
  })

  it('says the number of reactions « de membres », never who reacted', async () => {
    await open()

    expect(screen.getByText(containing(T.reactions))).toBeTruthy()
    // Ni les cinq réactions une à une, ni un nom.
    expect(screen.queryByText(fr.t(($) => $.project.reactions.amazing))).toBeNull()
  })

  it('says « Les commentaires sont réservés aux membres. » in place of the comments', async () => {
    await open()

    expect(screen.getByText(containing(T.commentsMembersOnly))).toBeTruthy()
    // Ni leur nombre, ni un extrait, ni de quoi écrire.
    expect(screen.queryByText(/commentaires? ·|\d+ commentaires?/)).toBeNull()
    expect(
      screen.queryByRole('button', { name: fr.t(($) => $.project.comments.addShort) }),
    ).toBeNull()
  })

  it('never shows « Suivre », the author menu, the testers or the hives', async () => {
    await open()

    // Témoin : la page est là.
    expect(screen.getByText(containing(decollage.pitch))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.follow })).toBeNull()
    expect(screen.queryByRole('button', { name: T.moreActions })).toBeNull()
    expect(screen.queryByText(/testeur/i)).toBeNull()
    expect(screen.queryByText(/ruche/i)).toBeNull()
  })

  it('opens « Compte requis » from « Réagir »', async () => {
    await open()

    await fireEvent.press(screen.getByRole('button', { name: REACT }))

    expect(await screen.findByRole('header', { name: T.accountRequired })).toBeTruthy()
    // Rien n'est fait à sa place : aucune écriture.
    expect(publicServer.sent.every(({ method }) => method === 'GET')).toBe(true)
  })

  it('opens « Compte requis » from « Créer un compte » under the comments sentence', async () => {
    await open()

    const notice = screen.getByText(containing(T.commentsMembersOnly))
    let row = notice.parent
    while (row && within(row).queryAllByRole('button', { name: T.signUp }).length === 0) {
      row = row.parent
    }
    if (!row) throw new Error('no « Créer un compte » near the comments sentence')
    const create =
      within(row).queryAllByRole('link', { name: T.signUp })[0] ??
      within(row).getAllByRole('button', { name: T.signUp })[0]
    if (!create) throw new Error('no « Créer un compte »')
    await fireEvent.press(create)

    expect(await screen.findByRole('header', { name: T.accountRequired })).toBeTruthy()
  })

  it('opens the demo through the exit page, which learns from which project it comes', async () => {
    await open()

    await fireEvent.press(screen.getByRole('button', { name: containing(T.tryDemo) }))

    const out = pushed().find((p) => p.startsWith('/out'))
    expect(out).toBeDefined()
    const params = new URLSearchParams(out?.slice(out.indexOf('?')))
    expect(params.get('url')).toBe(decollage.demo?.url)
    expect(params.get('project')).toBe(decollageId)
  })

  it('offers no demo when its link is withdrawn', async () => {
    publicServer.projects.set(decollageId, { ...decollage, demo: null })
    await open()

    expect(screen.queryByRole('button', { name: containing(T.tryDemo) })).toBeNull()
  })

  it('dates « Mis à jour » by the latest update, with its version', async () => {
    jest.useFakeTimers({
      now,
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setImmediate',
        'nextTick',
        'queueMicrotask',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
    await open()

    expect(screen.getByText(containing('Mis à jour hier'))).toBeTruthy()
    expect(screen.getAllByText(containing('v1.2')).length).toBeGreaterThan(0)
  })

  it('says no « Mis à jour » without an update, even when the project was edited', async () => {
    publicServer.projects.set(decollageId, {
      ...decollage,
      latestUpdate: null,
      latestUpdateAt: null,
      updateCount: 0,
      version: null,
    })
    publicServer.updates.set(decollageId, [])
    await open()

    // Témoin : la ligne des dates est là.
    expect(screen.getByText(containing('Publié'))).toBeTruthy()
    expect(screen.queryByText(/Mis à jour/)).toBeNull()
  })

  it('leads from the author name to their public page, in the language of the page', async () => {
    await open()

    await fireEvent.press(screen.getByRole('link', { name: containing('Papi Jean') }))

    expect(pushed()).toContain('/fr/members/u-papi')
  })

  it('does not link the author name when their page is not public', async () => {
    publicServer.projects.set(decollageId, {
      ...decollage,
      author: { ...decollage.author, publicPage: false },
    })
    await open()

    expect(screen.getByText('Papi Jean')).toBeTruthy()
    expect(screen.queryByRole('link', { name: containing('Papi Jean') })).toBeNull()
    expect(screen.queryByRole('button', { name: containing('Papi Jean') })).toBeNull()
  })

  it('offers « Signaler ce projet » at the bottom, which opens the report sheet', async () => {
    await open()

    const report =
      screen.queryByRole('link', { name: containing(T.report) }) ??
      screen.getByRole('button', { name: containing(T.report) })
    await fireEvent.press(report)

    const sheet = pushed().find((p) => p.startsWith('/report'))
    expect(sheet).toBeDefined()
    const params = new URLSearchParams(sheet?.slice(sheet.indexOf('?')))
    expect(params.get('kind')).toBe('project')
    expect(params.get('id')).toBe(decollageId)
  })

  it('offers « Se connecter » at the top, which comes back to the project', async () => {
    await open()

    const signIn =
      screen.queryAllByRole('link', { name: T.signIn })[0] ??
      screen.getAllByRole('button', { name: T.signIn })[0]
    if (!signIn) throw new Error('no « Se connecter »')
    await fireEvent.press(signIn)

    const target = pushed().find((p) => p.startsWith('/sign-in'))
    expect(target).toBeDefined()
    expect(new URLSearchParams(target?.slice(target.indexOf('?'))).get('next')).toBe(path)
  })

  it('shows « Se connecter », and nothing of the project, when it is not public', async () => {
    publicServer.projects.clear()
    await renderWithProviders(<PublicProjectScreen id={decollageId} />)

    expect(await screen.findByRole('header', { name: T.signedOutTitle })).toBeTruthy()
    expect(screen.queryByText(containing(decollage.title))).toBeNull()
  })

  it('labels the page in English at an English address, and keeps the text of the author', async () => {
    mockNav.pathname = `/en/projects/${decollageId}`
    await renderWithProviders(<PublicProjectScreen id={decollageId} />, 'en')

    await screen.findByRole('header', { name: containing(decollage.title) })
    // Les libellés en anglais, le texte de l'auteur tel qu'il l'a écrit (pas de traduction).
    const en = createI18n('en')
    expect(screen.getByText(containing(en.t(($) => $.visitor.commentsMembersOnly)))).toBeTruthy()
    expect(screen.getByText(containing(decollage.pitch))).toBeTruthy()
  })
})
