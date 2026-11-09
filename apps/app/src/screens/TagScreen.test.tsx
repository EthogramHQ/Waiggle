// Tests de la page d'un outil du catalogue (tranche R6b, docs/scenarios/refonte.md, « La page d'un
// outil », planches `R6-Outil` et `R6-Outil-Desktop`). L'adresse reste /tags/<slug>.
//
// Ce que la page montre : l'en-tête de l'outil (son nom en titre, « 34 projets · Sans code », sa
// description et la phrase « Description écrite par Waiggle… », son site par la page « Tu quittes
// Waiggle ») ; les pastilles du statut (« Tous », « Testables », « Terminés ») ; le choix de la
// catégorie (une feuille sur téléphone, une rangée de pastilles sur ordinateur) ; les projets en
// tuiles, 50 par page, puis « Afficher la suite » ; les vides ; « Outil introuvable » ; et, pour un
// administrateur, « Modifier » (la feuille de l'outil).
//
// Les filtres vivent dans l'adresse, en anglais (`?status=testable&category=cooking`), lus une
// seule fois la page hydratée (relecture du plan, point 15). Le réseau est remplacé au plus bas
// (`api/client`) par un faux serveur : les vrais hooks (`tools/api.ts`, `categories/api.ts`, le
// profil) tournent, et le test lit les demandes reçues, filtres compris, sans dépendre de la forme
// que l'écran donne à ses hooks.
import {
  type CategoryList,
  type Me,
  type ProjectSummary,
  TOOL_PAGE_SIZE,
  type ToolPage,
} from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, View } from 'react-native'
import type { ApiResult } from '../api/errors'
import { categoryList } from '../testing/categories'
import { passTapGuard } from '../testing/dialog'
import { adminMe, leaMe } from '../testing/fixtures'
import { pathOf, visited } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { lendContains, lendPage, watchFocus } from './ProjectComments.testkit'
import { TagScreen } from './TagScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les tests web passent Platform.OS à 'web' : sans cette ligne, `useBrowserLanguage` (dans `Screen`)
// lirait la langue du navigateur simulé et passerait le premier test web en anglais.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
// Le réseau : `request` et `requestWithoutBody` passent par le faux serveur ci-dessous.
jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  request: (path: string, init: RequestInit, schema: Parseable) =>
    mockServer.request(path, init, schema),
  requestWithoutBody: async (path: string, init: RequestInit) => {
    const result = await mockServer.respond(path, init)
    return result.ok ? { ok: true, data: null } : result
  },
}))
// L'hydratation, pilotée par le test : `useHydrated` lit `mockHydration` (une petite source
// extérieure à React, comme le vrai, qui prévient la page quand elle change).
jest.mock('../ui/theme/hydration', () => {
  const { useSyncExternalStore } = jest.requireActual('react')
  return {
    ...jest.requireActual('../ui/theme/hydration'),
    useHydrated: () => useSyncExternalStore(mockHydration.subscribe, () => mockHydration.value),
  }
})
// Le cadre de page, tel quel, mais dont le test lit les propriétés : « Modifier » doit être son
// action du haut (`topAction`, relecture du plan, point 15).
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
const mockSetParams = jest.fn()
// Les paramètres de l'adresse, comme une source extérieure : `setParams` et `replace` les changent,
// et la page qui les lit se redessine (comme avec Expo Router).
jest.mock('expo-router', () => {
  const { useSyncExternalStore } = jest.requireActual('react')
  return {
    usePathname: () => '/tags/lovable',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      navigate: mockNavigate,
      setParams: mockSetParams,
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useNavigation: () => ({ addListener: () => () => {} }),
    useLocalSearchParams: () =>
      useSyncExternalStore(mockAddress.subscribe, () => mockAddress.params),
  }
})

type Parseable = { safeParse: (value: unknown) => { success: boolean; data?: unknown } }
type Sent = { method: string; path: string; body: unknown }
type Answer = ApiResult<unknown> | Promise<ApiResult<unknown>>

