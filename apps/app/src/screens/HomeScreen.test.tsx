// Test de l'écran d'accueil avec Testing Library : on affiche l'écran en mémoire,
// puis on le manipule comme le ferait un utilisateur (lire un texte, appuyer sur un bouton).
// On cherche les éléments par ce que l'utilisateur voit (texte, rôle), pas par leur code interne.
import { appName } from '@ruche/brand'
import type { FeedItem, FeedPage, FollowingFeedPage, Project } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useDiscoverFeed, useFeedNews, useFollowingFeed } from '../feed/api'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithI18n, setDesktopWindow } from '../testing/render'
import { HomeScreen } from './HomeScreen'

// Le choix de la langue enregistre la langue sur le compte : on remplace aussi ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Les deux fils et la recherche de nouveautés : de fausses réponses, choisies par chaque test.
jest.mock('../feed/api', () => ({
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
}))
// Le nombre de la cloche (tranche 6b) : un faux hook, choisi par chaque test.
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}))

// --- De faux fils ---

/** Un élément du fil : un nouveau projet, devenu public à cette date. */
const itemOf = (project: Project, at = project.createdAt): FeedItem => ({
  kind: 'project',
  at,
  project: summaryOf(project),
})
const fromLea = itemOf(recipesProject)
const fromMax = itemOf({
  ...recipesProject,
  id: '8b3e4c0a-5d6f-4e70-9b82-9c0d1e2f3a41',
  author: { id: 'u2', name: 'Max', avatarUrl: null },
  title: 'Le tri des photos',
  status: 'idea',
})
const fromZoe = itemOf({
  ...recipesProject,
  id: '9c4f5d1b-6e70-4f81-8c93-0d1e2f3a4b52',
  author: { id: 'u3', name: 'Zoé', avatarUrl: null },
  title: 'Le carnet de jardin',
})

/**
 * Ce que renvoie un useInfiniteQuery de React Query : les pages déjà reçues, et de quoi lire la
 * suite (fetchNextPage) ou tout relire depuis le début (refetch).
 */
