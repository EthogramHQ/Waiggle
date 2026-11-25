// Tests de la feuille « Décorer mon rayon » seule (R19, planche R19-Miel, option b11) : les mêmes
// règles que `DecorateSheet.test.tsx`, qui l'ouvre depuis « Ma récolte », mais sans la page. Une
// petite page d'accueil lit la récolte (le vrai hook, sur le faux serveur de `Harvest.testkit.tsx`)
// et ouvre la feuille ; la feuille reçoit la récolte en propriété, comme dans `HarvestScreen`.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useState } from 'react'
import { useHarvest } from '../gamification/api'
import { leaHarvest } from '../testing/harvest'
import { containing } from '../testing/text'
import { Button } from '../ui/Button'
import { DecorateSheet } from './DecorateSheet'
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

const kit = () => require('./Harvest.testkit') as typeof import('./Harvest.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHarvestMocks()
})

const DECORATION = '/v1/me/game/decoration'

/** La page d'accueil : la récolte lue, un bouton qui ouvre la feuille. */
function Host() {
  const harvest = useHarvest()
  const [open, setOpen] = useState(false)
  if (!harvest.data) return null
  return (
    <>
      <Button label={T.decorate} onPress={() => setOpen(true)} />
      <DecorateSheet open={open} harvest={harvest.data} onClose={() => setOpen(false)} />
    </>
  )
}

const openSheet = async () => {
  await renderHarvest(<Host />)
  await fireEvent.press(await screen.findByRole('button', { name: T.decorate }))
  await screen.findByRole('header', { name: T.decorationTitle })
}

const option = (name: string, checked?: boolean) =>
  screen.getByRole('radio', {
    name: startingWith(name),
    ...(checked === undefined ? null : { checked }),
  })

const sheetIsOpen = () => screen.queryByRole('header', { name: T.decorationTitle }) !== null

const chooseNewOnes = async () => {
  await fireEvent.press(option('Pollen'))
  await fireEvent.press(option('Gaufré'))
}

describe('DecorateSheet, alone', () => {
  it('shows the balance and the current decoration checked', async () => {
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

  it('does not offer to decorate with the decoration already on the comb', async () => {
    await openSheet()

    expect(screen.getByRole('button', { name: T.apply })).toBeDisabled()
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

  it('buys, closes, says the comb is decorated, and reads the harvest again', async () => {
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    await waitFor(() => expect(sheetIsOpen()).toBe(false))
    expect(sentTo('PUT', DECORATION).map((one) => one.body)).toEqual([
      { tint: 'pollen', pattern: 'waffle' },
    ])
    expect(await screen.findByText(containing(T.decorated))).toBeTruthy()
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

  it('explains how honey is earned when it is short, stays open, and forgets it on a new choice', async () => {
    mockServer.answer('PUT', DECORATION, () => ({ ok: false, error: 'honeyShort' as never }))
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    expect(await screen.findByText(containing(T.shortHow))).toBeTruthy()
    expect(sheetIsOpen()).toBe(true)
    expect(screen.queryByText(containing(T.decorated))).toBeNull()
    // Un autre choix : la phrase parlait du précédent, elle s'en va.
    await fireEvent.press(option('Ambre'))
    expect(screen.queryByText(containing(T.shortHow))).toBeNull()
  })

  it('says the decoration could not be saved, and stays open', async () => {
    mockServer.answer('PUT', DECORATION, () => ({ ok: false, error: 'internal' }))
    await openSheet()

    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: buyText(25) }))

    expect(await screen.findByText(containing(T.decorationError))).toBeTruthy()
    expect(sheetIsOpen()).toBe(true)
  })

  it('opens again on the decoration of the comb, not on the last choice', async () => {
    await openSheet()
    await chooseNewOnes()
    await fireEvent.press(screen.getByRole('button', { name: T.sheetClose }))
    await waitFor(() => expect(sheetIsOpen()).toBe(false))

    await fireEvent.press(screen.getByRole('button', { name: T.decorate }))
    await screen.findByRole('header', { name: T.decorationTitle })

    expect(option('Miel', true)).toBeTruthy()
    expect(option('Lisse', true)).toBeTruthy()
  })

  it('reads the balance of the harvest, not a number of its own', async () => {
    mockServer.harvest = { ...leaHarvest, honey: 12 }
    await openSheet()

    expect(screen.getByText(balanceText(12))).toBeTruthy()
  })
})
