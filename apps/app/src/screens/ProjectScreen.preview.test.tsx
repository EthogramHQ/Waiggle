// Tests de l'aperçu de la page d'un projet (tranche R14, docs/scenarios/refonte.md, « Entrer dans un
// projet et en sortir ») : ouverte depuis une carte, la page montre tout de suite ce que la carte
// savait (titre, accroche, statut, photo), et le reste arrive avec son chargement. Le projet complet
// n'est pas encore dans le cache (`['project', id]`), mais une liste déjà lue le connaît : ici la
// page du membre (`['member', authorId]`, celle de `members/api`).
//
// Les règles (plan R14, choix 4) : une vue partielle, jamais un faux projet rangé dans le cache ;
// l'aperçu n'invente rien qui dépend de qui lit (ni « Modifier », ni menu, ni « Suivre », ni
// réactions), ni ce que la liste ne sait pas (la description) ; le bouton Retour de la page, oui.
// Le projet complet remplace l'aperçu sans remonter le titre ni la photo (le même élément, le focus
// gardé, pas de seconde arrivée). Un 404 remplace l'aperçu par « Introuvable ». Sans liste en
// cache, la page de chargement, comme avant.
//
// L'interface attendue : `useProjectPreview(id)` (projects/hooks.ts) lit les listes en cache ;
// `ProjectScreen` en montre l'aperçu tant que `getProject` n'a pas répondu. Mêmes faux appels que
// ProjectScreen.example.test.tsx ; `getProject` répond quand le test le décide.
import type { Member, Project } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react-native'
import { type ReactNode, useState } from 'react'
import { ApiError } from '../api/errors'
import { getProject } from '../projects/api'
import { leaPage, projectWithPhotos, summaryOf } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
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
// R16 : le bas vide de la page, tel quel, dans une vue marquée de son nom (sans rôle ni nom à lui).
jest.mock('../projects/ProjectPage', () => {
  const actual = jest.requireActual('../projects/ProjectPage')
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    ...actual,
    ProjectPageSkeleton: (props: Record<string, unknown>) =>
      createElement(
        View,
        { testID: 'ProjectPageSkeleton' },
        createElement(actual.ProjectPageSkeleton, props),
      ),
  }
})
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

/** Le projet de Léa, avec trois photos et une couverture verticale (que l'aperçu ne prend pas). */
const project: Project = projectWithPhotos
const cover = project.visuals[0]?.url ?? 'no cover'
const portrait = project.portraitCover?.url ?? 'no portrait'
/** La page de Léa, déjà lue : la liste qui connaît le projet (avec 7 réactions). */
const leaWithProject: Member = {
  ...leaPage,
  projects: [{ ...summaryOf(project), reactionTotal: 7 }],
}

const T = {
  back: fr.t(($) => $.project.page.back),
  menu: fr.t(($) => $.actionMenu.label),
  edit: fr.t(($) => $.project.page.edit),
  follow: fr.t(($) => $.follow.project),
  loading: fr.t(($) => $.common.loading),
  notFound: fr.t(($) => $.project.page.notFound),
  status: fr.t(($) => $.project.status.testable),
}
/** Un titre de la description du projet (« ## Comment ça marche »), que la liste ne connaît pas. */
const descriptionTitle = 'Comment ça marche'

/** La réponse de GET /v1/projects/<id>, que le test donne quand il le veut. */
let answer: { resolve: (value: Project) => void; reject: (error: unknown) => void }

/** Range une liste dans le cache avant le premier rendu de la page (comme une page déjà visitée). */
function WithCachedList({ page, children }: { page: Member | null; children: ReactNode }) {
  const client = useQueryClient()
  // useState avec une fonction : appelée une seule fois, au premier rendu, avant celui de la page.
  useState(() => {
    if (page) client.setQueryData(['member', page.id], page)
    return null
  })
  return <>{children}</>
}

const open = async (page: Member | null = leaWithProject) => {
  await renderWithProviders(
    <WithCachedList page={page}>
      <ProjectScreen id={project.id} />
    </WithCachedList>,
  )
}
/** L'API répond : le projet complet. */
const answerWith = async (value: Project = project) => {
  await act(async () => {
    answer.resolve(value)
  })
}

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Les images dessinées dont la source contient cette adresse. */
const imagesOf = (url: string) =>
  hostsOf(screen.root as unknown as Host).filter(
    (node) => node.props.source !== undefined && JSON.stringify(node.props.source).includes(url),
  )
