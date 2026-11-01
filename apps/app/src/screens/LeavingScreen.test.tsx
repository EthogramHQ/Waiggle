// Tests de la page d'avertissement qui précède l'ouverture d'un site extérieur.
import type { Project } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { ApiError } from '../api/errors'
import { getProject } from '../projects/api'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LeavingScreen } from './LeavingScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// R5a : la page relit le projet d'où vient le lien (?project=), par l'API, pour dire « La démo de … ».
jest.mock('../projects/api', () => ({ getProject: jest.fn() }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés (le titre de l'onglet).
const mockScreenProps: Record<string, unknown>[] = []
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
// L'hydratation (web) : vraie par défaut, comme sur un téléphone ; un test la retient.
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}))

const mockReplace = jest.fn()
let mockCanGoBack = true
let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  mockBack.mockReset()
  mockReplace.mockReset()
  mockCanGoBack = true
  mockHydrated = true
  mockScreenProps.length = 0
  // Personne de connecté par défaut : la page ne demande rien à l'API sans session.
  mockSession(null)
  jest.mocked(getProject).mockReset()
})
afterEach(() => openURL.mockRestore())

describe('LeavingScreen', () => {
  it('shows where the link really leads, then opens it', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com/demo?x=1" />)

    expect(screen.getByText('https://recettes.example.com/demo?x=1')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir le site' }))

    expect(openURL).toHaveBeenCalledWith('https://recettes.example.com/demo?x=1')
  })

  it('never opens a link that is not https', async () => {
    await renderWithProviders(<LeavingScreen url="javascript:alert(1)" />)

    expect(
      screen.getByText(
        'Ce lien ne peut pas être ouvert : seules les adresses https vers un site public sont acceptées.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ouvrir le site/ })).toBeNull()
  })

  it('goes back without opening anything', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" />)

    await fireEvent.press(screen.getByRole('button', { name: 'Rester sur Waiggle' }))

    expect(mockBack).toHaveBeenCalled()
    expect(openURL).not.toHaveBeenCalled()
  })

  it('goes home when there is no page to go back to (link opened in a new tab)', async () => {
    mockCanGoBack = false
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" />)

    await fireEvent.press(screen.getByRole('button', { name: 'Rester sur Waiggle' }))

    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('refuses local machines and disguised addresses', async () => {
    for (const url of ['https://192.168.1.1/admin', 'https://waiggle.com@pirate.example.com']) {
      await renderWithProviders(<LeavingScreen url={url} />)
      expect(screen.queryByRole('button', { name: /Ouvrir le site/ })).toBeNull()
    }
  })

  it('on a phone, refuses a name in another alphabet that could imitate a known site', async () => {
    // Sur iOS et Android, Expo remplace l'outil URL par une version minimale qui laisse les noms
    // Unicode tels quels (« аpple.com » avec un « а » cyrillique). On la charge pour reproduire ça.
    // require.resolve (fourni par Jest) trouve le chemin d'un module ; on cherche celui-ci depuis le
    // dossier d'Expo, qui en dépend. Le « as » décrit seulement ce dont on se sert.
    const resolve = (
      require as unknown as { resolve: (id: string, o?: { paths: string[] }) => string }
    ).resolve
    const expoPackage = resolve('expo/package.json')
    const expoDir = expoPackage.slice(0, expoPackage.lastIndexOf('/'))
    const { URL: PhoneURL } = require(resolve('whatwg-url-minimum', { paths: [expoDir] }))
    const realURL = globalThis.URL
    globalThis.URL = PhoneURL
    try {
      await renderWithProviders(<LeavingScreen url={'https://аpple.com/login'} />)
      expect(screen.queryByRole('button', { name: /Ouvrir le site/ })).toBeNull()
    } finally {
      globalThis.URL = realURL
    }
  })
})

// --- Tranche R5a : la page de sortie redessinée (F-Out1, F-Out2, sec-B4, ui-9, ui-17) ---

/** Le projet de Léa, vu par Max : sa démo est https://recettes.example.com. */
const lea: Project = { ...recipesProject, isMine: false }
const { id } = recipesProject
const fromLine = (project: Project = lea) =>
  fr.t(($) => $.leaving.from, { title: project.title, name: project.author.name })

/** Un élément de l'écran, tel que Testing Library le rend. */
type Element = ReturnType<typeof screen.getByText>

/** Le chemin de l'élément depuis la racine : sa place parmi ses frères, à chaque étage. */
const pathTo = (element: Element) => {
  const path: number[] = []
  let node: Element = element
  while (node.parent) {
    path.unshift(node.parent.children.indexOf(node))
    node = node.parent
  }
  return path
}

/** Attend que la réponse de l'API (ou son refus) soit arrivée et affichée. */
const settled = async () => {
  await waitFor(() => expect(getProject).toHaveBeenCalled())
  await act(async () => {})
}

describe('the page that leaves for another site (R5a)', () => {
  beforeEach(() => {
    mockSession({ user: { id: 'u2', name: 'Max' } })
    jest.mocked(getProject).mockResolvedValue(lea)
  })

  it('says « Tu quittes Waiggle pour », the site in full, its address, and the warning', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com/demo" />)

    expect(screen.getByText(fr.t(($) => $.leaving.to))).toBeTruthy()
    expect(screen.getByText('recettes.example.com')).toBeTruthy()
    expect(screen.getByText('https://recettes.example.com/demo')).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.leaving.warningTitle))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.leaving.warningBody))).toBeTruthy()
  })

  it('says whose demo it is when the address is the demo of the project, read from the API', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    expect(await screen.findByText(fromLine())).toBeTruthy()
    expect(getProject).toHaveBeenCalledWith(id)
  })

  it('compares both addresses the same way (a host in capitals is the same site)', async () => {
    await renderWithProviders(<LeavingScreen url="https://RECETTES.example.com/" project={id} />)

    expect(await screen.findByText(fromLine())).toBeTruthy()
  })

  // sec-B4 : un lien fabriqué « /out?url=piège&project=<vrai projet> » ne doit pas faire dire « La
  // démo de … » à côté d'un site piégé. Seule l'adresse exacte de la démo compte.
  it.each([
    ['another page of the same site', 'https://recettes.example.com/login'],
    ['a site that only starts with the same name', 'https://recettes.example.com.evil.net'],
    ['the same page with something added', 'https://recettes.example.com/?x=1'],
  ])('says nothing about the project for %s', async (_case, url) => {
    jest.mocked(getProject).mockResolvedValue({ ...lea, demoUrl: 'https://recettes.example.com/' })
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    await settled()
    // Témoin : la page est là, prête à ouvrir le site.
    expect(screen.getByRole('button', { name: 'Ouvrir le site' })).toBeTruthy()
    expect(screen.queryByText(/La démo de/)).toBeNull()
  })

  it.each([
    ['cannot be found', new ApiError('notFound')],
    ['needs a session again', new ApiError('unauthorized')],
  ])('shows the same page, without the line, when the project %s', async (_case, error) => {
    jest.mocked(getProject).mockRejectedValue(error)
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    await settled()
    expect(screen.getByRole('button', { name: 'Ouvrir le site' })).toBeTruthy()
    expect(screen.queryByText(/La démo de/)).toBeNull()
    // Rien ne trahit l'échec : ni alerte, ni message.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['abc', '../members/u1', `${id}?x=1`])(
    'asks nothing of the API when « project » is not a project id (%s)',
    async (project) => {
      await renderWithProviders(
        <LeavingScreen url="https://recettes.example.com" project={project} />,
      )

      expect(screen.getByRole('button', { name: 'Ouvrir le site' })).toBeTruthy()
      await act(async () => {})
      expect(getProject).not.toHaveBeenCalled()
      expect(screen.queryByText(/La démo de/)).toBeNull()
    },
  )

  it('asks nothing of the API when the address cannot be opened', async () => {
    await renderWithProviders(<LeavingScreen url="javascript:alert(1)" project={id} />)

    expect(screen.getByText(fr.t(($) => $.leaving.invalid))).toBeTruthy()
    await act(async () => {})
    expect(getProject).not.toHaveBeenCalled()
  })

  it('writes the title and the name as they are, never as formatting', async () => {
    const tricky = { ...lea, title: '**Connexion** <b>Waiggle</b>' }
    jest.mocked(getProject).mockResolvedValue(tricky)
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    expect(
      await screen.findByText('La démo de **Connexion** <b>Waiggle</b>, ajoutée par Léa'),
    ).toBeTruthy()
  })

  // ui-17 : la ligne réserve sa place ; « Ouvrir le site » ne bouge pas quand elle arrive.
  it('keeps « Ouvrir le site » in place when the line arrives', async () => {
    let answer: (project: Project) => void = () => {}
    jest.mocked(getProject).mockReturnValue(
      new Promise<Project>((resolve) => {
        answer = resolve
      }),
    )
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    const before = pathTo(screen.getByRole('button', { name: 'Ouvrir le site' }))
    await act(async () => answer(lea))
    expect(await screen.findByText(fromLine())).toBeTruthy()

    expect(pathTo(screen.getByRole('button', { name: 'Ouvrir le site' }))).toEqual(before)
  })

  it('opens the site only once for a double tap', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    const open = screen.getByRole('button', { name: 'Ouvrir le site' })
    await fireEvent.press(open)
    await fireEvent.press(open)

    expect(openURL).toHaveBeenCalledTimes(1)
  })

  it('offers « Retour » at the top, which leads back to the page left', async () => {
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.back) }))

    expect(mockBack).toHaveBeenCalled()
    expect(openURL).not.toHaveBeenCalled()
  })

  // ui-9 : sur le web, la page est préparée sans connaître l'adresse ; rien n'est lu avant.
  it('waits for the page to be ready in the browser before reading the project', async () => {
    mockHydrated = false
    await renderWithProviders(<LeavingScreen url="https://recettes.example.com" project={id} />)

    await act(async () => {})
    expect(getProject).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Ouvrir le site' })).toBeNull()
    expect(mockScreenProps.at(-1)?.pageTitle).toBeNull()
  })
})
