// Tests de l'écran des notifications (tranche 6b) : ce qu'Inès lit quand elle touche la cloche,
// où chaque notification la mène, et ce que l'écran dit quand il n'y a rien, ou plus rien.
// Les textes viennent des clés « notifications.* » : le test les lit par la même instance i18n
// que l'écran, si bien qu'il vérifie la clé et ses paramètres, pas la ponctuation exacte.
import type { NotificationPage } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createI18n } from '../i18n'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { suspendedMe } from '../testing/fixtures'
import { withParisEnd } from '../testing/moderation'
import {
  allNotifications,
  commentNotification,
  handleNotification,
  hiddenNotification,
  memberFollowsNotification,
  memberReportDismissedNotification,
  mentionNotification,
  meteoProject,
  noReactionCounts,
  notificationPageOf,
  notificationsAsOf,
  projectFollowsNotification,
  reactionsNotification,
  removedCommentNotification,
  removedProjectNotification,
  replyNotification,
  reportDismissedNotification,
  reportHandledNotification,
  suspendedIndefinitelyNotification,
  suspendedNotification,
  suspensionEndedNotification,
  suspensionLiftedNotification,
} from '../testing/notifications'
import { mockSession, renderWithProviders } from '../testing/render'
import { missingSentences, removalSentences } from '../testing/text'
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
  reactions: t(($) => $.notifications.reactions, { count: 2, title: 'Météo' }),
  comment: t(($) => $.notifications.comment, {
    name: 'Malik',
    title: 'Météo',
    excerpt: 'Super idée…',
  }),
  mention: t(($) => $.notifications.mention, { name: 'Malik', title: 'Météo' }),
  reply: t(($) => $.notifications.reply, { name: 'Malik', title: 'Météo' }),
  memberFollows: t(($) => $.notifications.memberFollows, { count: 3 }),
  projectFollows: t(($) => $.notifications.projectFollows, { count: 2, title: 'Météo' }),
  hidden: t(($) => $.notifications.hidden, { title: 'Météo' }),
  handle: t(($) => $.notifications.handle, { handle: 'ines_morel' }),
}

