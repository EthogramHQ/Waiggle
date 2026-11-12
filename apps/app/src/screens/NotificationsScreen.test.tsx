// Tests de l'écran des notifications (tranche 6b) : ce qu'Inès lit quand elle touche la cloche,
// où chaque notification la mène, et ce que l'écran dit quand il n'y a rien, ou plus rien.
// Les textes viennent des clés « notifications.* » : le test les lit par la même instance i18n
// que l'écran, si bien qu'il vérifie la clé et ses paramètres, pas la ponctuation exacte.

import { palettes } from '@ruche/brand'
import type { NotificationPage } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { createRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useEmailPreferences } from '../email/api'
import { createI18n } from '../i18n'
import { useMarkSeen, useNotifications, useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { labelOf, lendWebPage } from '../testing/arrivedFocus'
import { repliesNowPreferences } from '../testing/email'
import { suspendedMe } from '../testing/fixtures'
import { withParisEnd } from '../testing/moderation'
import {
  allNotifications,
  commentNotification,
  decollageProject,
  handleNotification,
  hiddenNotification,
  memberFollowsNotification,
  memberReportDismissedNotification,
  mentionNotification,
  meteoProject,
  noReactionCounts,
  notificationPageOf,
  notificationsAsOf,
  papiJeanAuthor,
  papiJeanReplyNotification,
  projectCategoryNotification,
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
  toolAddedNotification,
  updateNotification,
} from '../testing/notifications'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { missingSentences, removalSentences } from '../testing/text'
import { relativeDate, shortDate } from '../ui/relativeDate'
import { NotificationsScreen } from './NotificationsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit. R8 : une
// fausse fonction, pour vérifier que l'avatar et la miniature passent par elle.
const mockMediaSource = jest.fn((url: string | null | undefined) => (url ? { uri: url } : null))
jest.mock('../api/media', () => ({ useMediaSources: () => mockMediaSource }))
// R8 : la colonne « Ce que tu reçois par e-mail » (ordinateur) lit les réglages d'e-mail.
jest.mock('../email/api', () => ({ useEmailPreferences: jest.fn() }))
// R8 : le nom d'une catégorie vient de l'API (R6b) : la liste des seize catégories de départ.
jest.mock('../categories/api', () => {
  const actual = jest.requireActual('../categories/api')
  const { categoryList } = jest.requireActual('../testing/categories')
  return {
    ...actual,
    useCategories: () => ({
      data: categoryList('fr'),
      isSuccess: true,
      refetch: jest.fn(),
    }),
  }
})
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
const { t: translate } = createI18n('fr')

/**
 * R8 : les phrases portent des marques (`<b>…</b>` pour le gras, `<v>…</v>` pour une version) que
 * l'écran découpe (notifications/marks.ts). Ce qu'on lit à l'écran, c'est la phrase sans elles.
 */
const plain = (text: string): string => text.replace(/<\/?[bv]>/g, '')
const t = ((...args: Parameters<typeof translate>) =>
  plain(String(translate(...args)))) as unknown as typeof translate

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
  mockMediaSource.mockReset().mockImplementation((url) => (url ? { uri: url } : null))
  jest
    .mocked(useEmailPreferences)
    .mockReset()
    .mockReturnValue({
      data: repliesNowPreferences,
      isSuccess: true,
      isError: false,
    } as unknown as ReturnType<typeof useEmailPreferences>)
})

/**
 * L'adresse d'une destination, en texte : « /projects/<id>?comment=<id> ». Un objet
 * `{ pathname, params }` donne la même adresse : chaque `[clé]` du chemin prend son paramètre, les
 * autres vont après « ? », par ordre alphabétique.
 */
