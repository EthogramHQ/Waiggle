// Tests de l'écran « Accepter » (tranche R11, « La conformité ») : un membre inscrit avant R11, ou
// qui n'a pas accepté la nouvelle version des règles, le trouve avant toute autre page. Il y lit
// « Les règles de Waiggle », « Ce qui change » si la version a changé, « En bref » (les mêmes puces
// que /rules), un lien vers le texte complet, les deux cases et « Continuer », qui dit ce qui manque.
// Trois sorties restent : « Télécharger mes données » (sur place), « Supprimer mon compte », « Me
// déconnecter ». Un membre suspendu y relit l'essentiel de sa suspension (relecture juridique, J2).
//
// L'API attendue (plan de R11, « API des modules partagés ») :
// - `AcceptRulesScreen` reçoit le membre lu par la garde : `{ me: Me }` (il en lit `rulesChanges`
//   et `suspension`) ; le faux `getMe` rend le même membre, pour un écran qui le relirait lui-même ;
// - `rules/api.ts` : `useAcceptRules(): { accept: () => Promise<void>; busy: boolean }`, remplacé
//   ici par un faux ; un refus rejette la promesse.
import { contactEmail } from '@ruche/brand'
import type { Me } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { downloadMyData, signOut } from '../accounts/api'
import { legalDocument } from '../legal/documents'
import { getMe } from '../profile/api'
import { useAcceptRules } from '../rules/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { withParisEnd } from '../testing/moderation'
import { pathOf, visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { AcceptRulesScreen } from './AcceptRulesScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  downloadMyData: jest.fn(),
  signOut: jest.fn(),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../rules/api', () => ({ useAcceptRules: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

/** Inès, inscrite avant R11 : elle n'a encore accepté aucune version. */
const ines: Me = { ...leaMe, id: 'u7', name: 'Inès', handle: 'ines', rulesAccepted: false }

const accept = jest.fn<Promise<void>, []>()

const title = fr.t(($) => $.legal.pages.rules.title)
const summaryTitle = fr.t(($) => $.legal.summaryTitle)
const rulesBox = fr.t(($) => $.rules.accept)
const ageBox = fr.t(($) => $.rules.age)
const continueLabel = fr.t(($) => $.rules.continue)
const missing = {
  rules: fr.t(($) => $.rules.missing.rules),
  age: fr.t(($) => $.rules.missing.age),
  both: fr.t(($) => $.rules.missing.both),
}
const exportLabel = fr.t(($) => $.account.export.button)
const deleteLabel = fr.t(($) => $.account.delete.title)
const signOutLabel = fr.t(($) => $.account.signOut)

/** Un lien, ou, faute de mieux, un bouton (charte : `queryByRole('link') ?? getByRole('button')`). */
const linkNamed = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })
const press = (name: string) => fireEvent.press(linkNamed(name))
const paths = () => visited(mockPush, mockReplace, mockNavigate).map(pathOf)

const show = async (me: Me = ines) => {
  jest.mocked(getMe).mockResolvedValue(me)
  const view = await renderWithProviders(<AcceptRulesScreen me={me} />)
  await screen.findByRole('header', { name: title })
  return view
}

beforeEach(() => {
  mockPush.mockReset()
  mockReplace.mockReset()
  mockNavigate.mockReset()
  accept.mockReset().mockResolvedValue(undefined)
  jest.mocked(useAcceptRules).mockReturnValue({ accept, busy: false })
  jest.mocked(downloadMyData).mockReset().mockResolvedValue({ ok: true })
  jest.mocked(signOut).mockReset().mockResolvedValue({ ok: true })
  mockSession({ user: { id: ines.id, name: ines.name } })
})

