// Tests de l'écran d'accueil (HomeScreen) : le bouton des nouveautés, qui annonce ce qui est
// arrivé (R4), et sa place sous la barre du haut quand le titre « Fil » passe dessous (RF).
//
// Avec Testing Library, on affiche l'écran en mémoire, puis on le manipule comme le ferait un
// utilisateur (lire un texte, appuyer sur un bouton) ; on cherche les éléments par leur rôle et leur
// nom, pas par leur code interne. Ce fichier est une part de l'ancien HomeScreen.test.tsx, coupé
// par sections pour que Jest le lance plus vite (il donne un fichier entier à chaque processus) ;
// les fausses données et les aides communes sont dans HomeScreen.testkit.tsx. Les `jest.mock`
// restent écrits ici : Jest les remonte en tête du fichier où ils sont écrits, et ne remplace un
// module que pour ce fichier.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { Platform, ScrollView } from 'react-native'
import { setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import * as focusModule from '../ui/focus'
import {
  mockFollowing,
  mockNews,
  mockPush,
  mockScreenProps,
  nora,
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

// RF (point des listes « le bouton des nouveautés hors de vue dès qu'on descend », relecture du
// plan ui-5) : sur ordinateur, la barre du haut est fixe. Quand le titre « Fil » passe sous elle, le
// bouton des nouveautés, qui n'existe qu'une fois dans l'arbre, quitte le titre (`titleAside`) pour
// la place sous la barre (`belowBar` de Screen). Son toucher fait ce qu'il faisait (relire le fil),
// remonte en haut du fil (`toTop()` du canal de défilement de Screen) et pose le focus sur le titre
// « Fil ».
//
// Ce que le test suppose (noms choisis au plan des tests) : Screen sait que le titre est passé sous
// la barre par la mise en page de la rangée du titre (`onLayout`) comparée au défilement de la zone
// qui défile ; le focus passe par `focusWithoutScroll` (ou `focusAndReveal`) de ui/focus.ts.
describe('the news button under the pinned top bar (RF, ui-5)', () => {
  type TreeNode = {
    type: unknown
    props: Record<string, unknown>
    parent: TreeNode | null
    children: (TreeNode | string)[]
  }
  const NEWS = '3 nouveautés'
  const feedTitle = fr.t(($) => $.feed.title)

  const nodes = (): TreeNode[] => {
    const all: TreeNode[] = []
    const visit = (node: TreeNode | string) => {
      if (typeof node === 'string') return
      all.push(node)
      for (const child of node.children) visit(child)
    }
    visit(screen.root as unknown as TreeNode)
    return all
  }
  const scroller = (): TreeNode => {
    const found = nodes().find((node) => node.type === 'RCTScrollView')
    if (!found) throw new Error('No scrolling page')
    return found
  }
  const insideScroll = (element: unknown) => {
    for (let node = element as TreeNode | null; node; node = node.parent) {
      if (node === scroller()) return true
    }
    return false
  }

  /**
   * Le membre descend : la rangée du titre reçoit sa place dans la page (chaque `onLayout` entre le
   * titre et la zone qui défile, sur ses cadres ou sur une vue vide sœur qui mesure), puis la page
   * défile bien au-delà.
   */
  const scrollTitleUnderBar = async () => {
    const layout = {
      nativeEvent: { layout: { x: 0, y: 40, width: 800, height: 44 } },
      persist: () => {},
    }
    const scroll = scroller()
    let path = screen.getByRole('header', { name: feedTitle }) as unknown as TreeNode
    for (let node = path.parent; node && node !== scroll; path = node, node = node.parent) {
      const handlers = [
        node.props.onLayout,
        ...node.children.map((child) =>
          typeof child !== 'string' && child !== path && child.children.length === 0
            ? child.props.onLayout
            : undefined,
        ),
      ]
      for (const handler of handlers) {
        if (typeof handler === 'function') await act(async () => handler(layout))
      }
    }
    const onScroll = scroll.props.onScroll
    if (typeof onScroll !== 'function') throw new Error('The scrolling page does not listen')
    await act(async () => {
      onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: 2000 },
          layoutMeasurement: { width: 1440, height: 900 },
          contentSize: { width: 1440, height: 6000 },
        },
      })
    })
  }

  /** Le nœud reçu par l'aide de focus est-il le titre « Fil » ? */
  const isFeedTitle = (node: unknown) => {
    const props = (node as { props?: Record<string, unknown> } | null)?.props ?? {}
    return (
      props.accessibilityLabel === feedTitle ||
      props['aria-label'] === feedTitle ||
      [props.children].flat().includes(feedTitle)
    )
  }

  /**
   * Un test sur ordinateur, la fenêtre de téléphone remise à la fin. Pas sur le web : la page y
   * attendrait l'hydratation pour passer à l'ordinateur ; l'aide de focus, appelée partout, décide
   * elle-même de la plateforme (ui/focus.ts).
   */
  const onComputer = async (test: () => Promise<void>) => {
    const restore = setDesktopWindow()
    try {
      await test()
    } finally {
      jest.restoreAllMocks()
      await act(async () => restore())
    }
  }

  beforeEach(() => {
    mockNews({ count: 3, kinds: ['project', 'note'], authors: [nora] })
  })

  it('moves the one news button under the bar once the title « Fil » is under it', () =>
    onComputer(async () => {
      await renderMemberHome()
      // Témoin : en haut du fil, le bouton est à côté du titre, dans la page.
      expect(insideScroll(screen.getByRole('button', { name: NEWS }))).toBe(true)

      await scrollTitleUnderBar()

      const buttons = screen.getAllByRole('button', { name: NEWS })
      expect(buttons).toHaveLength(1)
      expect(insideScroll(buttons[0])).toBe(false)
      // Avant la page dans l'ordre de lecture, comme la barre (ui-4).
      const order = nodes()
      expect(order.indexOf(buttons[0] as unknown as TreeNode)).toBeLessThan(
        order.indexOf(scroller()),
      )
    }))

  it('shows the news, goes back to the top and moves the focus to « Fil » when touched under the bar', () =>
    onComputer(async () => {
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
      const focusWithoutScroll = jest.spyOn(focusModule, 'focusWithoutScroll')
      const focusAndReveal = jest.spyOn(focusModule, 'focusAndReveal')
      const following = mockFollowing()
      await renderMemberHome()
      await scrollTitleUnderBar()
      const button = screen.getByRole('button', { name: NEWS })
      expect(insideScroll(button)).toBe(false) // témoin : sous la barre
      scrollTo.mockClear()

      await fireEvent.press(button)

      expect(following.refetch).toHaveBeenCalledTimes(1)
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }))
      await waitFor(() =>
        expect(
          [...focusWithoutScroll.mock.calls, ...focusAndReveal.mock.calls].some(([node]) =>
            isFeedTitle(node),
          ),
        ).toBe(true),
      )
    }))

  // Correction après relecture (design n° 3) : dans le navigateur, le focus allait bien au titre,
  // puis le bouton des nouveautés le reprenait pour sa propre place (vidée, puis retirée de sous la
  // barre en remontant), et il tombait sur toute la page. Le titre doit garder le dernier focus.
  it('leaves the last focus on « Fil » on the web, the news button does not take it back', () =>
    onComputer(async () => {
      mockFollowing()
      await renderMemberHome()
      await scrollTitleUnderBar()
      const button = screen.getByRole('button', { name: NEWS })
      expect(insideScroll(button)).toBe(false) // témoin : sous la barre

      // Sur le web, chaque `focus` posé sur une vue native est noté (les vues partagent leur classe :
      // on l'écoute dès que l'aide de focus reçoit le titre, avant tout autre focus).
      const focused: unknown[] = []
      let lent: { proto: { focus?: unknown }; own: boolean } | null = null
      jest.spyOn(focusModule, 'focusWithoutScroll').mockImplementation((node) => {
        if (!node) return false
        if (!lent) {
          const proto = Object.getPrototypeOf(node) as { focus?: unknown }
          lent = { proto, own: Object.hasOwn(proto, 'focus') }
          if (typeof proto.focus !== 'function') proto.focus = () => {}
          jest.spyOn(proto as { focus: () => void }, 'focus').mockImplementation(function (
            this: unknown,
          ) {
            focused.push(this)
          })
        }
        ;(node as { focus: (options: object) => void }).focus({ preventScroll: true })
        return true
      })
      jest.replaceProperty(Platform, 'OS', 'web')
      ;(globalThis as { document?: unknown }).document = { activeElement: { focused: true } }
      try {
        await fireEvent.press(button)
        await act(async () => {})

        expect(focused.some(isFeedTitle)).toBe(true) // témoin : le titre a reçu le focus
        expect(isFeedTitle(focused.at(-1))).toBe(true)
      } finally {
        delete (globalThis as { document?: unknown }).document
        const kept = lent as { proto: { focus?: unknown }; own: boolean } | null
        if (kept && !kept.own) delete kept.proto.focus
      }
    }))

  it('keeps the button beside the title on a phone, where nothing is pinned', async () => {
    await renderMemberHome()
    await scrollTitleUnderBar()

    // Sur téléphone, le bouton est en tête du fil, dans la page, même loin en bas : rien ne change.
    const buttons = screen.getAllByRole('button', { name: NEWS })
    expect(buttons).toHaveLength(1)
    expect(insideScroll(buttons[0])).toBe(true)
  })
})