const addressOf = (target: unknown): string | null => {
  if (target === null || target === undefined) return null
  if (typeof target === 'string') return target
  const { pathname, params = {} } = target as { pathname: string; params?: Record<string, string> }
  let path = pathname
  const query: string[] = []
  for (const [key, value] of Object.entries(params).sort(([a], [b]) => a.localeCompare(b))) {
    if (path.includes(`[${key}]`)) path = path.replace(`[${key}]`, String(value))
    else query.push(`${key}=${value}`)
  }
  return query.length > 0 ? `${path}?${query.join('&')}` : path
}

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

  // R8 (planche R8-Activite) : les réactions se montrent par leurs icônes (notifications/present.ts
  // donne les sortes reçues), plus par « Bravo ×2 » écrit en texte. Le total reste dans la phrase.
  it('gives the total of reactions, and names no kind that was not received', async () => {
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
    ['project followers', projectFollowsNotification, texts.projectFollows],
    ['a hidden comment', hiddenNotification, texts.hidden],
  ])('opens the project for %s', async (_kind, notification, text) => {
    mockPages([notificationPageOf([notification])])
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('link', { name: containing(text) }))

    expect(mockPush).toHaveBeenCalledWith(projectRoute)
  })

  // R8, « Voir en contexte » : la page du projet, feuille des commentaires ouverte sur ce
  // commentaire ; l'adresse le porte (`/projects/<id>?comment=<id>`).
  it.each([
    ['a comment', commentNotification, texts.comment],
    ['a mention', mentionNotification, texts.mention],
    ['a reply', replyNotification, texts.reply],
  ])('opens %s in its context, on the page of the project', async (_kind, notification, text) => {
    mockPages([notificationPageOf([notification])])
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(screen.getByRole('link', { name: containing(text) }))

    expect(addressOf(mockPush.mock.calls[0]?.[0])).toBe(
      `/projects/${meteoProject.id}?comment=${notification.comment.id}`,
    )
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

  it('ends the list without a word at the very end (RF, T4)', async () => {
    await renderWithProviders(<NotificationsScreen />)

    expect(screen.queryByText('C’est tout')).toBeNull()
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
// « Publier un projet », vers un formulaire fermé ; il propose d'explorer les projets, comme le
// fil vide (R3 : « Explorer les projets », vers l'onglet Explorer).
describe('the empty list of a suspended member', () => {
  beforeEach(() => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
  })
  afterEach(() => {
    jest.mocked(getMe).mockReset()
  })

  it('offers to explore projects instead of publishing one', async () => {
    mockPages([notificationPageOf([])])
    await renderWithProviders(<NotificationsScreen />)

    const explore = await screen.findByRole('button', {
      name: t(($) => $.notifications.emptyActionSuspended),
    })
    expect(screen.queryByRole('button', { name: 'Publier un projet' })).toBeNull()
    await fireEvent.press(explore)

    expect(mockPush).toHaveBeenCalledWith('/explore')
  })
})

// --- R4 « le fil et les cartes » : les dates dites par rapport à maintenant (F-Fil3) ---
//
// Une notification dit « hier », « il y a 3 h » ; le lecteur d'écran lit la date et l'heure
// complètes. Une décision de la modération (un retrait, un signalement traité, une suspension) garde
// sa date absolue, visible sans survol (relecture juridique jur-J2) : c'est un repère qu'on cite.

describe('the dates, said relative to now (R4)', () => {
  /** Le mercredi 21 octobre 2026 à 14 h, heure de Paris. */
  const now = new Date('2026-10-21T12:00:00.000Z')

  beforeEach(() => {
    // Seule l'horloge des dates est figée : les minuteurs restent vrais, pour React et les tests.
    jest.useFakeTimers({
      now,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('says « yesterday » on a reaction, and reads its full date in the name of the link', async () => {
    mockPages([notificationPageOf([reactionsNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const { label, full } = relativeDate(reactionsNotification.at, 'fr', now)
    expect(screen.getByText(label)).toBeTruthy()
    // Le nom du lien reprend tout ce que dit la carte, la date complète en dernier (une seule
    // notification, donc un seul lien).
    const link = screen.getByRole('link', { name: containing(texts.reactions) })
    const name = String(link.props.accessibilityLabel).replace(/\s+/g, ' ')
    expect(name).toMatch(containing(`${full}.`))
    expect(name).not.toMatch(containing(label))
    expect(screen.queryByText(shortDate(reactionsNotification.at, 'fr', now))).toBeNull()
  })

  it('reads the full date of a notification that leads nowhere', async () => {
    mockPages([notificationPageOf([memberFollowsNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const { label, full } = relativeDate(memberFollowsNotification.at, 'fr', now)
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByLabelText(full)).toBeTruthy()
  })

  it.each([
    ['a removal', removedCommentNotification],
    ['a handled report', reportHandledNotification],
    ['a suspension', suspendedNotification],
  ])(
    'keeps the absolute date of %s, visible without hovering (jur-J2)',
    async (_, notification) => {
      mockPages([notificationPageOf([notification])])
      await renderWithProviders(<NotificationsScreen />)

      expect(screen.getAllByText(shortDate(notification.at, 'fr', now)).length).toBeGreaterThan(0)
      expect(screen.queryByText(relativeDate(notification.at, 'fr', now).label)).toBeNull()
    },
  )
})

// --- R8 : la page « Activité » (planches R8-Activite, R8-Activite-Desktop, R8-Activite-Vide) ---

/** Le mardi 20 octobre 2026 à 14 h 30, heure de Paris : l'heure de `notificationsAsOf`. */
const r8Now = new Date(notificationsAsOf)

/** Fige l'horloge des dates seulement (les minuteurs restent vrais), comme plus haut. */
const freezeDates = (at: Date) =>
  jest.useFakeTimers({
    now: at,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })

const sectionNames = {
  today: t(($) => $.notifications.sections.today),
  week: t(($) => $.notifications.sections.week),
  earlier: t(($) => $.notifications.sections.earlier),
}

/** Les titres des sections, dans l'ordre de la page. */
const shownSections = () =>
  screen
    .getAllByRole('header')
    .map((node) => textOf(node))
    .filter((name) => Object.values(sectionNames).includes(name))

/** Le nombre de « Nouveau » de la page, lus ou cachés à l'œil. */
const newWords = () =>
  screen.queryAllByText(
    t(($) => $.notifications.new),
    { includeHiddenElements: true },
  ).length

/** Le contrôle d'un nom : un lien, ou à défaut un bouton. */
const control = (name: string) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

describe('the sections of the Activity (R8)', () => {
  beforeEach(() => {
    freezeDates(r8Now)
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('sorts the notifications into today, this week and earlier, in the days of Paris', async () => {
    // Le 20 : réactions, commentaire, mention, réponse ; le 19 et le 18 : abonnés, masqué ; le
    // 1er octobre : le pseudo.
    await renderWithProviders(<NotificationsScreen />)

    expect(shownSections()).toEqual([sectionNames.today, sectionNames.week, sectionNames.earlier])
  })

  it('shows no title for an empty section', async () => {
    mockPages([notificationPageOf([reactionsNotification, handleNotification])])
    await renderWithProviders(<NotificationsScreen />)

    expect(shownSections()).toEqual([sectionNames.today, sectionNames.earlier])
  })

  it('keeps each notification an item of a list, inside its section', async () => {
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : les sections sont là (le pseudo, du 1er octobre, est sous « Plus tôt »).
    expect(shownSections()).toContain(sectionNames.earlier)

    const link = screen.getByRole('link', { name: containing(texts.handle) })
    let node: typeof link | null = link
    while (node && node.props.role !== 'listitem') node = node.parent
    expect(node).not.toBeNull()
  })

  // Relecture du plan (interface) : la première carte arrivée avec la page suivante reçoit le focus
  // du clavier, même quand elle rejoint une section déjà commencée.
  it('moves the focus to the first notification of the next page, inside its section', async () => {
    const restore = lendWebPage()
    // Sur le web prêté, l'appli suit la langue du navigateur (l'anglais) : les textes attendus aussi.
    const en = createI18n('en').t
    const english = {
      more: en(($) => $.notifications.more),
      projectFollows: plain(
        en(($) => $.notifications.projectFollows, { count: 2, title: 'Météo' }),
      ),
      sections: [
        en(($) => $.notifications.sections.today),
        en(($) => $.notifications.sections.week),
        en(($) => $.notifications.sections.earlier),
      ],
    }
    const englishSections = () =>
      screen
        .getAllByRole('header')
        .map((node) => textOf(node))
        .filter((name) => english.sections.includes(name))
    try {
      const firstPage = notificationPageOf(
        [reactionsNotification, memberFollowsNotification],
        'abc',
      )
      const secondPage = notificationPageOf([projectFollowsNotification, handleNotification])
      mockPages([firstPage], { hasNextPage: true })
      // Une vue témoin : toutes les vues natives du rendu partagent son prototype.
      const probe = createRef<View>()
      const page = (
        <>
          <View ref={probe} />
          <NotificationsScreen />
        </>
      )
      const view = await renderWithProviders(page)
      const proto = Object.getPrototypeOf(probe.current) as { contains?: unknown; focus?: unknown }
      const hadContains = Object.hasOwn(proto, 'contains')
      const hadFocus = Object.hasOwn(proto, 'focus')
      proto.contains = () => true
      if (typeof proto.focus !== 'function') proto.focus = () => {}
      const focus = jest.spyOn(proto as { focus: () => void }, 'focus')
      try {
        const button = screen.getByRole('button', { name: english.more })
        await fireEvent(button, 'focus')
        await fireEvent.press(button)
        mockPages([firstPage], { hasNextPage: true, isFetchingNextPage: true })
        await view.rerender(page)
        mockPages([firstPage, secondPage])
        await view.rerender(page)

        const focused = focus.mock.contexts
          .map(labelOf)
          .filter((label): label is string => typeof label === 'string')
        expect(focused.some((label) => containing(english.projectFollows).test(label))).toBe(true)
        // La notification arrivée rejoint « Cette semaine », déjà commencée : pas de second titre.
        expect(englishSections()).toEqual(english.sections)
      } finally {
        focus.mockRestore()
        if (!hadContains) delete proto.contains
        if (!hadFocus) delete proto.focus
      }
    } finally {
      restore()
      jest.restoreAllMocks()
    }
  })
})

describe('the honey of what is new (R8)', () => {
  it('keeps a new notification new for the whole visit, even once marked as seen', async () => {
    mockPages([notificationPageOf([commentNotification])])
    const { rerender } = await renderWithProviders(<NotificationsScreen />)
    expect(newWords()).toBe(1)

    // « Vu » relit la liste : l'API la rend sans nouveauté. La page garde son miel.
    mockPages([notificationPageOf([{ ...commentNotification, isNew: false }])])
    await rerender(<NotificationsScreen />)

    expect(newWords()).toBe(1)
  })

  it('shows no honey at the next visit', async () => {
    mockPages([notificationPageOf([{ ...commentNotification, isNew: false }])])
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : la notification est là, sans « Nouveau ».
    expect(screen.getAllByText(containing(texts.comment)).length).toBeGreaterThan(0)
    expect(newWords()).toBe(0)
  })

  it('draws a new notification and an open choice row on highlightSoft', async () => {
    mockPages([notificationPageOf([commentNotification, mentionNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const colors = (node: ReturnType<typeof screen.getByRole>): unknown[] => [
      StyleSheet.flatten(node.props.style)?.backgroundColor,
      ...node.children.flatMap((child) => (typeof child === 'string' ? [] : colors(child))),
    ]
    const newLink = screen.getByRole('link', { name: containing(texts.comment) })
    const seenLink = screen.getByRole('link', { name: containing(texts.mention) })
    expect(colors(newLink)).toContain(palettes.day.highlightSoft)
    expect(colors(seenLink)).not.toContain(palettes.day.highlightSoft)
  })

  it('puts out the honey of the page at once with « mark all as read », on a computer', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      await renderWithProviders(<NotificationsScreen />)
      expect(newWords()).toBe(2)

      await fireEvent.press(control(t(($) => $.notifications.markAllRead)))

      expect(newWords()).toBe(0)
      // Relecture du plan (interface) : le bouton reste à sa place après l'appui.
      expect(control(t(($) => $.notifications.markAllRead))).toBeTruthy()
    } finally {
      restoreWindow()
    }
  })

  it('offers « mark all as read » only on a computer', async () => {
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : la page est là…
    expect(screen.getAllByText(containing(texts.reactions)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: t(($) => $.notifications.markAllRead) })).toBeNull()
  })
})

describe('the settings of the notifications (R8)', () => {
  it('opens the notification settings from the wheel of the top bar, on a phone', async () => {
    await renderWithProviders(<NotificationsScreen />)

    await fireEvent.press(control(t(($) => $.notifications.settings)))

    expect(addressOf(mockPush.mock.calls[0]?.[0])).toBe('/settings/notifications')
  })

  it('sums up what leaves by email in a column, on a computer', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      await renderWithProviders(<NotificationsScreen />)

      expect(
        screen.getByRole('header', { name: t(($) => $.notifications.emailColumn.title) }),
      ).toBeTruthy()
      // La planche R8-Activite-Desktop : les réponses et mentions « Tout de suite ».
      expect(
        screen.getByText(
          t(($) => $.notifications.summary.nowAndRest, { types: 'Les réponses et les mentions' }),
        ),
      ).toBeTruthy()
      expect(screen.getByText(t(($) => $.notifications.emailColumn.counts))).toBeTruthy()
    } finally {
      restoreWindow()
    }
  })

  it('leads from the column to the notification settings, with one control of that name', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      await renderWithProviders(<NotificationsScreen />)

      // Deux contrôles d'un écran n'ont jamais le même nom : la roue et le lien de la colonne
      // disent la même chose (« Régler les notifications ») ; sur ordinateur, un seul reste.
      const name = t(($) => $.notifications.emailColumn.settings)
      const named = [
        ...screen.queryAllByRole('link', { name }),
        ...screen.queryAllByRole('button', { name }),
      ]
      expect(named).toHaveLength(1)
      await fireEvent.press(named[0] as (typeof named)[number])

      expect(addressOf(mockPush.mock.calls[0]?.[0])).toBe('/settings/notifications')
    } finally {
      restoreWindow()
    }
  })

  it('shows no email column on a phone', async () => {
    await renderWithProviders(<NotificationsScreen />)

    // Témoin : la page est là…
    expect(screen.getAllByText(containing(texts.reactions)).length).toBeGreaterThan(0)
    expect(
      screen.queryByRole('header', { name: t(($) => $.notifications.emailColumn.title) }),
    ).toBeNull()
  })
})

describe('the new lines of the Activity (R8)', () => {
  it('shows the avatar and the thumbnail through the session-aware media sources', async () => {
    mockMediaSource.mockImplementation((url) =>
      url ? { uri: url, headers: { Cookie: 'session=lea' } } : null,
    )
    mockPages([notificationPageOf([papiJeanReplyNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const sources: unknown[] = []
    const collect = (node: ReturnType<typeof screen.getByRole>) => {
      if (node.props.source) sources.push(node.props.source)
      for (const child of node.children) if (typeof child !== 'string') collect(child)
    }
    if (screen.root) collect(screen.root)
    expect(mockMediaSource).toHaveBeenCalledWith(papiJeanAuthor.avatarUrl)
    expect(mockMediaSource).toHaveBeenCalledWith(decollageProject.cover.url)
    expect(sources).toContainEqual(
      expect.objectContaining({
        uri: papiJeanAuthor.avatarUrl,
        headers: { Cookie: 'session=lea' },
      }),
    )
    expect(sources).toContainEqual(
      expect.objectContaining({
        uri: decollageProject.cover.url,
        headers: { Cookie: 'session=lea' },
      }),
    )
  })

  it('builds the avatar and the thumbnail through the session-aware media sources', async () => {
    // Relecture du plan (interface), mot pour mot : aucune adresse de média n'arrive à une image
    // sans passer par `useMediaSources` (la session voyage avec elle sur téléphone).
    mockMediaSource.mockImplementation(() => null)
    mockPages([notificationPageOf([papiJeanReplyNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const raw: unknown[] = []
    const collect = (node: ReturnType<typeof screen.getByRole>) => {
      const source = node.props.source as { uri?: string } | undefined
      if (source?.uri) raw.push(source.uri)
      for (const child of node.children) if (typeof child !== 'string') collect(child)
    }
    if (screen.root) collect(screen.root)
    // Témoin : la ligne demande bien l'avatar et la miniature à useMediaSources…
    expect(mockMediaSource).toHaveBeenCalledWith(papiJeanAuthor.avatarUrl)
    expect(mockMediaSource).toHaveBeenCalledWith(decollageProject.cover.url)
    // … et ne pose aucune des deux adresses telle quelle quand la source n'est pas prête.
    expect(raw).not.toContain(papiJeanAuthor.avatarUrl)
    expect(raw).not.toContain(decollageProject.cover.url)
  })

  it('says an update without naming its author, with its other changes', async () => {
    mockPages([notificationPageOf([updateNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const sentence = t(($) => $.notifications.projectUpdateVersion, {
      title: 'Décollage !',
      version: 'v1.2',
    })
    expect(screen.getAllByText(containing(sentence)).length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        t(($) => $.notifications.updateMore, {
          line: 'Un compte à rebours avant chaque question',
          count: 2,
        }),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(/Papi Jean/)).toBeNull()
  })

  it('says the team filed a project, with the name of its category', async () => {
    mockPages([notificationPageOf([projectCategoryNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const sentence = t(($) => $.notifications.projectCategory, {
      title: 'Météo',
      category: 'Animaux',
    })
    await fireEvent.press(screen.getByRole('link', { name: containing(sentence) }))

    // Jamais le code brut de la catégorie ; la ligne ouvre le projet.
    expect(screen.queryByText(/animals/)).toBeNull()
    expect(addressOf(mockPush.mock.calls[0]?.[0])).toBe(`/projects/${meteoProject.id}`)
  })

  it('opens the page of a tool added to the catalogue', async () => {
    mockPages([notificationPageOf([toolAddedNotification])])
    await renderWithProviders(<NotificationsScreen />)

    const sentence = t(($) => $.notifications.toolAdded, { name: 'Glide' })
    await fireEvent.press(screen.getByRole('link', { name: containing(sentence) }))

    expect(addressOf(mockPush.mock.calls[0]?.[0])).toBe('/tags/glide')
  })

  it('offers to publish a project or to explore when there is nothing yet', async () => {
    mockPages([notificationPageOf([])])
    await renderWithProviders(<NotificationsScreen />)

    expect(control(t(($) => $.notifications.emptyAction))).toBeTruthy()
    await fireEvent.press(control(t(($) => $.notifications.emptyExplore)))

    expect(addressOf(mockPush.mock.calls[0]?.[0])).toBe('/explore')
  })
})
