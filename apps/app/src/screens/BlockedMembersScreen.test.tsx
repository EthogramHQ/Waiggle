// Tests de la page « Membres bloqués » (tranche 7b), ouverte depuis « Mon compte » (app/blocks.tsx).
// Scénario « Débloquer » : Malik y voit Inès et Sam, et choisit « Débloquer » pour Inès ; une
// fenêtre lui rappelle que les abonnements retirés ne reviennent pas (règle 21 de la relecture du
// plan, J10).
//
// L'interface attendue de `src/blocks/api.ts` (écrit par ui-dev) :
// - `useBlockedMembers()` : la liste (useInfiniteQuery, pages `BlockedPage` de GET /v1/me/blocks) ;
// - `useUnblock()` : `{ unblock }`, où `unblock(memberId)` rend un `ApiResult` (`{ ok: true }` ou
//   `{ ok: false, error }`) et relit la liste une fois fait.
import type { BlockedPage } from '@ruche/contracts'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { useBlockedMembers, useUnblock } from '../blocks/api'
import { blockedInes, blockedPageOf, blockedSam } from '../testing/blocks'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { BlockedMembersScreen } from './BlockedMembersScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La liste et le déblocage : de faux hooks, choisis par chaque test.
jest.mock('../blocks/api', () => ({ useBlockedMembers: jest.fn(), useUnblock: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/blocks',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/**
 * Ce que rend un useInfiniteQuery de React Query : les pages déjà reçues, et de quoi lire la suite
 * (fetchNextPage) ou tout relire (refetch). `error` : la lecture a échoué. (Comme dans
 * ModerationScreen.test.tsx.)
 */
const infinite = (pages: BlockedPage[], { hasNextPage = false, error = null as unknown } = {}) => ({
  data: error ? undefined : { pages, pageParams: pages.map(() => undefined) },
  status: error ? 'error' : 'success',
  isPending: false,
  isLoading: false,
  isSuccess: !error,
  isError: Boolean(error),
  isFetchNextPageError: false,
  error,
  hasNextPage,
  isFetchingNextPage: false,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

const mockList = (pages: BlockedPage[], options?: Parameters<typeof infinite>[1]) => {
  const result = infinite(pages, options)
  jest
    .mocked(useBlockedMembers)
    .mockReturnValue(result as unknown as ReturnType<typeof useBlockedMembers>)
  return result
}

const mockUnblock = jest.fn()

beforeEach(() => {
  mockSession({ user: { id: 'u4', name: 'Malik' } })
  mockList([blockedPageOf()])
  mockUnblock.mockReset().mockResolvedValue({ ok: true, data: null })
  jest
    .mocked(useUnblock)
    .mockReset()
    .mockReturnValue({ unblock: mockUnblock } as unknown as ReturnType<typeof useUnblock>)
  mockPush.mockReset()
  mockReplace.mockReset()
})

/** La ligne d'un membre : on remonte depuis son nom jusqu'à l'ensemble qui porte « Débloquer ». */
const rowOf = (name: string) => {
  let node = screen.getByText(name).parent
  while (node && within(node).queryAllByRole('button', { name: /^Débloquer/ }).length === 0) {
    node = node.parent
  }
  if (!node) throw new Error(`no row around ${name}`)
  return within(node)
}

const unblockTitle = fr.t('block.unblockTitle', { handle: 'ines_morel' })

/** Touche « Débloquer » sur la ligne d'Inès : la fenêtre de confirmation s'ouvre. */
const askToUnblockInes = async () => {
  await fireEvent.press(rowOf(blockedInes.member.name).getByRole('button', { name: /^Débloquer/ }))
}

describe('the list of the members I blocked', () => {
  it('has a title, and says what a block does', async () => {
    await renderWithProviders(<BlockedMembersScreen />)

    expect(await screen.findByRole('header', { name: fr.t('block.list.title') })).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t('block.list.hint'))).length).toBeGreaterThan(0)
  })

  it('shows each member blocked, with name, handle and the date, from the most recent', async () => {
    await renderWithProviders(<BlockedMembersScreen />)

    await screen.findByText(blockedInes.member.name)
    const names = screen
      .getAllByText(/^(Inès Morel|Sam Petit)$/)
      .map((element) => element.props.children)
    expect(names).toEqual(['Inès Morel', 'Sam Petit'])
    expect(rowOf('Inès Morel').getByText(containing('@ines_morel'))).toBeTruthy()
    expect(rowOf('Sam Petit').getByText(containing('@sam'))).toBeTruthy()
    // « Bloqué le 23 oct. » : la date suit le format de l'appli, on n'en vérifie que le début.
    expect(rowOf('Inès Morel').getByText(/Bloqué le /)).toBeTruthy()
  })

  it('offers a « Débloquer » on each row', async () => {
    await renderWithProviders(<BlockedMembersScreen />)

    await screen.findByText(blockedInes.member.name)
    expect(rowOf(blockedInes.member.name).getByRole('button', { name: /^Débloquer/ })).toBeTruthy()
    expect(rowOf(blockedSam.member.name).getByRole('button', { name: /^Débloquer/ })).toBeTruthy()
  })

  it('says when nobody is blocked', async () => {
    mockList([blockedPageOf([])])
    await renderWithProviders(<BlockedMembersScreen />)

    expect(await screen.findByText(containing(fr.t('block.list.empty')))).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Débloquer/ })).toBeNull()
  })

  it('loads the next ones on request', async () => {
    const list = mockList([blockedPageOf([blockedInes], 'curseur-suivant')], { hasNextPage: true })
    await renderWithProviders(<BlockedMembersScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: fr.t('block.list.more') }))

    expect(list.fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('offers to try again when the list could not load', async () => {
    const list = mockList([], { error: new Error('réseau coupé') })
    await renderWithProviders(<BlockedMembersScreen />)

    expect(await screen.findByText(containing(fr.t('block.list.loadError')))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

    expect(list.refetch).toHaveBeenCalledTimes(1)
  })

  it('asks a visitor to sign in, and shows no list', async () => {
    mockSession(null)
    await renderWithProviders(<BlockedMembersScreen />)

    expect(await screen.findByRole('button', { name: 'Me connecter' })).toBeTruthy()
    expect(screen.queryByText(blockedInes.member.name)).toBeNull()
  })
})

describe('unblocking a member', () => {
  it('asks first, saying the follows do not come back', async () => {
    await renderWithProviders(<BlockedMembersScreen />)
    await screen.findByText(blockedInes.member.name)

    await askToUnblockInes()

    expect(screen.getByRole('header', { name: unblockTitle })).toBeTruthy()
    expect(screen.getAllByText(containing(fr.t('block.unblockMessage'))).length).toBeGreaterThan(0)
    expect(mockUnblock).not.toHaveBeenCalled()
  })

  it('unblocks the member once confirmed, and says so', async () => {
    await renderWithProviders(<BlockedMembersScreen />)
    await screen.findByText(blockedInes.member.name)

    await askToUnblockInes()
    await fireEvent.press(screen.getByRole('button', { name: fr.t('block.unblockConfirm') }))

    expect(mockUnblock).toHaveBeenCalledTimes(1)
    expect(mockUnblock).toHaveBeenCalledWith(blockedInes.member.id)
    expect(
      await screen.findByText(containing(fr.t('block.unblocked', { handle: 'ines_morel' }))),
    ).toBeTruthy()
  })

  it('unblocks nobody when the window is cancelled', async () => {
    await renderWithProviders(<BlockedMembersScreen />)
    await screen.findByText(blockedInes.member.name)

    await askToUnblockInes()
    await fireEvent.press(screen.getByRole('button', { name: fr.t('block.cancel') }))

    expect(mockUnblock).not.toHaveBeenCalled()
    expect(screen.queryByRole('header', { name: unblockTitle })).toBeNull()
  })

  it('unblocks only once for a double tap on « Débloquer » in the window', async () => {
    let answer: (value: unknown) => void = () => {}
    mockUnblock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    await renderWithProviders(<BlockedMembersScreen />)
    await screen.findByText(blockedInes.member.name)

    await askToUnblockInes()
    const confirm = screen.getByRole('button', { name: fr.t('block.unblockConfirm') })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(mockUnblock).toHaveBeenCalledTimes(1)
    await act(async () => answer({ ok: true, data: null }))
  })

  it('says so when the unblock could not be saved', async () => {
    mockUnblock.mockResolvedValue({ ok: false, error: 'internal' })
    await renderWithProviders(<BlockedMembersScreen />)
    await screen.findByText(blockedInes.member.name)

    await askToUnblockInes()
    await fireEvent.press(screen.getByRole('button', { name: fr.t('block.unblockConfirm') }))

    expect(await screen.findByText(containing(fr.t('block.error')))).toBeTruthy()
    expect(
      screen.queryByText(containing(fr.t('block.unblocked', { handle: 'ines_morel' }))),
    ).toBeNull()
  })
})
