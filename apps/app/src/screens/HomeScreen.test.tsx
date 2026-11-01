// Test de l'écran d'accueil avec Testing Library : on affiche l'écran en mémoire,
// puis on le manipule comme le ferait un utilisateur (lire un texte, appuyer sur un bouton).
// On cherche les éléments par ce que l'utilisateur voit (texte, rôle), pas par leur code interne.
import { appName, palettes } from '@ruche/brand'
import type {
  FeedItem,
  FeedPage,
  FollowingFeedPage,
  Me,
  Project,
  ProjectSummary,
  SuggestedMember,
} from '@ruche/contracts'
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { Linking, Platform, StyleSheet } from 'react-native'
import { useSession } from '../accounts/api'
import { useDiscoverFeed, useFeedNews, useFollowingFeed, useMarkFeedRead } from '../feed/api'
import { useFollow } from '../follows/api'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { useDismissSuggestion, useSuggestions } from '../suggestions/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { hrefOf, pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithI18n, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'

// Le choix de la langue enregistre la langue sur le compte : on remplace aussi ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Les deux fils, la recherche de nouveautés et la date de lecture du fil (R4) : de fausses
// réponses, choisies par chaque test.
jest.mock('../feed/api', () => ({
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
  useMarkFeedRead: jest.fn(),
}))
// R4 : « Proches à suivre » (premier lancement, colonne de droite sur ordinateur) et le bouton
// « Suivre » de chaque ligne.
jest.mock('../suggestions/api', () => ({
  useSuggestions: jest.fn(),
  useDismissSuggestion: jest.fn(),
}))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés : sur ordinateur, le titre
// « Fil » et le bouton des nouveautés à côté (`titleAside`) sont posés par `Screen` (R4).
const mockScreenProps: Record<string, unknown>[] = []
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
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
    [
      {
        items: [fromLea, fromMax],
        nextCursor: null,
        followsAnyone: true,
        lastReadAt: null,
        ...page,
      },
    ],
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

/**
 * Les nouveautés (R4, F-Fil4) : leur nombre, s'il y en a plus qu'une page, les photos de leurs
 * auteurs (trois au plus) et leurs sortes, qui choisissent le texte du bouton.
 */
type News = ReturnType<typeof useFeedNews>
const mockNews = (news: Pick<News, 'count'> & Partial<News>) =>
  jest.mocked(useFeedNews).mockReturnValue({ more: false, authors: [], kinds: [], ...news })

// --- R4 : les proches à suivre ---

/** L'auteur d'un projet tel que le contrat le donne (photo, nom), sans type exporté à part. */
type ProjectAuthor = ProjectSummary['author']

const nora: ProjectAuthor = {
  id: 'u4',
  name: 'Nora',
  avatarUrl: 'https://media.example.com/nora.jpg',
}
const sam: ProjectAuthor = { id: 'u5', name: 'Sam', avatarUrl: 'https://media.example.com/sam.jpg' }

/** Un membre suggéré, avec son dernier projet public. */
const suggested = (author: ProjectAuthor, projectId: string, title: string): SuggestedMember => ({
  ...author,
  latestProject: summaryOf({ ...recipesProject, id: projectId, author, title }),
})
const fiveSuggested: SuggestedMember[] = [
  suggested(nora, 'b1000000-0000-4000-8000-000000000001', 'Carnet de cafés'),
  suggested(sam, 'b1000000-0000-4000-8000-000000000002', 'Le quiz des capitales'),
  suggested(
    { id: 'u6', name: 'Hugo', avatarUrl: null },
    'b1000000-0000-4000-8000-000000000003',
    'Le planning du club',
  ),
  suggested(
    { id: 'u8', name: 'Jade', avatarUrl: null },
    'b1000000-0000-4000-8000-000000000004',
    'La météo du potager',
  ),
  suggested(
    { id: 'u10', name: 'Malo', avatarUrl: null },
    'b1000000-0000-4000-8000-000000000005',
    'Le lexique breton',
  ),
]

/** Ce que renvoie un useQuery réussi de React Query, ici pour la liste des proches à suivre. */
const mockSuggestions = (members: SuggestedMember[]) => {
  const result = {
    data: { members },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  }
  jest
    .mocked(useSuggestions)
    .mockReturnValue(result as unknown as ReturnType<typeof useSuggestions>)
  return result
}
const mockToggle = jest.fn()
const mockDismiss = jest.fn()

beforeEach(() => {
  mockSession(null)
  mockPush.mockReset()
  mockScreenProps.length = 0
  jest.mocked(useFollowingFeed).mockReset()
  jest.mocked(useDiscoverFeed).mockReset()
  jest.mocked(useFeedNews).mockReset()
  jest.mocked(useMarkFeedRead).mockReset()
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  // Tranche 7c : le profil, lu pour savoir si le compte est suspendu ; Léa ne l'est pas.
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockFollowing()
  mockDiscover()
  mockNews({ count: null })
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  mockDismiss.mockReset().mockResolvedValue({ ok: true, data: null })
  jest.mocked(useDismissSuggestion).mockReset().mockReturnValue({ dismiss: mockDismiss })
  jest.mocked(useSuggestions).mockReset()
  mockSuggestions(fiveSuggested)
})

/** Affiche l'accueil d'un membre connecté, Léa. */
const renderMemberHome = async () => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  return renderWithI18n(<HomeScreen />)
}

