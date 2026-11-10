// Tests de la ligne des testeurs sur la page de sortie (R7a, LeavingScreen) : quand la démo vient
// d'un projet « Testable » d'un autre membre, qui n'en est pas testeur, la page dit « Tu veux aider
// Léa ? », puis le lien « Rejoins les testeurs depuis la page du projet. » qui mène à la page du
// projet (interface S4). Ouvrir la démo ne rend jamais testeur tout seul : la page n'envoie rien.
import type { Project } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { request, requestWithoutBody } from '../api/client'
import { getProject } from '../projects/api'
import { suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { TAP_GUARD_MS } from '../ui/tapGuard'
import { LeavingScreen } from './LeavingScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn() }))
// Le faux réseau : aucune demande d'inscription ne doit partir de cette page.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/out',
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: mockReplace,
    back: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: () => true,
  }),
}))

const LEAD = fr.t(($) => $.project.testers.leavingLead, { name: 'Léa' })
const LINK = fr.t(($) => $.project.testers.leavingLink)
const url = 'https://recettes.example.com'
const { id } = recipesProject

/** Le projet de Léa, vu par Inès : « Testable », sa démo est l'adresse de la page. */
const seenByInes: Project = { ...recipesProject, isMine: false, isTester: false }

/** Attend que le projet relu (ou son refus) soit arrivé et affiché. */
const settled = async () => {
  await waitFor(() => expect(getProject).toHaveBeenCalled())
  await act(async () => {})
}

/** La page a-t-elle mené à celle du projet, par l'une des façons de naviguer ? */
const wentToProject = () =>
  [...mockPush.mock.calls, ...mockNavigate.mock.calls, ...mockReplace.mock.calls].some(
    ([to]) =>
      to === `/projects/${id}` ||
      (typeof to === 'object' &&
        to !== null &&
        (to as { pathname?: unknown }).pathname === '/projects/[id]' &&
        (to as { params?: { id?: unknown } }).params?.id === id),
  )

let openURL: jest.SpyInstance
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  mockSession({ user: { id: 'u3', name: 'Inès' } })
  jest.mocked(getProject).mockReset().mockResolvedValue(seenByInes)
  jest.mocked(request).mockReset()
  jest.mocked(requestWithoutBody).mockReset()
  mockPush.mockReset()
  mockNavigate.mockReset()
  mockReplace.mockReset()
})
afterEach(() => {
  openURL.mockRestore()
  jest.useRealTimers()
})

describe('the testers line of the page that leaves for a demo (R7a)', () => {
  it('invites a member who is not a tester to join, from the page of the project', async () => {
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    expect(await screen.findByText(LEAD)).toBeTruthy()
    expect(screen.getByRole('link', { name: LINK })).toBeTruthy()
  })

  it('leads to the page of the project through its link', async () => {
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    await fireEvent.press(await screen.findByRole('link', { name: LINK }))

    expect(wentToProject()).toBe(true)
    // Le lien mène à la page : il n'inscrit personne.
    expect(requestWithoutBody).not.toHaveBeenCalled()
  })

  it('never makes the member a tester by opening the demo', async () => {
    jest.useFakeTimers()
    await renderWithProviders(<LeavingScreen url={url} project={id} />)
    await act(async () => {
      jest.advanceTimersByTime(TAP_GUARD_MS)
    })

    await fireEvent.press(screen.getByRole('button', { name: 'Ouvrir le site' }))

    // L'adresse ouverte est celle que la page a mise en forme (publicHttpsUrl ajoute « / »).
    expect(openURL).toHaveBeenCalledWith(`${url}/`)
    const testers = [
      ...jest.mocked(request).mock.calls,
      ...jest.mocked(requestWithoutBody).mock.calls,
    ].filter(([path]) => String(path).includes('/testers'))
    expect(testers).toEqual([])
  })

  it('says nothing of the testers to a member who already tests the project', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...seenByInes, isTester: true })
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    await settled()
    // Témoin : la ligne « La démo de … » est là, le projet a bien été lu.
    expect(
      screen.getByText(fr.t(($) => $.leaving.from, { title: seenByInes.title, name: 'Léa' })),
    ).toBeTruthy()
    expect(screen.queryByText(LEAD)).toBeNull()
    expect(screen.queryByRole('link', { name: LINK })).toBeNull()
  })

  it('says nothing of the testers to the author of the project', async () => {
    jest.mocked(getProject).mockResolvedValue({ ...recipesProject, isMine: true })
    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    await settled()
    expect(
      screen.getByText(fr.t(($) => $.leaving.from, { title: seenByInes.title, name: 'Léa' })),
    ).toBeTruthy()
    expect(screen.queryByText(LEAD)).toBeNull()
  })

  it.each(['idea', 'building', 'paused', 'done'] as const)(
    'says nothing of the testers for a project that is %s',
    async (status) => {
      jest.mocked(getProject).mockResolvedValue({ ...seenByInes, status })
      await renderWithProviders(<LeavingScreen url={url} project={id} />)

      await settled()
      expect(
        screen.getByText(fr.t(($) => $.leaving.from, { title: seenByInes.title, name: 'Léa' })),
      ).toBeTruthy()
      expect(screen.queryByText(LEAD)).toBeNull()
    },
  )

  it('says nothing of the testers to a suspended account, which cannot join', async () => {
    // Le profil du membre dit qu'il est suspendu : la page ne l'invite pas à rejoindre.
    jest
      .mocked(request)
      .mockImplementation(async (path) =>
        String(path) === '/v1/me'
          ? { ok: true, data: { ...suspendedMe, id: 'u3', name: 'Inès' } }
          : { ok: false, error: { status: 404, code: 'not_found' } },
      )
    await renderWithProviders(<LeavingScreen url={url} project={id} />)

    await settled()
    await waitFor(() => expect(request).toHaveBeenCalledWith('/v1/me', {}, expect.anything()))
    // Témoin : la ligne « La démo de … » est là, le projet a bien été lu.
    expect(
      await screen.findByText(
        fr.t(($) => $.leaving.from, { title: seenByInes.title, name: 'Léa' }),
      ),
    ).toBeTruthy()
    expect(screen.queryByText(LEAD)).toBeNull()
    expect(screen.queryByRole('link', { name: LINK })).toBeNull()
  })

  it('says nothing of the testers when the address is not the demo of the project', async () => {
    await renderWithProviders(
      <LeavingScreen url="https://recettes.example.com/login" project={id} />,
    )

    await settled()
    // Témoin : la page est là, prête à ouvrir le site.
    expect(screen.getByRole('button', { name: 'Ouvrir le site' })).toBeTruthy()
    expect(screen.queryByText(LEAD)).toBeNull()
  })

  it('says nothing of the testers for a link that does not come from a project', async () => {
    await renderWithProviders(<LeavingScreen url={url} />)

    expect(screen.getByRole('button', { name: 'Ouvrir le site' })).toBeTruthy()
    expect(screen.queryByText(LEAD)).toBeNull()
    expect(getProject).not.toHaveBeenCalled()
  })
})
