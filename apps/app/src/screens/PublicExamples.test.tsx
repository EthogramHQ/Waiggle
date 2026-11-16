// Tests de ce que voit un visiteur d'un compte d'exemples (tranche R12b, scénario « Les exemples »,
// « Ce que voient les membres et les visiteurs ») : la carte de la vitrine de l'accueil, la page
// publique d'un projet d'exemple et la page publique du compte portent la pastille « Exemple » ;
// sous l'en-tête du projet, « Projet fictif, créé par l'équipe… » ; sous le nom du compte, « Les
// projets de ce compte sont fictifs… ». Un projet ou un membre ordinaire n'a ni l'une ni l'autre.
//
// L'interface attendue : les écrans de R12 (`ShowcaseScreen`, `PublicProjectScreen`,
// `PublicMemberScreen`), qui lisent le champ `example` du contrat (`ShowcaseItem.author`,
// `PublicAuthor`, `PublicMember`) et posent `ui/ExampleBadge`. Le faux serveur, les données (le
// compte « WaiggleBot » et son projet « Le carnet des plantes ») et le faux routeur :
// Public.testkit.tsx.
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  decollage,
  decollageId,
  exampleId,
  exampleName,
  exampleProjectId,
  examplePublicProject,
  exampleShowcaseItem,
  inesId,
  inesPublic,
  publicServer,
  resetPublic,
  showcase,
} from './Public.testkit'
import { PublicMemberScreen } from './PublicMemberScreen'
import { PublicProjectScreen } from './PublicProjectScreen'
import { ShowcaseScreen } from './ShowcaseScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../notifications/api', () => ({ useUnreadCount: jest.fn() }))
jest.mock('expo-router', () => {
  const kit = () => require('./Public.testkit').mockNav
  return {
    useRouter: () => kit().router,
    usePathname: () => kit().pathname,
    useNavigation: () => kit().navigation,
    useLocalSearchParams: () => kit().params,
    useGlobalSearchParams: () => kit().params,
    useSegments: () => [],
    useFocusEffect: () => {},
    useIsFocused: () => true,
  }
})

const T = {
  example: fr.t(($) => $.common.example),
  projectNote: fr.t(($) => $.project.page.exampleNote),
  memberNote: fr.t(($) => $.member.exampleNote),
}

/** Les pastilles « Exemple » lues à l'écran (cachées aux lecteurs d'écran : pas comptées). */
const badges = () => screen.queryAllByText(T.example)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type TreeNode = {
  props: Record<string, unknown>
  children: (TreeNode | string)[]
}
const nodesOf = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]
/** Tout le texte écrit sous un nœud, bout à bout. */
const textOf = (node: TreeNode): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')

/** La place de chaque élément dans l'ordre de lecture (l'arbre, en profondeur d'abord). */
const readingOrder = (...elements: unknown[]) => {
  const order = nodesOf(screen.root as unknown as TreeNode)
  return elements.map((element) => order.indexOf(element as TreeNode))
}

afterEach(() => jest.restoreAllMocks())

