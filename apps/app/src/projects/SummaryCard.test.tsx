// Tests de la catégorie sur la carte d'un projet (SummaryCard, tranche R6b, relecture du plan,
// décisions 15) : depuis R6b, le nom d'une catégorie vient de l'API (GET /v1/categories), plus des
// traductions ; une catégorie créée par un administrateur a donc son nom. Pendant le chargement,
// aucune étiquette ; un code que l'API ne connaît pas : aucune étiquette, jamais le code brut, et
// une seule relecture de la liste (une catégorie créée entre-temps). Le reste de la carte a ses
// tests dans `ui/ProjectCard.test.tsx`. GET /v1/categories passe par un faux réseau (`api/client`).
//
// R7a : ce que la carte tire de la dernière mise à jour (`updated` de ProjectCard, une union fixée
// au lancement de la tranche) : dans « Abonnements », un projet remonté par sa mise à jour (la prop
// `update` de SummaryCard, l'`update` de l'élément du fil) donne la carte entière (`full`) ;
// ailleurs, une mise à jour de moins de 30 jours (`UPDATED_BADGE_DAYS`) donne le repère seul
// (`badge`), l'accroche restant. Le dessin de ces deux formes est testé par
// `ui/ProjectCard.updated.test.tsx` ; ici, on lit ce que SummaryCard passe à ProjectCard.
import type { ProjectSummary, UpdateSummary } from '@ruche/contracts'
import { act, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import { categoryList } from '../testing/categories'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SummaryCard } from './SummaryCard'

/** Les propriétés reçues par ProjectCard, notées par son faux module (qui dessine le vrai). */
const mockCardProps: Record<string, unknown>[] = []
jest.mock('../ui/ProjectCard', () => {
  const actual = jest.requireActual('../ui/ProjectCard')
  const { createElement } = require('react')
  return {
    ...actual,
    ProjectCard: (props: Record<string, unknown>) => {
      mockCardProps.push(props)
      return createElement(actual.ProjectCard, props)
    },
  }
})
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

/** La réponse de GET /v1/categories : les seize de départ, plus « Tricot », créée en R6b. */
const withKnitting = () => {
  const list = categoryList('fr', { cooking: 3 })
  list.categories.splice(15, 0, {
    code: 'knitting',
    name: 'Tricot',
    icon: 'heart',
    projectCount: 1,
  })
  return list
}
let mockCategories: () => Promise<unknown> = () => Promise.resolve(withKnitting())
const categoryReads = () =>
  jest.mocked(request).mock.calls.filter(([path]) => String(path).startsWith('/v1/categories'))
    .length

/** L'étiquette est un décor caché aux lecteurs d'écran (lue dans la description du lien) : on la cherche quand même. */
const HIDDEN_TOO = { includeHiddenElements: true }

/** Ce que dit la carte de sa catégorie : « Catégorie : Tricot » (description du lien). */
const described = (name: string) => fr.t(($) => $.card.category, { category: name })

const cardOf = (primaryCategory: string | null) =>
  summaryOf({ ...recipesProject, isMine: false, primaryCategory, secondaryCategory: null })