const titleHeader = () => screen.queryByRole('header', { name: containing(project.title) })

beforeEach(() => {
  resetProjectScreenMocks()
  jest.mocked(getProject).mockImplementation(
    () =>
      new Promise<Project>((resolve, reject) => {
        answer = { resolve, reject }
      }),
  )
})

describe('the page of a project opened from a card, before the API answers (R14)', () => {
  it('shows the title, the pitch, the status and the photo known from a cached list', async () => {
    await open()

    expect(await screen.findByRole('header', { name: containing(project.title) })).toBeTruthy()
    expect(screen.getByText(project.pitch)).toBeTruthy()
    expect(screen.getAllByText(T.status).length).toBeGreaterThanOrEqual(1)
    // La photo de la carte : la première de la galerie, jamais la couverture verticale.
    expect(imagesOf(cover).length).toBeGreaterThanOrEqual(1)
    expect(imagesOf(portrait)).toHaveLength(0)
    expect(getProject).toHaveBeenCalledWith(project.id)
  })

  it('invents nothing the list does not know: no description, no reactions, the rest loading', async () => {
    await open()
    await screen.findByRole('header', { name: containing(project.title) })

    expect(screen.queryByRole('header', { name: descriptionTitle })).toBeNull()
    expect(screen.queryByText(containing(descriptionTitle))).toBeNull()
    expect(screen.queryByRole('button', { name: /^Waggle/ })).toBeNull()
    // Le reste de la page est un squelette, nommé « Chargement… ». R16 (plan, choix 8) : `Loading`
    // reste caché aux lecteurs d'écran 160 ms avant de se montrer : on l'attend (`findBy…`).
    expect(await screen.findByRole('progressbar', { name: T.loading })).toBeTruthy()
  })

  it('shows no action of the page that depends on who is reading (edit, menu, follow, reactions) before the API answers', async () => {
    await open()
    await screen.findByRole('header', { name: containing(project.title) })

    expect(screen.queryByRole('button', { name: T.menu })).toBeNull()
    expect(screen.queryByText(T.edit, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByRole('switch', { name: containing(T.follow) })).toBeNull()
    expect(screen.queryByRole('button', { name: containing(T.follow) })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Waggle/ })).toBeNull()

    // Témoin : l'API répond, et le menu de la page (« Modifier » y est, pour Léa) arrive.
    await answerWith()
    expect(await screen.findByRole('button', { name: T.menu })).toBeTruthy()
  })

  it('shows neither « Suivre » nor the reactions on the preview of a project by another member, then both once the API answers', async () => {
    // Le projet d'Inès, lu par Léa : seul un lecteur qui n'est pas l'auteur voit « Suivre Inès » et
    // la capsule des réactions. (Le projet de Léa, lu par Léa, ne les montre jamais : il ne
    // prouverait rien.)
    const ines = { id: 'u2', name: 'Inès', avatarUrl: null }
    const theirs: Project = { ...project, id: 'p-ines', author: ines, isMine: false }
    const inesPage: Member = {
      ...leaPage,
      id: ines.id,
      name: ines.name,
      handle: 'ines',
      projects: [{ ...summaryOf(theirs), reactionTotal: 7 }],
    }
    const followInes = fr.t(($) => $.follow.member, { name: ines.name })
    await renderWithProviders(
      <WithCachedList page={inesPage}>
        <ProjectScreen id={theirs.id} />
      </WithCachedList>,
    )
    await screen.findByRole('header', { name: containing(theirs.title) })

    expect(screen.queryByRole('switch', { name: containing(followInes) })).toBeNull()
    expect(screen.queryByRole('button', { name: containing(followInes) })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Waggle/ })).toBeNull()

    // Témoin : l'API répond, et les deux arrivent pour ce lecteur.
    await answerWith(theirs)
    expect(
      await screen
        .findAllByRole('button', { name: containing(followInes) })
        .catch(() => screen.findAllByRole('switch', { name: containing(followInes) })),
    ).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: /^Waggle/ })).not.toHaveLength(0)
  })

  it('offers the Back button of the page while only the preview is known', async () => {
    await open()
    await screen.findByRole('header', { name: containing(project.title) })

    expect(screen.getByRole('button', { name: T.back })).toBeTruthy()
  })

  it('keeps the focused title when the full project replaces the preview', async () => {
    await open()
    const before = await screen.findByRole('header', { name: containing(project.title) })

    await answerWith()
    // Témoin : le projet complet est là (sa description).
    expect(await screen.findByRole('header', { name: descriptionTitle })).toBeTruthy()
    // Le même élément, pas un titre remonté : le focus qu'il avait reçu ne se perd pas.
    expect(titleHeader() === before).toBe(true)
  })

  it('keeps the same photo when the full project replaces the preview, without a second arrival', async () => {
    await open()
    await screen.findByRole('header', { name: containing(project.title) })
    const [before] = imagesOf(cover)
    expect(before).toBeDefined()

    await answerWith()
    await screen.findByRole('header', { name: descriptionTitle })

    expect(imagesOf(cover)[0] === before).toBe(true)
  })

  it('replaces the preview with « Introuvable » when the API answers 404', async () => {
    await open()
    await screen.findByRole('header', { name: containing(project.title) })

    await act(async () => {
      answer.reject(new ApiError('notFound'))
    })

    expect(await screen.findByText(T.notFound)).toBeTruthy()
    expect(titleHeader()).toBeNull()
    expect(screen.queryByText(project.pitch)).toBeNull()
  })

  it('shows the loading page as before without a cached list (témoin)', async () => {
    await open(null)

    expect(await screen.findByRole('progressbar', { name: T.loading })).toBeTruthy()
    expect(titleHeader()).toBeNull()
    expect(screen.queryByText(project.pitch)).toBeNull()
  })

  it('shows the full project once the API answers, without a cached list (témoin)', async () => {
    await open(null)
    await answerWith()

    expect(await screen.findByRole('header', { name: containing(project.title) })).toBeTruthy()
    expect(screen.getByRole('header', { name: descriptionTitle })).toBeTruthy()
  })
})