describe('HomeScreen', () => {
  it('welcomes the visitor in French by default', async () => {
    await renderWithI18n(<HomeScreen />)

    // Le logo sert de titre à la page : les lecteurs d'écran l'annoncent avec la phrase d'accueil.
    expect(screen.getByRole('header', { name: `Bienvenue sur ${appName}` })).toBeTruthy()
    expect(screen.getByText('Montre à tes proches ce que tu construis avec l’IA.')).toBeTruthy()
    // R2, décision D2 (jur-B4) : la phrase de confidentialité dit ce qui est vrai aujourd'hui,
    // moteurs de recherche compris ; R12 la remplacera quand le public existera.
    expect(
      screen.getByText('Rien n’est visible sans compte, ni trouvé par un moteur de recherche.'),
    ).toBeTruthy()
    expect(
      screen.queryByText(
        'Les projets et les profils ne sont visibles que par les membres connectés.',
      ),
    ).toBeNull()
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
    // R4 : ni date de lecture du fil, ni proches à suivre.
    expect(useMarkFeedRead).not.toHaveBeenCalled()
    expect(useSuggestions).not.toHaveBeenCalled()
  })

  it('invites a visitor to create an account or sign in', async () => {
    await renderWithI18n(<HomeScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Créer un compte' }))
    await fireEvent.press(screen.getByRole('button', { name: 'J’ai déjà un compte' }))

    expect(mockPush).toHaveBeenNthCalledWith(1, '/sign-up')
    expect(mockPush).toHaveBeenNthCalledWith(2, '/sign-in')
  })

  // R3 (F-Nav6, F-Nav8, F-Nav10) : le salut, la rangée de raccourcis (« Publier », « Mes projets »,
  // « Réglages ») et le choix « Abonnements / Découvrir » ont quitté l'accueil : la barre d'onglets
  // et la barre du haut les remplacent (TabBar.test.tsx, TopNav.test.tsx), Découvrir devient
  // l'onglet Explorer (ExploreScreen.test.tsx). Les anciens tests de ces raccourcis sont retirés.
})

describe('the « following » feed on the home screen', () => {
  it('shows the new projects of the people followed, without a feed choice (R3)', async () => {
    await renderMemberHome()

    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    // R3 : le Fil ne garde que les abonnements ; « Découvrir » et son filtre sont dans Explorer.
    expect(screen.queryByRole('radio', { name: 'Abonnements' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Découvrir' })).toBeNull()
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

  // R4 (F-Fil9, scénario validé le 31/10/2026) : un membre qui ne suit personne voit le premier
  // lancement et « Proches à suivre », plus le bouton vers Explorer de R3.
  it('welcomes a member who follows nobody with « Ton fil t’attend » and people to follow', async () => {
    mockFollowing({ items: [], followsAnyone: false })
    await renderMemberHome()

    expect(screen.getByText('Ton fil t’attend')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Proches à suivre' })).toBeTruthy()
    expect(screen.queryByText('Tu ne suis personne pour l’instant')).toBeNull()
  })

  // R4 (F-Fil5) : un fil vide et fini pose « Tu es à jour », dont le bouton secondaire mène à
  // Explorer (jur-J9) ; au premier passage, « Tu as tout vu. » (jur-J1).
  it('says when the people followed have published nothing yet, and leads to « explore »', async () => {
    mockFollowing({ items: [], followsAnyone: true })
    await renderMemberHome()

    expect(screen.getByRole('header', { name: 'Tu es à jour' })).toBeTruthy()
    expect(screen.getByText('Tu as tout vu.')).toBeTruthy()
    expect(screen.queryByText('Ton fil t’attend')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Explorer d’autres projets' }))
    expect(mockPush).toHaveBeenCalledWith('/explore')
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

  // Une seule action miel par écran : sur l'accueil, c'est « Publier un projet ». Le bouton est
  // trouvé par son rôle et son nom ; seule sa couleur de fond est lue, parce que c'est la règle.
  it('offers to retry a feed that could not load, without a second honey button', async () => {
    const following = mockFollowing()
    jest.mocked(useFollowingFeed).mockReturnValue({
      ...following,
      data: undefined,
      status: 'error',
      isSuccess: false,
      isError: true,
      error: new Error('internal'),
    } as unknown as ReturnType<typeof useFollowingFeed>)
    await renderMemberHome()

    // La règle (une seule action miel par écran), pas la couleur choisie pour « Réessayer » : au plus
    // un bouton au fond miel, et ce n'est pas lui. R3 : sur téléphone, l'action miel de l'écran
    // (« Publier ») est le « + » de la barre d'onglets, posée hors de HomeScreen ; l'écran lui-même
    // n'en a donc plus aucune (test adapté par la session, F-Nav : la barre d'onglets).
    const honey = (element: ReturnType<typeof screen.getByRole>) =>
      StyleSheet.flatten(element.props.style)?.backgroundColor === palettes.day.honey
    const retry = screen.getByRole('button', { name: 'Réessayer' })
    expect(honey(retry)).toBe(false)
    expect(screen.getAllByRole('button').filter(honey)).toHaveLength(0)
    await fireEvent.press(retry)
    expect(following.refetch).toHaveBeenCalledTimes(1)
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
})

describe('the news banner', () => {
  it('announces new items without moving the feed, and shows them when touched', async () => {
    // R4 : des projets et des notes à la fois, d'où « nouveautés ».
    mockNews({ count: 3, kinds: ['project', 'note'], authors: [nora] })
    const following = mockFollowing()
    await renderMemberHome()

    const banner = screen.getByRole('button', { name: '3 nouveautés' })
    // Le fil ne bouge jamais tout seul : rien n'est relu avant que le membre touche le bandeau.
    expect(following.refetch).not.toHaveBeenCalled()
    await fireEvent.press(banner)

    expect(following.refetch).toHaveBeenCalledTimes(1)
  })

  // R4 (F-Fil4) : une seule nouveauté est forcément d'une seule sorte (« 1 nouveauté » est devenu
  // « 1 nouveau projet », test adapté).
  it('speaks of one novelty in the singular', async () => {
    mockNews({ count: 1, kinds: ['project'], authors: [nora] })
    await renderMemberHome()

    expect(screen.getByRole('button', { name: '1 nouveau projet' })).toBeTruthy()
  })

  it('says « 20 or more » when a whole page of new items waits', async () => {
    mockNews({ count: 20, more: true, kinds: ['project', 'note'], authors: [nora, sam] })
    await renderMemberHome()

    expect(screen.getByRole('button', { name: '20 nouveautés ou plus' })).toBeTruthy()
  })

  it('stays hidden when there is nothing new', async () => {
    await renderMemberHome()

    // Le fil est bien là (sinon l'absence du bandeau ne prouverait rien)…
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    // … mais pas le bandeau (« nouveautés », « nouveaux projets », « nouvelles notes »).
    expect(screen.queryByRole('button', { name: /nouve/ })).toBeNull()
  })

  // R4 (F-Fil4) : le texte dit ce qui est arrivé ; les photos des auteurs sont dans le bouton,
  // décoratives (cachées au lecteur d'écran, le nom du bouton suffit).
  it('says « 2 nouveaux projets » when only projects arrived, with the photos of their authors', async () => {
    mockNews({ count: 2, kinds: ['project'], authors: [nora, sam] })
    await renderMemberHome()

    const banner = screen.getByRole('button', {
      name: fr.t(($) => $.feed.newProjects, { count: 2 }),
    })
    expect(within(banner).getByLabelText('Nora', { includeHiddenElements: true })).toBeTruthy()
    expect(within(banner).getByLabelText('Sam', { includeHiddenElements: true })).toBeTruthy()
  })

  it('says « 1 nouvelle note » when only a note arrived', async () => {
    mockNews({ count: 1, kinds: ['note'], authors: [nora] })
    await renderMemberHome()

    expect(
      screen.getByRole('button', { name: fr.t(($) => $.feed.newNotes, { count: 1 }) }),
    ).toBeTruthy()
  })

  it('says « 20 nouveaux projets ou plus » when a whole page of projects waits', async () => {
    mockNews({ count: 20, more: true, kinds: ['project'], authors: [nora, sam] })
    await renderMemberHome()

    expect(
      screen.getByRole('button', { name: fr.t(($) => $.feed.newProjectsMany, { max: 20 }) }),
    ).toBeTruthy()
  })
})

// R3 : le fil « Découvrir » (tous, testeurs, vide, page suivante) se teste dans
// ExploreScreen.test.tsx ; l'accueil ne le lit plus.
describe('the home screen of a member on a computer', () => {
  it('shows the feed, and still offers to publish', async () => {
    const restore = setDesktopWindow()
    try {
      await renderMemberHome()

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

// --- Tranche 6b : la cloche des notifications sur téléphone (R3 : à droite du logo, en haut du Fil) ---

describe('the notification bell on the home screen of a phone', () => {
  const { t } = createI18n('fr')

  it('says how many groups are new', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(1)
    await renderMemberHome()

    expect(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNew, { count: 1 }) }),
    ).toBeTruthy()
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy()
  })

  it('stops at « 9+ » beyond nine', async () => {
    jest.mocked(useUnreadCount).mockReturnValue(10)
    await renderMemberHome()

    expect(
      screen.getByRole('button', { name: t(($) => $.notifications.bellNewMany, { max: 9 }) }),
    ).toBeTruthy()
    expect(screen.getByText('9+', { includeHiddenElements: true })).toBeTruthy()
  })

  it('shows no badge when nothing is new', async () => {
    await renderMemberHome()

    expect(screen.getByRole('button', { name: t(($) => $.notifications.bell) })).toBeTruthy()
    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull()
  })

  it('opens the notifications', async () => {
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('button', { name: t(($) => $.notifications.bell) }))

    expect(mockPush).toHaveBeenCalledWith('/notifications')
  })

  it('is not offered to a visitor', async () => {
    await renderWithI18n(<HomeScreen />)

    // Témoin : l'accueil du visiteur est bien affiché.
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: t(($) => $.notifications.bell) })).toBeNull()
  })
})

// --- Tranche 7c : un compte suspendu (docs/scenarios/phase-1.md, « Un compte suspendu ») ---
//
// Le profil (GET /v1/me) dit si le compte est suspendu (`Me.suspension`). L'accueil d'un membre
// suspendu montre le bandeau, en haut, et ne propose plus « Publier » ; le reste de l'accueil (son
// fil, ses projets) reste lisible.
describe('the home screen of a suspended member', () => {
  const banner = () => screen.findByText(containing(fr.t(($) => $.suspension.title)))

  it('shows the suspension banner at the top of the page', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderMemberHome()

    expect(await banner()).toBeTruthy()
  })

  it('offers no « Publier » on a phone, but keeps the feed and her projects', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderMemberHome()

    await banner()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.home.publish) })).toBeNull()
    // Témoin : il lit tout ce qu'il lisait avant (R3 : « Publier » est le « + » de la barre
    // d'onglets, masqué pour lui ; TabBar.test.tsx).
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
  })

  it('offers no « Publier » on a computer either', async () => {
    const restore = setDesktopWindow()
    try {
      jest.mocked(getMe).mockResolvedValue(suspendedMe)
      await renderMemberHome()

      await banner()
      expect(screen.queryAllByRole('button', { name: fr.t(($) => $.home.publish) })).toHaveLength(0)
      expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    } finally {
      restore()
    }
  })

  // R3 : sur téléphone, « Publier » est le « + » de la barre d'onglets (TabBar.test.tsx) ; sur
  // ordinateur, la barre du haut le propose encore.
  it('still offers to publish to a member who is not suspended, on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      jest.mocked(getMe).mockResolvedValue(leaMe)
      await renderMemberHome()

      await act(async () => {})
      expect(screen.getByRole('button', { name: fr.t(($) => $.home.publish) })).toBeTruthy()
      expect(screen.queryByText(containing(fr.t(($) => $.suspension.title)))).toBeNull()
    } finally {
      restore()
    }
  })
})

// --- Tranche R2 : l'accueil d'un visiteur, redessiné ---
// Ce que Jest ne mesure pas : la feuille claire (430 de large sur ordinateur) et le second bouton
// en verre sont des styles, l'affaire des captures et de la relecture de design.

describe('the visitor home after the redesign (R2)', () => {
  it('offers « Créer un compte » first, then « J’ai déjà un compte », in that order', async () => {
    await renderWithI18n(<HomeScreen />)

    const buttons = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel)
    const create = buttons.indexOf(fr.t(($) => $.home.signUp))
    const signIn = buttons.indexOf(fr.t(($) => $.home.haveAccount))
    expect(create).toBeGreaterThanOrEqual(0)
    expect(signIn).toBe(create + 1)
  })

  it('says the privacy sentence of decision D2, in English too', async () => {
    await renderWithI18n(<HomeScreen />, 'en')

    expect(screen.getByText(createI18n('en').t(($) => $.home.membersOnly))).toBeTruthy()
  })

  it('announces « Voir le code » as a link to an external site', async () => {
    await renderWithI18n(<HomeScreen />)

    const link = screen.getByRole('link', { name: containing(fr.t(($) => $.home.seeCode)) })
    const external = fr.t(($) => $.common.externalSite)
    const props = link.props as Record<string, unknown>
    expect(
      [props.accessibilityHint, props['aria-description'], props.accessibilityLabel].some(
        (value) => typeof value === 'string' && value.includes(external),
      ),
    ).toBe(true)
  })

  it('shows the same welcome, both buttons and the language choice on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      await renderWithI18n(<HomeScreen />)

      expect(screen.getByRole('header', { name: `Bienvenue sur ${appName}` })).toBeTruthy()
      expect(screen.getByRole('button', { name: fr.t(($) => $.home.signUp) })).toBeTruthy()
      expect(screen.getByRole('button', { name: fr.t(($) => $.home.haveAccount) })).toBeTruthy()
      expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
      expect(screen.getByText(fr.t(($) => $.home.membersOnly))).toBeTruthy()
    } finally {
      restore()
    }
  })
})