describe('the showcase of the home, with a project of the examples account (R12b)', () => {
  beforeEach(() => {
    resetPublic('/fr/', { lang: 'fr' })
    mockSession(null)
    jest.mocked(getMe).mockResolvedValue(leaMe)
    jest.mocked(useUnreadCount).mockReturnValue(0)
  })

  it('shows « Exemple » on the card of a project of the examples account', async () => {
    publicServer.showcase = [exampleShowcaseItem, ...showcase.slice(0, 2)]
    await renderWithProviders(<ShowcaseScreen />)

    await screen.findByText(containing(exampleShowcaseItem.title))
    expect(badges()).toHaveLength(1)
  })

  it('shows no « Exemple » on the cards of ordinary members', async () => {
    await renderWithProviders(<ShowcaseScreen />)

    // Témoin : les cartes sont là.
    expect(await screen.findByText(containing(showcase[0]?.title ?? ''))).toBeTruthy()
    expect(badges()).toHaveLength(0)
  })

  it('has the card read « Exemple » by screen readers on the web', async () => {
    publicServer.showcase = [exampleShowcaseItem, ...showcase.slice(0, 2)]
    const restore = jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(<ShowcaseScreen />)

      await screen.findByText(containing(exampleShowcaseItem.title))
      // La carte est un lien nommé par le titre : le lecteur d'écran lit son nom, puis sa
      // description (`aria-describedby`, les textes de la carte par leur identifiant). « Exemple »
      // est dans l'un ou dans l'autre, comme le statut et l'auteur (scénario : « Un lecteur
      // d'écran lit « Exemple » comme le reste du texte »).
      const link = screen.getAllByRole('link', { name: containing(exampleShowcaseItem.title) })[0]
      const props = (link?.props ?? {}) as Record<string, unknown>
      const ids = String(props['aria-describedby'] ?? '')
        .split(' ')
        .filter(Boolean)
      const all = nodesOf(screen.root as unknown as TreeNode)
      const described = ids
        .map((id) => all.find((node) => node.props.nativeID === id))
        .map((node) => (node ? textOf(node) : ''))
      const read = [String(props.accessibilityLabel ?? props['aria-label'] ?? ''), ...described]
      expect(read.some((text) => text.includes(T.example))).toBe(true)
    } finally {
      restore.restore()
    }
  })
})

describe('the public page of a project of the examples account (R12b)', () => {
  const open = async (id: string, title: string) => {
    resetPublic(`/fr/projects/${id}`, { id, lang: 'fr' })
    mockSession(null)
    await renderWithProviders(<PublicProjectScreen id={id} />)
    return screen.findByRole('header', { name: containing(title) })
  }

  it('shows « Exemple » and says the project is made up', async () => {
    await open(exampleProjectId, examplePublicProject.title)

    expect(badges().length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(containing(T.projectNote))).toBeTruthy()
  })

  it('says it under the header of the project', async () => {
    const title = await open(exampleProjectId, examplePublicProject.title)

    const [header, note] = readingOrder(title, screen.getByText(containing(T.projectNote)))
    expect(header).toBeGreaterThanOrEqual(0)
    expect(note).toBeGreaterThan(header ?? Number.POSITIVE_INFINITY)
  })

  it('shows neither on the project of an ordinary member', async () => {
    await open(decollageId, decollage.title)

    // Témoin : la page est là, son statut aussi.
    expect(screen.getByText('Testable')).toBeTruthy()
    expect(badges()).toHaveLength(0)
    expect(screen.queryByText(containing(T.projectNote))).toBeNull()
  })
})

describe('the public page of the examples account (R12b)', () => {
  const open = async (id: string, name: string) => {
    resetPublic(`/fr/members/${id}`, { id, lang: 'fr' })
    mockSession(null)
    await renderWithProviders(<PublicMemberScreen id={id} />)
    return screen.findByRole('header', { name: containing(name) })
  }

  it('shows « Exemple » next to the name, and says its projects are made up', async () => {
    await open(exampleId, exampleName)

    expect(badges().length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(containing(T.memberNote))).toBeTruthy()
  })

  it('says it under the name', async () => {
    const name = await open(exampleId, exampleName)

    const [header, badge, note] = readingOrder(
      name,
      badges()[0],
      screen.getByText(containing(T.memberNote)),
    )
    expect(header).toBeGreaterThanOrEqual(0)
    expect(badge).toBeGreaterThanOrEqual(0)
    // La pastille est là ; la phrase vient après le nom (« dessous »).
    expect(note).toBeGreaterThan(header ?? Number.POSITIVE_INFINITY)
  })

  it('shows neither on the page of an ordinary member', async () => {
    await open(inesId, inesPublic.name)

    // Témoin : la page est là, sa bio aussi.
    expect(screen.getByText(containing(inesPublic.bio ?? ''))).toBeTruthy()
    expect(badges()).toHaveLength(0)
    expect(screen.queryByText(containing(T.memberNote))).toBeNull()
  })
})