const infiniteResult = <Page,>(
  pages: Page[],
  { hasNextPage = false, isFetchingNextPage = false } = {},
) => ({
  data: { pages, pageParams: pages.map(() => undefined) },
  status: 'success',
  isPending: false,
  isLoading: false,
  isSuccess: true,
  isError: false,
  error: null,
  hasNextPage,
  isFetchingNextPage,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

const mockFollowing = (
  page: Partial<FollowingFeedPage> = {},
  options?: { hasNextPage?: boolean; isFetchingNextPage?: boolean },
) => {
  const result = infiniteResult<FollowingFeedPage>(
    [{ items: [fromLea, fromMax], nextCursor: null, followsAnyone: true, ...page }],
    options,
  )
  jest
    .mocked(useFollowingFeed)
    .mockReturnValue(result as unknown as ReturnType<typeof useFollowingFeed>)
  return result
}

const mockDiscover = (
  page: Partial<FeedPage> = {},
  options?: { hasNextPage?: boolean; isFetchingNextPage?: boolean },
) => {
  const result = infiniteResult<FeedPage>(
    [{ items: [fromZoe, fromMax, fromLea], nextCursor: null, ...page }],
    options,
  )
  jest
    .mocked(useDiscoverFeed)
    .mockReturnValue(result as unknown as ReturnType<typeof useDiscoverFeed>)
  return result
}

const mockNews = (news: { count: number | null; more: boolean }) =>
  jest.mocked(useFeedNews).mockReturnValue(news)

beforeEach(() => {
  mockSession(null)
  mockPush.mockReset()
  jest.mocked(useFollowingFeed).mockReset()
  jest.mocked(useDiscoverFeed).mockReset()
  jest.mocked(useFeedNews).mockReset()
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  mockFollowing()
  mockDiscover()
  mockNews({ count: null, more: false })
})

/** Affiche l'accueil d'un membre connecté, Léa. */
const renderMemberHome = async () => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  await renderWithI18n(<HomeScreen />)
}

describe('HomeScreen', () => {
  it('welcomes the visitor in French by default', async () => {
    await renderWithI18n(<HomeScreen />)

    // Le logo sert de titre à la page : les lecteurs d'écran l'annoncent avec la phrase d'accueil.
    expect(screen.getByRole('header', { name: `Bienvenue sur ${appName}` })).toBeTruthy()
    expect(screen.getByText('Montre à tes proches ce que tu construis avec l’IA.')).toBeTruthy()
    expect(
      screen.getByText(
        'Les projets et les profils ne sont visibles que par les membres connectés.',
      ),
    ).toBeTruthy()
  })

  it('welcomes the visitor in English when that is their language', async () => {
    await renderWithI18n(<HomeScreen />, 'en')

    expect(screen.getByRole('header', { name: `Welcome to ${appName}` })).toBeTruthy()
  })

  it('lets the visitor switch language', async () => {
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(screen.getByRole('header', { name: `Welcome to ${appName}` })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'English', checked: true })).toBeTruthy()
  })

  it('loads no feed for a visitor', async () => {
    await renderWithI18n(<HomeScreen />)

    // Les fils sont réservés aux membres : pas même une demande sans session.
    expect(useFollowingFeed).not.toHaveBeenCalled()
    expect(useDiscoverFeed).not.toHaveBeenCalled()
  })

  it('invites a visitor to create an account or sign in', async () => {
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Créer un compte' }))
    await fireEvent.press(screen.getByRole('button', { name: 'J’ai déjà un compte' }))

    expect(mockPush).toHaveBeenNthCalledWith(1, '/sign-up')
    expect(mockPush).toHaveBeenNthCalledWith(2, '/sign-in')
  })

  it('greets a signed-in member by name and leads to the account page', async () => {
    mockSession({ user: { name: 'Léa' } })
    await renderWithI18n(<HomeScreen />)

    expect(screen.getByText('Bonjour Léa\u202f!')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Créer un compte' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Mon compte' }))
    expect(mockPush).toHaveBeenCalledWith('/account')
  })

  it('invites a signed-in member to publish a project', async () => {
    mockSession({ user: { name: 'Léa' } })
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Publier un projet' }))

    expect(mockPush).toHaveBeenCalledWith('/projects/new')
  })

  it('leads a signed-in member to her own projects', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Mes projets' }))

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u1' } })
  })
})

