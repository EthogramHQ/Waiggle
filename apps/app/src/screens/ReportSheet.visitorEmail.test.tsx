// Tests ajoutés au mode visiteur de la feuille « Signaler » (tranche R12) : une adresse e-mail mal
// formée se dit sous son champ avant tout envoi (le contrat `VisitorReport` la refuserait) ; une
// sorte qu'un visiteur ne peut pas signaler (un commentaire) garde « Me connecter », comme en R9.
// Le faux serveur, les données et le faux routeur : Public.testkit.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { decollageId, publicServer, resetPublic } from './Public.testkit'
import { ReportSheet } from './ReportSheet'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../blocks/api', () => ({ useBlock: () => ({ block: jest.fn() }) }))
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
  title: fr.t(($) => $.report.project),
  continue: fr.t(($) => $.report.continue),
  submit: fr.t(($) => $.report.submit),
  email: fr.t(($) => $.report.visitor.email),
  invalidEmail: fr.t(($) => $.auth.errors.invalidEmail),
  scam: fr.t(($) => $.report.reasons.scamSpam),
  sentTitle: fr.t(($) => $.report.sentTitle),
  signIn: fr.t(($) => $.home.signIn),
}

beforeEach(() => {
  resetPublic('/report', { kind: 'project', id: decollageId })
  mockSession(null)
})

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }))
const posted = () => publicServer.sent.filter(({ method }) => method === 'POST')

/** Jusqu'au motif « Arnaque ou spam », avec cette adresse dans son champ. */
const fillWith = async (email: string) => {
  await renderWithProviders(<ReportSheet kind="project" id={decollageId} />)
  await screen.findByRole('header', { name: T.title })
  await passTapGuard()
  await press(T.continue)
  await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${T.scam}`) }))
  await fireEvent.changeText(screen.getByLabelText(containing(T.email)), email)
  await passTapGuard()
}

describe('the e-mail address of a visitor (R12)', () => {
  it('says a malformed address under its field, and sends nothing', async () => {
    await fillWith('yanis.papa@')
    await press(T.submit)

    expect(await screen.findByText(containing(T.invalidEmail))).toBeTruthy()
    expect(posted()).toHaveLength(0)
  })

  it('sends once the address is corrected (witness)', async () => {
    await fillWith('yanis.papa@')
    await press(T.submit)
    await screen.findByText(containing(T.invalidEmail))

    await fireEvent.changeText(screen.getByLabelText(containing(T.email)), 'yanis.papa@exemple.fr')
    // L'erreur part dès qu'on corrige.
    expect(screen.queryByText(containing(T.invalidEmail))).toBeNull()
    await press(T.submit)

    expect(await screen.findByRole('header', { name: containing(T.sentTitle) })).toBeTruthy()
    expect(posted()).toHaveLength(1)
  })
})

describe('a kind a visitor cannot report (R12)', () => {
  it('asks to sign in on a comment, without asking the API', async () => {
    const commentId = 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d'
    resetPublic('/report', { kind: 'comment', id: commentId })
    await renderWithProviders(<ReportSheet kind="comment" id={commentId} />)

    const signIn =
      (await screen.findAllByRole('link', { name: T.signIn }).catch(() => null)) ??
      (await screen.findAllByRole('button', { name: T.signIn }))
    expect(signIn.length).toBeGreaterThan(0)
    expect(publicServer.sent).toHaveLength(0)
  })
})