describe('the home screen when the session cannot be read', () => {
  // Relecture de l'interface (PR #62) : un 429 ou une panne de la lecture de session montrait
  // l'accueil des visiteurs (« Créer un compte », « J'ai déjà un compte ») à un membre connecté.
  const failSessionRead = () => {
    const refetch = jest.fn().mockResolvedValue(undefined)
    jest.mocked(useSession).mockReturnValue({
      data: null,
      isPending: false,
      error: { status: 429, statusText: 'Too Many Requests' },
      refetch,
    } as unknown as ReturnType<typeof useSession>)
    return refetch
  }

  it('offers to retry, not to sign in or sign up', async () => {
    const refetch = failSessionRead()
    await renderWithI18n(<HomeScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.states.errorTitle) })).toBeTruthy()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.home.haveAccount) })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.home.signUp) })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('has no « Retour » button, which would lead back to this same page', async () => {
    failSessionRead()
    await renderWithI18n(<HomeScreen />)

    expect(screen.queryByRole('button', { name: fr.t(($) => $.states.back) })).toBeNull()
  })

  it('still shows the visitor home while the session is being read (the pre-rendered page)', async () => {
    mockSession(null, true)
    await renderWithI18n(<HomeScreen />)

    expect(screen.getByRole('button', { name: fr.t(($) => $.home.signUp) })).toBeTruthy()
  })
})

