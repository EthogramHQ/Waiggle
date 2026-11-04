// Tests de l'écran d'accueil (HomeScreen) : le haut de la page, soit la cloche des notifications
// (6b), le bandeau d'un compte suspendu (7c), le logo du Fil sur téléphone (R3) et le titre de
// niveau 1 de la page.
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { createI18n } from '../i18n'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { renderWithI18n, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'
import {
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
