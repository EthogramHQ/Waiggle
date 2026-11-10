// Tests de l'en-tête de la page d'un projet (R5a, ProjectHeader) : la ligne de dates et la ligne de
// l'auteur, dont la pastille « Suivre » dit d'emblée si le membre qui regarde suit déjà l'auteur.
// `Project.author` ne le dit pas : l'en-tête le lit par la page du membre (`useMember`, le même
// hook que MemberScreen, sans changer l'API). Tant que la lecture n'a pas répondu, aucune pastille
// (question de TW-3, tranchée par la session le 2/11 : pas de « Suivre » qui bascule).
//
// R6b (scénario « Les catégories en filtre », « La page d'un projet », relecture du plan,
// décisions 15) : la catégorie à côté du statut, nommée par l'API (GET /v1/categories), est un lien
// vers Explorer filtré (`/explore?category=science`) ; pendant le chargement, aucune catégorie ;
// un code que l'API ne connaît pas : aucune catégorie, jamais le code brut, et une seule relecture.
import type { Member } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { getMe } from '../profile/api'
import { categoryList, categoryName } from '../testing/categories'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import { ProjectHeader } from './ProjectHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La page du membre : un faux hook, dont chaque test choisit la réponse (chargement, lue, échec).
jest.mock('../members/api', () => ({ useMember: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// R6b : le faux réseau, pour GET /v1/categories (les noms des catégories viennent de l'API).
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
// R6b : un `Link` d'Expo Router devient un texte au rôle de lien, qui passe son adresse à `push`.
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/projects/p1',
    useRouter: () => ({
      push: mockPush,
      navigate: mockNavigate,
      replace: jest.fn(),
      back: jest.fn(),
    }),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

/** Ce que répond le faux réseau à GET /v1/categories, choisi par chaque test. */
let mockCategories: () => Promise<unknown> = () => Promise.resolve(categoryList('fr'))
const categoryReads = () =>
  jest.mocked(request).mock.calls.filter(([path]) => String(path).startsWith('/v1/categories'))
    .length

const mockToggle = jest.fn()
/** Le projet de Léa (u1), vu par Max (u2). */
const seenByMax = { ...recipesProject, isMine: false }

/** La réponse du faux `useMember` : seuls `data` et `isError` comptent pour l'en-tête. */
type MemberQuery = ReturnType<typeof useMember>
const loading = { data: undefined, isError: false, isPending: true } as unknown as MemberQuery
const failed = { data: undefined, isError: true, isPending: false } as unknown as MemberQuery
const read = (isFollowed: boolean) =>
  ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed } as Member,
    isError: false,
    isPending: false,
  }) as unknown as MemberQuery

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockToggle.mockReset()
  mockPush.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  jest.mocked(useMember).mockReset().mockReturnValue(loading)
  mockNavigate.mockReset()
  mockCategories = () => Promise.resolve(categoryList('fr'))
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) => {
      if (!path.startsWith('/v1/categories')) return { ok: false, error: 'internal' }
      try {
        return { ok: true, data: await mockCategories() }
      } catch {
        return { ok: false, error: 'internal' }
      }
    }) as typeof request)
})

