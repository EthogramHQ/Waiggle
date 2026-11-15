// Tests du réglage « Découvertes » dans la rubrique « Notifications » des réglages (tranche R11,
// planche R11-Decouvertes, option 8 des planches). Scénario : docs/scenarios/refonte.md, « R11 — La
// conformité », « Le récap : couper les découvertes » : une ligne « Découvertes » (les nouveaux
// projets de ses proches, « Ils cherchent des testeurs »), « Dans le récap » ou « Jamais », « Dans le
// récap » par défaut ; « Jamais » retire ces deux parties du récap, qui garde les autres.
//
// Ce que ces tests supposent de l'écran (plan de R11, UI-G) : `EmailSettings` montre, dans le
// groupe « Par e-mail », après les sept types et avant l'interrupteur du récap, une ligne de choix
// (`ChoiceRow`) nommée comme les autres (`notificationSettings.rowName`), sans phrase d'aide ; un
// choix part seul (PATCH /v1/me/email-preferences `{ discoveries }`), comme les autres types.
//
// Le client réseau est remplacé par un faux serveur qui garde les réglages de Léa.
import type { EmailPreferences } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../../api/client'
import type { ApiResult } from '../../api/errors'
import { leaEmailPreferences } from '../../testing/email'
import { renderWithProviders } from '../../testing/render'
import { containing, fr } from '../../testing/text'
import { EmailSettings } from './EmailSettings'

jest.mock('../../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/notifications',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

const T = {
  discoveries: fr.t(($) => $.notificationSettings.types.discoveries),
  hives: fr.t(($) => $.notificationSettings.types.hives),
  recap: fr.t(($) => $.notificationSettings.recap),
  recapOff: fr.t(($) => $.notificationSettings.recapOff),
  saveError: fr.t(($) => $.notificationSettings.saveError),
  digest: fr.t(($) => $.notificationSettings.choices.digest),
  never: fr.t(($) => $.notificationSettings.choices.never),
  now: fr.t(($) => $.notificationSettings.choices.now),
  // La phrase de la page de désinscription, qui dit ce que sont les découvertes : hors de l'appli
  // seulement (option 8 des planches).
  outsideHint: fr.t(($) => $.unsubscribe.discoveriesHint),
}
const rowName = (choice: string) =>
  fr.t(($) => $.notificationSettings.rowName, { label: T.discoveries, choice })
const discoveriesRow = () => screen.getByRole('button', { name: new RegExp(`^${T.discoveries}, `) })

// --- Le faux serveur -----------------------------------------------------------------------------

const emailPath = '/v1/me/email-preferences'
let stored: EmailPreferences
let nextPatch: (() => Promise<ApiResult<EmailPreferences>>) | null
const fakeRequest = async (to: string, init: RequestInit = {}) => {
  if (to !== emailPath) return { ok: false, error: 'notFound' } as const
  if (init.method === 'PATCH') {
    if (nextPatch) return nextPatch()
    stored = { ...stored, ...JSON.parse(String(init.body)) }
    return { ok: true, data: stored } as const
  }
  return { ok: true, data: stored } as const
}
const patches = () =>
  jest
    .mocked(request)
    .mock.calls.filter(([to, init]) => to === emailPath && init.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init.body)) as unknown)

type TreeNode = { children: (TreeNode | string)[] }
const readingOrder = (...elements: unknown[]) => {
  const all: unknown[] = []
  const walk = (node: TreeNode) => {
    all.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => all.indexOf(element))
}

beforeEach(() => {
  // Les réglages par défaut : « Découvertes » vaut « Dans le récap » (choix 8 du scénario).
  stored = { ...leaEmailPreferences }
  nextPatch = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(fakeRequest as typeof request)
})

const openSettings = async () => {
  await renderWithProviders(<EmailSettings />)
  return screen.findByRole('switch', { name: T.recap })
}

describe('EmailSettings, « Découvertes » (R11)', () => {
  it('shows « Découvertes » set to « Dans le récap » by default, after the types and before the recap switch', async () => {
    const recapSwitch = await openSettings()

    const row = screen.getByRole('button', { name: rowName(T.digest), expanded: false })
    const hivesRow = screen.getByRole('button', { name: new RegExp(`^${T.hives}, `) })
    const [hives, discoveries, recap] = readingOrder(hivesRow, row, recapSwitch)
    expect(hives).toBeGreaterThanOrEqual(0)
    expect(discoveries).toBeGreaterThan(hives as number)
    expect(recap).toBeGreaterThan(discoveries as number)
  })

  it('offers only « Dans le récap » and « Jamais », without a sentence of help', async () => {
    await openSettings()

    await fireEvent.press(discoveriesRow())

    expect(discoveriesRow()).toBeExpanded()
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
      T.digest,
      T.never,
    ])
    expect(screen.queryByRole('radio', { name: T.now })).toBeNull()
    // Option 8 des planches : aucune phrase d'aide dans l'appli.
    expect(screen.queryByText(containing(T.outsideHint))).toBeNull()
  })

  it('saves « Jamais » as soon as it is touched, one field only', async () => {
    await openSettings()

    await fireEvent.press(discoveriesRow())
    await fireEvent.press(screen.getByRole('radio', { name: T.never }))

    expect(screen.getByRole('button', { name: rowName(T.never) })).toBeExpanded()
    await waitFor(() => expect(patches()).toEqual([{ discoveries: 'never' }]))
  })

  it('shows « Jamais » when the member chose it', async () => {
    stored = { ...leaEmailPreferences, discoveries: 'never' }
    await openSettings()

    expect(screen.getByRole('button', { name: rowName(T.never) })).toBeTruthy()
  })

  it('says nothing leaves under « Découvertes » when the recap is off', async () => {
    stored = { ...leaEmailPreferences, weeklyRecap: false }
    await openSettings()

    // Les découvertes partent dans le récap : coupé, elles ne partent plus, et la ligne le dit
    // comme les types « Dans le récap ». Leur choix ne change pas.
    const row = screen.getByRole('button', { name: containing(rowName(T.digest)) })
    const notes = screen.getAllByText(T.recapOff)
    const [rowPlace, recapPlace] = readingOrder(
      row,
      await screen.findByRole('switch', { name: T.recap }),
    )
    expect(
      notes.some((note) => {
        const [place] = readingOrder(note)
        return (
          (place as number) > (rowPlace as number) && (place as number) < (recapPlace as number)
        )
      }),
    ).toBe(true)
  })

  it('puts « Dans le récap » back, and says so, when « Jamais » could not be saved', async () => {
    nextPatch = async () => ({ ok: false, error: 'network' })
    await openSettings()

    await fireEvent.press(discoveriesRow())
    await fireEvent.press(screen.getByRole('radio', { name: T.never }))

    expect(await screen.findByRole('alert')).toHaveTextContent(containing(T.saveError))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: rowName(T.digest) })).toBeTruthy(),
    )
  })
})