/** Une petite source de valeurs qui prévient ses abonnés (hydratation, adresse). */
const store = <T,>(initial: T) => ({
  value: initial,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  },
  set(next: T) {
    this.value = next
    for (const listener of this.listeners) listener()
  },
})

const mockHydration = store(true)
mockHydration.subscribe = mockHydration.subscribe.bind(mockHydration)

const mockAddress = {
  params: {} as Record<string, string | undefined>,
  listeners: new Set<() => void>(),
  subscribe: (listener: () => void) => {
    mockAddress.listeners.add(listener)
    return () => {
      mockAddress.listeners.delete(listener)
    }
  },
  set(params: Record<string, string | undefined>) {
    // Un paramètre `undefined` quitte l'adresse, comme avec `setParams` d'Expo Router.
    mockAddress.params = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined),
    )
    for (const listener of mockAddress.listeners) listener()
  },
}

const ok = (data: unknown): ApiResult<unknown> => ({ ok: true, data })
const TAG = /^\/v1\/tags\/([^?]+)(\?.*)?$/

/**
 * Le faux serveur. `tagPage` répond à GET /v1/tags/<slug> (le test le change) ; `answer` impose une
 * réponse à d'autres demandes ; le reste répond « introuvable » et reste noté dans `sent`.
 */
const mockServer = {
  sent: [] as Sent[],
  me: leaMe as Me,
  categories: categoryList('fr', { cooking: 2, animals: 1 }) as CategoryList,
  tagPage: (_slug: string, _query: URLSearchParams): Answer => ok(page()),
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],

  reset() {
    this.sent = []
    this.me = leaMe
    this.categories = categoryList('fr', { cooking: 2, animals: 1 })
    this.tagPage = () => ok(page())
    this.overrides = []
  },

  answer(method: string, path: RegExp, answer: (sent: Sent) => Answer) {
    this.overrides.push({ method, path, answer })
  },

  received(method: string, path: RegExp): Sent[] {
    return this.sent.filter((one) => one.method === method && path.test(one.path))
  },

  async respond(path: string, init: RequestInit): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null
    const sent = { method, path, body }
    this.sent.push(sent)
    const forced = this.overrides.find((one) => one.method === method && one.path.test(path))
    if (forced) return forced.answer(sent)
    if (method === 'GET' && path === '/v1/me') return ok(this.me)
    if (method === 'GET' && path.startsWith('/v1/categories')) return ok(this.categories)
    const tag = TAG.exec(path)
    if (method === 'GET' && tag) {
      return this.tagPage(decodeURIComponent(tag[1] ?? ''), new URLSearchParams(tag[2] ?? ''))
    }
    return { ok: false, error: 'notFound' }
  },

  /** Comme le vrai `request` : la réponse est lue avec le schéma du contrat. */
  async request(path: string, init: RequestInit, schema: Parseable) {
    const result = await this.respond(path, init)
    if (!result.ok) return result
    const parsed = schema.safeParse(result.data)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
  },
}

// --- Les données ---

const DESCRIPTION = 'Écrit une application web à partir d’une description en français.'

const lovable: ToolPage['tool'] = {
  slug: 'lovable',
  name: 'Lovable',
  family: 'no-code',
  description: DESCRIPTION,
  siteUrl: 'https://lovable.dev/',
  projectCount: 34,
}

/** Un identifiant de projet valide (UUID v4) tiré d'un numéro. */
const projectId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Un projet en tuile : un titre et un identifiant à lui. */
const tile = (n: number, title = `Projet numéro ${n}`): ProjectSummary => ({
  ...summaryOf(recipesProject),
  id: projectId(n),
  title,
})

const threeProjects = [
  tile(1, 'Mon agent de recettes'),
  tile(2, 'Le tri des photos'),
  tile(3, 'La cabane à oiseaux'),
]

