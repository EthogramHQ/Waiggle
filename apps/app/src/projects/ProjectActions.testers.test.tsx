// Tests des testeurs sur la page d'un projet (R7a, ProjectActions et sa feuille TesterSheet) :
// « Rejoindre les testeurs » à côté de « Suivre ce projet », seulement pour un autre membre sur un
// projet « Testable » qui a une démo ; la feuille qui explique, la bulle, « Tu testes ce projet » qui
// reçoit le focus ; la feuille « Tu testes ce projet » et « Quitter les testeurs » ; les refus de
// l'API dits dans la feuille ; le nombre de testeurs pour l'auteur seul. Textes sans genre
// (décision de Louis du 10/11/2026).
//
// Les vrais hooks (`testers/api.ts`) tournent ici, sur un faux réseau (`api/client`) qui joue le
// serveur : la page lit le projet dans le cache, comme ProjectScreen, et voit donc `isTester` changer
// au toucher. Le focus passe par une aide de `ui/focus.ts` (Sheet et les écrans s'en servent).
import { palettes } from '@ruche/brand'
import type { Project } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { requestWithoutBody } from '../api/client'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import { ProjectActions } from './ProjectActions'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
}))
// Les aides de focus, telles quelles, mais dont le test lit les appels.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn((node: unknown) => actual.focusWithoutScroll(node)),
    focusAndReveal: jest.fn((node: unknown, calm: boolean) => actual.focusAndReveal(node, calm)),
    moveReaderTo: jest.fn((node: unknown) => actual.moveReaderTo(node)),
  }
})

const JOIN = fr.t(($) => $.project.testers.join)
const JOINED = fr.t(($) => $.project.testers.joined)
const QUIT = fr.t(($) => $.project.testers.quit)
const title = recipesProject.title

/** Le projet de Léa, vu par Inès : « Testable », avec une démo, suivi par deux membres. */
const seenByInes: Project = {
  ...recipesProject,
  isMine: false,
  isFollowed: false,
  followerCount: 2,
  isTester: false,
  testerCount: null,
}

const mockToggle = jest.fn()
/** Ce que le faux serveur sait du projet ; la page le relit après chaque geste. */
let mockServer: Project = seenByInes
/** Les demandes faites à /testers, dans l'ordre (« POST », « DELETE »). */
const testerRequests = () =>
  jest
    .mocked(requestWithoutBody)
    .mock.calls.filter(([path]) => String(path) === `/v1/projects/${seenByInes.id}/testers`)
    .map(([, init]) => init?.method)

/** La page : le projet lu dans le cache, comme ProjectScreen, et ses actions. */
function OnPage({ project }: { project: Project }) {
  const { data } = useQuery({
    queryKey: ['project', project.id],
    queryFn: () => Promise.resolve(mockServer),
    initialData: project,
    staleTime: Number.POSITIVE_INFINITY,
  })
  return <ProjectActions project={data} onOpenDemo={jest.fn()} onEdit={jest.fn()} />
}

const renderPage = async (project: Project = seenByInes) => {
  mockServer = project
  return renderWithProviders(
    <ToastProvider>
      <OnPage project={project} />
    </ToastProvider>,
  )
}

/** Le serveur accepte : l'inscription et le départ changent ce qu'il relit. */
const serverAccepts = () =>
  jest.mocked(requestWithoutBody).mockImplementation(async (_path, init) => {
    mockServer = { ...mockServer, isTester: init?.method === 'POST' }
    return { ok: true, data: null }
  })

/** Ouvre la feuille d'inscription, puis attend la fin de sa garde contre la double tape. */
const openJoinSheet = async () => {
  const pageButton = screen.getByRole('button', { name: JOIN })
  await fireEvent.press(pageButton)
  expect(await screen.findByRole('header', { name: JOIN })).toBeTruthy()
  await passTapGuard()
  return pageButton
}

/** « Rejoindre les testeurs » de la feuille : celui qui n'est pas le bouton de la page. */
const sheetConfirm = (pageButton: unknown) => {
  const found = screen.getAllByRole('button', { name: JOIN }).find((one) => one !== pageButton)
  if (!found) throw new Error('The sheet has no « Rejoindre les testeurs »')
  return found
}

/** Les couleurs de fond d'un élément et de tout ce qu'il contient. */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }
const backgrounds = (node: Node): unknown[] => {
  const own = (StyleSheet.flatten(node.props.style as never) as { backgroundColor?: unknown })
    ?.backgroundColor
  const inner = node.children.flatMap((child) =>
    typeof child === 'string' ? [] : backgrounds(child),
  )
  return own === undefined ? inner : [own, ...inner]
}