describe('NotificationsScreen', () => {
  it('has a title', async () => {
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getByRole('header', { name: t(($) => $.notifications.title) })).toBeTruthy()
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
      screen.getByText(
        containing(t(($) => $.notifications.reactions, { count: 3, title: 'Météo' })),
      ),
    ).toBeTruthy()
    const bravo = t(($) => $.project.reactions.bravo)
    const useful = t(($) => $.project.reactions.useful)
    expect(
      screen.getAllByText(
        containing(t(($) => $.notifications.reactionCount, { reaction: bravo, count: 2 })),
      ).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        containing(t(($) => $.notifications.reactionCount, { reaction: useful, count: 1 })),
      ).length,
    ).toBeGreaterThan(0)
    // Les types sans réaction ne sont pas cités.
    expect(screen.queryByText(containing(t(($) => $.project.reactions.funny)))).toBeNull()
    expect(screen.queryByText(containing(t(($) => $.project.reactions.amazing)))).toBeNull()
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

  it('quotes the excerpt under the sentence, for every sort of comment', async () => {
    for (const notification of [commentNotification, mentionNotification, replyNotification]) {
      mockPages([notificationPageOf([notification])])
      const { unmount } = await renderWithProviders(<NotificationsScreen />)

      // L'extrait est un texte à lui, sous la phrase, et non une fin de phrase.
      expect(screen.getByText(notification.comment.excerpt)).toBeTruthy()
      await unmount()
    }
  })

  it('lists the notifications as a list', async () => {
    await renderWithProviders(<NotificationsScreen />)

    // Chaque carte est un élément de liste (les lecteurs d'écran annoncent « liste, 8 éléments »).
    const link = screen.getByRole('link', { name: containing(texts.reactions) })
    let node: typeof link | null = link
    while (node && node.props.role !== 'listitem') node = node.parent
    expect(node).not.toBeNull()
  })

  it('points out the new notifications, and only them', async () => {
    // Dans l'exemple, seules les deux premières sont nouvelles.
    await renderWithProviders(<NotificationsScreen />)

    const newOnes = allNotifications.filter((notification) => notification.isNew).length
    expect(newOnes).toBe(2)
    expect(
      screen.getAllByText(
        t(($) => $.notifications.new),
        { includeHiddenElements: true },
      ),
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

    expect(screen.getByText(t(($) => $.notifications.empty))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull()
  })

  it('titles the empty list, like every other state', async () => {
    mockPages([notificationPageOf([])])
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getByRole('header', { name: t(($) => $.notifications.emptyTitle) })).toBeTruthy()
  })

  it('offers to publish a project when there is nothing yet', async () => {
    mockPages([notificationPageOf([])])
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Publier un projet' }))

    expect(mockPush).toHaveBeenCalledWith('/projects/new')
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
    expect(screen.getByRole('alert')).toHaveTextContent(t(($) => $.notifications.moreError))
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

// --- Tranche 7a : un contenu retiré, un signalement traité ---

/** Le retrait que décrit une notification « removed », pour lire les mêmes phrases qu'ailleurs. */
const removalOf = (notification: typeof removedCommentNotification) => ({
  ground: notification.ground,
  explanation: notification.explanation,
  afterReport: notification.afterReport,
  at: notification.at,
})

describe('a content of mine removed by the moderation', () => {
  it('says which comment was removed, on which project, and quotes it', async () => {
    mockPages([notificationPageOf([removedCommentNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const text = t(($) => $.notifications.removed.comment, { title: 'Météo' })
    expect(screen.getAllByText(containing(text)).length).toBeGreaterThan(0)
    expect(screen.getByText(removedCommentNotification.excerpt ?? '')).toBeTruthy()
  })

  it('says it is visible to me alone, after a report, decided by a person, why, and how to contest', async () => {
    // Règle 13 de la relecture du plan (article 17 du DSA).
    mockPages([notificationPageOf([removedCommentNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(
      missingSentences(removalSentences(removalOf(removedCommentNotification)), screen),
    ).toEqual([])
  })

  it('says when a project was removed by law, without any report', async () => {
    mockPages([notificationPageOf([removedProjectNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(
      screen.getAllByText(containing(t(($) => $.notifications.removed.project, { title: 'Météo' })))
        .length,
    ).toBeGreaterThan(0)
    expect(
      missingSentences(removalSentences(removalOf(removedProjectNotification)), screen),
    ).toEqual([])
    expect(screen.queryByText(containing(t(($) => $.removal.afterReport)))).toBeNull()
  })

  it('keeps the reasons of a removal on the project of a member who blocked me, without its title nor a link', async () => {
    // Tranche 7b, règle 9 : l'API vide le titre d'un projet que je ne vois plus ; la motivation
    // du retrait (article 17 du DSA) reste.
    // Tranche 7c : l'API le dit par `projectHidden` (test adapté au contrat de 7c : le titre vide
    // venait avec `projectHidden: false`, un état que l'API n'envoie plus).
    const elsewhere = {
      ...removedCommentNotification,
      project: { ...removedCommentNotification.project, title: '' },
      projectHidden: true,
    }
    mockPages([notificationPageOf([elsewhere])])
    await renderWithProviders(<NotificationsScreen />)

    const text = t(($) => $.notifications.removed.commentElsewhere)
    expect(screen.getAllByText(containing(text)).length).toBeGreaterThan(0)
    expect(missingSentences(removalSentences(removalOf(elsewhere)), screen)).toEqual([])
    expect(screen.queryByRole('link', { name: containing(text) })).toBeNull()
  })

  it('reads a hidden project from projectHidden, not from an empty title (slice 7c)', async () => {
    // Relecture de design 7b (ui-11) : l'appli devinait le projet caché à son titre vide. Ici,
    // l'API dit `projectHidden` et le titre est encore là : l'appli ne le nomme pas, ne mène
    // nulle part, et garde la motivation du retrait.
    const hidden = { ...removedCommentNotification, projectHidden: true }
    mockPages([notificationPageOf([hidden])])
    await renderWithProviders(<NotificationsScreen />)

    const text = t(($) => $.notifications.removed.commentElsewhere)
    expect(screen.getAllByText(containing(text)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Météo/)).toBeNull()
    expect(screen.queryByRole('link', { name: containing(text) })).toBeNull()
    expect(missingSentences(removalSentences(removalOf(hidden)), screen)).toEqual([])
  })

  it('leads to the project, which its author still sees', async () => {
    mockPages([notificationPageOf([removedCommentNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const text = t(($) => $.notifications.removed.comment, { title: 'Météo' })
    await fireEvent.press(screen.getByRole('link', { name: containing(text) }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: meteoProject.id },
    })
  })
})

describe('a report of mine that was handled', () => {
  const removedText = t(($) => $.notifications.reportHandled.comment.removed)

  it('says only the kind of content and the outcome, and how to disagree', async () => {
    mockPages([notificationPageOf([reportHandledNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getAllByText(containing(removedText)).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(containing(t(($) => $.notifications.reportHandled.contest))).length,
    ).toBeGreaterThan(0)
  })

  it('names no title, no author and no explanation', async () => {
    // Règle 2 de la relecture du plan : le contenu a pu devenir privé, ou son auteur partir.
    mockPages([notificationPageOf([reportHandledNotification])])
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : la notification est là…
    expect(screen.getAllByText(containing(removedText)).length).toBeGreaterThan(0)
    // … sans rien de ce qui appartient au contenu.
    expect(screen.queryByText(/Météo|Malik/)).toBeNull()
    expect(screen.queryByText(containing(t(($) => $.removal.contest)))).toBeNull()
  })

  it('leads nowhere when the content is no longer visible', async () => {
    mockPages([notificationPageOf([reportHandledNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.getAllByText(containing(removedText)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: containing(removedText) })).toBeNull()
    expect(screen.queryByRole('button', { name: containing(removedText) })).toBeNull()
  })

  it('says a dismissed report in its own words, and leads to the project still visible', async () => {
    mockPages([notificationPageOf([reportDismissedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const text = t(($) => $.notifications.reportHandled.project.dismissed)
    await fireEvent.press(screen.getByRole('link', { name: containing(text) }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: reportDismissedNotification.link?.projectId },
    })
  })

  it('leads to the page of the member for a dismissed report of a profile', async () => {
    mockPages([notificationPageOf([memberReportDismissedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const text = t(($) => $.notifications.reportHandled.member.dismissed)
    await fireEvent.press(screen.getByRole('link', { name: containing(text) }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u7' } })
  })
})

// --- Tranche 7c : la suspension de son compte, et sa fin ---
//
// Scénario « Suspendre un compte » : Karim reçoit une notification qui dit la mesure, sa fin (ou
// « jusqu'à nouvel ordre »), si elle suit un signalement (jamais de qui), qu'une personne a
// décidé, le fondement, l'explication, et comment contester (article 17 du DSA ; relecture
// juridique J2, J3, J4). Jamais l'administrateur qui a décidé.

describe('my account suspended by the moderation', () => {
  /** Les phrases de la motivation, comme pour un retrait : qui a décidé, pourquoi, et le recours. */
  const reasonsOf = (notification: typeof suspendedNotification) => [
    notification.afterReport ? t(($) => $.suspension.afterReport) : t(($) => $.suspension.direct),
    t(($) => $.removal.grounds[notification.ground]),
    t(($) => $.suspension.explanation, { explanation: notification.explanation }),
    t(($) => $.suspension.contest),
  ]

  it('says until when, at the hour of Paris (J4: 23:30 UTC is 0:30 the next day)', async () => {
    // La fin tombe le 2 novembre à 23 h 30 UTC : l'appli écrit le 3 novembre à 0 h 30. Sur ce PC
    // (Europe/Paris), une heure de l'appareil passerait aussi ; la CI, en UTC, la refuse.
    mockPages([notificationPageOf([suspendedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const until = withParisEnd(t(($) => $.notifications.suspended, { date: 'DATE', time: 'TIME' }))
    expect(screen.getAllByText(until).length).toBeGreaterThan(0)
  })

  it('says it follows a report, decided by a person, why, and how to contest', async () => {
    mockPages([notificationPageOf([suspendedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(missingSentences(reasonsOf(suspendedNotification), screen)).toEqual([])
  })

  it('says « until further notice » for a suspension without end, decided without a report', async () => {
    mockPages([notificationPageOf([suspendedIndefinitelyNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(
      screen.getAllByText(containing(t(($) => $.notifications.suspendedIndefinite))).length,
    ).toBeGreaterThan(0)
    expect(missingSentences(reasonsOf(suspendedIndefinitelyNotification), screen)).toEqual([])
    expect(screen.queryByText(containing(t(($) => $.suspension.afterReport)))).toBeNull()
  })

  it('says the suspension ended at its date, with nothing to explain', async () => {
    mockPages([notificationPageOf([suspensionEndedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(
      screen.getAllByText(containing(t(($) => $.notifications.suspensionEnded.ended))).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText(containing(t(($) => $.notifications.suspensionEnded.lifted))),
    ).toBeNull()
  })

  it('says the suspension was lifted earlier, with the explanation of the moderation', async () => {
    mockPages([notificationPageOf([suspensionLiftedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(
      screen.getAllByText(containing(t(($) => $.notifications.suspensionEnded.lifted))).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(containing(suspensionLiftedNotification.explanation ?? '')).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText(containing(t(($) => $.notifications.suspensionEnded.ended))),
    ).toBeNull()
  })
})

// Relecture de design 7c : un compte suspendu ne publie plus. L'état vide lui proposait pourtant
// « Publier un projet », vers un formulaire fermé ; il propose de découvrir des projets, à
// l'accueil, comme le fil vide (« Découvrir des projets »).
describe('the empty list of a suspended member', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
  })
  afterEach(() => {
    jest.mocked(getMe).mockReset()
  })

  it('offers to discover projects instead of publishing one', async () => {
    mockPages([notificationPageOf([])])
    await renderWithProviders(<NotificationsScreen />)

    const discover = await screen.findByRole('button', {
      name: t(($) => $.notifications.emptyActionSuspended),
    })
    expect(screen.queryByRole('button', { name: 'Publier un projet' })).toBeNull()
    await fireEvent.press(discover)

    expect(mockPush).toHaveBeenCalledWith('/')
  })
})
