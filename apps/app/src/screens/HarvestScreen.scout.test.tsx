// Tests de « Ma récolte » côté Éclaireuses (R20, docs/scenarios/refonte.md) : la rangée « Missions
// de la semaine » sous le niveau, pour une Éclaireuse active seulement, vers `/scout/missions`.
// Pas de cinquième famille « Retours à Waiggle » (écartée au plan). Le faux serveur et les
// textes : `Harvest.testkit.tsx`.
import type { Me } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { leaHarvest } from '../testing/harvest'
import { fr } from '../testing/text'
import { destinationOf, mockServer, renderHarvest, resetHarvestMocks, T } from './Harvest.testkit'
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
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

const scout = (patch: Partial<NonNullable<Me['scout']>>): Me['scout'] => ({
  active: true,
  joinedAt: '2026-11-20T08:00:00.000Z',
  removedAt: null,
  showDrop: true,
  programEndsAt: null,
  missionsLeft: 2,
  ...patch,
})

const openWith = async (me: Partial<Me>) => {
  jest.mocked(getMe).mockResolvedValue({ id: 'u1', ...me } as Me)
  mockServer.harvest = leaHarvest
  await renderHarvest(<HarvestScreen />)
  await screen.findByRole('header', { name: T.weekTitle })
}

const rowName = fr.t(($) => $.scout.missions.title)

beforeEach(() => {
  resetHarvestMocks()
})

describe('HarvestScreen, the scouts row', () => {
  it('shows « Missions de la semaine » with what is left to an active scout, leading to the page', async () => {
    await openWith({ scout: scout({ missionsLeft: 2 }) })

    const row = await screen.findByRole('link', { name: new RegExp(rowName) })
    expect(row).toHaveTextContent(new RegExp(fr.t(($) => $.scout.missions.left, { count: 2 })))
    expect(await destinationOf(new RegExp(rowName))).toBe('/scout/missions')
  })

  it('shows nothing to a member who was never a scout', async () => {
    await openWith({ scout: null })

    expect(screen.queryByRole('link', { name: new RegExp(rowName) })).toBeNull()
  })

  it('shows nothing to a scout who was removed', async () => {
    await openWith({ scout: scout({ active: false, removedAt: '2026-11-24T08:00:00.000Z' }) })

    expect(screen.queryByRole('link', { name: new RegExp(rowName) })).toBeNull()
  })
})
