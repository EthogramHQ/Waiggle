// Tests des testeurs sur la page d'un projet (R7a, puis R7b ; ProjectActions et sa feuille
// TesterSheet) : « Rejoindre les testeurs » à côté de « Suivre ce projet », seulement pour un autre
// membre sur un projet « Testable » qui a une démo, et que l'auteur n'a pas retiré
// (`testerJoinable`) ; la feuille qui explique, la bulle, puis, une fois inscrit, « Le coin des
// testeurs » (R7b), un lien vers la page du coin, au même endroit, qui garde le focus. La feuille
// « Tu testes ce projet » disparaît : on quitte les testeurs depuis le coin, ou depuis le menu « … »
// de la page (ProjectScreen.testers.test.tsx). Les refus de l'API dits dans la feuille ; pour
// l'auteur, « Le coin des testeurs » à côté de « 12 testeurs ». Textes sans genre (décision de
// Louis du 10/11/2026).
//
// Les vrais hooks (`testers/api.ts`) tournent ici, sur un faux réseau (`api/client`) qui joue le
// serveur : la page lit le projet dans le cache, comme ProjectScreen, et voit donc `isTester` changer
// au toucher. Le focus passe par une aide de `ui/focus.ts` (Sheet et les écrans s'en servent).
//
// Ce que ces tests supposent du code (plan R7b, « Écrans et modules », ui-A10) : « Le coin des
// testeurs » est un lien (rôle `link`) ou un bouton ; il mène à `/projects/<id>/testers` par le
// routeur (`push` ou `navigate`, adresse en texte ou `{ pathname: '/projects/[id]/testers' }`).
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
// Le routeur : le même objet à chaque appel, pour que le test lise où « Le coin des testeurs » mène.
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismissTo: jest.fn(),
}
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => mockRouter,
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
const CORNER = fr.t(($) => $.project.testers.corner)
// Le libellé de R7a, écrit en toutes lettres : sa clé (`joined`) part avec la feuille « membre ».
const OLD_JOINED = 'Tu testes ce projet'
const title = recipesProject.title

/** Le projet de Léa, vu par Inès : « Testable », avec une démo, suivi par deux membres. */
const seenByInes: Project = {
  ...recipesProject,
  isMine: false,
  isFollowed: false,
  followerCount: 2,
  isTester: false,
  testerCount: null,
  testerJoinable: true,
}
/** Le même, Inès étant inscrite aux testeurs. */
const tester: Project = { ...seenByInes, isTester: true }

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

/** « Le coin des testeurs » : un lien, ou un bouton (ui-A10 demande un lien). */
const queryCorner = () =>
  screen.queryByRole('link', { name: CORNER }) ?? screen.queryByRole('button', { name: CORNER })
const findCorner = async () => {
  await waitFor(() => expect(queryCorner()).not.toBeNull())
  const found = queryCorner()
  if (!found) throw new Error('No « Le coin des testeurs »')
  return found
}

/** Les adresses où le routeur a mené, en texte (« /projects/<id>/testers »). */
const visitedPaths = () =>
  [...mockRouter.push.mock.calls, ...mockRouter.navigate.mock.calls].map(([to]) => {
    if (typeof to === 'string') return to
    const { pathname, params } = to as { pathname: string; params?: Record<string, string> }
    return Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`[${key}]`, value),
      pathname,
    )
  })
const cornerPath = `/projects/${seenByInes.id}/testers`

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

/** Les contrôles de la page (bouton, lien, interrupteur), dans l'ordre de lecture. */
const controls = () => screen.getAllByRole(/^(button|link|switch)$/)