/** Une page de l'outil : l'outil, ses catégories, des projets, et la page suivante. */
const page = (over: Partial<ToolPage> = {}): ToolPage => ({
  tool: lovable,
  categories: [
    { code: 'cooking', projectCount: 2 },
    { code: 'animals', projectCount: 1 },
  ],
  projects: threeProjects,
  nextCursor: null,
  ...over,
})

/** Les filtres des demandes GET /v1/tags reçues, dans l'ordre (sans le curseur s'il manque). */
const tagRequests = () =>
  mockServer.received('GET', TAG).map((one) => {
    const [, slug, query] = TAG.exec(one.path) ?? []
    return { slug, ...Object.fromEntries(new URLSearchParams(query ?? '')) }
  })

// --- Les textes ---

const STATUS_TESTABLE = fr.t(($) => $.tool.statusTestable)
const STATUS_DONE = fr.t(($) => $.tool.statusDone)
const ALL_CATEGORIES = fr.t(($) => $.tool.allCategories)
/** Le nom lu du bouton des catégories, « Cuisine » choisie : « Catégorie : Cuisine ». */
const COOKING_CHOSEN = fr.t(($) => $.tool.categoryChosen, { name: 'Cuisine' })
const SHEET_TITLE = fr.t(($) => $.tool.categorySheetTitle)
const MORE = fr.t(($) => $.tool.more)
const EDIT = fr.t(($) => $.tool.edit)
const EDIT_TITLE = fr.t(($) => $.moderation.catalogue.formEditTitle)
const NAME_FIELD = fr.t(($) => $.moderation.catalogue.name)
const SAVE = fr.t(($) => $.moderation.catalogue.save)
const CANCEL = fr.t(($) => $.moderation.catalogue.cancel)
const CLOSE = fr.t(($) => $.common.close)
const ABANDON = fr.t(($) => $.common.discardTitle)
const KEEP_EDITING = fr.t(($) => $.common.keepEditing)
/** « Cuisine, 2 projets » : une catégorie de la feuille, avec son nombre. */
const withCount = (name: string, count: number) =>
  fr.t(($) => $.tool.categoryWithCount, {
    name,
    projects: fr.t(($) => $.tools.projects, { count }),
  })

// --- Aides ---

/** Le nom lu d'une vue, qu'il soit écrit pour le natif ou pour le web. */
const nameOf = (props: Record<string, unknown> | null | undefined) =>
  props?.accessibilityLabel ?? props?.['aria-label']

/** La couche (le Modal) la plus proche au-dessus d'un élément, qui reçoit `onRequestClose`. */
const layerOf = (node: ReturnType<typeof screen.getByText>) => {
  let at: typeof node | null = node
  while (at && typeof at.props.onRequestClose !== 'function') at = at.parent
  if (!at) throw new Error('no Modal layer above this element')
  return at as typeof node & { props: { onRequestClose: () => void } }
}

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const hostsOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le voile d'une couche : caché aux lecteurs d'écran, il se trouve par ce qui le cache. */
const scrimOf = (layer: Node) => {
  const found = hostsOf(layer).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim in this layer')
  return found as never
}

/** La feuille des catégories est-elle ouverte ? Elle est nommée par son titre « Catégories ». */
const categorySheet = () => screen.queryByLabelText(SHEET_TITLE)

/** La feuille de l'outil (administrateur) est-elle ouverte ? Son champ « Nom » le dit. */
const editSheetOpen = () => screen.queryByLabelText(NAME_FIELD) !== null

/** Le bouton des catégories (téléphone), qu'une catégorie soit choisie ou non. */
const categoryButton = () =>
  screen.queryByRole('button', { name: ALL_CATEGORIES }) ??
  screen.getByRole('button', { name: COOKING_CHOSEN })

const probe = createRef<View>()
const renderTag = (slug = 'lovable') =>
  renderWithProviders(
    <>
      <View ref={probe} />
      <TagScreen slug={slug} />
    </>,
  )

