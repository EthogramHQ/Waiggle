// Tests de « Couper les découvertes » sur la page de désinscription du récap (tranche R11, planche
// R11-Decouvertes, option 8 des planches). Scénario : docs/scenarios/refonte.md, « R11 — La
// conformité », « Le récap : couper les découvertes » : la page de désinscription du récap propose
// aussi « Couper les découvertes ».
//
// Ce que ces tests supposent de la page (plan de R11, UI-G ; rapport des planches, point 6) : sur un
// lien du récap, deux choix (des boutons radio, comme le lien « tout de suite » de R8) : « Couper tout
// le récap », coché d'avance, et « Couper les découvertes », avec la phrase qui dit ce qu'elles sont
// (la page s'ouvre hors de l'appli). Toucher un choix n'envoie rien ; « Confirmer » envoie le jeton
// seul pour tout le récap (comme avant R11), ou `unsubscribe(token, 'discoveries')`. Les liens des
// autres e-mails ne changent pas.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { unsubscribe } from '../email/api'
import { instantToken, mentionsToken, recapToken } from '../testing/email'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useHydrated } from '../ui/theme/hydration'
import { UnsubscribeScreen } from './UnsubscribeScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../email/api', () => ({ unsubscribe: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/unsubscribe',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: jest.fn(),
}))

const T = {
  confirm: fr.t(($) => $.unsubscribe.confirm),
  recapAll: fr.t(($) => $.unsubscribe.recapAll),
  discoveries: fr.t(($) => $.unsubscribe.recapDiscoveries),
  hint: fr.t(($) => $.unsubscribe.discoveriesHint),
  doneDiscoveries: fr.t(($) => $.unsubscribe.doneDiscoveries),
  doneRecap: fr.t(($) => $.unsubscribe.doneRecap),
}
/** Un bouton radio dont le nom commence par ce libellé (son aide peut le suivre dans le nom lu). */
const choice = (label: string, checked?: boolean) =>
  screen.getByRole('radio', {
    name: new RegExp(`^${containing(label).source}`),
    ...(checked === undefined ? null : { checked }),
  })

const open = (token: string) => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ token })
  return renderWithProviders(<UnsubscribeScreen />)
}
const confirm = () => fireEvent.press(screen.getByRole('button', { name: T.confirm }))

beforeEach(() => {
  mockSession(null)
  jest.mocked(useHydrated).mockReset().mockReturnValue(true)
  jest.mocked(unsubscribe).mockReset().mockResolvedValue({ ok: true, data: null })
})
afterEach(() => {
  jest.restoreAllMocks()
})

describe('UnsubscribeScreen, « Couper les découvertes » (R11)', () => {
  it('offers two choices on a recap link, « Couper tout le récap » checked first, and sends nothing', async () => {
    await open(recapToken)

    expect(choice(T.recapAll, true)).toBeTruthy()
    expect(choice(T.discoveries, false)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    // Hors de l'appli, la page dit ce que sont les découvertes.
    expect(screen.getAllByText(containing(T.hint)).length).toBeGreaterThan(0)
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('checks « Couper les découvertes » when touched, still sending nothing', async () => {
    await open(recapToken)

    await fireEvent.press(choice(T.discoveries))

    expect(choice(T.discoveries, true)).toBeTruthy()
    expect(choice(T.recapAll, false)).toBeTruthy()
    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('turns off only the discoveries once « Confirmer » is touched, and says the recap keeps the rest', async () => {
    await open(recapToken)

    await fireEvent.press(choice(T.discoveries))
    await confirm()

    expect(jest.mocked(unsubscribe).mock.calls).toEqual([[recapToken, 'discoveries']])
    expect(await screen.findByText(containing(T.doneDiscoveries))).toBeTruthy()
    expect(screen.queryByText(T.doneRecap)).toBeNull()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('still turns off the whole recap with the token alone when « Couper tout le récap » stays checked', async () => {
    await open(recapToken)

    // Le membre hésite, puis revient au choix d'avance.
    await fireEvent.press(choice(T.discoveries))
    await fireEvent.press(choice(T.recapAll))
    await confirm()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(jest.mocked(unsubscribe).mock.calls[0]?.[0]).toBe(recapToken)
    expect(jest.mocked(unsubscribe).mock.calls[0]?.[1]).toBeUndefined()
    expect(await screen.findByText(T.doneRecap)).toBeTruthy()
  })

  it('sends a single request when « Confirmer » is touched twice with the discoveries checked', async () => {
    let answer: (value: { ok: true; data: null }) => void = () => {}
    jest.mocked(unsubscribe).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    await open(recapToken)

    await fireEvent.press(choice(T.discoveries))
    await confirm()
    await confirm()
    await act(async () => answer({ ok: true, data: null }))

    expect(jest.mocked(unsubscribe).mock.calls).toEqual([[recapToken, 'discoveries']])
  })

  // Témoin : le lien du récap les propose (premier test). Les autres liens n'en parlent pas.
  it.each([
    ['mentions', mentionsToken],
    ['instant', instantToken],
  ])('offers no discoveries on the link of a %s e-mail', async (_kind, token) => {
    await open(token)

    expect(screen.getByRole('button', { name: T.confirm })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: containing(T.discoveries) })).toBeNull()
    expect(screen.queryByText(containing(T.hint))).toBeNull()
  })
})
