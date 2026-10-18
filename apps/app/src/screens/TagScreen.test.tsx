// Tests de la page d'une étiquette. L'API (members/api) est remplacée par de faux appels.
import { fireEvent, screen } from '@testing-library/react-native'
import { getTag } from '../members/api'
import { projectWithPhotos, recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { TagScreen } from './TagScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getTag = jest.fn()
  return {
    getTag,
    useTag: (slug: string, enabled = true) =>
      useQuery({ queryKey: ['tag', slug], queryFn: () => getTag(slug), enabled }),
  }
})
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}))

const otherProject = {
  ...recipesProject,
  id: '8b3e4c0a-5d6f-4e70-9b82-9c0d1e2f3a41',
  title: 'Le tri des photos',
}

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest
    .mocked(getTag)
    .mockReset()
    .mockResolvedValue({
      slug: 'claude-code',
      label: 'Claude Code',
      projects: [summaryOf(projectWithPhotos), summaryOf(otherProject)],
    })
  mockPush.mockReset()
})

describe('TagScreen', () => {
  it('shows the projects made with the tool, and opens one', async () => {
    await renderWithProviders(<TagScreen slug="claude-code" />)

    expect(await screen.findByRole('header', { name: 'Claude Code' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Mon agent de recettes' }))

    expect(getTag).toHaveBeenCalledWith('claude-code')
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: projectWithPhotos.id },
    })
  })

  it('shows an empty list, named after the tag itself, when no public project carries it', async () => {
    jest.mocked(getTag).mockResolvedValue({ slug: 'secret', label: null, projects: [] })
    await renderWithProviders(<TagScreen slug="secret" />)

    expect(await screen.findByRole('header', { name: 'secret' })).toBeTruthy()
    expect(screen.getByText('Aucun projet public pour l’instant.')).toBeTruthy()
  })
})