// --- Tranche R3 : le haut du Fil sur téléphone (docs/scenarios/refonte.md, « Le Fil ») ---
//
// Le logo remplace « Bonjour Léa ! », la cloche est à sa droite (F-Nav10) ; les raccourcis
// (« Publier un projet », « Mes projets », « Réglages ») ont quitté l'accueil : la barre d'onglets
// les remplace (« + » et « Moi », TabBar.test.tsx).
describe('the top of the feed on a phone (R3)', () => {
  it('shows the logo instead of « Bonjour Léa ! », and the bell', async () => {
    await renderMemberHome()

    // Témoin : le fil est là.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('img', { name: fr.t(($) => $.brand.logoAlt) })).toBeTruthy()
    // La clé de « Bonjour Léa ! » est retirée : le texte est écrit ici.
    expect(screen.queryByText(containing('Bonjour Léa'))).toBeNull()
    expect(screen.getByRole('button', { name: fr.t(($) => $.notifications.bell) })).toBeTruthy()
  })

  it('offers no shortcut any more: neither « Publier un projet », « Mes projets » nor « Réglages »', async () => {
    await renderMemberHome()
    await act(async () => {})

    // Témoin : le fil est là, et la cloche aussi.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: fr.t(($) => $.notifications.bell) })).toBeTruthy()
    for (const name of [
      fr.t(($) => $.home.publish),
      // Les clés de ces trois raccourcis sont retirées : leurs textes sont écrits ici.
      'Publier',
      'Mes projets',
      'Réglages',
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
      expect(screen.queryByRole('link', { name })).toBeNull()
    }
  })
})

// Relecture R3 (31/10/2026) : sur téléphone, le logo remplace le titre, et la page n'avait plus
// aucun titre de niveau 1 ; un lecteur d'écran ne savait pas où il était. Le titre « Fil » reste
// lu, caché à l'œil. Sur ordinateur, il est affiché : un seul titre de niveau 1 dans les deux cas.
//
// Le niveau ne se lit que sur le web (`aria-level`, posé par `Text heading`), où ce fichier ne fixe
// pas la langue (expo-localization y donne l'anglais au premier écran) : les tests du web comptent
// les titres de niveau 1, ceux du téléphone lisent le nom, en français.
describe('the page heading of the feed (R3 review)', () => {
  /** Les titres de niveau 1 de la page, sur le web. */
  const levelOneHeadings = () =>
    screen.queryAllByRole('header').filter((heading) => heading.props['aria-level'] === 1)

  it('keeps a heading named « Fil » on a phone, where the logo stands in for it', async () => {
    // R4 : « Tu es à jour » porte un titre de niveau 2 ; un fil qui continue, au premier passage,
    // n'en a pas (test adapté : il ne compte que le titre de la page).
    mockFollowing({ nextCursor: 'abc' }, { hasNextPage: true })
    await renderMemberHome()

    // Témoin : le fil et le logo sont là.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('img', { name: fr.t(($) => $.brand.logoAlt) })).toBeTruthy()
    // Le seul titre de la page : « Fil » (le fil lui-même n'en porte pas).
    const headings = screen.getAllByRole('header')
    expect(headings).toHaveLength(1)
    expect(screen.getByRole('header', { name: fr.t(($) => $.nav.feed) })).toBeTruthy()
  })

  it('makes it the one level-1 heading of the phone page on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderMemberHome()

      // Témoin : le fil est là.
      expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
      expect(levelOneHeadings()).toHaveLength(1)
    } finally {
      jest.restoreAllMocks()
    }
  })

  it('keeps a single level-1 heading « Fil » on a computer, shown there', async () => {
    const restore = setDesktopWindow()
    try {
      await renderMemberHome()

      expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
      expect(screen.getByRole('header', { name: fr.t(($) => $.nav.feed) })).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('makes it the one level-1 heading of the computer page on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const restore = setDesktopWindow()
    try {
      await renderMemberHome()

      expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
      expect(levelOneHeadings()).toHaveLength(1)
    } finally {
      restore()
      jest.restoreAllMocks()
    }
  })
})

// --- Tranche R4 : le fil et les cartes (docs/scenarios/refonte.md, R4) ---

/** Le texte tel que l'écran le montre : les espaces insécables de fr.ts lus comme des espaces. */
const shown = (text: string) => text.replace(/\s+/g, ' ')

/** Une date d'octobre 2026, à midi. */
const october = (day: string) => `2026-10-${day}T12:00:00.000Z`

/** Un nouveau projet du fil, devenu public à cette date, avec ou sans lien de démo. */
const projectItem = (
  id: string,
  title: string,
  author: ProjectAuthor,
  at: string,
  demoUrl: string | null = null,
): FeedItem => ({
  kind: 'project',
  at,
  project: summaryOf({ ...recipesProject, id, title, author, demoUrl, createdAt: at }),
})

// Quatre projets, du plus récent au plus ancien. La dernière lecture du fil date du 15 octobre à
// midi : le tri des photos, publié à cette heure exacte, est le premier élément déjà vu (`at ≤
// lastReadAt`).
const LAST_READ = october('15')
const cafes = projectItem(
  'c1000000-0000-4000-8000-000000000001',
  'Carnet de cafés',
  nora,
  october('20'),
)
const quiz = projectItem(
  'c1000000-0000-4000-8000-000000000002',
  'Le quiz des capitales',
  sam,
  october('18'),
)
const photos = projectItem(
  'c1000000-0000-4000-8000-000000000003',
  'Le tri des photos',
  { id: 'u2', name: 'Max', avatarUrl: null },
  LAST_READ,
)
const garden = projectItem(
  'c1000000-0000-4000-8000-000000000004',
  'Le carnet de jardin',
  { id: 'u3', name: 'Zoé', avatarUrl: null },
  october('10'),
)

/** Plusieurs pages du fil déjà reçues (« Afficher la suite » touché). */
const mockFollowingPages = (
  pages: Partial<FollowingFeedPage>[],
  options?: { hasNextPage?: boolean },
) => {
  const result = infiniteResult<FollowingFeedPage>(
    pages.map((page) => ({
      items: [],
      nextCursor: null,
      followsAnyone: true,
      lastReadAt: null,
      ...page,
    })),
    options,
  )
  jest
    .mocked(useFollowingFeed)
    .mockReturnValue(result as unknown as ReturnType<typeof useFollowingFeed>)
  return result
}

/** Le titre de la sphère « Tu es à jour ». */
const upToDate = () => screen.getByRole('header', { name: fr.t(($) => $.feed.upToDate.title) })
const queryUpToDate = () =>
  screen.queryByRole('header', { name: fr.t(($) => $.feed.upToDate.title) })
/** Le lien d'une carte du fil, nommé par le titre du projet. */
const card = (title: string) => screen.getByRole('link', { name: title })
/**
 * La liste qui contient cette carte, en remontant depuis son lien. `getByRole('list')` ne trouve
 * qu'un conteneur `accessible`, que la charte interdit (VoiceOver n'atteindrait plus les cartes).
 */
type Element = ReturnType<typeof screen.getByRole>
const listAround = (start: Element): Element | null => {
  let node: Element | null = start
  while (node && node.props.accessibilityRole !== 'list' && node.props.role !== 'list') {
    node = node.parent
  }
  return node
}

// L'ordre de lecture : l'arbre rendu, parcouru de haut en bas (RNTL 14 n'a plus `findAll`).
type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const nodesInOrder = (): Node[] => {
  const nodes: Node[] = []
  const walk = (node: Node) => {
    nodes.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as Node)
  return nodes
}
/** Vrai si `first` vient avant `second` dans la page (les deux doivent y être). */
const comesBefore = (first: unknown, second: unknown) => {
  const nodes = nodesInOrder()
  const a = nodes.indexOf(first as Node)
  const b = nodes.indexOf(second as Node)
  expect(a).toBeGreaterThanOrEqual(0)
  expect(b).toBeGreaterThanOrEqual(0)
  return a < b
}

// F-Fil5 et relecture de l'interface (ui-B6) : la sphère se pose avant le premier élément déjà vu
// de la première page, et coupe le fil en deux listes.
describe('« Tu es à jour » in the feed (R4, F-Fil5)', () => {
  it('stands before the first item already seen, and splits the feed in two lists around it', async () => {
    mockFollowing({ items: [cafes, quiz, photos, garden], lastReadAt: LAST_READ })
    await renderMemberHome()

    expect(comesBefore(card('Le quiz des capitales'), upToDate())).toBe(true)
    expect(comesBefore(upToDate(), card('Le tri des photos'))).toBe(true)
    // Deux grilles, chacune une liste complète (jamais la sphère au milieu d'une liste).
    const newer = listAround(card('Carnet de cafés')) as Element
    const seen = listAround(card('Le tri des photos')) as Element
    expect(newer).toBeTruthy()
    expect(seen).toBeTruthy()
    expect(newer).not.toBe(seen)
    expect(within(newer).getByRole('link', { name: 'Carnet de cafés' })).toBeTruthy()
    expect(within(newer).queryByRole('link', { name: 'Le tri des photos' })).toBeNull()
    expect(within(seen).getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(within(seen).getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
    expect(screen.getByText(shown(fr.t(($) => $.feed.upToDate.body)))).toBeTruthy()
  })

  it('stands at the top when nothing arrived since the last visit, with no empty list before it', async () => {
    mockFollowing({ items: [cafes, quiz], lastReadAt: october('21') })
    await renderMemberHome()

    expect(comesBefore(upToDate(), card('Carnet de cafés'))).toBe(true)
    const list = listAround(card('Carnet de cafés'))
    expect(list).toBeTruthy()
    expect(listAround(card('Le quiz des capitales'))).toBe(list)
    // La grille d'avant, vide, ne dit pas « rien de neuf » (ui-B6).
    expect(screen.queryByText(shown(fr.t(($) => $.feed.quiet)))).toBeNull()
  })

  it('stands at the very end when the feed ends with nothing already seen, said once', async () => {
    mockFollowing({ items: [cafes, quiz], lastReadAt: october('01') })
    await renderMemberHome()

    expect(comesBefore(card('Le quiz des capitales'), upToDate())).toBe(true)
    expect(screen.getAllByText(fr.t(($) => $.feed.upToDate.title))).toHaveLength(1)
    expect(screen.getByText(shown(fr.t(($) => $.feed.upToDate.body)))).toBeTruthy()
  })

  it('says only « Tu as tout vu. » at the end of a first visit (jur-J1)', async () => {
    // Le fil de départ : Léa et Max, jamais lu (lastReadAt null), sans suite.
    await renderMemberHome()

    expect(comesBefore(card('Le tri des photos'), upToDate())).toBe(true)
    expect(screen.getByText(shown(fr.t(($) => $.feed.upToDate.bodyFirst)))).toBeTruthy()
    expect(screen.queryByText(containing('dernière visite'))).toBeNull()
  })

  it('is nowhere on a first visit whose feed goes on', async () => {
    mockFollowing(
      { items: [cafes, quiz], nextCursor: 'abc', lastReadAt: null },
      { hasNextPage: true },
    )
    await renderMemberHome()

    // Témoin : le fil et sa suite sont là.
    expect(card('Carnet de cafés')).toBeTruthy()
    expect(screen.getByRole('button', { name: fr.t(($) => $.feed.more) })).toBeTruthy()
    expect(queryUpToDate()).toBeNull()
  })

  it('waits for the next page when every item shown is newer than the last visit', async () => {
    mockFollowing(
      { items: [cafes, quiz], nextCursor: 'abc', lastReadAt: LAST_READ },
      { hasNextPage: true },
    )
    await renderMemberHome()

    expect(card('Le quiz des capitales')).toBeTruthy()
    expect(queryUpToDate()).toBeNull()
  })

  it('reads the date of the last visit from the first page only', async () => {
    // La seconde page arrive après l'écriture de la nouvelle date (PUT /v1/feed/read) : elle porte
    // le 19 octobre, qui placerait la sphère avant le quiz. Seule compte celle de la première page.
    mockFollowingPages([
      { items: [cafes, quiz], nextCursor: 'abc', lastReadAt: LAST_READ },
      { items: [photos, garden], lastReadAt: october('19') },
    ])
    await renderMemberHome()

    expect(comesBefore(card('Le quiz des capitales'), upToDate())).toBe(true)
    expect(comesBefore(upToDate(), card('Le tri des photos'))).toBe(true)
  })

  it('keeps its place for the whole visit, even when the feed is read again', async () => {
    mockFollowing({ items: [cafes, quiz, photos, garden], lastReadAt: LAST_READ })
    const { rerender } = await renderMemberHome()
    expect(comesBefore(upToDate(), card('Le tri des photos'))).toBe(true)

    // Le fil est relu (le bouton des nouveautés) : sa première page porte désormais la date écrite
    // à l'ouverture, celle du carnet de cafés. La sphère ne bouge pas pendant la visite.
    mockFollowing({ items: [cafes, quiz, photos, garden], lastReadAt: cafes.at })
    await rerender(<HomeScreen />)

    expect(comesBefore(card('Le quiz des capitales'), upToDate())).toBe(true)
    expect(comesBefore(upToDate(), card('Le tri des photos'))).toBe(true)
  })

  it('gives « Tu es à jour » a level 2 heading on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      mockFollowing({ items: [cafes, quiz, photos, garden], lastReadAt: LAST_READ })
      await renderMemberHome()

      // Sur le web, la langue de l'écran suit le navigateur : le titre est cherché dans les deux.
      const titles = [fr, createI18n('en')].map((i18n) => i18n.t(($) => $.feed.upToDate.title))
      // `within(heading)` ne regarde que les descendants du titre, pas le titre lui-même : on
      // cherche donc le titre par son nom.
      const sphere = titles.flatMap((title) => screen.queryAllByRole('header', { name: title }))
      expect(sphere).toHaveLength(1)
      expect(sphere[0]?.props['aria-level']).toBe(2)
    } finally {
      jest.restoreAllMocks()
    }
  })
})

// R4 (F-Fil5) : l'appli retient la date de la dernière lecture du fil (PUT /v1/feed/read, par
// `useMarkFeedRead`), jusqu'au premier élément de la première page.
describe('marking the feed read (R4)', () => {
  it('marks the feed read up to the first item of the first page, never a later one', async () => {
    mockFollowingPages([
      { items: [cafes, quiz], nextCursor: 'abc', lastReadAt: LAST_READ },
      { items: [photos, garden], lastReadAt: LAST_READ },
    ])
    await renderMemberHome()

    expect(useMarkFeedRead).toHaveBeenCalledWith(cafes)
    // À chaque rendu, le même premier élément (ou rien, tant que le fil se charge).
    for (const [first] of jest.mocked(useMarkFeedRead).mock.calls) {
      expect([undefined, cafes]).toContain(first)
    }
  })

  // Relecture juridique (jur-J6) : le fil s'arrête ; la suite n'arrive que sur un geste.
  it('loads no further page until « Afficher la suite » is touched, even scrolled to the end', async () => {
    const following = mockFollowing(
      { items: [cafes, quiz, photos, garden], nextCursor: 'abc', lastReadAt: LAST_READ },
      { hasNextPage: true },
    )
    await renderMemberHome()

    // Témoin : la sphère est posée et la suite est proposée.
    expect(upToDate()).toBeTruthy()
    const more = screen.getByRole('button', { name: fr.t(($) => $.feed.more) })
    // Défiler jusqu'au bout : chaque vue qui écoute le défilement le reçoit (une liste qui charge
    // seule sa suite, `onEndReached` compris, passe par là). Aucune n'écoute ? Rien ne peut alors
    // charger en défilant.
    const scrollables = nodesInOrder().filter((node) => typeof node.props.onScroll === 'function')
    for (const node of scrollables) {
      await fireEvent.scroll(node as unknown as Parameters<typeof fireEvent.scroll>[0], {
        nativeEvent: {
          contentOffset: { x: 0, y: 4000 },
          contentSize: { width: 390, height: 4800 },
          layoutMeasurement: { width: 390, height: 844 },
        },
      })
    }
    await act(async () => {})
    expect(following.fetchNextPage).not.toHaveBeenCalled()

    await fireEvent.press(more)
    expect(following.fetchNextPage).toHaveBeenCalledTimes(1)
  })
})

// Relecture de sécurité (sec-A7) : « Tester » d'une carte part par la page d'avertissement des liens
// externes, comme dans Explorer.
describe('« Tester » on a card of the feed (R4, F-Fil2)', () => {
  it('sends « Tester » through the /out warning page, never straight to the demo', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    try {
      mockFollowing({
        items: [
          projectItem(
            'd1000000-0000-4000-8000-000000000001',
            'Carnet de cafés',
            nora,
            october('20'),
            'https://cafes.example.com',
          ),
          quiz,
        ],
      })
      await renderMemberHome()

      // Le quiz n'a pas de démo : un seul « Tester ».
      const testers = screen.getAllByRole('link', { name: /^Tester/ })
      expect(testers).toHaveLength(1)
      await fireEvent.press(testers[0] as ReturnType<typeof screen.getByRole>)

      const hrefs = mockPush.mock.calls.map(([href]) => hrefOf(href))
      expect(hrefs).toContain('/out?url=https://cafes.example.com')
      expect(hrefs).not.toContain('https://cafes.example.com')
      expect(openURL).not.toHaveBeenCalled()
    } finally {
      openURL.mockRestore()
    }
  })
})

