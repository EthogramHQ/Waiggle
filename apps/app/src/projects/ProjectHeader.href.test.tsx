// Test de l'en-tête d'un projet, après la relecture de l'interface de R6b (S4) : sur le web, le lien
// de la catégorie porte sa vraie adresse (`/explore?category=science`), comme les autres liens de
// l'appli : ouvrir dans un nouvel onglet, l'adresse au survol. Fichier à part de
// ProjectHeader.test.tsx (correction KC) : les mêmes faux modules, réduits à ce que ce test lit.
import type { Member } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { request } from '../api/client'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { getMe } from '../profile/api'
import { categoryList, categoryName } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { ProjectHeader } from './ProjectHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Sur le web, `Screen` et les textes liraient la langue du navigateur simulé : le français.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../members/api', () => ({ useMember: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/projects/p1',
    useRouter: () => ({
      push: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    }),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest
    .mocked(useMember)
    .mockReset()
    .mockReturnValue({
      data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false } as Member,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useMember>)
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) =>
      path.startsWith('/v1/categories')
        ? { ok: true, data: categoryList('fr') }
        : { ok: false, error: 'internal' }) as typeof request)
})

describe('ProjectHeader, the address of the category link', () => {
  it('links the category to /explore?category=science on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await renderWithProviders(
        <ProjectHeader
          project={{
            ...recipesProject,
            isMine: false,
            primaryCategory: 'science',
            secondaryCategory: 'learning',
          }}
        />,
      )

      const links = await screen.findAllByRole('link', {
        name: containing(categoryName('science')),
      })
      expect(links[0]?.props.href).toBe('/explore?category=science')
    } finally {
      jest.restoreAllMocks()
    }
  })
})