describe('following the author from the header', () => {
  it('says « Tu suis Léa » at opening when the member already follows her', async () => {
    jest.mocked(useMember).mockReturnValue(read(true))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    expect(await screen.findByRole('switch', { name: 'Tu suis Léa' })).toBeChecked()
    expect(screen.queryByRole('switch', { name: 'Suivre Léa' })).toBeNull()
    expect(useMember).toHaveBeenCalledWith('u1')
  })

  it('shows no chip while the page of the author is loading', async () => {
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    // Témoin : la ligne de l'auteur est là, sans la pastille.
    expect(await screen.findByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Suivre')).toBeNull()
  })

  it('offers « Suivre » once read, then says « Tu suis Léa » after the tap', async () => {
    jest.mocked(useMember).mockReturnValue(read(false))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    const chip = await screen.findByRole('switch', { name: 'Suivre Léa' })
    expect(chip).not.toBeChecked()
    expect(screen.getByText('@lea')).toBeTruthy()
    await fireEvent.press(chip)

    // L'état affiché part avec le toucher : retoucher plus tard demandera l'inverse.
    expect(mockToggle).toHaveBeenCalledWith(false)
    expect(await screen.findByRole('switch', { name: 'Tu suis Léa' })).toBeChecked()
  })

  it('offers no chip when the page of the author could not be read', async () => {
    // Décision de Louis du 2/11/2026 : sans la page de l'auteur, on ne sait pas si on le suit, et
    // « Suivre » échouerait sans doute aussi. Avant : « Suivre » était proposé quand même.
    jest.mocked(useMember).mockReturnValue(failed)
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    // Témoin : la ligne de l'auteur est là, sans la pastille.
    expect(await screen.findByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Suivre')).toBeNull()
  })

  it('offers no chip next to one’s own name', async () => {
    jest.mocked(useMember).mockReturnValue(read(false))
    await renderWithProviders(<ProjectHeader project={recipesProject} />)

    expect(await screen.findByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows no failure of a chip that was not touched', async () => {
    // Le faux hook dit « échec » dès le départ (comme quand Suivre ce projet a échoué) : la ligne
    // de l'auteur ne le reprend pas, faute d'un geste fait chez elle.
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    jest.mocked(useMember).mockReturnValue(read(false))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    expect(await screen.findByRole('switch', { name: 'Suivre Léa' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lets a suspended member stop following, but not follow', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    jest.mocked(useMember).mockReturnValue(read(true))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    // Témoin du profil lu : la pastille reste pour ne plus suivre.
    const chip = await screen.findByRole('switch', { name: 'Tu suis Léa' })
    await fireEvent.press(chip)
    expect(mockToggle).toHaveBeenCalledWith(true)

    // Retirée pendant la visite : à sa place, inactive.
    const again = await screen.findByRole('switch', { name: 'Suivre Léa' })
    expect(again).toBeDisabled()
  })

  it('leads to the page of the author', async () => {
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Voir la page de Léa' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u1' } })
  })
})

describe('the dates under the title', () => {
  const now = new Date('2026-10-20T10:00:00.000Z')

  it('says « Publié le 12 oct. » and reads the full date', async () => {
    await renderWithProviders(<ProjectHeader project={seenByMax} now={now} />)

    expect(await screen.findByText('Publié le 12 oct.')).toBeTruthy()
    expect(screen.queryByText(/Mis à jour/)).toBeNull()
  })

  // R7a : « Mis à jour » suit la dernière mise à jour publiée, plus une modification du projet.
  it('adds « Mis à jour » after an update, and not after a change of the project', async () => {
    await renderWithProviders(
      <ProjectHeader
        project={{ ...seenByMax, latestUpdate: rocketUpdate, updateCount: 1, version: 'v1.2' }}
        now={now}
      />,
    )

    expect(await screen.findByText('Publié le 12 oct.')).toBeTruthy()
    expect(screen.getByText(containing('Mis à jour hier'))).toBeTruthy()
    expect(screen.getByText(containing('v1.2'))).toBeTruthy()
  })

  it('says nothing of a change of the project without an update', async () => {
    await renderWithProviders(
      <ProjectHeader project={{ ...seenByMax, updatedAt: '2026-10-19T09:00:00.000Z' }} now={now} />,
    )

    expect(await screen.findByText('Publié le 12 oct.')).toBeTruthy()
    expect(screen.queryByText(/Mis à jour/)).toBeNull()
  })

  it('says « Créé » for a private project', async () => {
    await renderWithProviders(
      <ProjectHeader project={{ ...recipesProject, visibility: 'private' }} now={now} />,
    )

    expect(await screen.findByText('Créé le 12 oct.')).toBeTruthy()
    expect(screen.queryByText(/Publié/)).toBeNull()
  })
})

// R6b : la catégorie à côté du statut (scénario « Les catégories en filtre », « La page d'un projet »).
describe('the category next to the status', () => {
  const science = categoryName('science')
  /** Le projet de Léa, classé « Sciences et espace » puis « Apprendre ». */
  const scienceProject = {
    ...seenByMax,
    primaryCategory: 'science',
    secondaryCategory: 'learning',
  }
  const visitedPaths = () =>
    [...mockPush.mock.calls, ...mockNavigate.mock.calls].map((call) => pathOf(call[0]))

  it('names the categories as the API does', async () => {
    await renderWithProviders(<ProjectHeader project={scienceProject} />)

    expect(await screen.findByText(containing(science))).toBeTruthy()
    expect(screen.getByText(containing(categoryName('learning')))).toBeTruthy()
    expect(categoryReads()).toBe(1)
  })

  it('opens Explore filtered on the category when touched', async () => {
    await renderWithProviders(<ProjectHeader project={scienceProject} />)

    // Le lien de la catégorie (la principale, ou la ligne entière « Sciences et espace · Apprendre »).
    const links = await screen.findAllByRole('link', { name: containing(science) })
    await fireEvent.press(links[0] as never)

    expect(visitedPaths()).toContain('/explore?category=science')
  })

  it('shows no category while the categories load', async () => {
    mockCategories = () => new Promise(() => {})
    await renderWithProviders(<ProjectHeader project={scienceProject} />)

    // Témoin : l'en-tête est là, son titre aussi.
    expect(await screen.findByRole('header', { name: scienceProject.title })).toBeTruthy()
    expect(screen.queryByText(containing(science))).toBeNull()
    expect(screen.queryByText(/science/)).toBeNull()
    expect(screen.queryByRole('link', { name: containing(science) })).toBeNull()
  })

  it('shows no category rather than the raw code of an unknown category, and refetches the categories once', async () => {
    await renderWithProviders(
      <ProjectHeader
        project={{ ...seenByMax, primaryCategory: 'pottery', secondaryCategory: null }}
      />,
    )

    // La liste est lue, le code n'y est pas : une relecture (une catégorie créée entre-temps), une seule.
    await waitFor(() => expect(categoryReads()).toBe(2))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(categoryReads()).toBe(2)
    expect(screen.getByRole('header', { name: seenByMax.title })).toBeTruthy()
    expect(screen.queryByText(/pottery/)).toBeNull()
    expect(screen.queryByText(/project\.category/)).toBeNull()
    expect(visitedPaths()).toEqual([])
    expect(screen.queryAllByRole('link').map((link) => link.props.href)).not.toContain(
      '/explore?category=pottery',
    )
  })
})