/** La page dessinée et l'outil arrivé (témoin de chaque test). */
const renderLoaded = async (slug = 'lovable') => {
  await renderTag(slug)
  await screen.findByRole('header', { name: 'Lovable' })
}

beforeEach(() => {
  mockServer.reset()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  mockHydration.set(true)
  mockAddress.params = {}
  mockScreenProps.length = 0
  for (const mock of [mockPush, mockNavigate]) mock.mockReset()
  // `setParams` mêle les nouveaux paramètres à l'adresse ; `replace` vers /tags/… la remplace.
  mockSetParams.mockReset().mockImplementation((params: Record<string, string | undefined>) => {
    mockAddress.set({ ...mockAddress.params, ...params })
  })
  mockReplace.mockReset().mockImplementation((href: unknown) => {
    const path = pathOf(href)
    if (path.startsWith('/tags/')) {
      mockAddress.set(Object.fromEntries(new URLSearchParams(path.split('?')[1] ?? '')))
    }
  })
})

describe('TagScreen, the header of the tool', () => {
  it('shows the tool name as its title, its number of projects, its family and its description', async () => {
    await renderLoaded()

    expect(screen.getByRole('header', { name: 'Lovable' })).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.tools.projects, { count: 34 })))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.tools.family['no-code'])))).toBeTruthy()
    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(tagRequests()[0]).toEqual({ slug: 'lovable' })
  })

  it("says the description is written by the app, not by the tool's maker", async () => {
    await renderLoaded()

    expect(screen.getByText(containing(fr.t(($) => $.tool.disclaimer)))).toBeTruthy()
  })

  it('opens the site of the tool through the leaving page', async () => {
    await renderLoaded()

    await fireEvent.press(
      screen.getByRole('link', { name: fr.t(($) => $.tool.siteLink, { host: 'lovable.dev' }) }),
    )

    const leaving = visited(mockPush, mockNavigate).filter((path) => path.startsWith('/out'))
    expect(leaving).toHaveLength(1)
    expect(new URLSearchParams(leaving[0]?.split('?')[1]).get('url')).toBe('https://lovable.dev/')
  })

  it('shows the projects of the tool as tiles, and opens one', async () => {
    await renderLoaded()

    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Mon agent de recettes' }))

    expect(visited(mockPush, mockNavigate).map((href) => pathOf(href))).toContain(
      `/projects/${projectId(1)}`,
    )
  })
})

