// Tests de la recherche par mots (refonte, tranche R3, docs/scenarios/refonte.md, « La recherche par
// mots ») : le texte vit dans l'adresse (/search?q=carn), la requête part 250 ms après la dernière
// frappe, dès 2 caractères ; les résultats en trois groupes, filtrés par des onglets qui disent leur
// nombre ; le surlignage ; l'annonce polie du nombre de résultats ; « rien trouvé », le quota, et
// « Annuler ». Le hook de l'API (search/api.ts, useSearch) est remplacé par un faux, qui ne répond
// qu'à partir de 2 caractères, comme le vrai.
import { appName } from '@ruche/brand'
import type { SearchMember, SearchProject, SearchResults, ToolCount } from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { ApiError } from '../api/errors'
import { getMe } from '../profile/api'
import { useSearch } from '../search/api'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { draftProject, recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SearchScreen } from './SearchScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien : le champ trouvé est
// celui de la page.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../search/api', () => ({ useSearch: jest.fn() }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés : le titre de l'onglet du
// navigateur (`pageTitle`) ne doit jamais contenir le texte cherché (relecture de sécurité, sec-A8).
const mockScreenProps: Record<string, unknown>[] = []
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
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockDismissTo = jest.fn()
const mockBack = jest.fn()
const mockSetParams = jest.fn()
let mockParams: { q?: string | string[] } = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/search',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    dismissTo: mockDismissTo,
    back: mockBack,
    canGoBack: () => true,
    setParams: mockSetParams,
  }),
  useLocalSearchParams: () => mockParams,
}))

// --- Des résultats ---

const projectHit = (
  id: string,
  title: string,
  extra: Partial<SearchProject> = {},
): SearchProject => ({
  ...summaryOf({ ...recipesProject, id, title }),
  excerpt: null,
  ...extra,
})
const cafes = projectHit('1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5', 'Carnet de cafés')
const garden = projectHit('9c4f5d1b-6e70-4f81-8c93-0d1e2f3a4b52', 'Le carnet de jardin', {
  author: { id: 'u3', name: 'Nora', avatarUrl: null },
})
const mine = { ...summaryOf(draftProject), title: 'Mon carnet secret', excerpt: null }
const camille: SearchMember = {
  id: 'u7',
  name: 'Camille Carnot',
  handle: 'camille_ot',
  avatarUrl: null,
  followerCount: 12,
}
const carnivore: ToolCount = { slug: 'carnivore-ai', label: 'Carnivore AI', projectCount: 7 }

/** La réponse de l'API pour « carn » : 3 projets, 1 membre, 1 outil. */
const carnResults: SearchResults = {
  projects: { items: [cafes, garden, mine], more: false },
  members: { items: [camille], more: false },
  tools: { items: [carnivore], more: false },
}
const nothing: SearchResults = {
  projects: { items: [], more: false },
  members: { items: [], more: false },
  tools: { items: [], more: false },
}

/** Ce que renvoie un useQuery de React Query, réduit à ce que l'écran lit. */
const queryResult = (overrides: Record<string, unknown>) =>
  ({
    data: undefined,
    status: 'pending',
    fetchStatus: 'idle',
    isPending: true,
    isLoading: false,
    isFetching: false,
    isSuccess: false,
    isError: false,
    isPlaceholderData: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ReturnType<typeof useSearch>

const answered = (data: SearchResults, overrides: Record<string, unknown> = {}) =>
  queryResult({
    data,
    status: 'success',
    fetchStatus: 'idle',
    isPending: false,
    isSuccess: true,
    ...overrides,
  })

/**
 * Le faux hook : comme le vrai, il ne cherche rien sous 2 caractères (requête inactive) ; au-delà,
 * il rend la réponse choisie par le test.
 */
const mockAnswer = (result: ReturnType<typeof useSearch>) =>
  jest
    .mocked(useSearch)
    .mockImplementation((q: string) => (q.trim().length >= 2 ? result : queryResult({})))

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  for (const mock of [mockPush, mockReplace, mockNavigate, mockDismissTo, mockBack, mockSetParams])
    mock.mockReset()
  mockScreenProps.length = 0
  mockParams = { q: 'carn' }
  jest.mocked(useSearch).mockReset()
  mockAnswer(answered(carnResults))
})

/** Le champ de la page, par son texte d'attente (le bouton loupe de la barre a le même nom). */
const field = () => screen.getByPlaceholderText(fr.t(($) => $.search.placeholder))

