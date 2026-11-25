// Tests de « Offrir du miel » sur la page d'un projet (R19, docs/scenarios/refonte.md, « Le miel » ;
// planche R19-Miel, options b7, b9 et b10 ; relecture d'interface du plan, UI-5) :
// - un bouton secondaire « Offrir du miel » à côté du « Coin des testeurs », sur le projet d'un
//   autre membre seulement (ni l'auteur, ni un projet d'exemple) ;
// - il ouvre une feuille de confirmation : son titre, ce que l'auteur verra, le solde lu à
//   l'ouverture de la feuille (« Ton miel : 35. Il t'en restera 30. »), « Offrir 5 miel » et
//   « Annuler » ; Échap et Annuler la ferment sans rien envoyer, et rien ne la ferme pendant l'envoi ;
// - l'envoi part une seule fois, même sur deux touchers ; après : « Miel offert » (inactif mais
//   atteignable au clavier) et le toast « Miel offert. Il te reste 30 miel. » ;
// - déjà offert (`honeyGiven`, une offre par projet) : « Miel offert » dès l'arrivée ;
// - solde court : la feuille explique (« Il faut 5 miel ; tu en as 2. »), mène à « Ma récolte »
//   et se ferme par « Fermer », sans rien envoyer ; un refus `honey_short` de l'API pendant l'envoi
//   (le solde a changé ailleurs) donne la même explication.
//
// Les vrais hooks de `gamification/api` tournent sur un faux réseau (Game.testkit.ts) ; le projet
// est relu par `getProject`, qui rend ce que le faux serveur sait (`honeyGiven`).
import type { Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { getProject } from '../projects/api'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { exampleProject, recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll, moveReaderTo } from '../ui/focus'
import type { Sheet } from '../ui/Sheet'
import { ToastProvider } from '../ui/theme/toast'
import { gameServer, honeyGifts, leaHarvest, never } from './Game.testkit'
import { ProjectScreen } from './ProjectScreen'
import { id, mockPush, resetProjectScreenMocks } from './ProjectScreen.testkit'
import { pressEscape } from './TestersCorner.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La vraie feuille, enveloppée : le test lit ses dernières props (nom en `mock`, permis par jest.mock).
const mockSheet: { props: ComponentProps<typeof Sheet> | null } = { props: null }
jest.mock('../ui/Sheet', () => {
  const actual = jest.requireActual('../ui/Sheet')
  return {
    ...actual,
    Sheet: (props: ComponentProps<typeof Sheet>) => {
      mockSheet.props = props
      return actual.Sheet(props)
    },
  }
})
// Les aides de focus, telles quelles, mais dont le test lit les appels.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn((node: unknown) => actual.focusWithoutScroll(node)),
    moveReaderTo: jest.fn((node: unknown) => actual.moveReaderTo(node)),
  }
})
// Le client réseau : le faux serveur du jeu répond à ses adresses, la liste des catégories est
// rendue telle quelle, et toute autre demande reçoit « introuvable », jamais le réseau.
jest.mock('../api/client', () => {
  const actual: typeof import('../api/client') = jest.requireActual('../api/client')
  const { categoryList }: typeof import('../testing/categories') =
    jest.requireActual('../testing/categories')
  const route = (path: string, init?: RequestInit) =>
    String(path).startsWith('/v1/categories')
      ? Promise.resolve({ ok: true, data: categoryList('fr') })
      : require('./Game.testkit')
          .gameServer.route(path, init)
          .then((answer: unknown) => answer ?? { ok: false, error: 'notFound' })
  return { ...actual, request: jest.fn(route), requestWithoutBody: jest.fn(route) }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  const { mockPush } = require('./ProjectScreen.testkit')
  return {
    usePathname: () => '/page/actuelle',
    useRouter: () => ({
      push: mockPush,
      navigate: mockPush,
      replace: jest.fn(),
      dismissTo: jest.fn(),
      back: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    useIsFocused: () => true,
    useFocusEffect: () => undefined,
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

// Les textes attendus, tirés des mêmes traductions que l'écran.
const { title } = recipesProject
const T = {
  offer: fr.t(($) => $.game.offer.button),
  given: fr.t(($) => $.game.offer.given),
  sheetTitle: fr.t(($) => $.game.offer.title, { title }),
  notice: fr.t(($) => $.game.offer.notice, { author: 'Léa', name: 'Inès' }),
  balance: fr.t(($) => $.game.offer.balance, { balance: 35, after: 30 }),
  confirm: fr.t(($) => $.game.offer.confirm, { amount: 5 }),
  toast: fr.t(($) => $.game.offer.toast, { amount: 30 }),
  short: fr.t(($) => $.game.short.body, { needed: 5, balance: 2 }),
  how: fr.t(($) => $.game.short.how),
  harvest: fr.t(($) => $.game.harvest.title),
  cancel: fr.t(($) => $.common.cancel),
  close: fr.t(($) => $.common.close),
}

/** Le projet de Léa, vu par Inès ; `honeyGiven` suit ce que le faux serveur sait. */
const seenByInes: Project = { ...recipesProject, isMine: false, honeyGiven: false }
let server: Project = seenByInes

const renderPage = async (project: Project = seenByInes) => {
  server = project
  const view = await renderWithProviders(
    <ToastProvider>
      <ProjectScreen id={id} />
    </ToastProvider>,
  )
  expect(await screen.findByRole('header', { name: project.title })).toBeTruthy()
  return view
}

/** Le bouton du geste, une fois la page arrivée. */
const offerButton = () => screen.findByRole('button', { name: T.offer })

/** Ouvre la feuille d'offre, sa garde passée. */
const openSheet = async () => {
  await fireEvent.press(await offerButton())
  expect(await screen.findByRole('header', { name: T.sheetTitle })).toBeTruthy()
  await passTapGuard()
}

const sheetShown = () => screen.queryByRole('header', { name: T.sheetTitle }) !== null

beforeEach(() => {
  mockSheet.props = null
  jest.mocked(focusWithoutScroll).mockClear()
  jest.mocked(moveReaderTo).mockClear()
  resetProjectScreenMocks()
  gameServer.reset()
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest
    .mocked(getProject)
    // Déjà offert avant la visite (`honeyGiven` du projet rendu), ou offert pendant le test.
    .mockImplementation(async () => ({
      ...server,
      honeyGiven: server.honeyGiven || gameServer.gifted.has(server.id),
    }))
})

describe('« Offrir du miel » on the page of a project', () => {
  it('offers honey on the project of another member', async () => {
    await renderPage()

    expect(await offerButton()).toBeTruthy()
  })

  it('offers no honey to the author of the project', async () => {
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await renderPage({ ...recipesProject, isMine: true })

    // Témoin : la page de l'auteur est arrivée (son titre est lu, renderPage l'attend).
    expect(screen.queryByRole('button', { name: T.offer })).toBeNull()
  })

  it('offers no honey on an example project', async () => {
    await renderPage({ ...exampleProject, isMine: false, honeyGiven: false })

    expect(screen.queryByRole('button', { name: T.offer })).toBeNull()
  })

  // Témoin des deux tests du dessus : le bouton est bien celui que la page montre ailleurs.
  it('shows « Miel offert », inactive, when honey was already given to this project', async () => {
    await renderPage({ ...seenByInes, honeyGiven: true })

    const given = await screen.findByRole('button', { name: T.given })
    expect(given).toBeDisabled()
    expect(screen.queryByRole('button', { name: T.offer })).toBeNull()
  })
})

describe('the sheet that confirms the gift', () => {
  it('says what the author will see and reads the balance once the sheet is open', async () => {
    await renderPage()

    // UI-5 : le solde n'est lu qu'à l'ouverture de la feuille, pas sur chaque page de projet.
    expect(gameServer.sent.filter((one) => one.path === '/v1/me/harvest')).toEqual([])
    await openSheet()

    expect(await screen.findByText(T.balance)).toBeTruthy()
    expect(screen.getByText(T.notice)).toBeTruthy()
    expect(screen.getByRole('button', { name: T.confirm })).toBeTruthy()
  })

  it('closes on « Annuler » without sending anything', async () => {
    await renderPage()
    await openSheet()

    await fireEvent.press(screen.getByRole('button', { name: T.cancel }))

    await waitFor(() => expect(sheetShown()).toBe(false))
    expect(honeyGifts()).toEqual([])
  })

  it('closes on Escape without sending anything', async () => {
    await renderPage()
    await openSheet()

    await pressEscape(T.sheetTitle)

    await waitFor(() => expect(sheetShown()).toBe(false))
    expect(honeyGifts()).toEqual([])
  })

  it('sends the gift once on two taps, then shows « Miel offert » and the toast', async () => {
    await renderPage()
    await openSheet()
    await screen.findByText(T.balance)

    const confirm = screen.getByRole('button', { name: T.confirm })
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(await screen.findByText(T.toast)).toBeTruthy()
    expect(honeyGifts().map((one) => one.path)).toEqual([`/v1/projects/${id}/honey`])
    // Relecture d'interface du plan (UI-5) : inactif, mais le clavier et le lecteur d'écran le
    // trouvent encore (`focusableWhenDisabled`).
    const given = await screen.findByRole('button', { name: T.given })
    expect(given).toBeDisabled()
    expect(screen.queryByRole('button', { name: T.offer })).toBeNull()
  })

  it('gives the focus back to « Miel offert » once the honey is offered', async () => {
    await renderPage()
    await openSheet()
    await screen.findByText(T.balance)

    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await screen.findByRole('button', { name: T.given })

    // Le bouton « Offrir du miel » a disparu au profit de « Miel offert » : l'ouvreur retrouvé par
    // son nom ne serait plus là, la feuille doit rendre le focus au bouton de la page.
    expect(labelOf(mockSheet.props?.returnFocusTo?.())).toBe(T.given)
  })

  it('keeps the sheet open while the gift is being sent', async () => {
    gameServer.honeyAnswer = never
    await renderPage()
    await openSheet()
    await screen.findByText(T.balance)

    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await waitFor(() => expect(honeyGifts()).toHaveLength(1))
    await pressEscape(T.sheetTitle)
    const cancel = screen.queryByRole('button', { name: T.cancel })
    if (cancel) await fireEvent.press(cancel)

    expect(sheetShown()).toBe(true)
  })
})

// Option b9 : le solde court, sans rouge ni reproche ; la feuille explique et mène à « Ma récolte ».
describe('a short balance', () => {
  it('explains the short balance in the sheet and sends nothing', async () => {
    gameServer.reset({ ...leaHarvest, honey: 2 })
    await renderPage()
    await openSheet()

    expect(await screen.findByText(T.short)).toBeTruthy()
    expect(screen.getByText(T.how)).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.confirm })).toBeNull()
    await fireEvent.press(screen.getByRole('link', { name: T.harvest }))
    expect(mockPush.mock.calls.map(([href]) => String(href))).toContain('/harvest')
    expect(honeyGifts()).toEqual([])
  })

  it('closes the explanation on « Fermer »', async () => {
    gameServer.reset({ ...leaHarvest, honey: 2 })
    await renderPage()
    await openSheet()
    await screen.findByText(T.short)

    await fireEvent.press(screen.getByRole('button', { name: T.close }))

    await waitFor(() => expect(sheetShown()).toBe(false))
  })

  it('puts the focus on the message when there is not enough honey', async () => {
    gameServer.honeyAnswer = async () => ({ ok: false, error: 'honeyShort' }) as never
    await renderPage()
    await openSheet()
    await screen.findByText(T.balance)
    jest.mocked(focusWithoutScroll).mockClear()
    jest.mocked(moveReaderTo).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await screen.findByText(T.how)

    // Les boutons ont disparu avec le focus : il va sur le message, jamais sur la page entière.
    const reached = [
      ...jest.mocked(focusWithoutScroll).mock.calls,
      ...jest.mocked(moveReaderTo).mock.calls,
    ]
    expect(reached.some(([node]) => labelOf(node) === fr.t(($) => $.errors.honeyShort))).toBe(true)
  })

  it('explains a refusal for a short balance sent back by the server, without the toast', async () => {
    gameServer.honeyAnswer = async () => ({ ok: false, error: 'honeyShort' }) as never
    await renderPage()
    await openSheet()
    await screen.findByText(T.balance)

    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))

    expect(await screen.findByText(T.how)).toBeTruthy()
    expect(screen.queryByText(T.toast)).toBeNull()
    expect(screen.queryByRole('button', { name: T.given })).toBeNull()
  })
})
