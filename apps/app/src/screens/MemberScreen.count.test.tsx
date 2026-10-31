// Tests de la page d'un membre, corrections après la relecture de R3 : le titre de la liste au
// plafond de l'API (« Mes projets · 50+ », lu « 50 projets ou plus ») et la roue « Réglages » posée
// sur la rangée du « Retour ». Fichier à part de MemberScreen.test.tsx (les tests de la commande ne
// changent pas) ; mêmes faux modules, réduits à ce que ces tests lisent.
import { PROJECT_LIST_MAX } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { leaPage, projectWithPhotos, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { MemberScreen } from './MemberScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
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
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
// L'adresse de la page : /members/u1 (avec « Retour ») ou /me (sans), choisie par chaque test.
let mockPathname = '/members/u1'
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

/** Une page de membre avec `count` projets (les identifiants changent d'un projet à l'autre). */
const pageWith = (count: number, isMe: boolean) => ({
  ...leaPage,
  isMe,
  projects: Array.from({ length: count }, (_, rank) => ({
    ...summaryOf(projectWithPhotos),
    id: `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`,
    title: `Projet ${rank + 1}`,
  })),
})

/** Le texte affiché d'un élément, ses morceaux réunis, ses blancs ramenés à des espaces simples. */
const shownText = (element: { props: { children?: unknown } }): string => {
  const flatten = (node: unknown): string =>
    typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : Array.isArray(node)
        ? node.map(flatten).join('')
        : node && typeof node === 'object' && 'props' in node
          ? flatten((node as { props: { children?: unknown } }).props.children)
          : ''
  return flatten(element.props.children).replace(/\s+/g, ' ')
}

type Node = { props: Record<string, unknown>; parent: Node | null }

beforeEach(() => {
  mockPathname = '/members/u1'
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
})

describe('MemberScreen, the count of the projects', () => {
  it('says « 50+ » at the cap of the list, read « 50 projets ou plus »', async () => {
    jest.mocked(getMember).mockResolvedValue(pageWith(PROJECT_LIST_MAX, false))
    await renderWithProviders(<MemberScreen id="u1" />)

    const name = `${fr.t(($) => $.member.projects)}, ${fr.t(($) => $.member.projectCountMore, {
      max: PROJECT_LIST_MAX,
    })}`
    const title = await screen.findByRole('header', { name })
    expect(shownText(title)).toBe(`${fr.t(($) => $.member.projects)} · ${PROJECT_LIST_MAX}+`)
  })

  it('says the exact number under the cap', async () => {
    jest.mocked(getMember).mockResolvedValue(pageWith(PROJECT_LIST_MAX - 1, true))
    await renderWithProviders(<MemberScreen id="u1" />)

    const count = PROJECT_LIST_MAX - 1
    const name = `${fr.t(($) => $.me.myProjects)}, ${fr.t(($) => $.member.projectCount, { count })}`
    const title = await screen.findByRole('header', { name })
    expect(shownText(title)).toBe(`${fr.t(($) => $.me.myProjects)} · ${count}`)
  })
})

describe('MemberScreen, the gear of her own page', () => {
  const gearName = fr.t(($) => $.nav.settings)
  const backName = fr.t(($) => $.common.back)

  it('puts the gear on the row of « Retour » (/members/<herself>)', async () => {
    jest.mocked(getMember).mockResolvedValue(pageWith(3, true))
    await renderWithProviders(<MemberScreen id="u1" />)

    const gear = (await screen.findByRole('button', { name: gearName })) as unknown as Node
    const back = screen.getByRole('button', { name: backName }) as unknown as Node
    // Le premier parent commun des deux boutons est une rangée : ils sont côte à côte.
    const above = new Set<Node>()
    for (let node: Node | null = back; node; node = node.parent) above.add(node)
    let row: Node | null = gear.parent
    while (row && !above.has(row)) row = row.parent
    const style = Object.assign({}, ...[row?.props.style].flat(3).filter(Boolean))
    expect(style.flexDirection).toBe('row')
  })

  it('keeps the gear without « Retour » on /me', async () => {
    mockPathname = '/me'
    jest.mocked(getMember).mockResolvedValue(pageWith(3, true))
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('button', { name: gearName })).toBeTruthy()
    expect(screen.queryByRole('button', { name: backName })).toBeNull()
  })
})
