// Tests de l'onglet « Vitrine de l'accueil » de la modération (tranche R12, docs/scenarios/refonte.md,
// « La vitrine », Q9, planche R12-Vitrine ; relecture juridique 6 et décision 18) : « Sur l'accueil »
// et son compte « 3 sur 4 », les projets dans l'ordre, « Une place libre » ; « Mettre en avant » un
// projet public, qui entre à la dernière place ; « Retirer » ; quatre au plus (« L'accueil est
// plein… ») ; « Modifié depuis la mise en avant » ; le refus de l'auteur (409 `author_declined`)
// dit dans l'onglet, la vitrine inchangée ; la recherche parmi les projets publics.
//
// Ce que ces tests supposent du composant (plan R12, UI-G, choix 10, « API des modules partagés » ;
// à corriger si le code en décide autrement, en le disant) :
// - `moderation/ShowcaseTab.tsx`, `ShowcaseTab()` sans prop, monté par `ModerationScreen` ;
// - il lit GET /v1/moderation/showcase (`ModerationShowcase`) et écrit la vitrine entière par PUT
//   /v1/moderation/showcase (`ShowcaseOrder`, `{ projectIds }` dans l'ordre), puis relit ; le faux
//   serveur répond à PUT par la vitrine nouvelle (`ModerationShowcase`), avec `request` comme avec
//   `requestWithoutBody` : la forme des hooks de `showcase/api.ts` est libre ;
// - « Retirer {{title}} de l'accueil » et « Mettre en avant {{title}} » sont des boutons nommés ;
// - l'ordre : un projet ajouté prend la dernière place. Aucun texte « Monter » ou « Descendre »
//   n'existe : l'ordre se règle en retirant puis en remettant (question au rapport de R12).
import type { ModerationShowcase, ShowcaseCandidate } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request, requestWithoutBody } from '../api/client'
import type { ApiResult } from '../api/errors'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ShowcaseTab } from './ShowcaseTab'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

// --- Les données ---

type Project = ModerationShowcase['items'][number]['project']
const project = (id: string, title: string, name: string): Project => ({
  id,
  title,
  status: 'testable',
  cover: null,
  author: { id: `u-${name.toLowerCase().replace(/\s+/g, '-')}`, name },
})

const decollage = project('d1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6', 'Décollage !', 'Papi Jean')
const papillon = project('e2f3a4b5-6c7d-4e8f-9a01-b2c3d4e5f607', 'Quel papillon ?', 'Hugo Lefèvre')
const ciel = project('f3a4b5c6-7d8e-4f90-8b12-c3d4e5f60718', 'Le ciel de ce soir', 'Inès Haddad')
const cafes = project('a4b5c6d7-8e9f-4a01-9c23-d4e5f6071829', 'Carnet de cafés', 'Léa Moreau')
const arrosage = project('b5c6d7e8-9fa0-4b12-8d34-e5f607182930', 'Arrosage malin', 'Nora Benali')
const bonbons = project('c6d7e8f9-a0b1-4c23-9e45-f60718293041', 'Compte-bonbons', 'Max Petit')

const candidate = (one: Project, declined = false): ShowcaseCandidate => ({
  project: one,
  publishedAt: '2026-11-02T08:00:00.000Z',
  showcaseDeclinedAt: declined ? '2026-11-13T17:40:00.000Z' : null,
})

/** Les projets publics connus du faux serveur, et le refus de leur auteur. */
const all = [decollage, papillon, ciel, cafes, arrosage, bonbons]
const declined = new Set<string>([bonbons.id])

// --- Le faux serveur ---