/** Les textes d'onglets : « Projets, 2 résultats » (le nombre affiché, « 2 », reste hors du nom). */
const tabName = (tab: 'projects' | 'members' | 'tools', count: number, more = false) =>
  fr.t(($) => $.search.tabWithCount, {
    tab: fr.t(($) => $.search.tabs[tab]),
    results: more
      ? fr.t(($) => $.search.resultsMore, { max: count })
      : fr.t(($) => $.search.results, { count }),
  })

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; parent: Node | null; children: (Node | string)[] }

const textOf = (node: Node | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Les parties surlignées d'un texte : ses enfants qui sont des textes imbriqués (HighlightedText). */
const marks = (text: Node): string[] =>
  text.children.filter((child): child is Node => typeof child !== 'string').map(textOf)

/** Vrai si un parent du texte est une région annoncée poliment (rôle « status » ou aria-live polite). */
const politelyAnnounced = (element: unknown): boolean => {
  for (let node = element as Node | null; node; node = node.parent) {
    const { role, accessibilityRole, accessibilityLiveRegion } = node.props
    const values = [role, accessibilityRole, node.props['aria-live'], accessibilityLiveRegion]
    if (values.some((value) => value === 'status' || value === 'polite')) return true
  }
  return false
}

/** Les adresses demandées au routeur, quelle que soit la méthode. */
const visitedPaths = () =>
  [mockPush, mockNavigate, mockReplace, mockDismissTo].flatMap((mock) =>
    mock.mock.calls.map((call) => pathOf(call[0])),
  )

const renderSearch = () => renderWithProviders(<SearchScreen />)

describe('SearchScreen, the address', () => {
  it('reads the searched text from the address', async () => {
    await renderSearch()

    expect(field().props.value).toBe('carn')
    expect(useSearch).toHaveBeenCalledWith('carn')
  })

  it('writes the text into the address at each keystroke, without a new page in the history', async () => {
    mockParams = {}
    await renderSearch()

    await fireEvent.changeText(field(), 'c')
    await fireEvent.changeText(field(), 'ca')

    // setParams remplace l'adresse ; push ajouterait une page à l'historique par lettre (jur-J5).
    expect(mockSetParams).toHaveBeenNthCalledWith(1, { q: 'c' })
    expect(mockSetParams).toHaveBeenNthCalledWith(2, { q: 'ca' })
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('SearchScreen, when the search starts', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('searches 250 ms after the last keystroke', async () => {
    mockParams = {}
    await renderSearch()

    await fireEvent.changeText(field(), 'c')
    await fireEvent.changeText(field(), 'ca')
    await fireEvent.changeText(field(), 'car')
    await act(async () => {
      jest.advanceTimersByTime(249)
    })
    // Pas encore : le membre tape peut-être encore.
    expect(jest.mocked(useSearch).mock.calls.map(([q]) => q)).not.toContain('car')
    expect(jest.mocked(useSearch).mock.calls.map(([q]) => q)).not.toContain('ca')

    await act(async () => {
      jest.advanceTimersByTime(1)
    })
    expect(useSearch).toHaveBeenLastCalledWith('car')
    // Les étapes de la frappe n'ont jamais été cherchées.
    expect(jest.mocked(useSearch).mock.calls.map(([q]) => q)).not.toContain('ca')
  })

  it('searches nothing under two characters, and says so', async () => {
    mockParams = {}
    await renderSearch()

    await fireEvent.changeText(field(), 'c')
    await act(async () => {
      jest.advanceTimersByTime(300)
    })

    expect(screen.getByText(containing(fr.t(($) => $.search.typeMore)))).toBeTruthy()
    expect(screen.queryByText('Carnet de cafés')).toBeNull()
  })
})

describe('SearchScreen, the results', () => {
  it('shows the projects, the members and the tools found', async () => {
    await renderSearch()

    expect(screen.getByText('Carnet de cafés')).toBeTruthy()
    expect(screen.getByText('Le carnet de jardin')).toBeTruthy()
    expect(screen.getByText('Camille Carnot')).toBeTruthy()
    expect(
      screen.getByText(
        containing(
          fr.t(($) => $.search.memberMeta, {
            handle: 'camille_ot',
            followers: fr.t(($) => $.follow.followers, { count: 12 }),
          }),
        ),
      ),
    ).toBeTruthy()
    expect(screen.getByText('Carnivore AI')).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.tools.projects, { count: 7 })))).toBeTruthy()
  })

  it('marks her own private projects as such', async () => {
    await renderSearch()

    expect(screen.getByText('Mon carnet secret')).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.member.private))).toBeTruthy()
  })

  it('shows the excerpt of the description that matched', async () => {
    mockAnswer(
      answered({
        ...nothing,
        projects: {
          items: [
            projectHit(cafes.id, 'Le café du matin', { excerpt: 'mon carnet de dégustation' }),
          ],
          more: false,
        },
      }),
    )
    await renderSearch()

    expect(
      screen.getByText(
        containing(fr.t(($) => $.search.excerpt, { excerpt: 'mon carnet de dégustation' })),
      ),
    ).toBeTruthy()
  })

  it('highlights the part of the text that matches', async () => {
    await renderSearch()

    const title = screen.getAllByText('Carnet de cafés')[0] as unknown as Node
    expect(marks(title)).toEqual(['Carn'])
    const name = screen.getAllByText('Camille Carnot')[0] as unknown as Node
    expect(marks(name)).toEqual(['Carn'])
  })

  it('opens a project, a member and a tool', async () => {
    await renderSearch()

    await fireEvent.press(screen.getByText('Carnet de cafés'))
    await fireEvent.press(screen.getByText('Camille Carnot'))
    await fireEvent.press(screen.getByText('Carnivore AI'))

    expect(visitedPaths()).toEqual([`/projects/${cafes.id}`, '/members/u7', '/tags/carnivore-ai'])
  })

  it('keeps the previous results while the next ones load', async () => {
    mockAnswer(answered(carnResults, { isFetching: true, isPlaceholderData: true }))
    await renderSearch()

    expect(screen.getByText('Carnet de cafés')).toBeTruthy()
    expect(screen.getByText('Camille Carnot')).toBeTruthy()
  })
})

