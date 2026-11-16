// Tests de « Partager » sur la page d'un membre qui a rendu sa page publique (tranche R12, plan
// R12, décision 11 ; scénario « Partager » : « une page publique se partage de même ») : la feuille
// dit « Tout le monde pourra l'ouvrir. », et le lien est l'adresse publique de la page dans la langue
// de qui partage (`/fr/members/<id>`). Une page fermée garde « Seuls les membres… » et l'adresse des
// membres (MemberScreen.test.tsx).
import { fireEvent, screen } from '@testing-library/react-native'
import { useBlock, useUnblock } from '../blocks/api'
import { webAppUrl } from '../config'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { copyText } from '../ui/clipboard'
import { MemberScreen } from './MemberScreen'

jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../blocks/api', () => ({ useBlock: jest.fn(), useUnblock: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
jest.mock('expo-router', () => ({
  usePathname: () => '/members/u1',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest
    .mocked(useBlock)
    .mockReturnValue({ block: jest.fn() } as unknown as ReturnType<typeof useBlock>)
  jest
    .mocked(useUnblock)
    .mockReturnValue({ unblock: jest.fn() } as unknown as ReturnType<typeof useUnblock>)
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest.mocked(copyText).mockReset().mockResolvedValue(true)
})

const openSheet = async () => {
  await fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.share.action) }))
  await screen.findByText(fr.t(($) => $.share.title, { title: 'Léa' }))
}

describe('« Partager » on a public member page (R12)', () => {
  it('says everyone can open it, and copies the address of the page in French', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, publicPage: true })
    await renderWithProviders(<MemberScreen id="u1" />)

    await openSheet()

    expect(screen.getByText(fr.t(($) => $.share.everyone))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.share.membersOnly))).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.share.copy) }))
    expect(copyText).toHaveBeenCalledWith(new URL('/fr/members/u1', webAppUrl).href)
  })

  it('keeps « Seuls les membres… » and the members’ address for a page that is not public (témoin)', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, publicPage: false })
    await renderWithProviders(<MemberScreen id="u1" />)

    await openSheet()

    expect(screen.getByText(fr.t(($) => $.share.membersOnly))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.share.copy) }))
    expect(copyText).toHaveBeenCalledWith(new URL('/members/u1', webAppUrl).href)
  })
})