describe('TagScreen, the filters and the address', () => {
  it('filters by status, and keeps the filter in the address as ?status=', async () => {
    await renderLoaded()
    mockServer.tagPage = (_slug, query) =>
      ok(page({ projects: query.get('status') === 'testable' ? [tile(9, 'Testable seul')] : [] }))

    await fireEvent.press(screen.getByRole('radio', { name: STATUS_TESTABLE }))

    expect(await screen.findByRole('link', { name: 'Testable seul' })).toBeTruthy()
    expect(mockAddress.params).toEqual({ status: 'testable' })
    expect(tagRequests().at(-1)).toEqual({ slug: 'lovable', status: 'testable' })
    expect(screen.getByRole('radio', { name: STATUS_TESTABLE, checked: true })).toBeTruthy()
  })

  it('filters by category on a computer, with a row of pills, and keeps it as ?category=', async () => {
    const restore = setDesktopWindow()
    try {
      await renderLoaded()
      mockServer.tagPage = (_slug, query) =>
        ok(page({ projects: query.get('category') === 'cooking' ? [tile(8, 'Soupe')] : [] }))

      await fireEvent.press(screen.getByRole('radio', { name: /^Cuisine/ }))

      expect(await screen.findByRole('link', { name: 'Soupe' })).toBeTruthy()
      expect(mockAddress.params).toEqual({ category: 'cooking' })
      expect(tagRequests().at(-1)).toEqual({ slug: 'lovable', category: 'cooking' })
      // Seules les catégories de ses projets : ni « Jeux », ni « Musique ».
      expect(screen.queryByRole('radio', { name: /^Jeux/ })).toBeNull()
    } finally {
      restore()
    }
  })

  it('loads the page filtered by the address it was opened with', async () => {
    mockAddress.params = { status: 'done', category: 'cooking' }
    await renderLoaded()

    expect(tagRequests()).toEqual([{ slug: 'lovable', status: 'done', category: 'cooking' }])
    expect(screen.getByRole('radio', { name: STATUS_DONE, checked: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: COOKING_CHOSEN })).toBeTruthy()
  })

  it('reads the address only once hydrated, and loads the filtered page once', async () => {
    mockHydration.set(false)
    mockAddress.params = { status: 'testable', category: 'cooking' }
    await renderTag()
    await act(async () => {})
    // Avant l'hydratation, aucune lecture : ni la page sans filtre, ni une autre.
    expect(tagRequests()).toEqual([])

    await act(async () => mockHydration.set(true))

    expect(await screen.findByRole('header', { name: 'Lovable' })).toBeTruthy()
    expect(tagRequests()).toEqual([{ slug: 'lovable', status: 'testable', category: 'cooking' }])
  })

  it('ignores a malformed ?category= instead of showing an error', async () => {
    mockAddress.params = { category: 'Cuisine!' }
    await renderLoaded()

    expect(tagRequests()).toEqual([{ slug: 'lovable' }])
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.tool.errorTitle))).toBeNull()
  })

  it('replaces an alias address by the canonical one, keeping the filters', async () => {
    mockAddress.params = { status: 'testable', category: 'cooking' }
    mockServer.tagPage = () =>
      ok(page({ tool: { ...lovable, slug: 'chatgpt', name: 'ChatGPT', family: 'assistant' } }))
    await renderTag('chat-gpt')
    await screen.findByRole('header', { name: 'ChatGPT' })

    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
    const replaced = pathOf(mockReplace.mock.calls.at(-1)?.[0])
    const [path, query] = replaced.split('?')
    expect(path).toBe('/tags/chatgpt')
    expect(Object.fromEntries(new URLSearchParams(query ?? ''))).toEqual({
      status: 'testable',
      category: 'cooking',
    })
  })

  it('does not replace the address of a tool reached by its own name (witness)', async () => {
    await renderLoaded()

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('offers on a phone only the categories of its projects, each with its count, in a sheet with « Fermer » only', async () => {
    await renderLoaded()

    await fireEvent.press(screen.getByRole('button', { name: ALL_CATEGORIES }))

    const sheet = categorySheet()
    expect(sheet).toBeTruthy()
    const inside = within(layerOf(sheet as never))
    expect(inside.getByRole('radio', { name: withCount('Cuisine', 2) })).toBeTruthy()
    expect(inside.getByRole('radio', { name: withCount('Animaux', 1) })).toBeTruthy()
    expect(inside.queryByRole('radio', { name: /^Jeux/ })).toBeNull()
    expect(inside.getByRole('button', { name: CLOSE })).toBeTruthy()
    expect(inside.queryByRole('button', { name: CANCEL })).toBeNull()
    expect(inside.queryByRole('button', { name: fr.t(($) => $.project.form.ok) })).toBeNull()
  })

  describe('on the web, with the keyboard', () => {
    let returnPage: () => void = () => {}
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      returnPage = lendPage()
    })
    afterEach(() => returnPage())

    it('applies a category chosen in the sheet, closes it and gives focus back to the same button', async () => {
      await renderLoaded()
      await fireEvent.press(screen.getByRole('button', { name: ALL_CATEGORIES }))
      const restoreContains = lendContains(probe)
      const focus = watchFocus(probe)
      try {
        await fireEvent.press(screen.getByRole('radio', { name: withCount('Cuisine', 2) }))

        await waitFor(() => expect(categorySheet()).toBeNull())
        expect(mockAddress.params).toEqual({ category: 'cooking' })
        await waitFor(() =>
          expect(tagRequests().at(-1)).toEqual({ slug: 'lovable', category: 'cooking' }),
        )
        expect(categoryButton()).toBeTruthy()
        expect([ALL_CATEGORIES, COOKING_CHOSEN]).toContain(nameOf(focus.last() as never))
      } finally {
        focus.restore()
        restoreContains()
      }
    })
  })

  it('closes the category sheet with Escape and with the scrim, leaving the filter unchanged', async () => {
    await renderLoaded()
    const before = tagRequests().length

    // Échap : le Modal du web la change en `onRequestClose` (comme le bouton retour d'Android).
    await fireEvent.press(screen.getByRole('button', { name: ALL_CATEGORIES }))
    const first = categorySheet()
    expect(first).toBeTruthy()
    await act(async () => layerOf(first as never).props.onRequestClose())
    expect(categorySheet()).toBeNull()

    // Le voile, après la garde de double tape de l'ouverture.
    await fireEvent.press(screen.getByRole('button', { name: ALL_CATEGORIES }))
    const second = categorySheet()
    expect(second).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(scrimOf(layerOf(second as never) as never))
    expect(categorySheet()).toBeNull()

    expect(mockAddress.params).toEqual({})
    expect(tagRequests()).toHaveLength(before)
    expect(screen.getByRole('button', { name: ALL_CATEGORIES })).toBeTruthy()
  })
})