describe('SearchScreen, the tabs', () => {
  it('offers « Tout · Projets 3 · Membres 1 · Outils 1 », « Tout » first and chosen', async () => {
    await renderSearch()

    expect(screen.getByRole('radio', { name: fr.t(($) => $.search.tabs.all) })).toBeChecked()
    expect(screen.getByRole('radio', { name: tabName('projects', 3) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: tabName('members', 1) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: tabName('tools', 1) })).toBeTruthy()
  })

  it('reads the number in the name, in the plural', async () => {
    // Témoin de l'aide : le nom lu tel que les traductions le composent.
    expect(tabName('projects', 3)).toBe('Projets, 3 résultats')
    expect(tabName('members', 1)).toBe('Membres, 1 résultat')
    expect(tabName('projects', 20, true)).toBe('Projets, 20 résultats ou plus')
  })

  it('says « 20+ » when a group has more than twenty results', async () => {
    const twenty = Array.from({ length: 20 }, (_, index) =>
      projectHit(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, `Carnet ${index}`),
    )
    mockAnswer(answered({ ...carnResults, projects: { items: twenty, more: true } }))
    await renderSearch()

    expect(screen.getByRole('radio', { name: tabName('projects', 20, true) })).toBeTruthy()
    expect(screen.getByText(containing('20+'))).toBeTruthy()
  })

  it('keeps only the members once « Membres » is chosen', async () => {
    await renderSearch()

    await fireEvent.press(screen.getByRole('radio', { name: tabName('members', 1) }))

    expect(screen.getByRole('radio', { name: tabName('members', 1) })).toBeChecked()
    expect(screen.getByText('Camille Carnot')).toBeTruthy()
    expect(screen.queryByText('Carnet de cafés')).toBeNull()
    expect(screen.queryByText('Carnivore AI')).toBeNull()
  })
})

describe('SearchScreen, what is announced', () => {
  it('announces « 3 projets, 1 membre, 0 outil » politely', async () => {
    mockAnswer(answered({ ...carnResults, tools: { items: [], more: false } }))
    await renderSearch()

    const summary = fr.t(($) => $.search.summary, {
      projects: fr.t(($) => $.search.projects, { count: 3 }),
      members: fr.t(($) => $.search.members, { count: 1 }),
      tools: fr.t(($) => $.search.tools, { count: 0 }),
    })
    // Témoin : la phrase telle que la planche la donne.
    expect(summary).toBe('3 projets, 1 membre, 0 outil')
    const spoken = screen.getByText(containing(summary), { includeHiddenElements: true })
    expect(politelyAnnounced(spoken)).toBe(true)
  })
})

