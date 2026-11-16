// Tests de la feuille « Compte requis » (tranche R12, scénario « Réagir, commenter, suivre »,
// planche R12-Compte-Requis) : un visiteur touche « Réagir » ou « Créer un compte » sur un projet
// public. Le titre dit tout (« Pour réagir, crée ton compte ») ; trois pastilles disent ce qu'un
// compte permet ; la limite (« {{appName}} s'ouvre sur invitation. ») ; « Créer un compte » puis
// « Se connecter » ; « Rien n'est public sans ton accord. ». Une fois connecté, il revient sur le
// projet ; rien n'est fait à sa place (Q11).
//
// L'interface attendue (plan R12, UI-C) : `screens/AccountRequiredSheet.tsx`,
// `AccountRequiredSheet({ open, onClose }: { open: boolean; onClose: () => void })`, posée par la
// page du projet ; elle lit elle-même l'adresse de la page (`usePathname`) pour y ramener après la
// connexion (`?next=`, comme `useSignInAgain`).
import { appName } from '@ruche/brand'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { pathOf, visited } from '../testing/navigation'
import { watchOpeningFocus } from '../testing/openingFocus'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { AccountRequiredSheet } from './AccountRequiredSheet'
import { decollageId, mockNav, resetPublic } from './Public.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
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
  title: fr.t(($) => $.visitor.accountRequired.title),
  follow: fr.t(($) => $.visitor.accountRequired.follow),
  inviteOnly: fr.t(($) => $.visitor.accountRequired.inviteOnly),
  signUp: fr.t(($) => $.visitor.signUp),
  signIn: fr.t(($) => $.visitor.signIn),
  nothingPublic: fr.t(($) => $.home.membersOnly),
  waggle: fr.t(($) => $.project.reactions.bravo),
  comment: fr.t(($) => $.project.comments.addShort),
}

const path = `/fr/projects/${decollageId}`
const onClose = jest.fn()
const pushed = () =>
  visited(mockNav.router.push, mockNav.router.navigate, mockNav.router.replace).map(pathOf)

beforeEach(() => {
  resetPublic(path, { id: decollageId, lang: 'fr' })
  mockSession(null)
  onClose.mockClear()
})
afterEach(() => jest.restoreAllMocks())

const openSheet = async () => {
  await renderWithProviders(<AccountRequiredSheet open onClose={onClose} />)
  return screen.findByRole('header', { name: T.title })
}

/** Le bouton (ou le lien) de ce nom. */
const action = (name: string) =>
  screen.queryAllByRole('button', { name })[0] ?? screen.getAllByRole('link', { name })[0]

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

describe('the « Compte requis » sheet (R12)', () => {
  it('is titled « Pour réagir, crée ton compte »', async () => {
    expect(await openSheet()).toBeTruthy()
  })

  it('offers « Créer un compte » first, then « Se connecter »', async () => {
    await openSheet()

    const names = screen
      .getAllByRole('button')
      .map((one) => String(one.props.accessibilityLabel ?? ''))
    const create = names.indexOf(T.signUp)
    expect(create).toBeGreaterThanOrEqual(0)
    expect(names.indexOf(T.signIn)).toBeGreaterThan(create)
  })

  it('says the invitation limit and « Rien n’est public sans ton accord. »', async () => {
    await openSheet()

    // Le nom de l'appli est rempli par i18n ({{appName}}).
    expect(T.inviteOnly).toContain(appName)
    expect(screen.getByText(containing(T.inviteOnly))).toBeTruthy()
    expect(screen.getByText(containing(T.nothingPublic))).toBeTruthy()
  })

  it('shows what an account allows as plain labels, not as buttons', async () => {
    await openSheet()

    for (const label of [T.waggle, T.comment, T.follow]) {
      expect(screen.getByText(containing(label))).toBeTruthy()
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  it('puts the focus on its title when it opens', async () => {
    const focused = watchOpeningFocus()
    await openSheet()

    await waitFor(() => expect(focused()).toBe(T.title))
  })

  it('closes with Escape (or the back button of Android)', async () => {
    await openSheet()

    const layer = hostsOf(screen.root as unknown as Host)
      .filter((node) => typeof node.props.onRequestClose === 'function')
      .filter((node) => textOf(node).includes(T.title))
      .at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
    if (!layer) throw new Error('no layer around the sheet')
    await act(() => layer.props.onRequestClose())

    expect(onClose).toHaveBeenCalled()
  })

  it('comes back to the project after signing in', async () => {
    await openSheet()

    await fireEvent.press(action(T.signIn) as never)

    const target = pushed().find((p) => p.startsWith('/sign-in'))
    expect(target).toBeDefined()
    expect(new URLSearchParams(target?.slice(target.indexOf('?'))).get('next')).toBe(path)
  })

  it('leads to the sign-up page from « Créer un compte », and does nothing else', async () => {
    await openSheet()

    await fireEvent.press(action(T.signUp) as never)

    expect(pushed().some((p) => p.startsWith('/sign-up'))).toBe(true)
    expect(pushed().some((p) => p.startsWith('/sign-in'))).toBe(false)
  })
})
