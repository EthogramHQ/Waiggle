// Tests de la feuille « Décorer mon rayon » (R19, planche R19-Miel, option b11), ouverte depuis
// « Mon miel » de « Ma récolte » : l'aperçu, une teinte et un motif (`DecorationPicker`), « Ton
// miel : N », et un bouton qui suit le choix (« Décorer pour 25 miel », ou « Décorer » pour ce qui
// est déjà à soi). Relecture d'interface du plan (UI-2) : l'achat part une fois sur deux tapes, la
// feuille refuse de se fermer pendant l'achat (`Sheet busy`), et un 409 `honey_short` s'explique
// dans la feuille. On l'ouvre comme le membre, depuis la page : la feuille n'a pas d'adresse.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { leaHarvest } from '../testing/harvest'
import { containing } from '../testing/text'
import {
  balanceText,
  buyText,
  deferred,
  mockServer,
  pressEscape,
  renderHarvest,
  resetHarvestMocks,
  sentTo,
  startingWith,
  T,
} from './Harvest.testkit'
import { HarvestScreen } from './HarvestScreen'

const kit = () => require('./Harvest.testkit') as typeof import('./Harvest.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => Promise.resolve(null)) }))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHarvestMocks()
})

const DECORATION = '/v1/me/game/decoration'

/** Léa (35 miel, l'Ambre déjà à elle) ouvre la feuille depuis « Mon miel ». */
const openSheet = async () => {
  await renderHarvest(<HarvestScreen />)
  await fireEvent.press(await screen.findByRole('button', { name: startingWith(T.decorate) }))
  await screen.findByRole('header', { name: T.decorationTitle })
}

const option = (name: string, checked?: boolean) =>
  screen.getByRole('radio', {
    name: startingWith(name),
    ...(checked === undefined ? null : { checked }),
  })

const sheetIsOpen = () => screen.queryByRole('header', { name: T.decorationTitle }) !== null

/** Choisit la teinte Pollen (10 miel) et le motif Gaufré (15 miel), ni l'une ni l'autre à Léa. */
const chooseNewOnes = async () => {
  await fireEvent.press(option('Pollen'))
  await fireEvent.press(option('Gaufré'))
}

describe('DecorateSheet', () => {
  it('opens from « Mon miel » with the balance and the current decoration checked', async () => {
    await openSheet()

    expect(screen.getByText(balanceText(35))).toBeTruthy()
    expect(option('Miel', true)).toBeTruthy()
    expect(option('Lisse', true)).toBeTruthy()
    expect(option('Ambre', false)).toBeTruthy()
  })

  it('names its button after the price of the choice', async () => {
    await openSheet()

    await chooseNewOnes()

    expect(screen.getByRole('button', { name: buyText(25) })).toBeTruthy()
  })

  it('decorates for free with what the member already owns', async () => {
    await openSheet()

    await fireEvent.press(option('Ambre'))
    await fireEvent.press(screen.getByRole('button', { name: T.apply }))

    await waitFor(() =>
      expect(sentTo('PUT', DECORATION).map((one) => one.body)).toEqual([
        { tint: 'amber', pattern: 'smooth' },
      ]),
    )
  })

  it('buys the decoration, closes, and says the comb is decorated', async () => {
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    await waitFor(() => expect(sheetIsOpen()).toBe(false))
    expect(sentTo('PUT', DECORATION).map((one) => one.body)).toEqual([
      { tint: 'pollen', pattern: 'waffle' },
    ])
    expect(await screen.findByText(containing(T.decorated))).toBeTruthy()
    // La récolte est relue : le solde de « Mon miel » suit l'achat (35 − 25).
    await waitFor(() => expect(sentTo('GET', '/v1/me/harvest').length).toBeGreaterThan(1))
  })

  it('buys once on a double tap', async () => {
    const answer = deferred<{ ok: true; data: null }>()
    mockServer.answer('PUT', DECORATION, () => answer.promise)
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    expect(sentTo('PUT', DECORATION)).toHaveLength(1)
    await act(async () => answer.resolve({ ok: true, data: null }))
  })

  it('refuses Escape and « Fermer » while the purchase is sent', async () => {
    const answer = deferred<{ ok: true; data: null }>()
    mockServer.answer('PUT', DECORATION, () => answer.promise)
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))
    await pressEscape(T.decorationTitle)
    await fireEvent.press(screen.getByRole('button', { name: T.sheetClose }))

    expect(sheetIsOpen()).toBe(true)
    await act(async () => answer.resolve({ ok: true, data: null }))
  })

  it('closes with « Fermer » when nothing is being bought', async () => {
    await openSheet()

    await fireEvent.press(screen.getByRole('button', { name: T.sheetClose }))

    await waitFor(() => expect(sheetIsOpen()).toBe(false))
    expect(sentTo('PUT', DECORATION)).toHaveLength(0)
  })

  // Option b9 : le solde court s'explique dans la feuille, sans rouge ni reproche ; rien n'est débité.
  it('explains in the sheet how honey is earned when it is short, and stays open', async () => {
    mockServer.answer('PUT', DECORATION, () => ({ ok: false, error: 'honeyShort' as never }))
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    expect(await screen.findByText(containing(T.shortHow))).toBeTruthy()
    expect(sheetIsOpen()).toBe(true)
    expect(screen.queryByText(containing(T.decorated))).toBeNull()
  })

  it('says the decoration could not be saved, and stays open', async () => {
    mockServer.answer('PUT', DECORATION, () => ({ ok: false, error: 'internal' }))
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    expect(await screen.findByText(containing(T.decorationError))).toBeTruthy()
    expect(sheetIsOpen()).toBe(true)
  })

  it('reads the balance of the harvest, not a number of its own', async () => {
    mockServer.harvest = { ...leaHarvest, honey: 12 }
    await openSheet()

    expect(screen.getByText(balanceText(12))).toBeTruthy()
  })
})
