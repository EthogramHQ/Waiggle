// Les fils de l'auteur en temps réel (R21, décision de Louis du 27/11/2026). Quand un testeur écrit,
// le serveur prévient l'auteur (`me:corner`) et sa liste de fils se relit. Rien ne bouge sous le
// doigt : la ligne du fil se met à jour à sa place, même si le fil est désormais le plus récent, et
// un fil tout neuf s'ajoute au bout, sans pousser les autres. L'ordre du serveur revient au
// prochain passage sur la page.
import { screen, waitFor } from '@testing-library/react-native'
import { liveSignal } from '../testing/live'
import { mockSession, renderWithProviders } from '../testing/render'
import { ToastProvider } from '../ui/theme/toast'
import {
  daysAgo,
  id,
  ines,
  lea,
  mockNav,
  mockServer,
  openThreads,
  project,
  resetCornerMocks,
  sam,
  shown,
  threadOf,
} from './TestersCorner.testkit'
import { TestersCornerScreen } from './TestersCornerScreen'

const kit = () => require('./TestersCorner.testkit') as typeof import('./TestersCorner.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(async () => null) }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetCornerMocks()
  mockSession({ user: { id: lea.id, name: lea.name } })
})

const chloe = { id: 't3', name: 'Chloé Bernard' }
const nora = { id: 't5', name: 'Nora Petit' }
const names = [ines.name, sam.name, chloe.name, nora.name]

/** Les noms des fils, dans l'ordre des lignes à l'écran. */
const rowOrder = () =>
  screen
    .getAllByText(new RegExp(`^(${names.join('|')})$`))
    .map((node) => names.find((name) => name === String(node.props.children)))

describe('the threads of the author in real time', () => {
  it('updates a thread in its place and adds a new one at the end, without moving the others', async () => {
    mockNav.params = { id, tab: 'feedback' }
    const { queryClient } = await renderWithProviders(
      <ToastProvider>
        <TestersCornerScreen id={id} />
      </ToastProvider>,
    )
    await waitFor(() => expect(shown(project.title)).toBe(true))
    await screen.findByText(ines.name)
    expect(rowOrder()).toEqual([ines.name, sam.name, chloe.name])

    // Sam écrit, puis Nora, une nouvelle testeuse : pour le serveur, leurs fils passent en tête.
    const [inesRow, samRow, chloeRow] = openThreads
    mockServer.threadPages.open.set('', {
      items: [
        threadOf(nora, { lastAt: daysAgo(0), excerpt: 'Premier essai.' }),
        { ...(samRow ?? threadOf(sam)), lastAt: daysAgo(0), excerpt: 'Ça plante au lancement.' },
        ...[inesRow, chloeRow].filter((row) => row !== undefined),
      ],
      nextCursor: null,
    })
    mockServer.counts = { open: 4, settled: 1 }
    await liveSignal(queryClient, { topic: 'me', kind: 'corner' })

    // La ligne de Sam dit son nouveau message, à sa place ; Nora arrive au bout.
    await waitFor(() => expect(shown('Ça plante au lancement.')).toBe(true))
    expect(rowOrder()).toEqual([ines.name, sam.name, chloe.name, nora.name])
  })
})