/** Une aide de focus a-t-elle reçu le bouton « Tu testes ce projet » ? */
const focusWentToJoined = () =>
  [
    ...jest.mocked(focusWithoutScroll).mock.calls,
    ...jest.mocked(focusAndReveal).mock.calls,
    ...jest.mocked(moveReaderTo).mock.calls,
  ].some(([node]) => labelOf(node) === JOINED)

beforeEach(() => {
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  jest.mocked(requestWithoutBody).mockReset()
  serverAccepts()
  jest.mocked(focusWithoutScroll).mockClear()
  jest.mocked(focusAndReveal).mockClear()
  jest.mocked(moveReaderTo).mockClear()
})

describe('« Rejoindre les testeurs » on the page of a project (R7a)', () => {
  it('offers « Rejoindre les testeurs » beside « Suivre ce projet » on a testable project with a demo', async () => {
    await renderPage()

    expect(screen.getByRole('button', { name: JOIN })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Suivre ce projet' })).toBeTruthy()
    // Aucune demande avant le geste : ouvrir la page ne rend jamais testeur.
    expect(testerRequests()).toEqual([])
  })

  it.each(['idea', 'building', 'paused', 'done'] as const)(
    'offers no « Rejoindre les testeurs » on a project that is %s',
    async (status) => {
      await renderPage({ ...seenByInes, status })

      // Témoin : les actions sont là.
      expect(screen.getByRole('switch', { name: 'Suivre ce projet' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
    },
  )

  it('offers no « Rejoindre les testeurs » on a testable project without a demo', async () => {
    await renderPage({ ...seenByInes, demoUrl: null })

    expect(screen.getByText('Pas encore de démo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  it('never offers « Rejoindre les testeurs » to the author, who sees « 12 testeurs » beside the followers', async () => {
    await renderPage({ ...recipesProject, testerCount: 12, followerCount: 12 })

    expect(screen.getByText(fr.t(($) => $.follow.followers, { count: 12 }))).toBeTruthy()
    expect(screen.getByText('12 testeurs')).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
    expect(screen.queryByRole('button', { name: JOINED })).toBeNull()
  })

  it('says « 1 testeur » to the author, in the singular', async () => {
    await renderPage({ ...recipesProject, testerCount: 1 })

    expect(screen.getByText('1 testeur')).toBeTruthy()
  })

  it('never shows the number of testers to another member', async () => {
    await renderPage({ ...seenByInes, isTester: true })

    // Témoin : la ligne des abonnés est là.
    expect(screen.getByText(fr.t(($) => $.follow.followers, { count: 2 }))).toBeTruthy()
    expect(screen.queryByText(/^\d+ testeurs?$/)).toBeNull()
  })

  it('keeps « Rejoindre les testeurs » out of honey', async () => {
    await renderPage()

    // Témoin : « Tester la démo » est bien l'action miel de la page, et sa couleur se lit ainsi.
    const demo = screen.getByRole('button', { name: 'Tester la démo' })
    expect(backgrounds(demo as unknown as Node)).toContain(palettes.day.honey)
    const join = screen.getByRole('button', { name: JOIN })
    expect(backgrounds(join as unknown as Node)).not.toContain(palettes.day.honey)
    expect(backgrounds(join as unknown as Node)).not.toContain(palettes.day.honeyDisabled)
  })

  it('hides « Rejoindre les testeurs » from a suspended member who is not a tester', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderPage()

    await waitFor(() => expect(screen.queryByRole('button', { name: JOIN })).toBeNull())
    // Témoin : la démo reste.
    expect(screen.getByRole('button', { name: 'Tester la démo' })).toBeTruthy()
  })

  it('opens a sheet that says what joining means, with « Rejoindre les testeurs » and « Annuler »', async () => {
    await renderPage()

    const pageButton = await openJoinSheet()

    expect(
      screen.getByText(fr.t(($) => $.project.testers.joinBody, { name: 'Léa', title })),
    ).toBeTruthy()
    expect(sheetConfirm(pageButton)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Annuler' }).length).toBeGreaterThan(0)
    // Ouvrir la feuille n'inscrit personne.
    expect(testerRequests()).toEqual([])
  })

  it('closes on « Annuler » without joining', async () => {
    await renderPage()
    await openJoinSheet()

    const [cancel] = screen.getAllByRole('button', { name: 'Annuler' })
    if (!cancel) throw new Error('The sheet has no « Annuler »')
    await fireEvent.press(cancel)

    await waitFor(() => expect(screen.queryByRole('header', { name: JOIN })).toBeNull())
    expect(testerRequests()).toEqual([])
    expect(screen.getByRole('button', { name: JOIN })).toBeTruthy()
  })

  it('joins on confirmation: one request, a bubble, and the button becomes « Tu testes ce projet »', async () => {
    await renderPage()
    const pageButton = await openJoinSheet()

    await fireEvent.press(sheetConfirm(pageButton))

    expect(testerRequests()).toEqual(['POST'])
    expect(
      await screen.findByText(fr.t(($) => $.project.testers.joinedToast, { title })),
    ).toBeTruthy()
    expect(await screen.findByRole('button', { name: JOINED })).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('header', { name: JOIN })).toBeNull())
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  it('puts focus on « Tu testes ce projet » after confirming', async () => {
    await renderPage()
    const pageButton = await openJoinSheet()
    jest.mocked(focusWithoutScroll).mockClear()
    jest.mocked(focusAndReveal).mockClear()
    jest.mocked(moveReaderTo).mockClear()

    await fireEvent.press(sheetConfirm(pageButton))

    await screen.findByRole('button', { name: JOINED })
    await waitFor(() => expect(focusWentToJoined()).toBe(true))
  })

  // ui-C5 : sur téléphone, `focusWithoutScroll` ne fait rien ; le lecteur d'écran est amené sur le
  // bouton par `moveReaderTo`, sinon il repartirait du haut quand la feuille disparaît.
  it('moves the screen reader to « Tu testes ce projet » after confirming (phone)', async () => {
    await renderPage()
    const pageButton = await openJoinSheet()
    jest.mocked(moveReaderTo).mockClear()

    await fireEvent.press(sheetConfirm(pageButton))

    await screen.findByRole('button', { name: JOINED })
    await waitFor(() =>
      expect(jest.mocked(moveReaderTo).mock.calls.some(([node]) => labelOf(node) === JOINED)).toBe(
        true,
      ),
    )
  })

  it('sends one request on a double tap on « Rejoindre les testeurs » in the sheet', async () => {
    // La réponse se fait attendre : la seconde tape arrive pendant l'envoi.
    jest.mocked(requestWithoutBody).mockImplementation(() => new Promise(() => {}))
    await renderPage()
    const pageButton = await openJoinSheet()

    const confirm = sheetConfirm(pageButton)
    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(requestWithoutBody).toHaveBeenCalledTimes(1)
  })

  it('does not join on the second tap of a double tap on « Rejoindre les testeurs » of the page', async () => {
    await renderPage()
    const pageButton = screen.getByRole('button', { name: JOIN })

    // La seconde tape tombe sur le bouton de la feuille, tout juste ouverte.
    await fireEvent.press(pageButton)
    await screen.findByRole('header', { name: JOIN })
    await fireEvent.press(sheetConfirm(pageButton))

    expect(testerRequests()).toEqual([])
    // Témoin : après la garde, la même tape inscrit bien.
    await passTapGuard()
    await fireEvent.press(sheetConfirm(pageButton))
    expect(testerRequests()).toEqual(['POST'])
  })

  it('says « Ce projet ne prend plus de nouveaux testeurs. » in the sheet, never a number', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'testersFull' })
    await renderPage()
    const pageButton = await openJoinSheet()

    await fireEvent.press(sheetConfirm(pageButton))

    expect(await screen.findByText(fr.t(($) => $.project.testers.full))).toBeTruthy()
    // La feuille reste ouverte, et la page n'a pas cru l'inscription faite.
    expect(screen.getByRole('header', { name: JOIN })).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOINED })).toBeNull()
    expect(screen.queryByText(/200/)).toBeNull()
  })

  it('says in the sheet that the project no longer looks for testers (409 not_testable)', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'notTestable' })
    await renderPage()
    const pageButton = await openJoinSheet()

    await fireEvent.press(sheetConfirm(pageButton))

    expect(await screen.findByText(fr.t(($) => $.project.testers.notTestable))).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOINED })).toBeNull()
  })

  it('says in the sheet when joining failed for a reason that trying again can fix', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    await renderPage()
    const pageButton = await openJoinSheet()

    await fireEvent.press(sheetConfirm(pageButton))

    expect(await screen.findByText(fr.t(($) => $.project.testers.error))).toBeTruthy()
    // Réessayer reste possible : le bouton de la feuille est toujours là.
    expect(sheetConfirm(pageButton)).toBeTruthy()
  })
})