// --- R16 : ce qui est déjà connu s'affiche (docs/scenarios/refonte.md, « Le squelette a la forme
// de sa page », choix 10) ---
// Ouverte depuis une carte, la page montre le titre, l'auteur, la photo, le statut et l'accroche ;
// le squelette ne couvre que la description, la recette et les commentaires. Une zone qui charge
// n'a qu'un nom pour un lecteur d'écran (« Chargement… ») : ce qui est connu doit rester dehors,
// sinon il ne serait plus lu.

/** Vrai si l'élément est dans une zone « Chargement » (un `progressbar`). */
const insideProgressbar = (element: { parent: unknown; props: Record<string, unknown> }) => {
  let node = element.parent as { parent: unknown; props: Record<string, unknown> } | null
  while (node) {
    if (node.props.role === 'progressbar' || node.props.accessibilityRole === 'progressbar')
      return true
    node = node.parent as typeof node
  }
  return false
}

describe('the preview of a project while the rest of its page loads (R16)', () => {
  it('keeps the title, author, status and pitch readable outside the loading progressbar', async () => {
    await open()

    const known = [
      await screen.findByRole('header', { name: containing(project.title) }),
      screen.getAllByText(containing(project.author.name))[0],
      screen.getAllByText(T.status)[0],
      screen.getByText(project.pitch),
    ]
    // Témoin : le reste de la page attend bien, sous un seul nom.
    expect(screen.getByRole('progressbar', { name: T.loading })).toBeTruthy()
    for (const element of known) {
      expect(element).toBeTruthy()
      expect(insideProgressbar(element as never)).toBe(false)
    }
  })

  it('draws the empty bottom of the page under the preview, where the description and the comments will be', async () => {
    await open()
    await screen.findByRole('header', { name: containing(project.title) })

    // La pièce vide de la page d'un projet (projects/ProjectPage.tsx), sans rôle ni nom à elle :
    // son faux module l'entoure d'une vue marquée de son nom.
    expect(screen.getByTestId('ProjectPageSkeleton')).toBeTruthy()
  })
})
