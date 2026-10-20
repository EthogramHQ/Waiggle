// Tests de l'écran des notifications (tranche 6b) : ce qu'Inès lit quand elle touche la cloche,
// où chaque notification la mène, et ce que l'écran dit quand il n'y a rien, ou plus rien.
// Les textes viennent des clés « notifications.* » : le test les lit par la même instance i18n
// que l'écran, si bien qu'il vérifie la clé et ses paramètres, pas la ponctuation exacte.
import type { NotificationPage } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import {
  allNotifications,
  commentNotification,
  handleNotification,
  hiddenNotification,
  memberFollowsNotification,
  mentionNotification,
  meteoProject,
  noReactionCounts,
  notificationPageOf,
  notificationsAsOf,
  projectFollowsNotification,
  reactionsNotification,
  replyNotification,
} from '../testing/notifications'
import { mockSession, renderWithProviders } from '../testing/render'
import { NotificationsScreen } from './NotificationsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La liste, le marquage « vu » et le nombre de la cloche : de faux hooks, choisis par chaque test.
jest.mock('../notifications/api', () => ({
  useNotifications: jest.fn(),
  useMarkSeen: jest.fn(),
  useUnreadCount: jest.fn(),
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

// Les textes attendus, tirés des mêmes traductions que l'écran.
const { t } = createI18n('fr')

/** Le texte entier d'un élément, textes imbriqués compris. */
type Element = ReturnType<typeof screen.getByText>
const textOf = (node: Element): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')

/**
 * Une expression qui trouve ce texte n'importe où dans un texte plus long (la carte entière).
 * getByText remplace tous les blancs du texte affiché (espaces insécables de « » et « : »
 * comprises) par des espaces simples : on fait de même avec le texte cherché.
 */
const containing = (text: string) =>
  new RegExp(text.replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

const mockMarkSeen = jest.fn()

/**
 * Ce que renvoie useNotifications (un useInfiniteQuery de React Query) : les pages déjà reçues, et
 * de quoi lire la suite (fetchNextPage) ou tout relire (refetch).
 */
const mockPages = (
  pages: NotificationPage[],
  { hasNextPage = false, isFetchingNextPage = false } = {},
) => {
  const result = {
    data: { pages, pageParams: pages.map(() => undefined) },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isFetchNextPageError: false,
    error: null,
    hasNextPage,
    isFetchingNextPage,
    isRefetching: false,
    fetchNextPage: jest.fn().mockResolvedValue(undefined),
    refetch: jest.fn().mockResolvedValue(undefined),
  }
  jest
    .mocked(useNotifications)
    .mockReturnValue(result as unknown as ReturnType<typeof useNotifications>)
  return result
}

beforeEach(() => {
  mockPush.mockReset()
  mockMarkSeen.mockReset()
  mockSession({ user: { id: 'u5', name: 'Inès' } })
  jest.mocked(useMarkSeen).mockReset().mockReturnValue({ markSeen: mockMarkSeen })
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  jest.mocked(useNotifications).mockReset()
  mockPages([notificationPageOf()])
})

// Les textes de chaque notification d'exemple (testing/notifications.ts).
const texts = {
  reactions: t('notifications.reactions', { count: 2, title: 'Météo' }),
  comment: t('notifications.comment', { name: 'Malik', title: 'Météo', excerpt: 'Super idée…' }),
  mention: t('notifications.mention', { name: 'Malik', title: 'Météo' }),
  reply: t('notifications.reply', { name: 'Malik', title: 'Météo' }),
  memberFollows: t('notifications.memberFollows', { count: 3 }),
  projectFollows: t('notifications.projectFollows', { count: 2, title: 'Météo' }),
  hidden: t('notifications.hidden', { title: 'Météo' }),
  handle: t('notifications.handle', { handle: 'ines_morel' }),
}

describe('NotificationsScreen', () => {
  it('has a title', async () => {
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getByRole('header', { name: t('notifications.title') })).toBeTruthy()
  })

  it('writes a sentence for each kind of notification', async () => {
    await renderWithProviders(<NotificationsScreen />)

    for (const text of Object.values(texts)) {
      expect(screen.getAllByText(containing(text)).length).toBeGreaterThan(0)
    }
  })

  it('keeps the order of the API, from the most recent to the oldest', async () => {
    await renderWithProviders(<NotificationsScreen />)

    const order = [
      texts.reactions,
      texts.comment,
      texts.mention,
      texts.reply,
      texts.memberFollows,
      texts.projectFollows,
      texts.hidden,
      texts.handle,
    ]
    // Les textes de la page, dans l'ordre où ils sont dessinés : chacun dit de quelle notification
    // il vient (la première phrase attendue qu'il contient).
    const shown = screen
      .getAllByText(new RegExp(order.map((text) => containing(text).source).join('|')))
      .map((node) => order.findIndex((text) => textOf(node).includes(text)))
    expect(shown.filter((index, at) => shown.indexOf(index) === at)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
  })

  it('gives the number of each kind of reaction, and only the kinds received', async () => {
    mockPages([
      notificationPageOf([
        {
          ...reactionsNotification,
          counts: { ...noReactionCounts, bravo: 2, useful: 1 },
          total: 3,
        },
      ]),
    ])
    await renderWithProviders(<NotificationsScreen />)

    expect(
      screen.getByText(containing(t('notifications.reactions', { count: 3, title: 'Météo' }))),
    ).toBeTruthy()
    const bravo = t('project.reactions.bravo')
    const useful = t('project.reactions.useful')
    expect(
      screen.getAllByText(
        containing(t('notifications.reactionCount', { reaction: bravo, count: 2 })),
      ).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        containing(t('notifications.reactionCount', { reaction: useful, count: 1 })),
      ).length,
    ).toBeGreaterThan(0)
    // Les types sans réaction ne sont pas cités.
    expect(screen.queryByText(containing(t('project.reactions.funny')))).toBeNull()
    expect(screen.queryByText(containing(t('project.reactions.amazing')))).toBeNull()
  })

  it('names nobody for reactions and followers', async () => {
    mockPages([
      notificationPageOf([
        reactionsNotification,
        memberFollowsNotification,
        projectFollowsNotification,
      ]),
    ])
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : les trois notifications sont bien là…
    expect(screen.getAllByText(containing(texts.reactions)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(texts.memberFollows)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(texts.projectFollows)).length).toBeGreaterThan(0)
    // … et aucune personne n'y est nommée.
    expect(screen.queryByText(/Malik/)).toBeNull()
  })

  it('names the author of a comment, whom the comment already shows', async () => {
    mockPages([notificationPageOf([commentNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getAllByText(containing(texts.comment)).length).toBeGreaterThan(0)
  })

  it('points out the new notifications, and only them', async () => {
    // Dans l'exemple, seules les deux premières sont nouvelles.
    await renderWithProviders(<NotificationsScreen />)

    const newOnes = allNotifications.filter((notification) => notification.isNew).length
    expect(newOnes).toBe(2)
    expect(
      screen.getAllByText(t('notifications.new'), { includeHiddenElements: true }),
    ).toHaveLength(newOnes)
  })

  it('marks as seen what existed when the screen opened, once', async () => {
    await renderWithProviders(<NotificationsScreen />)

    expect(mockMarkSeen).toHaveBeenCalledTimes(1)
    // L'heure du serveur à la lecture (asOf), pas l'heure du téléphone : rien de ce qui arrive
    // entre-temps n'est marqué vu.
    expect(mockMarkSeen).toHaveBeenCalledWith(notificationsAsOf)
  })

  it('does not mark again when the next page arrives', async () => {
    const { rerender } = await renderWithProviders(<NotificationsScreen />)
    mockPages([
      notificationPageOf(allNotifications, 'abc'),
      notificationPageOf([], null, '2026-10-20T13:00:00.000Z'),
    ])
    await rerender(<NotificationsScreen />)

    expect(mockMarkSeen).toHaveBeenCalledTimes(1)
    expect(mockMarkSeen).toHaveBeenCalledWith(notificationsAsOf)
  })

  it('marks nothing before the list has arrived', async () => {
    jest.mocked(useNotifications).mockReturnValue({
      data: undefined,
      status: 'pending',
      isPending: true,
      isLoading: true,
      isSuccess: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useNotifications>)
    const { rerender } = await renderWithProviders(<NotificationsScreen />)

    expect(mockMarkSeen).not.toHaveBeenCalled()
    // Témoin : la liste arrive, et c'est alors seulement que tout est marqué vu.
    mockPages([notificationPageOf()])
    await rerender(<NotificationsScreen />)
    expect(mockMarkSeen).toHaveBeenCalledWith(notificationsAsOf)
  })
})

describe('where a notification leads', () => {
  const projectRoute = { pathname: '/projects/[id]', params: { id: meteoProject.id } }

  it.each([
    ['reactions', reactionsNotification, texts.reactions],
    ['a comment', commentNotification, texts.comment],
    ['a mention', mentionNotification, texts.mention],
    ['a reply', replyNotification, texts.reply],
    ['project followers', projectFollowsNotification, texts.projectFollows],
    ['a hidden comment', hiddenNotification, texts.hidden],
  ])('opens the project for %s', async (_kind, notification, text) => {
    mockPages([notificationPageOf([notification])])
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('link', { name: containing(text) }))

    expect(mockPush).toHaveBeenCalledWith(projectRoute)
  })

  it('opens « my profile » for the handle', async () => {
    mockPages([notificationPageOf([handleNotification])])
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('link', { name: containing(texts.handle) }))

    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('leads nowhere for the followers of one’s account', async () => {
    mockPages([notificationPageOf([memberFollowsNotification])])
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : la notification est affichée…
    expect(screen.getAllByText(containing(texts.memberFollows)).length).toBeGreaterThan(0)
    // … mais ne se touche pas : ni lien, ni bouton.
    expect(screen.queryByRole('link', { name: containing(texts.memberFollows) })).toBeNull()
    expect(screen.queryByRole('button', { name: containing(texts.memberFollows) })).toBeNull()
  })
})

describe('the end of the list', () => {
  it('says when there is no notification at all', async () => {
    mockPages([notificationPageOf([])])
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getByText(t('notifications.empty'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull()
  })

  it('loads the next 20 on request', async () => {
    const result = mockPages([notificationPageOf(allNotifications, 'abc')], { hasNextPage: true })
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher la suite' }))

    expect(result.fetchNextPage).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('C’est tout')).toBeNull()
  })

  it('shows that the next page is on its way', async () => {
    mockPages([notificationPageOf(allNotifications, 'abc')], {
      hasNextPage: true,
      isFetchingNextPage: true,
    })
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getByRole('button', { name: 'Afficher la suite' })).toBeBusy()
  })

  it('says « that’s all » at the very end', async () => {
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getByText('C’est tout')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull()
  })
})

describe('when something goes wrong', () => {
  it('offers to retry when the list could not be loaded', async () => {
    const refetch = jest.fn().mockResolvedValue(undefined)
    jest.mocked(useNotifications).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isLoading: false,
      isSuccess: false,
      isError: true,
      isFetchNextPageError: false,
      error: new Error('internal'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      refetch,
    } as unknown as ReturnType<typeof useNotifications>)
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))

    expect(refetch).toHaveBeenCalledTimes(1)
    expect(mockMarkSeen).not.toHaveBeenCalled()
  })

  it('keeps the notifications already read when the next page fails, and offers to retry', async () => {
    const result = mockPages([notificationPageOf(allNotifications, 'abc')], { hasNextPage: true })
    jest.mocked(useNotifications).mockReturnValue({
      ...result,
      isError: true,
      isFetchNextPageError: true,
      error: new Error('internal'),
    } as unknown as ReturnType<typeof useNotifications>)
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getAllByText(containing(texts.reactions)).length).toBeGreaterThan(0)
    expect(screen.getByRole('alert')).toHaveTextContent(t('notifications.moreError'))
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(result.fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('asks a visitor to sign in', async () => {
    mockSession(null)
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getAllByText('Réservé aux membres').length).toBeGreaterThan(0)
    expect(screen.queryByText(containing(texts.reactions))).toBeNull()
    expect(mockMarkSeen).not.toHaveBeenCalled()
  })
})