describe('AcceptRulesScreen (R11)', () => {
  it('shows the rules title, En bref, a link to the full text, the two boxes and Continuer', async () => {
    await show()

    expect(screen.getByRole('header', { name: summaryTitle })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: rulesBox, checked: false })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: ageBox, checked: false })).toBeTruthy()
    expect(screen.getByRole('button', { name: continueLabel })).toBeTruthy()

    await press(fr.t(($) => $.rules.readFull))
    expect(paths()).toEqual(['/rules'])
  })

  it('the rules screen shows the same summary as /rules', async () => {
    await show()

    const points = legalDocument('rules', fr.t).summary
    // Témoin : les règles ont bien un « En bref ».
    expect(points.length).toBeGreaterThan(0)
    for (const point of points) expect(screen.getByText(point.text)).toBeTruthy()
  })

  it('says what is missing until both boxes are checked, and sends nothing', async () => {
    await show()

    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))
    expect(screen.getByText(missing.both)).toBeTruthy()

    await fireEvent.press(screen.getByRole('checkbox', { name: rulesBox }))
    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))
    expect(screen.getByText(missing.age)).toBeTruthy()
    expect(screen.queryByText(missing.both)).toBeNull()

    await fireEvent.press(screen.getByRole('checkbox', { name: rulesBox }))
    await fireEvent.press(screen.getByRole('checkbox', { name: ageBox }))
    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))
    expect(screen.getByText(missing.rules)).toBeTruthy()

    expect(accept).not.toHaveBeenCalled()
    // « Continuer » reste actif : il dit ce qui manque au lieu de se taire.
    expect(screen.getByRole('button', { name: continueLabel })).not.toBeDisabled()
  })

  it('accepts the current rules once both boxes are checked', async () => {
    await show()

    await fireEvent.press(screen.getByRole('checkbox', { name: rulesBox }))
    await fireEvent.press(screen.getByRole('checkbox', { name: ageBox }))
    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))

    expect(accept).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(missing.both)).toBeNull()
  })

  it('sends one request on a double tap on Continuer', async () => {
    // La réponse attend : sans garde, le second toucher partirait avant la fin du premier.
    let finish: () => void = () => {}
    accept.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    await show()
    await fireEvent.press(screen.getByRole('checkbox', { name: rulesBox }))
    await fireEvent.press(screen.getByRole('checkbox', { name: ageBox }))

    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))
    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))

    expect(accept).toHaveBeenCalledTimes(1)
    await act(async () => finish())
  })

  it('says the acceptance could not be saved, and stays', async () => {
    accept.mockRejectedValue(new Error('rules'))
    await show()
    await fireEvent.press(screen.getByRole('checkbox', { name: rulesBox }))
    await fireEvent.press(screen.getByRole('checkbox', { name: ageBox }))

    await fireEvent.press(screen.getByRole('button', { name: continueLabel }))

    expect(await screen.findByText(fr.t(($) => $.rules.error))).toBeTruthy()
    expect(screen.getByRole('header', { name: title })).toBeTruthy()
  })

  it('shows Ce qui change above En bref only when the version changed', async () => {
    const first = await show()
    // Témoin : « En bref » est là ; « Ce qui change » non (aucune version acceptée avant).
    expect(screen.getByRole('header', { name: summaryTitle })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.rules.changesTitle))).toBeNull()
    // Avec RNTL 14, démonter est asynchrone : sans `await`, le rendu suivant chevauche son `act`.
    await first.unmount()

    await show({ ...ines, rulesChanges: ['hivesClarified'] })

    expect(screen.getByText(fr.t(($) => $.rules.changesTitle))).toBeTruthy()
  })

  it('downloads the data from the rules screen without leaving it', async () => {
    await show()

    await press(exportLabel)

    expect(downloadMyData).toHaveBeenCalledTimes(1)
    expect(paths()).toEqual([])
    expect(await screen.findByText(fr.t(($) => $.account.export.done))).toBeTruthy()
  })

  it('opens the account deletion from the rules screen', async () => {
    await show()

    await press(deleteLabel)

    expect(paths()).toEqual(['/settings/account/delete'])
  })

  it('signs out from the rules screen', async () => {
    await show()

    await press(signOutLabel)

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('says why signing out failed and stays', async () => {
    jest.mocked(signOut).mockResolvedValue({ ok: false, error: 'generic' })
    await show()

    await press(signOutLabel)

    expect(await screen.findByText(fr.t(($) => $.account.signOutError))).toBeTruthy()
    expect(screen.getByRole('header', { name: title })).toBeTruthy()
    expect(paths()).toEqual([])
  })

  // Relecture juridique du plan, J2 : l'écran couvre le bandeau de la suspension ; il en redit
  // l'essentiel (la mesure, sa fin, le recours) et ne laisse pas croire qu'accepter rend l'écriture.
  it('reminds a suspended member of the suspension, its end and the recourse, and that accepting does not lift it', async () => {
    await show({ ...suspendedMe, rulesAccepted: false })

    expect(
      screen.getAllByText(
        withParisEnd(fr.t(($) => $.suspension.headline, { date: 'DATE', time: 'TIME' })),
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(contactEmail)).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(containing(fr.t(($) => $.suspension.contestCourt))).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(fr.t(($) => $.rules.suspended))).toBeTruthy()
  })

  it('says nothing of a suspension to a member who is not suspended', async () => {
    await show()

    // Témoin : l'écran est là.
    expect(screen.getByRole('button', { name: continueLabel })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.rules.suspended))).toBeNull()
    expect(screen.queryByText(containing(fr.t(($) => $.suspension.title)))).toBeNull()
  })
})
