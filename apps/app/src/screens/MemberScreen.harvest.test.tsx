// Tests du rayon sur la page d'un membre (R19, docs/scenarios/refonte.md, « Le niveau et ton
// rayon », « Où on le voit » ; planches R19-Profil, options a5 et a10). Sous l'en-tête du membre,
// le panneau du niveau (`HarvestPanel`) :
// - sur sa propre page (« Moi ») : niveau, titre, miel, rayon, phrase de pollen, semaines, « Mes
//   sceaux · N », et le titre de la rubrique qui mène à « Ma récolte » (/harvest). Ce qui n'est pas
//   dans `Member.game` (le miel, la phrase, les semaines) vient de GET /v1/me/harvest, lu pour soi
//   seulement ;
// - sur la page d'un proche : `Member.game` seul (niveau, titre, rayon, « Ses sceaux · N »), jamais
//   le miel, la phrase ni les semaines, et sa récolte n'est jamais demandée ;
// - un compte d'exemple, ou un membre bloqué (`game: null`) : aucun rayon ;
// - un niveau passé depuis la dernière visite (`levelSeen < level`) : la cire coule une fois,
//   « Nouveau » s'affiche, puis l'écran envoie PATCH /v1/me/game { levelSeen } à la fin du
//   mouvement ; « Nouveau » reste jusqu'à la fin de la visite (relecture d'interface du plan, UI-4).
//
// Le client réseau est remplacé par le faux serveur du jeu (Game.testkit.ts) : les vrais hooks de
// `gamification/api` y lisent et y écrivent.
import type { Harvest, Member } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { blockedLeaPage, examplePage, leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { gameOf, gamePatches, gameServer, harvestReads, leaHarvest } from './Game.testkit'
import { MemberScreen } from './MemberScreen'

jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Le client réseau : le faux serveur du jeu répond à ses adresses ; toute autre demande reçoit
// « introuvable », jamais le réseau. `require` dans la fabrique : Jest la remonte avant les imports.
jest.mock('../api/client', () => {
  const route = (path: string, init?: RequestInit) =>
    require('./Game.testkit')
      .gameServer.route(path, init)
      .then((answer: unknown) => answer ?? { ok: false, error: 'notFound' })
  return {
    ...jest.requireActual('../api/client'),
    request: jest.fn(route),
    requestWithoutBody: jest.fn(route),
  }
})
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../blocks/api', () => ({
  useBlock: () => ({ block: jest.fn() }),
  useUnblock: () => ({ unblock: jest.fn() }),
}))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    ...jest.requireActual('../members/api'),
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
const mockPush = jest.fn()
// Un `Link` d'Expo Router devient un texte au rôle de lien, qui passe son adresse au faux `push` :
// le titre de la rubrique peut être un lien ou un bouton qui pousse la page, le test lit où il mène.
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/members/u1',
    useRouter: () => ({
      push: mockPush,
      navigate: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

// Les textes attendus, tirés des mêmes traductions que l'écran.
const T = {
  level: (level: number) => fr.t(($) => $.game.level, { level }),
  keeperF: fr.t(($) => $.game.titles.keeper_f),
  keeperM: fr.t(($) => $.game.titles.keeper_m),
  honey: fr.t(($) => $.game.honey, { amount: 35 }),
  toNext: fr.t(($) => $.game.toNext, { count: 120, next: 5 }),
  weeks: fr.t(($) => $.game.weeks, { count: 3 }),
  cells: fr.t(($) => $.game.comb.cells, { count: 7, next: 5 }),
  mySeals: fr.t(($) => $.game.harvest.seals.mine, { count: 2 }),
  theirSeals: fr.t(($) => $.game.harvest.seals.theirs, { count: 2 }),
  firstFeedback: fr.t(($) => $.game.seals.first_feedback),
  cooking: fr.t(($) => $.game.seals.category.cooking),
  harvest: fr.t(($) => $.game.harvest.title),
  isNew: fr.t(($) => $.game.new),
}

/**
 * Un texte visible, ou le nom lu d'un élément qui le porte (le niveau peut être écrit dans
 * l'alvéole du niveau, nommée par lui) : le test ne dépend pas de la façon de le dessiner.
 */
const shown = (text: string) =>
  screen.queryAllByText(text).length > 0 || screen.queryAllByLabelText(text).length > 0

/** Le panneau de Léa à 880 pollen (niveau 4), tel que sa page le reçoit. */
const leaWithGame: Member = { ...leaPage, game: gameOf() }

/** Léa ouvre sa propre page ; `harvest` : ce que GET /v1/me/harvest lui rend. */
const openMine = async (harvest: Harvest = leaHarvest) => {
  gameServer.reset(harvest)
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMember).mockResolvedValue({ ...leaPage, isMe: true, game: gameOf(harvest) })
  const view = await renderWithProviders(<MemberScreen id="u1" />)
  expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
  return view
}

/** Max ouvre la page de Léa. */
const openLea = async (member: Member = leaWithGame) => {
  jest.mocked(getMember).mockResolvedValue(member)
  const view = await renderWithProviders(<MemberScreen id="u1" />)
  expect(await screen.findByRole('header', { name: member.name })).toBeTruthy()
  return view
}

beforeEach(() => {
  gameServer.reset()
  mockSession({ user: { id: 'u2', name: 'Max' } })
  mockPush.mockReset()
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(getMember).mockReset()
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
})

describe('the comb on her own page', () => {
  it('shows the level, the title, the honey, the comb and the pollen before the next level', async () => {
    await openMine()

    await waitFor(() => expect(screen.getByText(T.honey)).toBeTruthy())
    expect(shown(T.level(4))).toBe(true)
    expect(screen.getByText(T.keeperF)).toBeTruthy()
    expect(screen.getByText(T.toNext)).toBeTruthy()
    expect(screen.getByRole('progressbar').props['aria-valuetext']).toBe(T.cells)
  })

  it('counts her foraged weeks and her seals', async () => {
    await openMine()

    await waitFor(() => expect(screen.getByText(T.weeks)).toBeTruthy())
    expect(shown(T.mySeals)).toBe(true)
    expect(shown(T.firstFeedback)).toBe(true)
  })

  it('leads from the title of the section to « Ma récolte »', async () => {
    await openMine()

    const link = await screen.findByRole('link', { name: T.harvest })
    await fireEvent.press(link)

    expect(visited(mockPush)).toContain('/harvest')
  })

  it('reads her harvest to show her honey', async () => {
    await openMine()

    await waitFor(() => expect(screen.getByText(T.honey)).toBeTruthy())
    expect(harvestReads()).toBeGreaterThan(0)
  })
})

// Option a5 des planches : la page d'un proche montre son rayon sans le miel, la phrase de pollen
// ni les semaines ; « Ses sceaux · N ».
describe('the comb on the page of another member', () => {
  it('shows her level, her title, her comb and her seals', async () => {
    await openLea()

    await waitFor(() => expect(shown(T.level(4))).toBe(true))
    expect(screen.getByText(T.keeperF)).toBeTruthy()
    expect(screen.getByRole('progressbar').props['aria-valuetext']).toBe(T.cells)
    expect(shown(T.theirSeals)).toBe(true)
    expect(shown(T.cooking)).toBe(true)
  })

  it('never shows her honey, the pollen sentence or her weeks', async () => {
    await openLea()

    await waitFor(() => expect(shown(T.level(4))).toBe(true))
    expect(screen.queryByText(/miel/)).toBeNull()
    expect(screen.queryByText(T.toNext)).toBeNull()
    expect(screen.queryByText(/semaines? butinées?/)).toBeNull()
    expect(shown(T.mySeals)).toBe(false)
  })

  it('never reads the harvest of the visitor on the page of another member', async () => {
    await openLea()

    await waitFor(() => expect(shown(T.level(4))).toBe(true))
    expect(harvestReads()).toBe(0)
  })

  // Choix 12 du plan : le libellé du titre suit la forme choisie par le membre, partout.
  it('writes her title in the form she chose', async () => {
    await openLea({
      ...leaWithGame,
      game: { ...gameOf(), title: { family: 'keeper', form: 'm', pinned: false } },
    })

    await waitFor(() => expect(screen.getByText(T.keeperM)).toBeTruthy())
    expect(screen.queryByText(T.keeperF)).toBeNull()
  })

  it('shows no title to a member who has none yet', async () => {
    await openLea({ ...leaWithGame, game: { ...gameOf(), title: null } })

    await waitFor(() => expect(shown(T.level(4))).toBe(true))
    expect(screen.queryByText(T.keeperF)).toBeNull()
  })
})

describe('no comb where the member does not play', () => {
  it('shows no comb on the page of the examples account', async () => {
    await openLea(examplePage)

    // Témoin : la page est arrivée (son nom est lu) ; pas de rayon, ni de niveau.
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(shown(T.level(1))).toBe(false)
    expect(harvestReads()).toBe(0)
  })

  it('shows no comb on the page of a blocked member', async () => {
    await openLea({ ...blockedLeaPage, game: null })

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(T.keeperF)).toBeNull()
  })

  // Témoin des deux tests du dessus : le même membre, avec son jeu, a bien un rayon.
  it('shows the comb of the same member once she plays', async () => {
    await openLea()

    expect(await screen.findByRole('progressbar')).toBeTruthy()
  })
})