const server = {
  /** La vitrine, dans l'ordre ; `edited` : modifiés depuis leur entrée. */
  order: [] as string[],
  edited: new Set<string>(),
  /** La réponse imposée au prochain PUT (un refus), sinon la vitrine nouvelle. */
  putFailure: null as ApiResult<never> | null,
  puts: [] as unknown[],
  failRead: false,

  state(): ModerationShowcase {
    return {
      items: this.order.map((id, index) => ({
        project: all.find((one) => one.id === id) as Project,
        position: index + 1,
        addedAt: '2026-11-14T10:02:00.000Z',
        editedSinceAdded: this.edited.has(id),
      })),
      candidates: all
        .filter((one) => !this.order.includes(one.id))
        .map((one) => candidate(one, declined.has(one.id))),
    }
  },

  respond(path: string, init: RequestInit): ApiResult<unknown> {
    const url = new URL(path, 'https://api.test')
    const method = (init.method ?? 'GET').toUpperCase()
    if (url.pathname !== '/v1/moderation/showcase') return { ok: false, error: 'notFound' }
    if (method === 'GET') {
      return this.failRead ? { ok: false, error: 'unavailable' } : { ok: true, data: this.state() }
    }
    if (method === 'PUT') {
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null
      this.puts.push(body)
      if (this.putFailure) return this.putFailure
      this.order = (body as { projectIds: string[] }).projectIds
      return { ok: true, data: this.state() }
    }
    return { ok: false, error: 'notFound' }
  },
}

const puts = () => server.puts as { projectIds: string[] }[]

beforeEach(() => {
  server.order = [decollage.id, papillon.id, ciel.id]
  server.edited = new Set()
  server.putFailure = null
  server.puts = []
  server.failRead = false
  mockSession({ user: { id: 'u9', name: 'Louis' } })
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string, init: RequestInit, schema) => {
      const result = server.respond(path, init)
      if (!result.ok) return result
      const parsed = schema.safeParse(result.data)
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
    }) as typeof request)
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation((async (path: string, init: RequestInit) => {
      const result = server.respond(path, init)
      return result.ok ? { ok: true, data: null } : result
    }) as typeof requestWithoutBody)
})

// --- Les textes et les aides ---

const T = {
  title: fr.t(($) => $.moderation.showcase.title),
  count: (count: number) => fr.t(($) => $.moderation.showcase.count, { count, max: 4 }),
  freeSlot: fr.t(($) => $.moderation.showcase.freeSlot),
  removeNamed: (title: string) => fr.t(($) => $.moderation.showcase.removeNamed, { title }),
  featureNamed: (title: string) => fr.t(($) => $.moderation.showcase.featureNamed, { title }),
  candidates: fr.t(($) => $.moderation.showcase.candidates),
  search: fr.t(($) => $.moderation.showcase.search),
  limit: fr.t(($) => $.moderation.showcase.limit, { max: 4 }),
  full: fr.t(($) => $.moderation.showcase.full),
  searchEmpty: fr.t(($) => $.moderation.showcase.searchEmpty),
  changed: fr.t(($) => $.moderation.showcase.changed),
  errorTitle: fr.t(($) => $.moderation.showcase.errorTitle),
  error: fr.t(($) => $.moderation.showcase.error),
  authorDeclined: fr.t(($) => $.errors.authorDeclined),
}

const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0
const removeButton = (title: string) => screen.getByRole('button', { name: T.removeNamed(title) })
const featureButton = (title: string) => screen.getByRole('button', { name: T.featureNamed(title) })

const open = async () => {
  await renderWithProviders(<ShowcaseTab />)
  await screen.findByRole('header', { name: containing(T.title) })
}

/** Les titres de la vitrine, dans l'ordre de l'écran (par leurs boutons « Retirer … »). */
const showcaseOrder = () =>
  screen
    .queryAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel ?? ''))
    .map((name) => all.find((one) => name === T.removeNamed(one.title))?.title)
    .filter((title) => title !== undefined)

// --- Les tests ---