/** Une aide de focus a-t-elle reçu l'élément nommé ainsi ? */
const focusWentTo = (name: string) =>
  [
    ...jest.mocked(focusWithoutScroll).mock.calls,
    ...jest.mocked(focusAndReveal).mock.calls,
    ...jest.mocked(moveReaderTo).mock.calls,
  ].some(([node]) => labelOf(node) === name)

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
  for (const fn of Object.values(mockRouter)) fn.mockClear()
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

  // R7b (plan validé du 11/11/2026) : l'API refuse la réinscription d'un membre retiré par l'auteur ;
  // l'appli ne lui propose pas le bouton (`testerJoinable` faux), sans dire pourquoi.
  it('offers no « Rejoindre les testeurs » to a member the author removed from the testers', async () => {
    await renderPage({ ...seenByInes, testerJoinable: false })

    // Témoin : le projet cherche des testeurs, et la page est là.
    expect(screen.getByRole('switch', { name: 'Suivre ce projet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tester la démo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
    expect(queryCorner()).toBeNull()
  })

  it('never offers « Rejoindre les testeurs » to the author, who sees « 12 testeurs » beside the followers', async () => {
    await renderPage({ ...recipesProject, testerCount: 12, followerCount: 12 })

    expect(screen.getByText(fr.t(($) => $.follow.followers, { count: 12 }))).toBeTruthy()
    expect(screen.getByText('12 testeurs')).toBeTruthy()
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  it('says « 1 testeur » to the author, in the singular', async () => {
    await renderPage({ ...recipesProject, testerCount: 1 })

    expect(screen.getByText('1 testeur')).toBeTruthy()
  })

  it('never shows the number of testers to another member', async () => {
    await renderPage(tester)

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

  // Juridique J4 : la feuille dit ce que l'auteur verra (la date d'inscription), le badge que tous
  // les lecteurs des commentaires verront, et que les retours restent privés. Le texte est celui du
  // contrat : ce test passe dès lors que la feuille montre `joinBody`.
  it('names the badge, the inscription date and the private feedback in the join sheet', async () => {
    await renderPage()
    await openJoinSheet()

    const body = fr.t(($) => $.project.testers.joinBody, { name: 'Léa', title })
    expect(screen.getByText(body)).toBeTruthy()
    expect(body).toMatch(/badge\s«\sTesteur\s»/)
    expect(body).toMatch(/date d’inscription/)
    expect(body).toMatch(/aucun autre membre ne lit/)
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

  it('joins on confirmation: one request, a bubble, and the button becomes « Le coin des testeurs »', async () => {
    await renderPage()
    const pageButton = await openJoinSheet()

    await fireEvent.press(sheetConfirm(pageButton))

    expect(testerRequests()).toEqual(['POST'])
    expect(
      await screen.findByText(fr.t(($) => $.project.testers.joinedToast, { title })),
    ).toBeTruthy()
    expect(await findCorner()).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('header', { name: JOIN })).toBeNull())
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
    expect(screen.queryByText(OLD_JOINED)).toBeNull()
  })

  // Interface A10 : un seul élément pour les deux libellés, à la même place (sous « Suivre ce
  // projet »), et le focus y arrive après la feuille.
  it('turns « Rejoindre les testeurs » into « Le coin des testeurs » in place, focus kept', async () => {
    await renderPage()
    const placeBefore = controls().indexOf(screen.getByRole('button', { name: JOIN }))
    const pageButton = await openJoinSheet()
    jest.mocked(focusWithoutScroll).mockClear()
    jest.mocked(focusAndReveal).mockClear()
    jest.mocked(moveReaderTo).mockClear()

    await fireEvent.press(sheetConfirm(pageButton))

    const corner = await findCorner()
    await waitFor(() => expect(screen.queryByRole('header', { name: JOIN })).toBeNull())
    // À la même place parmi les contrôles de la page : juste après « Suivre ce projet ».
    expect(controls().indexOf(corner)).toBe(placeBefore)
    expect(controls().indexOf(corner)).toBe(
      controls().indexOf(screen.getByRole('switch', { name: 'Suivre ce projet' })) + 1,
    )
    await waitFor(() => expect(focusWentTo(CORNER)).toBe(true))
  })

  // ui-C5 (R7a) : sur téléphone, `focusWithoutScroll` ne fait rien ; le lecteur d'écran est amené
  // sur le lien, sinon il repartirait du haut quand la feuille disparaît.
  it('moves the screen reader to « Le coin des testeurs » after confirming (phone)', async () => {
    await renderPage()
    const pageButton = await openJoinSheet()
    jest.mocked(moveReaderTo).mockClear()

    await fireEvent.press(sheetConfirm(pageButton))

    await findCorner()
    await waitFor(() =>
      expect(jest.mocked(moveReaderTo).mock.calls.some(([node]) => labelOf(node) === CORNER)).toBe(
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
    expect(queryCorner()).toBeNull()
    expect(screen.queryByText(/200/)).toBeNull()
  })

  // Juridique J6 : le 409 `not_testable` répond aussi à un membre retiré par l'auteur (qui arrive
  // sur une page restée ouverte). La phrase reste vraie pour toutes les causes : jamais « ne cherche
  // plus de testeurs », qui serait faux pour lui. Le texte est celui du contrat.
  it('shows a removed member a refusal that stays true for every cause', async () => {
    jest.mocked(requestWithoutBody).mockResolvedValue({ ok: false, error: 'notTestable' })
    await renderPage()
    const pageButton = await openJoinSheet()

    await fireEvent.press(sheetConfirm(pageButton))

    const refusal = fr.t(($) => $.project.testers.notTestable)
    expect(await screen.findByText(refusal)).toBeTruthy()
    expect(refusal).not.toMatch(/cherche plus/)
    expect(refusal).not.toMatch(/retiré/)
    expect(queryCorner()).toBeNull()
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

describe('« Le coin des testeurs » for a tester (R7b)', () => {
  it('shows « Le coin des testeurs » under « Suivre ce projet », never « Tu testes ce projet »', async () => {
    await renderPage(tester)

    const corner = await findCorner()
    expect(controls().indexOf(corner)).toBe(
      controls().indexOf(screen.getByRole('switch', { name: 'Suivre ce projet' })) + 1,
    )
    expect(screen.queryByText(OLD_JOINED)).toBeNull()
    expect(screen.queryByRole('button', { name: JOIN })).toBeNull()
  })

  // Interface A10 (R7b, correction 7) : le bouton des testeurs mène au coin, il se lit « lien » ;
  // « Rejoindre les testeurs », qui ouvre une feuille, reste un bouton (témoin).
  it('reads « Le coin des testeurs » as a link, « Rejoindre les testeurs » as a button', async () => {
    await renderPage(tester)

    expect(await screen.findByRole('link', { name: CORNER })).toBeTruthy()
    expect(screen.queryByRole('button', { name: CORNER })).toBeNull()
  })

  it('leads to the testers corner of the project, without a sheet and without a request', async () => {
    await renderPage(tester)

    await fireEvent.press(await findCorner())

    expect(visitedPaths()).toEqual([cornerPath])
    // La feuille « membre » de R7a n'existe plus : rien ne s'ouvre sur la page.
    expect(screen.queryByRole('header', { name: OLD_JOINED })).toBeNull()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.project.testers.quit) })).toBeNull()
    expect(testerRequests()).toEqual([])
  })

  it('keeps « Le coin des testeurs » out of honey', async () => {
    await renderPage(tester)

    const corner = await findCorner()
    expect(backgrounds(corner as unknown as Node)).not.toContain(palettes.day.honey)
  })

  // Juridique P3, interface A5 (R7a) : ce qui mène à son fil et au départ reste quand la condition
  // pour entrer tombe. Un projet en pause ou terminé garde son coin (seuls un retrait, le privé ou la
  // suspension de l'auteur le ferment).
  it.each(['idea', 'building', 'paused', 'done'] as const)(
    'keeps « Le coin des testeurs » on a project that is no longer testable (%s)',
    async (status) => {
      await renderPage({ ...tester, status })

      await fireEvent.press(await findCorner())

      expect(visitedPaths()).toEqual([cornerPath])
    },
  )

  it('keeps « Le coin des testeurs » on a project whose demo is gone', async () => {
    await renderPage({ ...tester, demoUrl: null })

    expect(await findCorner()).toBeTruthy()
  })

  it('keeps « Le coin des testeurs » for a suspended tester, who can still read it and leave', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderPage(tester)
    // Le profil se lit après le premier rendu : on attend que la suspension soit connue.
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    const corner = await findCorner()
    expect(corner).not.toBeDisabled()
    await fireEvent.press(corner)
    expect(visitedPaths()).toEqual([cornerPath])
  })

  // Juridique T5 (R7a) : ne plus suivre ne fait pas quitter les testeurs ; la bulle le dit.
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

describe('« Le coin des testeurs » for the author (R7b, planche validée 2)', () => {
  const mine: Project = { ...recipesProject, testerCount: 12, followerCount: 12 }

  it('shows the author « Le coin des testeurs » with « 12 testeurs » beside it', async () => {
    await renderPage(mine)

    expect(await findCorner()).toBeTruthy()
    expect(screen.getByText('12 testeurs')).toBeTruthy()
    // Témoin : « Modifier » reste à l'auteur.
    expect(screen.getByRole('button', { name: fr.t(($) => $.project.page.edit) })).toBeTruthy()
  })

  it('leads the author to the testers corner of the project', async () => {
    await renderPage(mine)

    await fireEvent.press(await findCorner())

    expect(visitedPaths()).toEqual([cornerPath])
  })

  // Interface A10 (R7b, correction 7) : il mène à une autre page, il se lit « lien ».
  it('reads « Le coin des testeurs » as a link, for the author as for a tester', async () => {
    await renderPage(mine)

    expect(await screen.findByRole('link', { name: CORNER })).toBeTruthy()
    expect(screen.queryByRole('button', { name: CORNER })).toBeNull()
    // Témoin : « Modifier », qui ouvre une feuille sur la page, reste un bouton.
    expect(screen.getByRole('button', { name: fr.t(($) => $.project.page.edit) })).toBeTruthy()
  })

  it('offers the corner on a testable project that has no tester yet, beside « 0 testeur »', async () => {
    await renderPage({ ...mine, testerCount: 0 })

    expect(await findCorner()).toBeTruthy()
    expect(screen.getByText('0 testeur')).toBeTruthy()
  })

  it('offers the corner on a paused project that still has testers', async () => {
    await renderPage({ ...mine, status: 'paused', testerCount: 3 })

    expect(await findCorner()).toBeTruthy()
  })

  it('offers no corner on a project that never looked for testers', async () => {
    await renderPage({ ...mine, status: 'idea', testerCount: 0 })

    // Témoin : « Modifier » est là.
    expect(screen.getByRole('button', { name: fr.t(($) => $.project.page.edit) })).toBeTruthy()
    expect(queryCorner()).toBeNull()
  })

  // Plan R7b validé du 11/11/2026 : un coin fermé (auteur suspendu) reste lisible par l'auteur, qui y lit
  // le bandeau du coin fermé ; il ne peut plus y écrire.
  it('keeps the corner for a suspended author, who still reads it', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderPage(mine)
    await waitFor(() => expect(getMe).toHaveBeenCalled())
    await act(async () => {})

    await fireEvent.press(await findCorner())

    expect(visitedPaths()).toEqual([cornerPath])
  })
})