// Planches R19-Niveau, option a10 : la cire coule une fois, à la visite qui suit le passage ;
// « Nouveau » jusqu'à la visite suivante, aucune félicitation.
describe('a new level on her own page', () => {
  /** Léa vient de passer au niveau 5 (1 000 pollen) ; sa dernière visite l'a vue au niveau 4. */
  const risen: Harvest = {
    ...leaHarvest,
    level: 5,
    total: 1000,
    cells: 0,
    toNext: 1000,
    levelSeen: 4,
  }

  it('says « Nouveau », then marks the level as seen once the wax has run', async () => {
    await openMine(risen)

    await waitFor(() => expect(screen.getByText(T.isNew)).toBeTruthy())
    expect(shown(T.level(5))).toBe(true)
    await waitFor(() => expect(gamePatches()).toEqual([{ levelSeen: 5 }]), { timeout: 5000 })
  })

  it('keeps « Nouveau » for the whole visit after the level is marked seen', async () => {
    const { queryClient } = await openMine(risen)

    await waitFor(() => expect(gamePatches()).toEqual([{ levelSeen: 5 }]), { timeout: 5000 })
    // La relecture après l'écriture : le serveur dit maintenant `levelSeen: 5`. La visite garde
    // « Nouveau » (figé à l'arrivée, comme les nouveautés de l'Activité).
    await act(() => queryClient.invalidateQueries())
    await waitFor(() => expect(harvestReads()).toBeGreaterThan(1))

    expect(screen.getByText(T.isNew)).toBeTruthy()
  })

  it('neither says « Nouveau » nor writes when the level was already seen', async () => {
    await openMine()

    await waitFor(() => expect(screen.getByText(T.honey)).toBeTruthy())
    expect(screen.queryByText(T.isNew)).toBeNull()
    expect(gamePatches()).toEqual([])
  })
})