describe('SearchScreen, nothing found', () => {
  it('shows the bee with its magnifying glass and « Aucun résultat pour « carnaval » »', async () => {
    mockParams = { q: 'carnaval' }
    mockAnswer(answered(nothing))
    await renderSearch()

    expect(
      screen.getByText(containing(fr.t(($) => $.search.emptyTitle, { q: 'carnaval' }))),
    ).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.search.empty)))).toBeTruthy()
    expect(
      screen.getByLabelText(
        fr.t(($) => $.mascot.search),
        { includeHiddenElements: true },
      ),
    ).toBeTruthy()
  })

  // Relecture de sécurité (sec-A8) : le texte cherché est montré tel quel, jamais interprété par
  // les traductions (« {{appName}} » ne devient pas le nom de l'appli), ni écrit dans le titre.
  it('shows a searched text that looks like {{appName}} as typed', async () => {
    const typed = '{{appName}}'
    mockParams = { q: typed }
    mockAnswer(answered(nothing))
    await renderSearch()

    expect(field().props.value).toBe(typed)
    // La phrase attendue est composée à la main : une marque remplacée par le texte tapé après la
    // traduction, pour que les traductions ne puissent pas l'interpréter ici non plus.
    const expected = fr.t(($) => $.search.emptyTitle, { q: '§' }).replace('§', typed)
    expect(screen.getByText(containing(expected))).toBeTruthy()
    expect(screen.queryByText(new RegExp(appName))).toBeNull()
    // Jamais dans le titre de la page, ni dans celui de l'onglet du navigateur.
    expect(mockScreenProps.length).toBeGreaterThan(0)
    for (const props of mockScreenProps) {
      for (const shown of [props.pageTitle, props.title]) {
        expect(String(shown ?? '')).not.toContain('appName')
        expect(String(shown ?? '')).not.toContain(appName)
      }
    }
  })
})

describe('SearchScreen, errors', () => {
  it('says « Trop de recherches, réessaie dans un instant. » on a 429', async () => {
    mockAnswer(
      queryResult({
        status: 'error',
        isPending: false,
        isError: true,
        error: new ApiError('rateLimited'),
      }),
    )
    await renderSearch()

    expect(screen.getByText(containing(fr.t(($) => $.search.tooMany)))).toBeTruthy()
  })

  it('offers to retry a search that failed', async () => {
    const failed = queryResult({
      status: 'error',
      isPending: false,
      isError: true,
      error: new ApiError('internal'),
    })
    mockAnswer(failed)
    await renderSearch()

    expect(screen.getByText(containing(fr.t(($) => $.search.errorTitle)))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })
})

describe('SearchScreen, where the field lives', () => {
  it('offers « Annuler » on a phone, which empties the search and goes back to Explore', async () => {
    await renderSearch()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.cancel) }))

    expect(visitedPaths()).toContain('/explore')
    // Vider : l'adresse ne garde pas « carn » (ni une nouvelle page par lettre).
    for (const [params] of mockSetParams.mock.calls) expect(params).not.toEqual({ q: 'carn' })
  })

  it('shows its own field on a medium window (ui-6)', async () => {
    const medium = { width: 900, height: 900, scale: 2, fontScale: 1 }
    const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
    Dimensions.set({ window: medium, screen: medium })
    try {
      await renderSearch()

      expect(field().props.value).toBe('carn')
      expect(screen.getByText('Carnet de cafés')).toBeTruthy()
    } finally {
      Dimensions.set({ window: phone, screen: phone })
    }
  })

  it('leaves the field to the top bar on a computer, without « Annuler »', async () => {
    const restore = setDesktopWindow()
    try {
      await renderSearch()

      // Témoin : les résultats sont là ; le champ est celui de la barre du haut (non dessinée).
      expect(screen.getByText('Carnet de cafés')).toBeTruthy()
      expect(screen.queryByPlaceholderText(fr.t(($) => $.search.placeholder))).toBeNull()
      expect(screen.queryByRole('button', { name: fr.t(($) => $.common.cancel) })).toBeNull()
    } finally {
      restore()
    }
  })
})

// --- Corrections après les relectures de R3 ---

/** La ligne d'état de la page (LiveStatus), lue même quand elle ne se montre pas. */
const statusRegion = () => screen.getByRole('status', { includeHiddenElements: true })

