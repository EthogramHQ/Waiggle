// Tests de la page du compte d'exemples vue par un membre (tranche R12b, scénario « Les exemples ») :
// la pastille « Exemple » à côté du nom, et dessous « Les projets de ce compte sont fictifs :
// l'équipe de {{appName}} les a créés pour montrer à quoi ressemble un projet. ». La page d'un membre
// ordinaire n'a ni l'une ni l'autre. La page publique, vue par un visiteur : PublicExamples.test.tsx.
//
// L'interface attendue : `MemberScreen` lit `member.example` (contrat `Member`) et pose
// `ui/ExampleBadge`. Mêmes faux appels que MemberScreen.publicPage.test.tsx ; la page vient de
// `testing/projects.ts` (`examplePage`, le compte « WaiggleBot » et « Le carnet des plantes »).
import { screen } from '@testing-library/react-native'
import { useBlock, useUnblock } from '../blocks/api'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { examplePage, leaPage } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { MemberScreen } from './MemberScreen'

jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../blocks/api', () => ({ useBlock: jest.fn(), useUnblock: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
jest.mock('expo-router', () => ({
  usePathname: () => '/members/u-example',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

const T = {
  example: fr.t(($) => $.common.example),
  note: fr.t(($) => $.member.exampleNote),
}

/** Les pastilles « Exemple » lues à l'écran (cachées aux lecteurs d'écran : pas comptées). */
const badges = () => screen.queryAllByText(T.example)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type TreeNode = { children: (TreeNode | string)[] }
/** La place de chaque élément dans l'ordre de lecture (l'arbre, en profondeur d'abord). */
const readingOrder = (...elements: unknown[]) => {
  const order: unknown[] = []
  const walk = (node: TreeNode) => {
    order.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return elements.map((element) => order.indexOf(element))
}

beforeEach(() => {
  // Max regarde : ni la page de Léa ni celle du compte d'exemples ne sont les siennes.
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest
    .mocked(useBlock)
    .mockReturnValue({ block: jest.fn() } as unknown as ReturnType<typeof useBlock>)
  jest
    .mocked(useUnblock)
    .mockReturnValue({ unblock: jest.fn() } as unknown as ReturnType<typeof useUnblock>)
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
})

/** Ouvre la page de ce membre et attend son nom. */
const open = async (member = examplePage) => {
  jest.mocked(getMember).mockResolvedValue(member)
  await renderWithProviders(<MemberScreen id={member.id} />)
  return screen.findByRole('header', { name: containing(member.name) })
}

describe('the page of the examples account (R12b)', () => {
  it('shows « Exemple » next to the name', async () => {
    await open()

    expect(badges().length).toBeGreaterThanOrEqual(1)
  })

  it('says under the name that the projects of this account are made up', async () => {
    const name = await open()

    const note = screen.getByText(containing(T.note))
    const [header, said] = readingOrder(name, note)
    expect(header).toBeGreaterThanOrEqual(0)
    expect(said).toBeGreaterThan(header ?? Number.POSITIVE_INFINITY)
  })

  it('shows neither on the page of an ordinary member', async () => {
    await open(leaPage)

    // Témoin : la page est là, sa bio aussi.
    expect(screen.getByText(containing(leaPage.bio))).toBeTruthy()
    expect(badges()).toHaveLength(0)
    expect(screen.queryByText(containing(T.note))).toBeNull()
  })
})
