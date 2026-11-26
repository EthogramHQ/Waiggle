// Tests du titre « Éclaireuse » dans « Mon titre » (R20) : l'épingle le propose à une Éclaireuse
// active, jamais à qui ne l'est pas (ou plus). Le faux serveur : `Harvest.testkit.tsx`.
import type { Me } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { getMe } from '../../profile/api'
import { leaHarvest } from '../../testing/harvest'
import { mockServer, renderHarvest, resetHarvestMocks } from '../Harvest.testkit'
import { TitleSettings } from './GameSettings'

const kit = () => require('../Harvest.testkit') as typeof import('../Harvest.testkit')

jest.mock('../../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('../../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('expo-router', () => kit().mockExpoRouter())

const openWith = async (scout: Me['scout']) => {
  jest.mocked(getMe).mockResolvedValue({ id: 'u1', scout } as Me)
  mockServer.harvest = leaHarvest
  await renderHarvest(<TitleSettings />)
}

const active: NonNullable<Me['scout']> = {
  active: true,
  joinedAt: '2026-11-20T08:00:00.000Z',
  removedAt: null,
  showDrop: true,
  programEndsAt: null,
  missionsLeft: 0,
}

beforeEach(() => {
  resetHarvestMocks()
})

describe('TitleSettings, the scout title', () => {
  it('offers « Éclaireuse » to an active scout', async () => {
    await openWith(active)

    expect(await screen.findByRole('radio', { name: 'Éclaireuse' })).toBeTruthy()
  })

  it('does not offer it to a member who is not a scout', async () => {
    await openWith(null)

    await screen.findByRole('radio', { name: 'Selon mes gestes' })
    expect(screen.queryByRole('radio', { name: 'Éclaireuse' })).toBeNull()
  })

  it('does not offer it to a removed scout', async () => {
    await openWith({ ...active, active: false, removedAt: '2026-11-24T08:00:00.000Z' })

    await screen.findByRole('radio', { name: 'Selon mes gestes' })
    expect(screen.queryByRole('radio', { name: 'Éclaireuse' })).toBeNull()
  })
})
