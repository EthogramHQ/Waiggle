// Le focus du clavier après un « Retirer » réussi (R9, relecture du design, C8). Le bouton
// « Retirer » qui a ouvert la feuille a disparu : le détail montre « Contenu retiré. » à sa place.
// La feuille, en se fermant, rendait le focus à cet ouvreur parti, et il tombait sur la page
// (`body`), d'où le Tab suivant repartait du logo. L'écran donne donc à la feuille la place où
// rendre le focus (`returnFocusTo`) : le résultat de l'élément décidé. Sans décision (« Annuler »),
// rien : la feuille le rend à « Retirer », toujours là.
//
// La feuille est remplacée ici par une fausse, qui garde ce que l'écran lui passe : ce qu'elle fait
// de `returnFocusTo` (le focus posé à la fermeture, puis à la fin du fondu) est testé avec elle,
// dans moderation/RemoveSheet.focus.test.tsx.
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import type { RemoveSheet } from '../moderation/RemoveSheet'
import { getMe } from '../profile/api'
import { labelOf } from '../testing/arrivedFocus'
import { adminMe } from '../testing/fixtures'
import {
  decisionHistoryPageOf,
  firstTextOf,
  moderationQueuePageOf,
  removedPageOf,
  scamCommentItem,
} from '../testing/moderation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { ModerationScreen } from './ModerationScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../moderation/api', () => ({
  useModerationQueue: jest.fn(),
  useRemovedItems: jest.fn(),
  useDecide: jest.fn(),
  useDecisionHistory: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

type SheetProps = ComponentProps<typeof RemoveSheet>
// Les dernières props reçues par la fausse feuille (le nom commence par `mock` : jest.mock le
// permet dans sa fabrique).
const mockSheet: { props: SheetProps | null } = { props: null }
jest.mock('../moderation/RemoveSheet', () => ({
  RemoveSheet: (props: SheetProps) => {
    mockSheet.props = props
    return null
  },
}))

/** Ce que rend un useInfiniteQuery, pour une page déjà reçue. */
const infinite = <Page,>(page: Page) => ({
  data: { pages: [page], pageParams: [undefined] },
  status: 'success',
  isPending: false,
  isLoading: false,
  isSuccess: true,
  isError: false,
  isFetchNextPageError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

let restoreWindow: () => void

beforeEach(() => {
  mockSheet.props = null
  restoreWindow = setDesktopWindow()
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  jest
    .mocked(useModerationQueue)
    .mockReturnValue(
      infinite(moderationQueuePageOf()) as unknown as ReturnType<typeof useModerationQueue>,
    )
  jest
    .mocked(useRemovedItems)
    .mockReturnValue(infinite(removedPageOf()) as unknown as ReturnType<typeof useRemovedItems>)
  jest
    .mocked(useDecisionHistory)
    .mockReturnValue(
      infinite(decisionHistoryPageOf()) as unknown as ReturnType<typeof useDecisionHistory>,
    )
  jest
    .mocked(useDecide)
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

afterEach(() => {
  restoreWindow()
})

/** Ouvre « Retirer » sur le premier élément (le commentaire de Sam, montré dans le détail). */
const openRemove = async () => {
  await renderWithProviders(<ModerationScreen />)
  await screen.findAllByText(firstTextOf(scamCommentItem))
  await fireEvent.press(screen.getByRole('button', { name: 'Retirer' }))
  const props = mockSheet.props
  if (!props?.open) throw new Error('La feuille « Retirer » ne s’est pas ouverte.')
  return props
}

describe('the keyboard focus after « Retirer »', () => {
  it('gives the closing sheet the outcome « Contenu retiré. » as the place for the focus', async () => {
    const opened = await openRemove()
    await act(async () => opened.onDone())

    const closed = mockSheet.props
    // Témoin : la feuille est bien fermée, et le résultat est affiché à la place des boutons.
    expect(closed?.open).toBe(false)
    expect(screen.getByText(fr.t(($) => $.moderation.removedDone))).toBeTruthy()
    const target = closed?.returnFocusTo?.()
    expect(labelOf(target)).toBe(fr.t(($) => $.moderation.removedDone))
  })

  it('names no place without a decision: the sheet gives the focus back to « Retirer »', async () => {
    const opened = await openRemove()
    await act(async () => opened.onClose())

    const closed = mockSheet.props
    expect(closed?.open).toBe(false)
    // Témoin : « Retirer » est toujours là, rien n'a été décidé.
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeTruthy()
    expect(closed?.returnFocusTo?.() ?? null).toBeNull()
  })
})
