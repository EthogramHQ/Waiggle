// Tests du réglage « Ne pas me proposer aux autres » dans la rubrique « Mes données » des réglages
// (R10, docs/scenarios/refonte.md, « Ne pas me proposer aux autres », planche R10-Membres ; choix 7
// du plan : l'interrupteur est aussi dans l'onglet Membres d'une ruche, testé dans HiveScreen.test).
// Le réglage vaut pour toutes ses ruches : il est rangé avec les autres choix sur ce que les autres
// voient, sous le sous-titre « Ce que les autres voient ».
//
// Ce que ces tests supposent de l'écran (plan R10, UI-E2b ; « API au contrat », `hives/api.ts`) :
// - `SettingsSection section="data"` montre, en plus de « Télécharger mes données », un
//   interrupteur (`switch`) nommé « Ne pas me proposer aux autres », avec la ligne qui l'explique ;
// - son état vient du profil (GET /v1/me, `hideFromSuggestions`) ; le toucher le change tout de
//   suite et envoie PATCH /v1/me `{ hideFromSuggestions }` (`useSetHideFromSuggestions`) ; un refus
//   remet l'état d'avant et le dit (`hives.hideFromSuggestionsError`).
//
// Le client réseau est remplacé par un faux serveur qui garde le profil de Léa.
import type { Me } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../../api/client'
import type { ApiResult } from '../../api/errors'
import { leaMe } from '../../testing/fixtures'
import { mockSession, renderWithProviders } from '../../testing/render'
import { containing, fr } from '../../testing/text'
import { SettingsSection } from './sections'

jest.mock('../../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../../accounts/api', () => ({
  useSession: jest.fn(),
  downloadMyData: jest.fn(),
  signOut: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/data',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const TEXT = {
  othersSee: fr.t(($) => $.account.data.othersSee),
  hide: fr.t(($) => $.hives.hideFromSuggestions),
  hint: fr.t(($) => $.hives.hideFromSuggestionsHint),
  error: fr.t(($) => $.hives.hideFromSuggestionsError),
  exportRow: fr.t(($) => $.account.export.button),
}

// --- Le faux serveur ---

let storedMe: Me
let nextPatch: (() => Promise<ApiResult<Me>>) | null
const fakeRequest = async (to: string, init: RequestInit = {}) => {
  if (to !== '/v1/me') return { ok: false, error: 'notFound' } as const
  if (init.method === 'PATCH') {
    if (nextPatch) return nextPatch()
    storedMe = { ...storedMe, ...JSON.parse(String(init.body)) }
    return { ok: true, data: storedMe } as const
  }
  return { ok: true, data: storedMe } as const
}
/** Les corps des PATCH /v1/me, dans l'ordre. */
const mePatches = () =>
  jest
    .mocked(request)
    .mock.calls.filter(([to, init]) => to === '/v1/me' && init.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init.body)) as unknown)

beforeEach(() => {
  storedMe = { ...leaMe, hideFromSuggestions: false }
  nextPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
})

const renderData = () =>
  renderWithProviders(<SettingsSection section="data" email="lea@example.com" />)
const hideSwitch = () => screen.findByRole('switch', { name: TEXT.hide })

describe('« Ne pas me proposer aux autres » in Mes données (R10)', () => {
  it('offers the switch under « Ce que les autres voient », off, with what it changes', async () => {
    await renderData()

    expect(await hideSwitch()).not.toBeChecked()
    expect(screen.getByText(containing(TEXT.othersSee))).toBeTruthy()
    expect(screen.getAllByText(containing(TEXT.hint)).length).toBeGreaterThan(0)
    // Témoin : l'export de ses données est toujours là.
    expect(screen.getByRole('button', { name: containing(TEXT.exportRow) })).toBeTruthy()
  })

  it('shows the switch on for a member who chose it', async () => {
    storedMe = { ...storedMe, hideFromSuggestions: true }
    await renderData()

    await waitFor(async () => expect(await hideSwitch()).toBeChecked())
  })

  it('turns it on at once and saves it on the account, that field only', async () => {
    await renderData()

    await fireEvent.press(await hideSwitch())

    expect(await hideSwitch()).toBeChecked()
    await waitFor(() => expect(mePatches()).toEqual([{ hideFromSuggestions: true }]))
  })

  it('puts the switch back and says so when the choice could not be saved', async () => {
    nextPatch = async () => ({ ok: false, error: 'internal' })
    await renderData()

    await fireEvent.press(await hideSwitch())

    expect(await screen.findByText(containing(TEXT.error))).toBeTruthy()
    await waitFor(async () => expect(await hideSwitch()).not.toBeChecked())
  })
})
