// « Mon profil » d'un membre suspendu dont le nom ou le pseudo est provisoire (R9, relecture
// juridique jur-B4) : l'API lui permet d'en choisir un autre, la page doit lui en donner le moyen.
// Le texte devient « … et remplacer ton nom ou ton pseudo provisoire », et un bouton ouvre la
// feuille du pseudo (ou du nom) provisoire. Un suspendu ordinaire ne voit ni l'un ni l'autre.
import type { Me } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { getMe } from '../profile/api'
import { suspendedMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProfileScreen } from './ProfileScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/profile',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

const locked = fr.t(($) => $.suspension.profileLocked)
const lockedProvisional = fr.t(($) => $.suspension.profileLockedProvisional)
const chooseHandle = fr.t(($) => $.removal.part.chooseHandle)
const chooseName = fr.t(($) => $.removal.part.chooseName)

beforeEach(() => {
  jest
    .mocked(request)
    .mockReset()
    .mockResolvedValue({ ok: true, data: { tools: [], others: [] } } as never)
  mockSession({ user: { id: suspendedMe.id, name: suspendedMe.name } })
})

const renderLocked = async (me: Me) => {
  jest.mocked(getMe).mockResolvedValue(me)
  await renderWithProviders(<ProfileScreen />)
}

describe('« Mon profil » of a suspended member with a provisional handle or name', () => {
  it('offers to choose another handle, and says so', async () => {
    await renderLocked({ ...suspendedMe, provisional: { name: false, handle: true } })

    expect(await screen.findByText(containing(lockedProvisional))).toBeTruthy()
    expect(screen.queryByText(containing(locked))).toBeNull()
    expect(screen.getByRole('button', { name: chooseHandle })).toBeTruthy()
    expect(screen.queryByRole('button', { name: chooseName })).toBeNull()
  })

  it('offers to choose another name when only the name is provisional', async () => {
    await renderLocked({ ...suspendedMe, provisional: { name: true, handle: false } })

    expect(await screen.findByText(containing(lockedProvisional))).toBeTruthy()
    expect(screen.getByRole('button', { name: chooseName })).toBeTruthy()
    expect(screen.queryByRole('button', { name: chooseHandle })).toBeNull()
  })

  it('opens the sheet of the provisional handle', async () => {
    await renderLocked({ ...suspendedMe, provisional: { name: false, handle: true } })

    await fireEvent.press(await screen.findByRole('button', { name: chooseHandle }))

    expect(
      await screen.findByRole('header', { name: fr.t(($) => $.profile.provisional.handleTitle) }),
    ).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.profile.fields.handle))).toBeTruthy()
  })

  it('offers neither the button nor the longer text to an ordinary suspended member', async () => {
    await renderLocked({ ...suspendedMe, provisional: { name: false, handle: false } })

    expect(await screen.findByText(containing(locked))).toBeTruthy() // témoin
    expect(screen.queryByText(containing(lockedProvisional))).toBeNull()
    expect(screen.queryByRole('button', { name: chooseHandle })).toBeNull()
    expect(screen.queryByRole('button', { name: chooseName })).toBeNull()
  })
})