// R4 (F-Fil9, F-Fil10, planche R4-Fil-Premier) : un membre qui ne suit encore personne.
describe('the first run of a member who follows nobody (R4)', () => {
  const inesMe: Me = { ...leaMe, id: 'u7', name: 'Inès', handle: 'ines' }
  const suspendedInes: Me = { ...suspendedMe, id: 'u7', name: 'Inès', handle: 'ines' }
  const renderFirstRun = async (me: Me = inesMe) => {
    mockFollowing({ items: [], followsAnyone: false })
    jest.mocked(getMe).mockResolvedValue(me)
    mockSession({ user: { id: me.id, name: me.name } })
    return renderWithI18n(<HomeScreen />)
  }
  const dismissOf = (name: string) => fr.t(($) => $.suggestions.dismiss, { name })
  const suspensionBanner = () => screen.findByText(containing(fr.t(($) => $.suspension.title)))

  it('greets the member by name, says the feed is waiting, and explains', async () => {
    await renderFirstRun()

    expect(
      screen.getByText(shown(fr.t(($) => $.feed.firstRun.hello, { name: 'Inès' }))),
    ).toBeTruthy()
    expect(screen.getByText(shown(fr.t(($) => $.feed.firstRun.title)))).toBeTruthy()
    expect(screen.getByText(shown(fr.t(($) => $.feed.firstRun.body)))).toBeTruthy()
    expect(screen.getByText(shown(fr.t(($) => $.suggestions.caption)))).toBeTruthy()
  })

  it('lists the five people to follow, each with « Suivre » and its « × »', async () => {
    await renderFirstRun()

    expect(screen.getAllByRole('button', { name: /^Ne plus suggérer/ })).toHaveLength(5)
    expect(screen.getAllByRole('switch', { name: /^Suivre/ })).toHaveLength(5)
    expect(screen.getByRole('button', { name: dismissOf('Malo') })).toBeTruthy()
  })

  it('follows a member from the list and keeps the row in place', async () => {
    const suggestions = mockSuggestions(fiveSuggested)
    await renderFirstRun()

    await fireEvent.press(screen.getAllByRole('switch', { name: /^Suivre/ })[0] as never)

    expect(useFollow).toHaveBeenCalledWith({ kind: 'member', id: nora.id })
    expect(mockToggle).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('switch', { name: /^Tu suis/ })).toBeTruthy()
    // La ligne de Nora reste là, et la liste n'est pas relue (elle bougerait sous le doigt).
    expect(screen.getByRole('button', { name: dismissOf('Nora') })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Ne plus suggérer/ })).toHaveLength(5)
    expect(suggestions.refetch).not.toHaveBeenCalled()
  })

  // Décision de Louis du 31/10/2026 (jur-J8) : « Annuler » pendant 5 secondes ; l'écart n'est
  // envoyé qu'à la fin du délai, ou au départ de la page.
  it('removes a dismissed row at once, and sends the dismissal when the page is left', async () => {
    const { unmount } = await renderFirstRun()

    await fireEvent.press(screen.getByRole('button', { name: dismissOf('Nora') }))

    expect(screen.queryByRole('button', { name: dismissOf('Nora') })).toBeNull()
    expect(screen.getByRole('button', { name: dismissOf('Sam') })).toBeTruthy()
    expect(mockDismiss).not.toHaveBeenCalled()
    await unmount()
    expect(mockDismiss).toHaveBeenCalledTimes(1)
    expect(mockDismiss).toHaveBeenCalledWith(nora.id)
  })

  // Décision de Louis du 31/10/2026 : le nom ou la photo ouvre la page du membre, la vignette ouvre
  // le projet. Deux rendus : la garde de double tape de la liste (600 ms, ui-B7) bloquerait une
  // seconde tape faite aussitôt après la première.
  it('opens the page of a suggested member', async () => {
    await renderFirstRun()

    const nameOf =
      screen.queryByRole('link', { name: 'Nora' }) ?? screen.getByRole('button', { name: 'Nora' })
    await fireEvent.press(nameOf)

    const paths = mockPush.mock.calls.map(([href]) => pathOf(href))
    expect(paths).toContain(`/members/${nora.id}`)
  })

  it('opens the latest project of a suggested member', async () => {
    await renderFirstRun()

    await fireEvent.press(screen.getByRole('link', { name: 'Carnet de cafés' }))

    const paths = mockPush.mock.calls.map(([href]) => pathOf(href))
    expect(paths).toContain(`/projects/${fiveSuggested[0]?.latestProject.id}`)
  })

  it('offers « Publier » under the list, which opens a new project', async () => {
    await renderFirstRun()

    expect(screen.getByText(shown(fr.t(($) => $.publishPrompt.title)))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.publishPrompt.action) }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toContain('/projects/new')
  })

  it('hides « Publier » from a suspended member', async () => {
    await renderFirstRun(suspendedInes)

    await suspensionBanner()
    // Témoin : le premier lancement est là.
    expect(screen.getByText(shown(fr.t(($) => $.feed.firstRun.title)))).toBeTruthy()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.publishPrompt.action) })).toBeNull()
  })

  // Relecture de l'interface : comme dans Explorer, « Suivre » reste à sa place, inactif.
  it('keeps « Suivre » in place but disabled for a suspended member', async () => {
    await renderFirstRun(suspendedInes)

    await suspensionBanner()
    const follows = screen.getAllByRole('switch', { name: /^Suivre/ })
    expect(follows).toHaveLength(5)
    for (const button of follows) expect(button).toBeDisabled()
  })
})