beforeEach(() => {
  mockCategories = () => Promise.resolve(withKnitting())
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

describe('SummaryCard, its category (R6b)', () => {
  it('names the category as the API does, a category created by an administrator included', async () => {
    await renderWithProviders(<SummaryCard project={cardOf('knitting')} />)

    expect(await screen.findByText('Tricot', HIDDEN_TOO)).toBeTruthy()
    expect(screen.getByText(containing(described('Tricot')), HIDDEN_TOO)).toBeTruthy()
    expect(categoryReads()).toBe(1)
  })

  it('shows no category while the categories load', async () => {
    mockCategories = () => new Promise(() => {})
    await renderWithProviders(<SummaryCard project={cardOf('cooking')} />)

    // Témoin : la carte est là.
    expect(await screen.findByText(recipesProject.title)).toBeTruthy()
    expect(screen.queryByText('Cuisine', HIDDEN_TOO)).toBeNull()
    expect(screen.queryByText(/cooking/, HIDDEN_TOO)).toBeNull()
    expect(screen.queryByText(containing(described('Cuisine')))).toBeNull()
  })

  it('shows no category rather than the raw code of an unknown category, and refetches the categories once', async () => {
    await renderWithProviders(<SummaryCard project={cardOf('pottery')} />)

    await waitFor(() => expect(categoryReads()).toBe(2))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(categoryReads()).toBe(2)
    // Témoin : la carte est là, sans étiquette.
    expect(screen.getByText(recipesProject.title)).toBeTruthy()
    expect(screen.queryByText(/pottery/, HIDDEN_TOO)).toBeNull()
    expect(screen.queryByText(/project\.category/)).toBeNull()
    expect(screen.queryByText(containing(described('')))).toBeNull()
  })

  it('shows no category for a project from before R6a', async () => {
    await renderWithProviders(<SummaryCard project={cardOf(null)} />)

    expect(await screen.findByText(recipesProject.title)).toBeTruthy()
    expect(screen.queryByText(containing(described('')))).toBeNull()
  })
})

// --- R7a : la carte d'un projet mis à jour ---

const DAY_MS = 24 * 60 * 60 * 1000
/** Il y a `days` jours, à partir de l'horloge réelle (la carte compte depuis maintenant). */
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

/** « Le décompte de la fusée » en version courte : trois lignes, la première « Nouveau ». */
const rocket = (at: string, version: string | null = 'v1.2'): UpdateSummary => ({
  id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  at,
  version,
  firstLine: { family: 'new', text: 'Un compte à rebours avant chaque question' },
  lineCount: 3,
})

/** Le projet de Léa vu par Inès, avec sa dernière mise à jour. */
const updatedCard = (latestUpdate: UpdateSummary | null): ProjectSummary => ({
  ...cardOf('cooking'),
  latestUpdate,
  version: latestUpdate?.version ?? null,
})

/** Ce que la dernière carte dessinée a reçu pour sa mise à jour. */
const updatedProp = () => mockCardProps.at(-1)?.updated

describe('SummaryCard, a project raised by its update (R7a)', () => {
  beforeEach(() => {
    mockCardProps.length = 0
  })

  it('shows « Mis à jour · v1.2 », the first line and « et 2 autres changements » in « Abonnements »', async () => {
    const update = rocket(daysAgo(1))
    await renderWithProviders(<SummaryCard project={updatedCard(update)} update={update} />)

    await screen.findByText(recipesProject.title)
    expect(updatedProp()).toEqual({
      kind: 'full',
      label: 'Mis à jour · v1.2',
      line: { family: 'new', text: 'Un compte à rebours avant chaque question' },
      more: 'et 2 autres changements',
      at: update.at,
    })
  })

  it('says « Mis à jour » alone when the update has no version', async () => {
    const update = rocket(daysAgo(1), null)
    await renderWithProviders(<SummaryCard project={updatedCard(update)} update={update} />)

    await screen.findByText(recipesProject.title)
    expect(updatedProp()).toMatchObject({ kind: 'full', label: 'Mis à jour' })
  })

  it('says « et 1 autre changement » for two lines, and nothing more for one', async () => {
    const two = { ...rocket(daysAgo(1)), lineCount: 2 }
    const view = await renderWithProviders(<SummaryCard project={updatedCard(two)} update={two} />)
    await screen.findByText(recipesProject.title)
    expect(updatedProp()).toMatchObject({ more: 'et 1 autre changement' })

    const one = { ...rocket(daysAgo(1)), lineCount: 1 }
    await view.rerender(<SummaryCard project={updatedCard(one)} update={one} />)
    expect(updatedProp()).toMatchObject({ kind: 'full', more: null })
  })

  // Hors d'« Abonnements » (Découvrir, la page d'un membre, d'un outil, la recherche) : le repère
  // seul, pendant 30 jours ; l'accroche reste (scénario, « Dans le fil »).
  it('marks a card elsewhere with « Mis à jour · v1.2 » alone, 29 days after the update', async () => {
    await renderWithProviders(<SummaryCard project={updatedCard(rocket(daysAgo(29)))} />)

    await screen.findByText(recipesProject.title)
    expect(updatedProp()).toEqual({ kind: 'badge', label: 'Mis à jour · v1.2' })
    // L'accroche reste à sa place.
    expect(mockCardProps.at(-1)?.pitch).toBe(recipesProject.pitch)
  })

  it('no longer marks a card 31 days after the update', async () => {
    await renderWithProviders(<SummaryCard project={updatedCard(rocket(daysAgo(31)))} />)

    await screen.findByText(recipesProject.title)
    // Témoin : la carte a bien été dessinée.
    expect(mockCardProps.length).toBeGreaterThan(0)
    expect(updatedProp()).toBeUndefined()
  })

  it('marks nothing on a project that was never updated', async () => {
    await renderWithProviders(<SummaryCard project={updatedCard(null)} />)

    await screen.findByText(recipesProject.title)
    expect(mockCardProps.length).toBeGreaterThan(0)
    expect(updatedProp()).toBeUndefined()
  })
})
