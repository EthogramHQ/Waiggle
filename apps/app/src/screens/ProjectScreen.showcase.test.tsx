// Tests de la page d'un projet ouverte depuis une carte de la vitrine (tranche R17,
// docs/scenarios/refonte.md, « La carte qui devient la page » ; R16, « Le squelette a la forme de sa
// page ») : « À la une » d'Explorer, la vitrine de l'accueil d'un membre, la modération. La vitrine
// déjà lue (`['showcase']`) connaît le projet en version de carte (`ShowcaseItem`) ; le projet complet
// n'est pas encore dans le cache.
//
// Les règles : la page qui attend montre seulement ce que la vitrine sait vraiment (la photo, posée
// dans `CoverArrival` : la cible de la photo qui vole ; le titre, l'auteur, le statut) et le reste en
// squelette. Rien de ce qu'elle ne sait pas ne s'affiche comme vrai : ni réactions, ni visibilité, ni
// dates, ni bouton qui agirait sans le projet. Quand le projet arrive, la page continue : le titre et
// la photo restent les mêmes éléments. Sans vitrine en cache, rien ne change.
//
// Mêmes faux appels que ProjectScreen.preview.test.tsx ; `getProject` répond quand le test le décide.
import type { Project, ShowcasePage } from '@ruche/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react-native'
import { type ReactNode, useState } from 'react'
import { Platform } from 'react-native'
import { getProject } from '../projects/api'
import { projectWithPhotos } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { CoverTransitionProvider, useCoverSource } from '../ui/coverTransition'
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

/** Le projet de Léa, publié pour tous (`web`), avec trois photos : il est dans la vitrine. */
const project: Project = { ...projectWithPhotos, visibility: 'web' }
const cover = project.visuals[0]?.url ?? 'no cover'

/** La vitrine déjà lue par le membre (« À la une », l'accueil) : la carte du projet. */
const showcase: ShowcasePage = {
  items: [
    {
      id: project.id,
      title: project.title,
      pitch: project.pitch,
      status: project.status,
      cover: project.visuals[0] ?? null,
      author: { name: project.author.name, avatarUrl: project.author.avatarUrl },
    },
  ],
}

const T = {
  menu: fr.t(($) => $.actionMenu.label),
  share: fr.t(($) => $.share.action),
  back: fr.t(($) => $.project.page.back),
  loading: fr.t(($) => $.common.loading),
  status: fr.t(($) => $.project.status[project.status]),
  web: fr.t(($) => $.project.webBadge),
  demo: fr.t(($) => $.project.page.tryDemo),
}
/** Un titre de la description du projet, que la vitrine ne connaît pas. */
const descriptionTitle = 'Comment ça marche'

/** La réponse de GET /v1/projects/<id>, que le test donne quand il le veut. */
let answer: { resolve: (value: Project) => void; reject: (error: unknown) => void }

/** Range la vitrine dans le cache avant le premier rendu de la page (une vitrine déjà vue). */
function WithCachedShowcase({
  page,
  children,
}: {
  page: ShowcasePage | null
  children: ReactNode
}) {
  const client = useQueryClient()
  // useState avec une fonction : appelée une seule fois, au premier rendu, avant celui de la page.
  useState(() => {
    if (page) client.setQueryData(['showcase'], page)
    return null
  })
  return <>{children}</>
}

// La carte de la vitrine, touchée : elle prévient la page qu'elle arrive d'elle (coverTransition).
let card: ReturnType<typeof useCoverSource> | undefined
function Card() {
  card = useCoverSource(project.id)
  return null
}
const stage = (page: boolean, cached: ShowcasePage | null) => (
  <CoverTransitionProvider>
    <WithCachedShowcase page={cached}>
      <Card />
      {page ? <ProjectScreen id={project.id} /> : null}
    </WithCachedShowcase>
  </CoverTransitionProvider>
)

