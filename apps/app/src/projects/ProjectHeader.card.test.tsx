// Tests de l'en-tête d'un projet nourri d'une carte de la vitrine (R17, `CardHeaderProject`) : la
// page ouverte depuis « À la une », l'accueil ou la modération, avant la réponse de l'API. Il montre
// le statut, le titre, l'auteur par son nom et l'accroche ; il ne lit ni la page de l'auteur (son
// identifiant manque) ni les catégories, et ne dit ni dates ni « Public ».
import { screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { categoryList, categoryName } from '../testing/categories'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { type CardHeaderProject, ProjectHeader } from './ProjectHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../members/api', () => ({ useMember: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

/** Ce que sait une carte de la vitrine du projet de Léa (publié pour tous). */
const card: CardHeaderProject = {
  id: recipesProject.id,
  title: recipesProject.title,
  status: recipesProject.status,
  pitch: recipesProject.pitch,
  author: { name: recipesProject.author.name, avatarUrl: null },
}

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(request).mockReset()
  jest
    .mocked(request)
    .mockImplementation(() => Promise.resolve({ ok: true, data: categoryList('fr') } as never))
  jest.mocked(useMember).mockReturnValue({
    data: undefined,
    isError: false,
    isPending: true,
  } as never)
  jest.mocked(useFollow).mockReturnValue({
    toggle: jest.fn(),
    error: null,
    expired: false,
  } as never)
})

describe('the header of a project known from a showcase card (R17)', () => {
  it('shows the status, the title, the author by name and the pitch', async () => {
    await renderWithProviders(<ProjectHeader project={card} followable={false} />)

    expect(await screen.findByRole('header', { name: card.title })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.project.status[card.status]))).toBeTruthy()
    expect(screen.getByText(card.author.name)).toBeTruthy()
    expect(screen.getByText(card.pitch ?? '')).toBeTruthy()
  })

  it('reads neither the page of the author nor the categories, and links to no page', async () => {
    await renderWithProviders(<ProjectHeader project={card} followable={false} />)
    await screen.findByRole('header', { name: card.title })

    // Aucune lecture de la page d'un membre (désactivée), aucune catégorie affichée.
    expect(jest.mocked(useMember).mock.calls.length).toBeGreaterThan(0)
    expect(jest.mocked(useMember).mock.calls.every(([, enabled]) => enabled === false)).toBe(true)
    expect(screen.queryByRole('link', { name: containing(categoryName('science')) })).toBeNull()
    const open = fr.t(($) => $.member.open, { nameOf: card.author.name })
    expect(screen.queryByRole('link', { name: containing(card.author.name) })).toBeNull()
    expect(screen.queryByRole('button', { name: open })).toBeNull()
  })

  it('says neither the dates nor « Public », which the card does not know', async () => {
    await renderWithProviders(<ProjectHeader project={card} followable={false} />)
    await screen.findByRole('header', { name: card.title })

    const published = fr.t(($) => $.project.page.publishedOn, { when: '' }).trim()
    expect(screen.queryByText(containing(published), { includeHiddenElements: true })).toBeNull()
    expect(
      screen.queryByText(
        fr.t(($) => $.project.webBadge),
        { includeHiddenElements: true },
      ),
    ).toBeNull()
  })

  it('draws an empty place for the pitch when the card has none (the moderation tab)', async () => {
    await renderWithProviders(
      <ProjectHeader project={{ ...card, pitch: null }} followable={false} />,
    )

    expect(await screen.findByRole('header', { name: card.title })).toBeTruthy()
    expect(screen.queryByText(recipesProject.pitch)).toBeNull()
  })
})
