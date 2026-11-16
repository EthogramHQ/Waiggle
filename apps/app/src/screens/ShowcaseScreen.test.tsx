// Tests de l'accueil `/` avec sa vitrine (tranche R12, scénario « L'accueil : la vitrine, pour tout
// le monde », planches R12-Visiteur-Accueil et R12-Visiteur-Desktop) : l'accroche, « Des projets à
// voir » (3 cartes sur téléphone, 4 sur ordinateur), la phrase sous la vitrine, « Créer un compte »
// et « J'ai déjà un compte », « Rien n'est public sans ton accord. » ; sans projet mis en avant,
// l'accueil de R11 ; au pied, « Signaler un contenu » et le lien vers l'autre langue. Un membre
// connecté qui ouvre l'accueil y voit la vitrine avec sa barre de membre.
//
// L'interface attendue (plan R12, choix 8, UI-B, décision 16) :
// - `screens/ShowcaseScreen.tsx` : `ShowcaseScreen()`, sans props ;
// - il lit GET /v1/public/showcase pour un visiteur (`usePublicShowcase`, `showcase/api.ts`) ;
// - une carte mène au projet par `publicPath` (`/fr/projects/<id>`) quand l'adresse a une langue,
//   à l'adresse des membres (`/projects/<id>`) sinon ;
// - le pied : `LegalLinks` et « Signaler un contenu » (l'adresse de contact de R11), `LanguageLink`.
// Le faux serveur, les données et le faux routeur : Public.testkit.tsx.
import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  decollageId,
  mockNav,
  publicServer,
  requested,
  resetPublic,
  showcase,
} from './Public.testkit'
import { ShowcaseScreen } from './ShowcaseScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// Le nombre de la cloche, dans la barre d'un membre.
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
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
  tagline: fr.t(($) => $.home.tagline),
  showcase: fr.t(($) => $.home.showcase),
  note: fr.t(($) => $.home.showcaseNote),
  signUp: fr.t(($) => $.home.signUp),
  haveAccount: fr.t(($) => $.home.haveAccount),
  nothingPublic: fr.t(($) => $.home.membersOnly),
  report: fr.t(($) => $.legal.links.report),
}
const [first, second, third, fourth] = showcase.map((item) => item.title)

const pushed = () =>
  visited(mockNav.router.push, mockNav.router.navigate, mockNav.router.replace).map(pathOf)

/** La carte d'un projet : un lien, ou à défaut un bouton, dont le nom contient son titre. */
const cardOf = (title: string) =>
  screen.queryAllByRole('link', { name: containing(title) })[0] ??
  screen.getAllByRole('button', { name: containing(title) })[0]

let restoreWindow: (() => void) | null = null
beforeEach(() => {
  resetPublic('/fr/', { lang: 'fr' })
  mockSession(null)
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(useUnreadCount).mockReturnValue(0)
})
afterEach(() => {
  restoreWindow?.()
  restoreWindow = null
  jest.restoreAllMocks()
})
const onComputer = () => {
  restoreWindow = setDesktopWindow()
}

describe('the home showcase seen by a visitor (R12)', () => {
  it('shows the tagline, « Des projets à voir », and both account buttons', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    expect(await screen.findByRole('header', { name: T.showcase })).toBeTruthy()
    expect(screen.getByText(containing(T.tagline))).toBeTruthy()
    expect(screen.getByRole('button', { name: T.signUp })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.haveAccount })).toBeTruthy()
  })

  it('reads the showcase from the public route, without a session', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    await screen.findByText(containing(first ?? ''))
    expect(requested()).toContain('GET /v1/public/showcase')
  })

  it('shows three projects on a phone', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    for (const title of [first, second, third]) {
      expect(await screen.findByText(containing(title ?? ''))).toBeTruthy()
    }
    expect(screen.queryByText(containing(fourth ?? ''))).toBeNull()
  })

  it('shows four projects on a computer', async () => {
    onComputer()
    await renderWithProviders(<ShowcaseScreen />)

    for (const title of [first, second, third, fourth]) {
      expect(await screen.findByText(containing(title ?? ''))).toBeTruthy()
    }
  })

  it('says under the showcase that the authors chose to make these projects public', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    expect(await screen.findByText(containing(T.note))).toBeTruthy()
  })

  it('says « Rien n’est public sans ton accord. »', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    expect(await screen.findByText(containing(T.nothingPublic))).toBeTruthy()
  })

  it('opens a project at the address of the page language', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    await screen.findByText(containing(first ?? ''))
    await fireEvent.press(cardOf(first ?? '') as never)

    expect(pushed()).toContain(`/fr/projects/${decollageId}`)
  })

  it('opens a project at its English address from the English home', async () => {
    resetPublic('/en/', { lang: 'en' })
    await renderWithProviders(<ShowcaseScreen />, 'en')

    await screen.findByText(containing(first ?? ''))
    await fireEvent.press(cardOf(first ?? '') as never)

    expect(pushed()).toContain(`/en/projects/${decollageId}`)
  })

  it('keeps the home of R11 when no project is showcased', async () => {
    publicServer.showcase = []
    await renderWithProviders(<ShowcaseScreen />)

    // Témoin : l'accueil est là, la vitrine lue.
    expect(await screen.findByRole('button', { name: T.signUp })).toBeTruthy()
    await screen.findByText(containing(T.nothingPublic))
    expect(requested()).toContain('GET /v1/public/showcase')
    expect(screen.queryByRole('header', { name: T.showcase })).toBeNull()
    expect(screen.queryByText(containing(T.note))).toBeNull()
  })

  it('has « Signaler un contenu » at the foot of the page, which writes to the contact address', async () => {
    onComputer()
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    openURL.mockClear()
    await renderWithProviders(<ShowcaseScreen />)

    const report = await screen.findByRole('link', { name: containing(T.report) })
    await fireEvent.press(report)

    const opened = [
      ...openURL.mock.calls.map(([url]) => String(url)),
      ...visited(mockNav.router.push).map(String),
      String(report.props.href ?? ''),
    ]
    expect(opened.some((url) => url.startsWith('mailto:') && url.includes(contactEmail))).toBe(true)
  })

  it('links to the same page in the other language, named in that language', async () => {
    onComputer()
    await renderWithProviders(<ShowcaseScreen />)

    const english = await screen.findByRole('link', { name: 'English' })
    // La langue de destination, lue dans sa langue (scénario R12, « Accessibilité »).
    let node: typeof english | null = english
    let lang: unknown
    while (node && lang === undefined) {
      lang = node.props.lang
      node = node.parent
    }
    const inside = screen.getByText('English').props.lang
    expect([lang, inside]).toContain('en')
    expect(pathOf(english.props.href)).toBe('/en/')
  })
})

describe('the home showcase seen by a member (R12)', () => {
  beforeEach(() => {
    resetPublic('/')
    mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  })

  it('shows the showcase, without « Créer un compte »', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    expect(await screen.findByText(containing(first ?? ''))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.signUp })).toBeNull()
    expect(screen.queryByRole('button', { name: T.haveAccount })).toBeNull()
  })

  it('opens a project at its members address', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    await screen.findByText(containing(first ?? ''))
    await fireEvent.press(cardOf(first ?? '') as never)

    expect(pushed()).toContain(`/projects/${decollageId}`)
  })

  it('says the showcase in English for an English member', async () => {
    await renderWithProviders(<ShowcaseScreen />, 'en')

    const en = createI18n('en')
    expect(await screen.findByText(containing(first ?? ''))).toBeTruthy()
    expect(screen.getByRole('header', { name: en.t(($) => $.home.showcase) })).toBeTruthy()
  })
})
