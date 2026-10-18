// Tests de la page d'un membre. L'API (members/api) est remplacée par de faux appels.
import { fireEvent, screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMember } from '../members/api'
import { draftProject, leaPage, projectWithPhotos, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { MemberScreen } from './MemberScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaPage)
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('MemberScreen', () => {
  it('shows the member, her favourite tools and her projects', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('Je bricole des agents pour la maison.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Python' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    // La page d'un autre : pas de bouton pour modifier son profil.
    expect(screen.queryByRole('button', { name: 'Modifier mon profil' })).toBeNull()
  })

  it('opens a project, and the page of a favourite tool', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Mon agent de recettes' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: projectWithPhotos.id },
    })

    await fireEvent.press(screen.getByRole('link', { name: 'Python' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/tags/[slug]', params: { slug: 'python' } })
  })

  it('shows her own private projects to the member, marked as such, and lets her edit her profile', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaPage,
      isMe: true,
      projects: [summaryOf(draftProject), summaryOf(projectWithPhotos)],
    })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('link', { name: 'Mon brouillon' })).toBeTruthy()
    expect(screen.getByText('Privé')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Modifier mon profil' }))
    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('says when there is no project yet', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, projects: [] })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByText('Pas encore de projet public.')).toBeTruthy()
  })

  it('says « not found » for an unknown or deleted member', async () => {
    jest.mocked(getMember).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<MemberScreen id="nobody" />)

    expect(await screen.findByRole('header', { name: 'Ce membre est introuvable' })).toBeTruthy()
  })

  it('asks a visitor to sign in, without calling the API', async () => {
    mockSession(null)
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeTruthy()
    expect(getMember).not.toHaveBeenCalled()
  })
})
