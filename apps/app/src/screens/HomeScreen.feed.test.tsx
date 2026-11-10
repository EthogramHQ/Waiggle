// Tests de l'écran d'accueil (HomeScreen) : le fil « Abonnements » d'un membre (cartes, fil
// vide, page suivante, erreurs) et, depuis R7a, les projets qui y remontent par leur mise à jour
// (« Mis à jour · v1.2 », la première ligne de « Ce qui a changé »), à la place des notes de 4b.
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import { palettes } from '@ruche/brand'
import type { FeedItem } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { useFollowingFeed } from '../feed/api'
import { recipesProject, summaryOf } from '../testing/projects'
import {
  fromLea,
  fromMax,
  mockFollowing,
  mockPush,
  mockScreenProps,
  renderMemberHome,
  resetHomeMocks,
} from './HomeScreen.testkit'

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
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}))

beforeEach(resetHomeMocks)

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
  // Explorer (jur-J9) ; depuis RF (T1), le titre seul, sans « Tu as tout vu. ».
  it('says when the people followed have published nothing yet, and leads to « explore »', async () => {
    mockFollowing({ items: [], followsAnyone: true })
    await renderMemberHome()

    expect(screen.getByRole('header', { name: 'Tu es à jour' })).toBeTruthy()
    expect(screen.queryByText(/Tu as tout vu/)).toBeNull()
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

// R3 : le fil « Découvrir » (tous, testeurs, vide, page suivante) se teste dans
// ExploreScreen.test.tsx ; l'accueil ne le lit plus.

// --- R7a : un projet suivi remonte dans « Abonnements » par sa mise à jour ---
// (La petite carte « Note de Léa sur … » de la tranche 4b a disparu avec le Journal.)

/** « Le décompte de la fusée », la mise à jour de Léa sur son agent de recettes : trois lignes. */
const rocketOfLea: FeedItem = {
  kind: 'update',
  at: '2026-10-19T09:00:00.000Z',
  update: {
    id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
    at: '2026-10-19T09:00:00.000Z',
    version: 'v1.2',
    firstLine: { family: 'new', text: 'Un compte à rebours avant chaque question' },
    lineCount: 3,
  },
  project: {
    ...summaryOf(recipesProject),
    version: 'v1.2',
    latestUpdate: {
      id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      at: '2026-10-19T09:00:00.000Z',
      version: 'v1.2',
      firstLine: { family: 'new', text: 'Un compte à rebours avant chaque question' },
      lineCount: 3,
    },
  },
}

/** Le décor caché aux lecteurs d'écran compte aussi : la ligne peut y être lue autrement. */
const HIDDEN_TOO = { includeHiddenElements: true }

describe('updates in the « following » feed on the home screen (R7a)', () => {
  it('shows the card of the project raised by its update, with « Mis à jour · v1.2 »', async () => {
    mockFollowing({ items: [rocketOfLea, fromMax] })
    await renderMemberHome()

    // La carte est celle du projet, nommée par son titre, comme un nouveau projet.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByText('Mis à jour · v1.2', HIDDEN_TOO)).toBeTruthy()
    // Le projet qui suit dans le fil est toujours une carte de projet.
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
  })

  it('replaces the pitch with the first line of « Ce qui a changé », then « et 2 autres changements »', async () => {
    mockFollowing({ items: [rocketOfLea] })
    await renderMemberHome()

    // `^` : la description cachée du lien reprend la même ligne après « Nouveau : ».
    expect(screen.getByText(/^Un compte à rebours avant chaque question/, HIDDEN_TOO)).toBeTruthy()
    expect(screen.getByText('et 2 autres changements', HIDDEN_TOO)).toBeTruthy()
    expect(screen.queryByText(recipesProject.pitch)).toBeNull()
  })

  it('says « Mis à jour » alone for an update without a version', async () => {
    mockFollowing({
      items: [
        {
          ...rocketOfLea,
          update: { ...rocketOfLea.update, version: null },
          project: { ...rocketOfLea.project, version: null },
        } as FeedItem,
      ],
    })
    await renderMemberHome()

    expect(screen.getByText('Mis à jour', HIDDEN_TOO)).toBeTruthy()
    expect(screen.queryByText(/Mis à jour · /, HIDDEN_TOO)).toBeNull()
  })

  it('opens the page of the project when the card of an update is touched', async () => {
    mockFollowing({ items: [rocketOfLea] })
    await renderMemberHome()

    await fireEvent.press(screen.getByRole('link', { name: 'Mon agent de recettes' }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: recipesProject.id },
    })
  })

  it('never shows the small note card any more', async () => {
    mockFollowing({ items: [rocketOfLea] })
    await renderMemberHome()

    // Témoin : la carte du projet est là.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Note d/ })).toBeNull()
  })

  it('keeps the pitch and shows no update line on a new project of the feed', async () => {
    mockFollowing({ items: [fromLea] })
    await renderMemberHome()

    expect(screen.getByText(recipesProject.pitch)).toBeTruthy()
    expect(screen.queryByText(/autres? changements?/, HIDDEN_TOO)).toBeNull()
  })
})