/** « 0 projet, 0 membre, 0 outil ». */
const zeroSummary = () =>
  fr.t(($) => $.search.summary, {
    projects: fr.t(($) => $.search.projects, { count: 0 }),
    members: fr.t(($) => $.search.members, { count: 0 }),
    tools: fr.t(($) => $.search.tools, { count: 0 }),
  })

describe('SearchScreen, the status line (ui-reviewer C3, design-reviewer 13)', () => {
  it('reads « 0 projet, 0 membre, 0 outil » when nothing is found, without showing it above « Aucun résultat »', async () => {
    mockParams = { q: 'carnaval' }
    mockAnswer(answered(nothing))
    await renderSearch()

    expect(statusRegion()).toHaveTextContent(zeroSummary())
    expect(screen.getByText(zeroSummary(), { includeHiddenElements: true })).not.toBeVisible()
    // Témoin : « Aucun résultat » est bien à l'écran.
    expect(
      screen.getByText(containing(fr.t(($) => $.search.emptyTitle, { q: 'carnaval' }))),
    ).toBeVisible()
  })

  it('shows the summary when something is found', async () => {
    await renderSearch()

    const summary = fr.t(($) => $.search.summary, {
      projects: fr.t(($) => $.search.projects, { count: 3 }),
      members: fr.t(($) => $.search.members, { count: 1 }),
      tools: fr.t(($) => $.search.tools, { count: 1 }),
    })
    expect(screen.getByText(summary)).toBeVisible()
  })

  it('keeps the status line mounted, empty, when the search fails', async () => {
    mockAnswer(
      queryResult({
        status: 'error',
        isPending: false,
        isError: true,
        error: new ApiError('internal'),
      }),
    )
    await renderSearch()

    // Toujours montée (une région remontée déjà pleine ne serait pas annoncée) ; la panne, elle,
    // est dite par l'alerte de son message.
    expect(statusRegion()).toHaveTextContent('')
    expect(screen.getByText(containing(fr.t(($) => $.search.errorTitle)))).toBeTruthy()
  })
})

describe('SearchScreen, under three letters (legal-reviewer C1)', () => {
  it('says that unfollowed members need three letters', async () => {
    mockParams = { q: 'ca' }
    mockAnswer(answered(nothing))
    await renderSearch()

    expect(screen.getByText(containing(fr.t(($) => $.search.shortQuery)))).toBeTruthy()
    // « Essaie un mot plus court » serait faux ici.
    expect(screen.queryByText(containing(fr.t(($) => $.search.empty)))).toBeNull()
  })

  it('does not say it from three letters on', async () => {
    mockParams = { q: 'car' }
    mockAnswer(answered(nothing))
    await renderSearch()

    expect(screen.getByText(containing(fr.t(($) => $.search.empty)))).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.search.shortQuery)))).toBeNull()
  })

  it('does not say it when one word has three letters, even next to a short one', async () => {
    mockParams = { q: 'ca carnaval' }
    mockAnswer(answered(nothing))
    await renderSearch()

    expect(screen.queryByText(containing(fr.t(($) => $.search.shortQuery)))).toBeNull()
  })
})

describe('SearchScreen, the pictures of the rows (ui-reviewer C6)', () => {
  /** Les images natives de la page dont l'adresse est `uri`, en parcourant l'arbre rendu. */
  const imagesOf = (uri: string): Node[] => {
    const found: Node[] = []
    const walk = (node: Node | string) => {
      if (typeof node === 'string') return
      const source = node.props.source as { uri?: string } | undefined
      if (source?.uri === uri) found.push(node)
      for (const child of node.children) walk(child)
    }
    walk(screen.root as unknown as Node)
    return found
  }

  it('shows the photo of a member found', async () => {
    const photo = 'https://api.example.test/media/camille.webp'
    mockAnswer(
      answered({
        ...carnResults,
        members: { items: [{ ...camille, avatarUrl: photo }], more: false },
      }),
    )
    await renderSearch()

    expect(imagesOf(photo).length).toBeGreaterThan(0)
    // Le nom de la ligne reste celui du membre : la photo ne s'y ajoute pas.
    expect(screen.getByRole('link', { name: 'Camille Carnot' })).toBeTruthy()
  })

  it('shows the initials of a member without a photo, and the initial tile of a tool', async () => {
    await renderSearch()

    // Décoratives : cachées des lecteurs d'écran, on les cherche quand même.
    expect(screen.getByText('CC', { includeHiddenElements: true })).toBeTruthy()
    expect(screen.getByText('C', { includeHiddenElements: true })).toBeTruthy()
  })
})
