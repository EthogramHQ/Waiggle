// Tests de la catégorie « en attente » de la carte d'un projet (R16, « Les squelettes », scénario :
// « La page ne bouge plus en arrivant », ni les cartes ne bougent ni ne grandissent). Tant que la
// liste des catégories (GET /v1/categories) charge, la carte d'un projet qui a une catégorie garde
// la place exacte de son étiquette, sans texte ni nom : à l'arrivée de la liste, l'étiquette s'y
// pose sans pousser le titre (avant : le verre grandissait de 52 points, essai `sauts.mjs` au Fil).
// Un projet sans catégorie ne garde rien ; une liste en panne libère la place. GET
// /v1/categories passe par un faux réseau (`api/client`), comme dans SummaryCard.test.tsx.
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
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

/** La place gardée et l'étiquette sont des décors cachés aux lecteurs d'écran : on les cherche quand même. */
const HIDDEN_TOO = { includeHiddenElements: true }
const PENDING = 'category-pending'

/** La réponse de GET /v1/categories, que le test laisse partir quand il le veut. */
let answer: (ok: boolean) => void = () => {}

const cardOf = (primaryCategory: string | null) =>
  summaryOf({ ...recipesProject, isMine: false, primaryCategory, secondaryCategory: null })

beforeEach(() => {
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) => {
      if (!path.startsWith('/v1/categories')) return { ok: false, error: 'internal' }
      const ok = await new Promise<boolean>((resolve) => {
        answer = resolve
      })
      return ok
        ? { ok: true, data: categoryList('fr', { cooking: 3 }) }
        : { ok: false, error: 'internal' }
    }) as typeof request)
})

describe('SummaryCard, its category while the categories load (R16)', () => {
  it('keeps the place of its category tag, wordless, until the list arrives', async () => {
    await renderWithProviders(<SummaryCard project={cardOf('cooking')} />)

    // Témoin : la carte est là, et la liste est partie.
    expect(await screen.findByText(recipesProject.title)).toBeTruthy()
    const kept = screen.getByTestId(PENDING, HIDDEN_TOO)
    // Une place vide : ni texte inventé, ni le code brut, ni description du lien.
    expect(kept.children).toHaveLength(0)
    expect(screen.queryByText('Cuisine', HIDDEN_TOO)).toBeNull()
    expect(screen.queryByText(/cooking/, HIDDEN_TOO)).toBeNull()
    expect(
      screen.queryByText(
        containing(fr.t(($) => $.card.category, { category: 'Cuisine' })),
        HIDDEN_TOO,
      ),
    ).toBeNull()

    // La liste arrive : l'étiquette prend la place gardée.
    await act(async () => answer(true))
    expect(await screen.findByText('Cuisine', HIDDEN_TOO)).toBeTruthy()
    expect(screen.queryByTestId(PENDING, HIDDEN_TOO)).toBeNull()
  })

  it('keeps nothing for a project without a category', async () => {
    await renderWithProviders(<SummaryCard project={cardOf(null)} />)

    expect(await screen.findByText(recipesProject.title)).toBeTruthy()
    expect(screen.queryByTestId(PENDING, HIDDEN_TOO)).toBeNull()
  })

  it('frees the place when the list of categories fails', async () => {
    await renderWithProviders(<SummaryCard project={cardOf('cooking')} />)
    expect(await screen.findByTestId(PENDING, HIDDEN_TOO)).toBeTruthy()

    await act(async () => answer(false))
    await waitFor(() => expect(screen.queryByTestId(PENDING, HIDDEN_TOO)).toBeNull())
    // Témoin : la carte reste, sans étiquette.
    expect(screen.getByText(recipesProject.title)).toBeTruthy()
    expect(screen.queryByText('Cuisine', HIDDEN_TOO)).toBeNull()
  })
})