describe('ShowcaseTab, the showcase of the home page (R12)', () => {
  it('shows « Sur l’accueil », « 3 sur 4 », the three projects in order and one free place', async () => {
    await open()

    expect(shown(T.count(3))).toBe(true)
    expect(showcaseOrder()).toEqual([decollage.title, papillon.title, ciel.title])
    expect(screen.getAllByText(containing(T.freeSlot))).toHaveLength(1)
  })

  it('lists the public projects that are not on it, each with « Mettre en avant »', async () => {
    await open()

    expect(shown(T.candidates)).toBe(true)
    expect(featureButton(cafes.title)).toBeTruthy()
    expect(featureButton(arrosage.title)).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.featureNamed(decollage.title) })).toBeNull()
  })

  it('says the limit and that each author is told', async () => {
    await open()

    expect(shown(T.limit)).toBe(true)
  })

  it('adds a project at the last place, sending the whole showcase in order', async () => {
    await open()

    await fireEvent.press(featureButton(cafes.title))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]).toEqual({ projectIds: [decollage.id, papillon.id, ciel.id, cafes.id] })
    await waitFor(() =>
      expect(showcaseOrder()).toEqual([decollage.title, papillon.title, ciel.title, cafes.title]),
    )
  })

  it('removes a project, keeping the others in their order', async () => {
    await open()

    await fireEvent.press(removeButton(papillon.title))

    await waitFor(() => expect(puts()).toHaveLength(1))
    expect(puts()[0]).toEqual({ projectIds: [decollage.id, ciel.id] })
    await waitFor(() => expect(showcaseOrder()).toEqual([decollage.title, ciel.title]))
  })

  it('shows the projects in the order of their place', async () => {
    server.order = [ciel.id, decollage.id, papillon.id]
    await open()

    expect(showcaseOrder()).toEqual([ciel.title, decollage.title, papillon.title])
  })

  it('takes no fifth project: « L’accueil est plein… », and nothing is sent', async () => {
    server.order = [decollage.id, papillon.id, ciel.id, cafes.id]
    await open()

    expect(shown(T.count(4))).toBe(true)
    expect(shown(T.full)).toBe(true)
    expect(screen.queryAllByText(containing(T.freeSlot))).toHaveLength(0)
    const feature = featureButton(arrosage.title)
    expect(feature).toBeDisabled()
    await fireEvent.press(feature)
    expect(puts()).toHaveLength(0)
  })

  it('marks a project changed since it was put forward, and only it', async () => {
    server.edited = new Set([papillon.id])
    await open()

    expect(screen.getAllByText(containing(T.changed))).toHaveLength(1)
  })

  it('marks nothing when no project has changed (témoin)', async () => {
    await open()

    expect(shown(decollage.title)).toBe(true)
    expect(shown(T.changed)).toBe(false)
  })
})

describe('ShowcaseTab, the refusal of an author (juridique 6, décision 18)', () => {
  it('says an author has taken the project off the home page, before any try', async () => {
    await open()

    expect(shown(bonbons.title)).toBe(true)
    expect(shown(T.authorDeclined)).toBe(true)
  })

  it('says it when the API refuses the project, and keeps the showcase as it was', async () => {
    server.putFailure = { ok: false, error: 'authorDeclined' } as ApiResult<never>
    await open()
    // Un autre projet des données est déjà refusé par son auteur, et sa ligne le dit (test
    // précédent) : la phrase est donc déjà là une fois ; le refus de l'API en ajoute une.
    const before = screen.queryAllByText(containing(T.authorDeclined)).length

    await fireEvent.press(featureButton(cafes.title))

    await waitFor(() =>
      expect(screen.queryAllByText(containing(T.authorDeclined)).length).toBeGreaterThan(before),
    )
    expect(showcaseOrder()).toEqual([decollage.title, papillon.title, ciel.title])
  })
})

describe('ShowcaseTab, searching and failing', () => {
  it('finds a public project by its title', async () => {
    await open()

    await fireEvent.changeText(screen.getByLabelText(T.search), 'arros')

    expect(featureButton(arrosage.title)).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.featureNamed(cafes.title) })).toBeNull()
  })

  it('says when no public project matches', async () => {
    await open()

    await fireEvent.changeText(screen.getByLabelText(T.search), 'zzz')

    expect(await screen.findByText(containing(T.searchEmpty))).toBeTruthy()
  })

  it('says when a change could not be saved', async () => {
    server.putFailure = { ok: false, error: 'unavailable' } as ApiResult<never>
    await open()

    await fireEvent.press(removeButton(decollage.title))

    expect(await screen.findByText(containing(T.error))).toBeTruthy()
  })

  it('says when the showcase cannot load', async () => {
    server.failRead = true
    await renderWithProviders(<ShowcaseTab />)

    expect(await screen.findByText(containing(T.errorTitle))).toBeTruthy()
  })
})