describe('the « following » feed on the home screen', () => {
  it('opens on « following », with the new projects of the people followed', async () => {
    await renderMemberHome()

    expect(screen.getByRole('radio', { name: 'Abonnements', checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Découvrir', checked: false })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    // Le filtre des testeurs n'appartient qu'à « Découvrir ».
    expect(screen.queryByRole('radio', { name: 'Cherchent des testeurs' })).toBeNull()
  })

  it('opens a project of the feed', async () => {
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('link', { name: 'Le tri des photos' }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: fromMax.project.id },
    })
  })

  it('invites a member who follows nobody to discover projects', async () => {
    mockFollowing({ items: [], followsAnyone: false })
    await renderMemberHome()

    expect(screen.getByText('Tu ne suis personne pour l’instant')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Découvrir des projets' }))

    expect(screen.getByRole('radio', { name: 'Découvrir', checked: true })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
  })

  it('says when the people followed have published nothing yet, and leads to « discover »', async () => {
    mockFollowing({ items: [], followsAnyone: true })
    await renderMemberHome()

    expect(
      screen.getByText('Rien de neuf pour l’instant chez les personnes que tu suis.'),
    ).toBeTruthy()
    expect(screen.queryByText('Tu ne suis personne pour l’instant')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Découvrir des projets' }))
    expect(screen.getByRole('radio', { name: 'Découvrir', checked: true })).toBeTruthy()
  })

  it('keeps the cards already read when the next page fails, and offers to retry', async () => {
    const following = mockFollowing({ nextCursor: 'abc' }, { hasNextPage: true })
    jest.mocked(useFollowingFeed).mockReturnValue({
      ...following,
      isError: true,
      isFetchNextPageError: true,
      error: new Error('internal'),
    } as unknown as ReturnType<typeof useFollowingFeed>)
    await renderMemberHome()

    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveTextContent('La suite du fil n’a pas pu se charger.')
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }))
    expect(following.fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('loads the next 20 on request', async () => {
    const following = mockFollowing({ nextCursor: 'abc' }, { hasNextPage: true })
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher la suite' }))

    expect(following.fetchNextPage).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Tu es à jour')).toBeNull()
  })

  it('shows that the next page is on its way', async () => {
    mockFollowing({ nextCursor: 'abc' }, { hasNextPage: true, isFetchingNextPage: true })
    await renderMemberHome()

    expect(screen.getByRole('button', { name: 'Afficher la suite' })).toBeBusy()
  })

  it('says the member is up to date at the very end, instead of scrolling forever', async () => {
    await renderMemberHome()

    expect(screen.getByText('Tu es à jour')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Afficher la suite' })).toBeNull()
  })

  it('still offers to publish and to reach one’s own projects', async () => {
    await renderMemberHome()

    expect(screen.getByRole('button', { name: 'Publier un projet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mes projets' })).toBeTruthy()
  })
})

describe('the news banner', () => {
  it('announces new items without moving the feed, and shows them when touched', async () => {
    mockNews({ count: 3, more: false })
    const following = mockFollowing()
    await renderMemberHome()

    const banner = screen.getByRole('button', { name: '3 nouveautés' })
    // Le fil ne bouge jamais tout seul : rien n'est relu avant que le membre touche le bandeau.
    expect(following.refetch).not.toHaveBeenCalled()
    await fireEvent.press(banner)

    expect(following.refetch).toHaveBeenCalledTimes(1)
  })

  it('speaks of one novelty in the singular', async () => {
    mockNews({ count: 1, more: false })
    await renderMemberHome()

    expect(screen.getByRole('button', { name: '1 nouveauté' })).toBeTruthy()
  })

  it('says « 20 or more » when a whole page of new items waits', async () => {
    mockNews({ count: 20, more: true })
    await renderMemberHome()

    expect(screen.getByRole('button', { name: '20 nouveautés ou plus' })).toBeTruthy()
  })

  it('stays hidden when there is nothing new', async () => {
    await renderMemberHome()

    // Le fil est bien là (sinon l'absence du bandeau ne prouverait rien)…
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    // … mais pas le bandeau.
    expect(screen.queryByRole('button', { name: /nouveaut/ })).toBeNull()
  })
})

describe('the « discover » feed on the home screen', () => {
  it('shows the public projects of every member', async () => {
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('radio', { name: 'Découvrir' }))

    expect(screen.getByRole('radio', { name: 'Découvrir', checked: true })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Tous', checked: true })).toBeTruthy()
    expect(useDiscoverFeed).toHaveBeenLastCalledWith(expect.objectContaining({ testers: false }))
  })

  it('keeps only the projects looking for testers once that filter is chosen', async () => {
    await renderMemberHome()
    await fireEvent.press(screen.getByRole('radio', { name: 'Découvrir' }))

    await fireEvent.press(screen.getByRole('radio', { name: 'Cherchent des testeurs' }))

    expect(
      screen.getByRole('radio', { name: 'Cherchent des testeurs', checked: true }),
    ).toBeTruthy()
    expect(useDiscoverFeed).toHaveBeenLastCalledWith(expect.objectContaining({ testers: true }))
  })

  it('says when no project is public yet', async () => {
    mockDiscover({ items: [] })
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('radio', { name: 'Découvrir' }))

    expect(screen.getByText('Aucun projet public pour l’instant.')).toBeTruthy()
  })

  it('says when no project is looking for testers', async () => {
    mockDiscover({ items: [] })
    await renderMemberHome()
    await fireEvent.press(screen.getByRole('radio', { name: 'Découvrir' }))

    await fireEvent.press(screen.getByRole('radio', { name: 'Cherchent des testeurs' }))

    expect(screen.getByText('Aucun projet ne cherche de testeurs pour l’instant.')).toBeTruthy()
  })

  it('also loads the next page on request', async () => {
    const discover = mockDiscover({ nextCursor: 'abc' }, { hasNextPage: true })
    await renderMemberHome()
    await fireEvent.press(screen.getByRole('radio', { name: 'Découvrir' }))

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher la suite' }))

    expect(discover.fetchNextPage).toHaveBeenCalledTimes(1)
  })
})

describe('the home screen of a member on a computer', () => {
  it('shows the feed and its choices, and still offers to publish', async () => {
    const restore = setDesktopWindow()
    try {
      await renderMemberHome()

      expect(screen.getByRole('radio', { name: 'Abonnements', checked: true })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
      expect(screen.getByText('Tu es à jour')).toBeTruthy()
      // Sur ordinateur, la barre du haut peut aussi proposer de publier : au moins un bouton.
      expect(screen.getAllByRole('button', { name: 'Publier un projet' }).length).toBeGreaterThan(0)
    } finally {
      restore()
    }
  })
})

// --- Tranche 4b : les notes des projets suivis dans « Abonnements » ---

/** Une note de Léa sur son agent de recettes, telle que le fil la donne. */
const noteOfLea: FeedItem = {
  kind: 'note',
  at: '2026-10-14T09:00:00.000Z',
  note: {
    id: '0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718',
    body: 'v2 : mode hors ligne',
    createdAt: '2026-10-14T09:00:00.000Z',
    removal: null,
  },
  project: summaryOf(recipesProject),
}

describe('notes in the « following » feed on the home screen', () => {
  it('shows the note of a followed project, named after its author and its project', async () => {
    mockFollowing({ items: [noteOfLea, fromMax] })
    await renderMemberHome()

    expect(screen.getByRole('link', { name: 'Note de Léa sur Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByText('v2 : mode hors ligne')).toBeTruthy()
    // Le projet qui suit dans le fil est toujours une carte de projet.
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
  })

  it('elides « de » before an author whose name starts with a vowel (« Note d’Inès »)', async () => {
    const ines = { id: 'u3', name: 'Inès', avatarUrl: null }
    mockFollowing({
      items: [{ ...noteOfLea, project: { ...noteOfLea.project, author: ines } }],
    })
    await renderMemberHome()

    expect(screen.getByRole('link', { name: 'Note d’Inès sur Mon agent de recettes' })).toBeTruthy()
  })

  it('opens the page of the project when the note is touched', async () => {
    mockFollowing({ items: [noteOfLea] })
    await renderMemberHome()

    await fireEvent.press(
      screen.getByRole('link', { name: 'Note de Léa sur Mon agent de recettes' }),
    )

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: recipesProject.id },
    })
  })

  it('shows a note and the new project it belongs to as two separate items', async () => {
    mockFollowing({ items: [noteOfLea, fromLea] })
    await renderMemberHome()

    expect(screen.getByRole('link', { name: 'Note de Léa sur Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
  })
})

// --- Tranche 6b : la cloche des notifications, à côté de « Mes projets » sur téléphone ---

describe('the notification bell on the home screen of a phone', () => {
  const { t } = createI18n('fr')

  it('says how many groups are new, next to « my projects »', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(1)
    await renderMemberHome()

    expect(screen.getByRole('button', { name: 'Mes projets' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: t('notifications.bellNew', { count: 1 }) }),
    ).toBeTruthy()
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy()
  })

  it('stops at « 9+ » beyond nine', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(10)
    await renderMemberHome()

    expect(
      screen.getByRole('button', { name: t('notifications.bellNewMany', { max: 9 }) }),
    ).toBeTruthy()
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
  })

  it('shows no badge when nothing is new', async () => {
    await renderMemberHome()

    expect(screen.getByRole('button', { name: t('notifications.bell') })).toBeTruthy()
    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it('opens the notifications', async () => {
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('button', { name: t('notifications.bell') }))

    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('is not offered to a visitor', async () => {
    await renderWithI18n(<HomeScreen />)

    // Témoin : l'accueil du visiteur est bien affiché.
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('notifications.bell') })).toBeNull()
  })
})
