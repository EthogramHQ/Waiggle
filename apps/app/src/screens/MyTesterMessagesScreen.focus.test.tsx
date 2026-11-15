// Le focus de « Mes retours envoyés » (R11) après une suppression : il ne se perd jamais. Le
// message parti, il va au « Supprimer » du message suivant dans l'ordre de lecture (même quand ce
// message est dans la carte d'un autre projet), sinon au titre de la page. Sur téléphone, c'est le
// lecteur d'écran qui y va (`moveReaderTo`), espionné ici.
import type { MyTesterMessage, MyTesterMessagesPage } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request, requestWithoutBody } from '../api/client'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { moveReaderTo } from '../ui/focus'
import { MyTesterMessagesScreen } from './MyTesterMessagesScreen'

jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => Promise.resolve(null)) }))
jest.mock('../api/media', () => ({ useMediaSources: () => () => null }))
jest.mock('../ui/focus', () => ({
  ...jest.requireActual('../ui/focus'),
  moveReaderTo: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/data/feedback',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

const project = (n: number) => ({
  id: `5d2c9e41-7a0b-4e6f-8c3d-1b9a0000000${n}`,
  title: `Projet ${n}`,
  cover: null,
  author: { name: `Auteur ${n}` },
})
const message = (n: number, projectNumber: number): MyTesterMessage => ({
  id: `0f1e2d3c-4b5a-4968-8776-00000000000${n}`,
  projectId: project(projectNumber).id,
  project: project(projectNumber),
  closed: false,
  kind: 'feedback',
  text: `Message ${n}`,
  outcome: 'yes',
  device: 'phone',
  createdAt: `2026-11-1${n}T10:00:00.000Z`,
  media: null,
  removed: false,
})

let page: MyTesterMessagesPage

beforeEach(() => {
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (to: string) =>
      to.startsWith('/v1/me/tester-messages')
        ? { ok: true, data: page }
        : { ok: false, error: 'notFound' }) as typeof request)
  jest
    .mocked(requestWithoutBody)
    .mockReset()
    .mockImplementation((async () => ({ ok: true, data: null })) as typeof requestWithoutBody)
  mockSession({ user: { id: 'u-max', name: 'Max' } })
  jest.mocked(moveReaderTo).mockClear()
})

const deleteName = (text: string) => fr.t(($) => $.myFeedback.deleteNamed, { excerpt: text })
const deleteMessage = async (text: string) => {
  await fireEvent.press(await screen.findByRole('button', { name: deleteName(text) }))
  await screen.findByRole('header', { name: fr.t(($) => $.project.testers.thread.deleteTitle) })
  await passTapGuard()
  jest.mocked(moveReaderTo).mockClear()
  await fireEvent.press(
    screen.getByRole('button', { name: fr.t(($) => $.project.testers.thread.deleteConfirm) }),
  )
  await waitFor(() => expect(screen.queryByText(text)).toBeNull())
}
const focusedLabels = () =>
  jest
    .mocked(moveReaderTo)
    .mock.calls.map(([node]) => (node as { props?: { accessibilityLabel?: string } }).props)
    .map((props) => props?.accessibilityLabel ?? null)

describe('MyTesterMessagesScreen, the focus after deleting', () => {
  it('moves the focus to the next message, even in the card of another project', async () => {
    // Message 2 (projet 1) puis message 1 (projet 2) : la fin d'une carte mène à la suivante.
    page = { items: [message(2, 1), message(1, 2)], nextCursor: null }
    await renderWithProviders(<MyTesterMessagesScreen />)

    await deleteMessage('Message 2')

    await waitFor(() => expect(focusedLabels()).toContain(deleteName('Message 1')))
  })

  it('moves the focus to the title of the page when no message is left', async () => {
    page = { items: [message(1, 1)], nextCursor: null }
    await renderWithProviders(<MyTesterMessagesScreen />)

    await deleteMessage('Message 1')

    await waitFor(() => expect(moveReaderTo).toHaveBeenCalled())
    expect(focusedLabels()).not.toContain(deleteName('Message 1'))
  })
})
