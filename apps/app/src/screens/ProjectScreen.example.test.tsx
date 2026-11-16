// Tests de la page d'un projet d'exemple vue par un membre (tranche R12b, scénario « Les exemples ») :
// la pastille « Exemple » à côté du statut ou du nom de l'auteur, et sous l'en-tête la phrase
// « Projet fictif, créé par l'équipe de {{appName}} pour montrer à quoi ressemble un projet. ». Un
// projet d'un membre ordinaire n'a ni l'une ni l'autre. La page publique, vue par un visiteur :
// PublicExamples.test.tsx.
//
// L'interface attendue : `ProjectScreen` lit `project.author.example` (contrat `ProjectAuthor`) et
// pose `ui/ExampleBadge`. Mêmes faux appels que ProjectScreen.tools.test.tsx.
import { screen } from '@testing-library/react-native'
import { getProject } from '../projects/api'
import { exampleProject, recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import { readingOrder, resetProjectScreenMocks } from './ProjectScreen.testkit'

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
    data: { id: 'u-example', name: 'WaiggleBot', handle: 'waigglebot', isFollowed: false },
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
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}))

const T = {
  example: fr.t(($) => $.common.example),
  note: fr.t(($) => $.project.page.exampleNote),
}

/** Les pastilles « Exemple » lues à l'écran (cachées aux lecteurs d'écran : pas comptées). */
const badges = () => screen.queryAllByText(T.example)

/** Ouvre la page de ce projet, vue par Léa, et attend son titre. */
const open = async (project = exampleProject) => {
  jest.mocked(getProject).mockResolvedValue(project)
  await renderWithProviders(<ProjectScreen id={project.id} />)
  return screen.findByRole('header', { name: containing(project.title) })
}

beforeEach(() => {
  resetProjectScreenMocks()
})

describe('the page of a project of the examples account (R12b)', () => {
  it('shows « Exemple »', async () => {
    await open()

    expect(badges().length).toBeGreaterThanOrEqual(1)
  })

  it('says the project is made up, under its header', async () => {
    const title = await open()

    const note = screen.getByText(containing(T.note))
    const [header, said] = readingOrder(title, note)
    expect(header).toBeGreaterThanOrEqual(0)
    expect(said).toBeGreaterThan(header ?? Number.POSITIVE_INFINITY)
  })

  it('shows neither on the project of an ordinary member', async () => {
    await open({ ...recipesProject, isMine: false })

    // Témoin : la page est là, son statut aussi.
    expect(screen.getAllByText('Testable').length).toBeGreaterThanOrEqual(1)
    expect(badges()).toHaveLength(0)
    expect(screen.queryByText(containing(T.note))).toBeNull()
  })

  it('shows neither on the own project of a member', async () => {
    // Le projet de Léa, sur sa propre page : son auteur n'est pas un compte d'exemples.
    await open(recipesProject)

    expect(screen.getAllByText('Testable').length).toBeGreaterThanOrEqual(1)
    expect(badges()).toHaveLength(0)
    expect(screen.queryByText(containing(T.note))).toBeNull()
  })
})