describe('TagScreen, more projects and empty lists', () => {
  const firstPage = Array.from({ length: TOOL_PAGE_SIZE }, (_, index) => tile(index + 1))
  const secondPage = Array.from({ length: 10 }, (_, index) => tile(TOOL_PAGE_SIZE + index + 1))

  const twoPages = () => {
    mockServer.tagPage = (_slug, query) =>
      query.get('cursor') === 'page-2'
        ? ok(page({ projects: secondPage, nextCursor: null }))
        : ok(page({ projects: firstPage, nextCursor: 'page-2' }))
  }

  it('adds the next 50 projects with « Afficher la suite », keeping the filters', async () => {
    twoPages()
    mockAddress.params = { status: 'testable' }
    await renderLoaded()
    expect(screen.getByRole('link', { name: 'Projet numéro 50' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Projet numéro 51' })).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: MORE }))

    expect(await screen.findByRole('link', { name: 'Projet numéro 60' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Projet numéro 1' })).toBeTruthy()
    expect(tagRequests().at(-1)).toEqual({ slug: 'lovable', status: 'testable', cursor: 'page-2' })
    expect(screen.queryByRole('button', { name: MORE })).toBeNull()
  })

  it('moves the focus to the first new tile when « Afficher la suite » disappears', async () => {
    twoPages()
    const restoreWeb = (() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      return lendPage()
    })()
    try {
      await renderLoaded()
      // « Le bouton contient le focus » : vrai pour toute vue (c'est lui qui l'avait).
      const restoreContains = lendContains(probe)
      const focus = watchFocus(probe)
      try {
        const button = screen.getByRole('button', { name: MORE })
        await fireEvent(button, 'focus')
        await fireEvent.press(button)
        await screen.findByRole('link', { name: 'Projet numéro 60' })

        await waitFor(() => expect(nameOf(focus.last() as never)).toBe('Projet numéro 51'))
      } finally {
        focus.restore()
        restoreContains()
      }
    } finally {
      restoreWeb()
    }
  })

  it('invites to publish when the tool has no project yet', async () => {
    mockServer.tagPage = () =>
      ok(page({ tool: { ...lovable, projectCount: 0 }, categories: [], projects: [] }))
    await renderLoaded()

    expect(screen.getByRole('header', { name: fr.t(($) => $.tool.emptyTitle) })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: /^Publier/ }))
    expect(visited(mockPush, mockNavigate)).toContain('/projects/new')
  })

  it('says when no project matches the filters, and « Voir tous les projets » clears them', async () => {
    mockAddress.params = { status: 'done', category: 'cooking' }
    mockServer.tagPage = (_slug, query) =>
      ok(page({ projects: query.get('status') || query.get('category') ? [] : threeProjects }))
    await renderLoaded()

    expect(screen.getByText(fr.t(($) => $.tool.emptyFiltered))).toBeTruthy()
    // Pas l'invitation d'un outil sans projet : l'outil en a, mais pas pour ces filtres.
    expect(screen.queryByRole('header', { name: fr.t(($) => $.tool.emptyTitle) })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.tool.clearFilters) }))

    expect(await screen.findByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(mockAddress.params).toEqual({})
  })
})

describe('TagScreen, a tool that is not in the catalogue', () => {
  it('shows « Outil introuvable » for an other tool or an unknown name', async () => {
    mockServer.tagPage = () => ({ ok: false, error: 'notFound' })
    await renderTag('teachable-machine')

    expect(
      await screen.findByRole('header', { name: fr.t(($) => $.tool.notFoundTitle) }),
    ).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.tool.notFound))).toBeTruthy()
  })

  it('offers a way out from « Outil introuvable »', async () => {
    mockServer.tagPage = () => ({ ok: false, error: 'notFound' })
    await renderTag('teachable-machine')
    await screen.findByRole('header', { name: fr.t(($) => $.tool.notFoundTitle) })

    const out = fr.t(($) => $.tool.seeAllTools)
    await fireEvent.press(
      screen.queryByRole('link', { name: out }) ?? screen.getByRole('button', { name: out }),
    )

    expect(visited(mockPush, mockNavigate, mockReplace).map((href) => pathOf(href))).toContain(
      '/tools',
    )
  })

  it('says when the tool could not load, and offers to retry', async () => {
    mockServer.tagPage = () => ({ ok: false, error: 'internal' })
    await renderTag()

    await fireEvent.press(await screen.findByRole('button', { name: fr.t(($) => $.common.retry) }))

    expect(tagRequests().length).toBeGreaterThanOrEqual(2)
  })
})

