// L'aperçu de la page d'un projet sur un ordinateur (R14, plan, choix 4) : la mise en page en
// colonnes (galerie | en-tête, actions) gagne des rangées quand le projet complet arrive (la
// description, les commentaires, « Signaler »). Le titre et la photo n'y remontent pas non plus, et
// « Retour » est en toutes lettres en haut de la page, sans « Partager » ni menu pendant l'aperçu.
// Mêmes faux appels que ProjectScreen.preview.test.tsx (jest.mock s'écrit dans chaque fichier).
import type { Member, Project } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react-native'
import { type ReactNode, useState } from 'react'
import { getProject } from '../projects/api'
import { leaPage, projectWithPhotos, summaryOf } from '../testing/projects'
import { renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import { resetProjectScreenMocks } from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => {
  const actual: typeof import('../api/client') = jest.requireActual('../api/client')
  const { categoryList }: typeof import('../testing/categories') =
    jest.requireActual('../testing/categories')
  return {
    ...actual,
    request: jest.fn((...args: Parameters<typeof actual.request>) =>
      String(args[0]).startsWith('/v1/categories')
        ? Promise.resolve({ ok: true, data: categoryList('fr') })
        : actual.request(...args),
    ),
  }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../updates/api', () => ({
  useProjectUpdates: jest.fn(),
  usePublishUpdate: jest.fn(),
  useDeleteUpdate: jest.fn(),
}))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}))

const project: Project = projectWithPhotos
const cover = project.visuals[0]?.url ?? 'no cover'
const leaWithProject: Member = { ...leaPage, projects: [summaryOf(project)] }
const T = {
  back: fr.t(($) => $.project.page.back),
  menu: fr.t(($) => $.actionMenu.label),
  share: fr.t(($) => $.share.action),
}

let answer: (value: Project) => void

function WithCachedList({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  useState(() => client.setQueryData(['member', leaWithProject.id], leaWithProject))
  return <>{children}</>
}

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const firstImageOf = (url: string) =>
  hostsOf(screen.root as unknown as Host).find(
    (node) => node.props.source !== undefined && JSON.stringify(node.props.source).includes(url),
  )

let restorePhone: () => void
beforeEach(() => {
  resetProjectScreenMocks()
  restorePhone = setDesktopWindow()
  jest.mocked(getProject).mockImplementation(
    () =>
      new Promise<Project>((resolve) => {
        answer = resolve
      }),
  )
})
afterEach(() => restorePhone())

describe('the preview of a project page on a computer (R14)', () => {
  it('keeps the title and the photo when the columns grow with the full project', async () => {
    await renderWithProviders(
      <WithCachedList>
        <ProjectScreen id={project.id} />
      </WithCachedList>,
    )
    const title = await screen.findByRole('header', { name: containing(project.title) })
    const photo = firstImageOf(cover)
    expect(photo).toBeDefined()
    // « Retour » en haut de la page ; ni « Partager » ni le menu avant la réponse.
    expect(screen.getByRole('button', { name: T.back })).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.share })).toBeNull()
    expect(screen.queryByRole('button', { name: T.menu })).toBeNull()

    await act(async () => {
      answer(project)
    })

    // Témoin : le menu de la page est arrivé avec le projet complet.
    expect(await screen.findByRole('button', { name: T.menu })).toBeTruthy()
    expect(screen.getByRole('header', { name: containing(project.title) }) === title).toBe(true)
    expect(firstImageOf(cover) === photo).toBe(true)
  })
})