// R4 (F-Fil11, F-Fil12, F-Fil14, planche R4-Fil-Desktop) : la colonne de droite et le titre.
describe('the feed on a computer (R4)', () => {
  /** Un test sur ordinateur, la fenêtre de téléphone remise à la fin. */
  const onComputer = async (test: () => Promise<void>) => {
    const restore = setDesktopWindow()
    try {
      await test()
    } finally {
      restore()
    }
  }
  const voyage = projectItem(
    'e1000000-0000-4000-8000-000000000001',
    'Le carnet de voyage',
    sam,
    october('17'),
    'https://voyage.example.com',
  )

  it('shows three people to follow and the projects looking for testers in a right column', () =>
    onComputer(async () => {
      mockFollowing({ items: [garden] })
      mockDiscover({ items: [voyage] })
      await renderMemberHome()

      expect(card('Le carnet de jardin')).toBeTruthy()
      expect(
        screen.getByRole('header', { name: fr.t(($) => $.feed.side.suggestions) }),
      ).toBeTruthy()
      expect(screen.getAllByRole('button', { name: /^Ne plus suggérer/ })).toHaveLength(3)
      expect(screen.getByRole('header', { name: fr.t(($) => $.feed.side.testers) })).toBeTruthy()
      expect(useDiscoverFeed).toHaveBeenCalledWith({ testers: true })
      expect(screen.getAllByText('Le carnet de voyage').length).toBeGreaterThan(0)
    }))

  it('opens a demo of the right column through the /out warning page (sec-A7)', () =>
    onComputer(async () => {
      // Le fil n'a pas de démo : le seul « Tester » est celui de la colonne.
      mockFollowing({ items: [garden] })
      mockDiscover({ items: [voyage] })
      await renderMemberHome()

      const testers = screen.getAllByRole('link', { name: /^Tester/ })
      expect(testers).toHaveLength(1)
      await fireEvent.press(testers[0] as ReturnType<typeof screen.getByRole>)
      const hrefs = mockPush.mock.calls.map(([href]) => hrefOf(href))
      expect(hrefs).toContain('/out?url=https://voyage.example.com')
      expect(hrefs).not.toContain('https://voyage.example.com')
    }))

  it('has no right column on a phone', async () => {
    mockDiscover({ items: [voyage] })
    await renderMemberHome()

    // Témoin : le fil est là.
    expect(card('Mon agent de recettes')).toBeTruthy()
    expect(screen.queryByRole('header', { name: fr.t(($) => $.feed.side.testers) })).toBeNull()
    expect(screen.queryByRole('header', { name: fr.t(($) => $.feed.side.suggestions) })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Ne plus suggérer/ })).toBeNull()
  })

  it('titles the page « Fil » through Screen, with the news button beside it, once', () =>
    onComputer(async () => {
      mockNews({ count: 2, kinds: ['project'], authors: [nora, sam] })
      await renderMemberHome()

      const props = mockScreenProps[mockScreenProps.length - 1]
      expect(props?.title).toBe(fr.t(($) => $.feed.title))
      expect(props?.titleAside).toBeTruthy()
      expect(
        screen.getAllByRole('button', { name: fr.t(($) => $.feed.newProjects, { count: 2 }) }),
      ).toHaveLength(1)
    }))
})
