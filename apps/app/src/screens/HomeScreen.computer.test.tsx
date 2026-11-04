// Tests de l'écran d'accueil (HomeScreen) sur ordinateur : le fil, la colonne de droite
// (proches à suivre, projets qui cherchent des testeurs) et le titre « Fil » posé par `Screen` (R4).
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import { fireEvent, screen } from '@testing-library/react-native'
import { useDiscoverFeed } from '../feed/api'
import { hrefOf } from '../testing/navigation'
import { setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import {
  card,
  garden,
  mockDiscover,
  mockFollowing,
  mockNews,
  mockPush,
  mockScreenProps,
  nora,
  october,
  projectItem,
  renderMemberHome,
  resetHomeMocks,
  sam,
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
      // R5a : l'identifiant du projet suit, pour que la page de sortie dise « La démo de … ».
      expect(
        hrefs.some((href) => href.startsWith('/out?url=https://voyage.example.com&project=')),
      ).toBe(true)
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
