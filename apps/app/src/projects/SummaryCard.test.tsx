// Tests de la catégorie sur la carte d'un projet (SummaryCard, tranche R6b, relecture du plan,
// décisions 15) : depuis R6b, le nom d'une catégorie vient de l'API (GET /v1/categories), plus des
// traductions ; une catégorie créée par un administrateur a donc son nom. Pendant le chargement,
// aucune étiquette ; un code que l'API ne connaît pas : aucune étiquette, jamais le code brut, et
// une seule relecture de la liste (une catégorie créée entre-temps). Le reste de la carte a ses
// tests dans `ui/ProjectCard.test.tsx`. GET /v1/categories passe par un faux réseau (`api/client`).
import { act, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import { categoryList } from '../testing/categories'
import { recipesProject, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SummaryCard } from './SummaryCard'

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