describe('« Tu testes ce projet » and « Quitter les testeurs » (R7a)', () => {
  const tester: Project = { ...seenByInes, isTester: true }

  /** Ouvre la feuille « Tu testes ce projet », puis attend la fin de sa garde. */
  const openMemberSheet = async () => {
    await fireEvent.press(screen.getByRole('button', { name: JOINED }))
    expect(await screen.findByRole('header', { name: JOINED })).toBeTruthy()
    await passTapGuard()
  }

  it('opens a sheet « Tu testes ce projet » with « Quitter les testeurs » and « Fermer »', async () => {
    await renderPage(tester)

    await openMemberSheet()

    expect(screen.getByText(fr.t(($) => $.project.testers.memberBody, { title }))).toBeTruthy()
    expect(screen.getByRole('button', { name: QUIT })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Fermer' }).length).toBeGreaterThan(0)
    expect(testerRequests()).toEqual([])
  })

  it('quits the testers: one request, a bubble, and the button is « Rejoindre les testeurs » again', async () => {
    await renderPage(tester)
    await openMemberSheet()

    await fireEvent.press(screen.getByRole('button', { name: QUIT }))

    expect(testerRequests()).toEqual(['DELETE'])
    expect(
      await screen.findByText(fr.t(($) => $.project.testers.quitToast, { title })),
    ).toBeTruthy()
    expect(await screen.findByRole('button', { name: JOIN })).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOINED })).toBeNull()
  })

  it('moves the screen reader to « Rejoindre les testeurs » after quitting (phone)', async () => {
    await renderPage(tester)
    await openMemberSheet()
    jest.mocked(moveReaderTo).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: QUIT }))

    await screen.findByRole('button', { name: JOIN })
    await waitFor(() =>
      expect(jest.mocked(moveReaderTo).mock.calls.some(([node]) => labelOf(node) === JOIN)).toBe(
        true,
      ),
    )
  })

  it('does not quit on the second tap of a double tap on « Tu testes ce projet »', async () => {
    await renderPage(tester)

    await fireEvent.press(screen.getByRole('button', { name: JOINED }))
    await screen.findByRole('header', { name: JOINED })
    // La seconde tape, 180 ms après la première, tombe sur « Quitter les testeurs ».
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 180)))
    await fireEvent.press(screen.getByRole('button', { name: QUIT }))

    expect(testerRequests()).toEqual([])
    expect(screen.getByRole('button', { name: JOINED })).toBeTruthy()
  })

  it('closes on « Fermer » without quitting', async () => {
    await renderPage(tester)
    await openMemberSheet()

    const [close] = screen.getAllByRole('button', { name: 'Fermer' })
    if (!close) throw new Error('The sheet has no « Fermer »')
    await fireEvent.press(close)

    await waitFor(() => expect(screen.queryByRole('header', { name: JOINED })).toBeNull())
    expect(testerRequests()).toEqual([])
    expect(screen.getByRole('button', { name: JOINED })).toBeTruthy()
  })

  it('says the departure failed, and keeps « Tu testes ce projet »', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'network' })
    await renderPage(tester)
    await openMemberSheet()

    await fireEvent.press(screen.getByRole('button', { name: QUIT }))

    expect(await screen.findByText(fr.t(($) => $.project.testers.quitError))).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  // Juridique P3, interface A5 : ce qui permet de partir reste quand la condition pour entrer tombe.
  it.each(['idea', 'building', 'paused', 'done'] as const)(
    'keeps « Tu testes ce projet » on a project that is no longer testable (%s)',
    async (status) => {
      await renderPage({ ...tester, status })

      await openMemberSheet()
      await fireEvent.press(screen.getByRole('button', { name: QUIT }))

      expect(testerRequests()).toEqual(['DELETE'])
    },
  )

  it('keeps « Tu testes ce projet » on a project whose demo is gone', async () => {
    await renderPage({ ...tester, demoUrl: null })

    expect(screen.getByRole('button', { name: JOINED })).toBeTruthy()
  })

  it('lets a suspended tester quit', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderPage(tester)
    // Le profil se lit après le premier rendu : on attend que la suspension soit connue.
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    await openMemberSheet()
    await fireEvent.press(screen.getByRole('button', { name: QUIT }))

    expect(testerRequests()).toEqual(['DELETE'])
  })

  // Juridique T5 : ne plus suivre ne fait pas quitter les testeurs ; la bulle le dit.
  it('says one stays a tester when unfollowing a project one tests', async () => {
    await renderPage({ ...tester, isFollowed: true, followerCount: 3 })

    await fireEvent.press(screen.getByRole('switch', { name: 'Projet suivi' }))

    expect(mockToggle).toHaveBeenCalledWith(true)
    expect(await screen.findByText(fr.t(($) => $.project.testers.stillTester))).toBeTruthy()
    expect(testerRequests()).toEqual([])
  })

  it('says nothing of the testers when unfollowing a project one does not test', async () => {
    await renderPage({ ...seenByInes, isFollowed: true, followerCount: 3 })

    await fireEvent.press(screen.getByRole('switch', { name: 'Projet suivi' }))

    // Témoin : le geste est bien parti.
    expect(mockToggle).toHaveBeenCalledWith(true)
    await act(async () => {})
    expect(screen.queryByText(fr.t(($) => $.project.testers.stillTester))).toBeNull()
  })
})
