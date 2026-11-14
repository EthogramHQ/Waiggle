// Tests du branchement de la feuille du pseudo provisoire dans le cadre de l'appli (R9) : elle
// s'ouvre sur la page d'un onglet, attend sur une feuille à adresse (« Signaler ») ou une page
// poussée, et attend aussi qu'une feuille ouverte dans la page (la pile des couches, web) se ferme.
import type { Me } from '@ruche/contracts'
import { act, screen, waitFor } from '@testing-library/react-native'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { openModalLayer } from '../ui/modalLayers'
import { getMe } from './api'
import { ProvisionalNameGate } from './ProvisionalNameGate'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
let mockPathname = '/'
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/** Léa, son pseudo retiré par la modération. */
const handleRemoved: Me = {
  ...leaMe,
  handle: 'membre_4f2a',
  provisional: { name: false, handle: true },
}
const title = fr.t(($) => $.profile.provisional.handleTitle)
const titleShown = () => screen.queryByRole('header', { name: title }) !== null

beforeEach(() => {
  mockPathname = '/'
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(handleRemoved)
})

describe('ProvisionalNameGate (R9)', () => {
  it('opens the sheet on the page of a tab', async () => {
    await renderWithProviders(<ProvisionalNameGate />)

    expect(await screen.findByRole('header', { name: title })).toBeTruthy()
  })

  it('waits on a sheet with its own address, and opens back on a tab', async () => {
    mockPathname = '/report'
    const { rerender } = await renderWithProviders(<ProvisionalNameGate />)
    // Le profil est arrivé (témoin : la lecture a eu lieu), la feuille attend.
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    expect(titleShown()).toBe(false)

    mockPathname = '/'
    await rerender(<ProvisionalNameGate />)

    expect(await screen.findByRole('header', { name: title })).toBeTruthy()
  })

  it('waits while another sheet is open in the page, and opens once it is closed', async () => {
    const closeOther = openModalLayer('share', () => false)
    await renderWithProviders(<ProvisionalNameGate />)
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    expect(titleShown()).toBe(false)

    await act(async () => closeOther())

    expect(await screen.findByRole('header', { name: title })).toBeTruthy()
  })
})
