// Tests de la cloche en temps réel (R21, docs/scenarios/refonte.md : « l'Activité : la pastille de
// la cloche s'allume ») : quand un avis arrive pour le membre, le serveur envoie `me:notifications`
// et la cloche relit son nombre tout de suite, sans attendre la minute ni recharger. Un signal qui
// ne la concerne pas (les commentaires d'un projet) ne lui fait rien relire.
//
// La vraie cloche et le vrai hook (`useUnreadCount`) ; seul le client de l'API est simulé, avec le
// nombre que le serveur rendrait.
import { act, screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { liveSignal } from '../testing/live'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { NotificationBell } from './NotificationBell'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))

const P = '9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

/** Le nombre que rend GET /v1/notifications/unread, choisi par le test. */
let serverCount = 0
let countReads = 0

beforeEach(() => {
  serverCount = 0
  countReads = 0
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(async (path: string) => {
      if (path === '/v1/notifications/unread') {
        countReads += 1
        return { ok: true, data: { count: serverCount } }
      }
      return { ok: false, error: 'network' }
    })
})

const plain = (text: string) => text.replace(/\s+/g, ' ')
const bellWith = (count: number) => plain(fr.t(($) => $.notifications.bellNew, { count }))

describe('the bell in real time', () => {
  it('lights up as soon as a notification arrives, without reloading', async () => {
    const { queryClient } = await renderWithProviders(<NotificationBell />)
    await act(async () => {})
    // Témoin : rien de nouveau au départ.
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()

    // Nora répond à Léa : l'avis est créé, le serveur prévient Léa.
    serverCount = 2
    await liveSignal(queryClient, { topic: 'me', kind: 'notifications' })

    expect(screen.getByRole('button', { name: bellWith(2) })).toBeTruthy()
  })

  it('does not reread its count for a signal about something else', async () => {
    const { queryClient } = await renderWithProviders(<NotificationBell />)
    await act(async () => {})
    const before = countReads

    serverCount = 1
    await liveSignal(queryClient, { topic: `project:${P}`, kind: 'comments' })
    await liveSignal(queryClient, { topic: 'me', kind: 'pollen' })

    expect(countReads).toBe(before)
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })
})
