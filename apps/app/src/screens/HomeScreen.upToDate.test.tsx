// Tests de l'écran d'accueil (HomeScreen) : la sphère « Tu es à jour » et sa place dans le
// fil, la date de lecture du fil, et « Tester » d'une carte, qui passe par la page
// d'avertissement (R4).
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import { act, fireEvent, screen, within } from '@testing-library/react-native'
import { Linking, Platform } from 'react-native'
import { useMarkFeedRead } from '../feed/api'
import { createI18n } from '../i18n'
import { hrefOf } from '../testing/navigation'
import { containing, fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'
import {
  cafes,
  card,
  comesBefore,
  type Element,
  garden,
  LAST_READ,
  listAround,
  mockFollowing,
  mockFollowingPages,
  mockPush,
  mockScreenProps,
  nodesInOrder,
  nora,
  october,
  photos,
  projectItem,
  queryUpToDate,
  quiz,
  renderMemberHome,
  resetHomeMocks,
  upToDate,
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
    expect(screen.queryByText(containing('Tu as tout vu'))).toBeNull()
  })

  it('stands at the top when nothing arrived since the last visit, with no empty list before it', async () => {
    mockFollowing({ items: [cafes, quiz], lastReadAt: october('21') })
    await renderMemberHome()

    expect(comesBefore(upToDate(), card('Carnet de cafés'))).toBe(true)
    const list = listAround(card('Carnet de cafés'))
    expect(list).toBeTruthy()
    expect(listAround(card('Le quiz des capitales'))).toBe(list)
    // La grille d'avant, vide, ne dit pas « rien de neuf » (ui-B6). Le texte écrit en toutes lettres :
    // sa clé (feed.quiet) est retirée depuis que le fil vide finit sur « Tu es à jour ».
    expect(screen.queryByText(/Rien de neuf pour l’instant/)).toBeNull()
  })

  it('stands at the very end when the feed ends with nothing already seen, said once', async () => {
    mockFollowing({ items: [cafes, quiz], lastReadAt: october('01') })
    await renderMemberHome()

    expect(comesBefore(card('Le quiz des capitales'), upToDate())).toBe(true)
    expect(screen.getAllByText(fr.t(($) => $.feed.upToDate.title))).toHaveLength(1)
    expect(screen.queryByText(containing('Tu as tout vu'))).toBeNull()
  })

  it('says only its title at the end of a first visit, no « dernière visite » (jur-J1, RF T1)', async () => {
    // Le fil de départ : Léa et Max, jamais lu (lastReadAt null), sans suite.
    await renderMemberHome()

    expect(comesBefore(card('Le tri des photos'), upToDate())).toBe(true)
    expect(screen.getAllByText(fr.t(($) => $.feed.upToDate.title))).toHaveLength(1)
    expect(screen.queryByText(containing('Tu as tout vu'))).toBeNull()
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
      // R5a : l'identifiant du projet suit, pour que la page de sortie dise « La démo de … ».
      expect(
        hrefs.some((href) => href.startsWith('/out?url=https://cafes.example.com&project=')),
      ).toBe(true)
      expect(hrefs).not.toContain('https://cafes.example.com')
      expect(openURL).not.toHaveBeenCalled()
    } finally {
      openURL.mockRestore()
    }
  })
})