describe('TagScreen, for an administrator', () => {
  const adminLovable = {
    slug: 'lovable',
    name: 'Lovable',
    family: 'no-code',
    descriptionFr: DESCRIPTION,
    descriptionEn: 'Writes a web application from a description in English.',
    siteUrl: 'https://lovable.dev/',
    aliases: [],
    projectCount: 34,
  }

  beforeEach(() => {
    mockServer.me = adminMe
    mockSession({ user: { id: adminMe.id, name: adminMe.name } })
    // Les champs de l'outil dans les deux langues, si la feuille les relit (catalogue d'administration).
    mockServer.answer('GET', /^\/v1\/moderation\/tools(\?|$)/, () =>
      ok({ items: [adminLovable], nextCursor: null }),
    )
    mockServer.answer('PATCH', /^\/v1\/moderation\/tools\/lovable$/, (sent) =>
      ok({ ...adminLovable, ...(sent.body as object) }),
    )
  })

  /** Ouvre la feuille de l'outil et change son nom (la feuille est alors « modifiée »). */
  const openAndChange = async () => {
    await renderLoaded()
    await fireEvent.press(await screen.findByRole('button', { name: EDIT }))
    const name = await screen.findByLabelText(NAME_FIELD)
    await waitFor(() => expect(name).toHaveDisplayValue('Lovable'))
    await fireEvent.changeText(name, 'Lovable Studio')
  }

  /** Revient à la feuille après la question « Abandonner les changements ? ». */
  const keepEditing = async () => {
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: KEEP_EDITING }))
  }

  it('puts « Modifier » in the top action row for an administrator only', async () => {
    await renderLoaded()
    expect(await screen.findByRole('button', { name: EDIT })).toBeTruthy()
    expect(mockScreenProps.some((props) => props.topAction)).toBe(true)
  })

  it('shows no « Modifier » to a member who is not an administrator', async () => {
    mockServer.me = leaMe
    mockSession({ user: { id: leaMe.id, name: leaMe.name } })
    await renderLoaded()
    // Témoin : le profil est lu (la page sait qui regarde) avant de conclure à l'absence.
    await waitFor(() => expect(mockServer.received('GET', /^\/v1\/me$/).length).toBeGreaterThan(0))
    await act(async () => {})

    expect(screen.queryByRole('button', { name: EDIT })).toBeNull()
    expect(mockScreenProps.every((props) => !props.topAction)).toBe(true)
  })

  it('opens the edit sheet filled with the tool, and saves the new name', async () => {
    await openAndChange()
    expect(screen.getByLabelText(EDIT_TITLE)).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: SAVE }))

    await waitFor(() => expect(editSheetOpen()).toBe(false))
    const saved = mockServer.received('PATCH', /^\/v1\/moderation\/tools\/lovable$/)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.body).toMatchObject({ name: 'Lovable Studio' })
  })

  it('closes an unmodified edit sheet without asking (witness)', async () => {
    await renderLoaded()
    await fireEvent.press(await screen.findByRole('button', { name: EDIT }))
    await screen.findByLabelText(NAME_FIELD)

    await fireEvent.press(screen.getByRole('button', { name: CANCEL }))

    expect(screen.queryByText(ABANDON)).toBeNull()
    expect(editSheetOpen()).toBe(false)
  })

  it('asks « Abandonner les changements ? » when a modified edit sheet is closed by Escape, the scrim, « Annuler » or « Fermer »', async () => {
    await openAndChange()
    const ways: [string, () => Promise<void>][] = [
      // Échap : le Modal du web la change en `onRequestClose`.
      [
        'Escape',
        async () => {
          await act(async () => layerOf(screen.getByLabelText(NAME_FIELD)).props.onRequestClose())
        },
      ],
      [
        'scrim',
        async () => {
          await passTapGuard()
          await fireEvent.press(scrimOf(layerOf(screen.getByLabelText(NAME_FIELD)) as never))
        },
      ],
      ['Annuler', () => fireEvent.press(screen.getByRole('button', { name: CANCEL }))],
      [
        'Fermer',
        () =>
          fireEvent.press(
            within(layerOf(screen.getByLabelText(NAME_FIELD))).getByRole('button', {
              name: CLOSE,
            }),
          ),
      ],
    ]

    const asked: string[] = []
    for (const [way, close] of ways) {
      await close()
      if (screen.queryAllByText(ABANDON).length > 0) asked.push(way)
      await keepEditing()
      // La feuille reste, avec ce qui a été tapé.
      expect({ way, kept: screen.getByLabelText(NAME_FIELD).props.value }).toEqual({
        way,
        kept: 'Lovable Studio',
      })
    }

    expect(asked).toEqual(['Escape', 'scrim', 'Annuler', 'Fermer'])
    expect(mockServer.received('PATCH', /moderation/)).toHaveLength(0)
  })

  it('refuses to close the edit sheet while it saves', async () => {
    let answer: (value: ApiResult<unknown>) => void = () => {}
    mockServer.overrides = mockServer.overrides.filter((one) => one.method !== 'PATCH')
    mockServer.answer(
      'PATCH',
      /^\/v1\/moderation\/tools\/lovable$/,
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    await openAndChange()

    await fireEvent.press(screen.getByRole('button', { name: SAVE }))
    await act(async () => layerOf(screen.getByLabelText(NAME_FIELD)).props.onRequestClose())
    await fireEvent.press(screen.getByRole('button', { name: CANCEL }))
    await fireEvent.press(
      within(layerOf(screen.getByLabelText(NAME_FIELD))).getByRole('button', { name: CLOSE }),
    )

    expect(editSheetOpen()).toBe(true)
    expect(screen.queryByText(ABANDON)).toBeNull()
    expect(mockServer.received('PATCH', /moderation/)).toHaveLength(1)
    await act(async () => answer(ok({ ...adminLovable, name: 'Lovable Studio' })))
  })
})
