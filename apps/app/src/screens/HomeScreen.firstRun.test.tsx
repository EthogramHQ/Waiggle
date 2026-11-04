// Tests de l'écran d'accueil (HomeScreen) : le premier lancement d'un membre qui ne suit
// encore personne (le salut, les proches à suivre, l'écart d'une suggestion, « Publier », R4).
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import type { Me } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'
import {
  fiveSuggested,
  mockDismiss,
  mockFollowing,
  mockPush,
  mockScreenProps,
  mockSuggestions,
  mockToggle,
  nora,
  resetHomeMocks,
  shown,
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