/** Ouvre la page depuis la carte touchée de la vitrine (ou sans vitrine en cache). */
const openFromCard = async (cached: ShowcasePage | null = showcase) => {
  const view = await renderWithProviders(stage(false, cached))
  await act(async () => card?.capture(() => {}))
  await view.rerender(stage(true, cached))
  return view
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
const allHosts = () => hostsOf(screen.root as unknown as Host)
const hasCover = (node: Host) =>
  node.props.source !== undefined && JSON.stringify(node.props.source).includes(cover)
/** Les images dessinées de la photo de la carte. */
const coverImages = () => allHosts().filter(hasCover)
/** La boîte marquée `data-cover-target="<id>"` (react-native-web : `dataSet`), la cible du vol. */
const coverTargets = () =>
  allHosts().filter(
    (node) =>
      (node.props.dataSet as Record<string, unknown> | undefined)?.coverTarget === project.id,
  )
const titleHeader = () => screen.queryByRole('header', { name: containing(project.title) })

beforeEach(() => {
  resetProjectScreenMocks()
  // Le web : c'est là que la boîte de la photo porte `data-cover-target`, où le moteur des passages
  // pose le nom de la photo qui vole.
  jest.replaceProperty(Platform, 'OS', 'web')
  card = undefined
  jest.mocked(getProject).mockImplementation(
    () =>
      new Promise<Project>((resolve, reject) => {
        answer = { resolve, reject }
      }),
  )
})

describe('the page of a project opened from a showcase card, before the API answers (R17)', () => {
  it('shows the photo of the card inside the arrival of the cover, marked as the target of the flight', async () => {
    await openFromCard()
    await screen.findByRole('header', { name: containing(project.title) })

    const [target] = coverTargets()
    expect(target).toBeDefined()
    // La photo de la carte est dedans : c'est elle qui vole jusqu'à sa place.
    expect(target ? hostsOf(target).some(hasCover) : false).toBe(true)
    expect(getProject).toHaveBeenCalledWith(project.id)
  })

  it('shows the real title, its author and its status, the rest loading', async () => {
    await openFromCard()

    expect(await screen.findByRole('header', { name: containing(project.title) })).toBeTruthy()
    expect(screen.getAllByText(containing(project.author.name)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(T.status).length).toBeGreaterThanOrEqual(1)
    // Retour est posé sur la photo (téléphone) : caché au lecteur d'écran pendant son vol.
    expect(screen.getByRole('button', { name: T.back, includeHiddenElements: true })).toBeTruthy()
    expect(await screen.findByRole('progressbar', { name: T.loading })).toBeTruthy()
  })

  it('shows nothing the showcase does not know: no reactions, no visibility, no menu, no demo', async () => {
    await openFromCard()
    await screen.findByRole('header', { name: containing(project.title) })

    expect(screen.queryByRole('button', { name: /^Waggle/ })).toBeNull()
    expect(screen.queryByText(T.web, { includeHiddenElements: true })).toBeNull()
    expect(screen.queryByRole('button', { name: T.menu })).toBeNull()
    expect(screen.queryByRole('button', { name: T.share })).toBeNull()
    expect(screen.queryByRole('link', { name: containing(T.demo) })).toBeNull()
    expect(screen.queryByRole('button', { name: containing(T.demo) })).toBeNull()
    expect(screen.queryByText(containing(descriptionTitle))).toBeNull()

    // Témoin : l'API répond, et ce que la vitrine ne savait pas arrive (« Public », le menu).
    await answerWith()
    expect(await screen.findByRole('button', { name: T.menu })).toBeTruthy()
    expect(screen.getAllByText(T.web).length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the same title and the same photo when the full project arrives', async () => {
    await openFromCard()
    const before = await screen.findByRole('header', { name: containing(project.title) })
    const [photo] = coverImages()
    expect(photo).toBeDefined()

    await answerWith()
    expect(await screen.findByRole('header', { name: descriptionTitle })).toBeTruthy()

    expect(titleHeader() === before).toBe(true)
    expect(coverImages()[0] === photo).toBe(true)
  })

  it('shows the loading page as before without a showcase in cache (témoin)', async () => {
    await openFromCard(null)

    expect(await screen.findByRole('progressbar', { name: T.loading })).toBeTruthy()
    expect(titleHeader()).toBeNull()
    expect(coverImages()).toHaveLength(0)
    expect(coverTargets()).toHaveLength(0)
  })
})
