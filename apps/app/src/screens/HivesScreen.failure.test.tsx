// Tests de l'onglet Ruches quand « Rejoindre » ou « Refuser » échoue (R10, « L'onglet Ruches ») :
// le message s'écrit sous la carte touchée, et dit pourquoi quand l'API le sait (la session expirée
// pendant la visite), sinon la phrase de la carte. La carte reste, ses boutons aussi : on peut
// réessayer. (Sa venue dans l'écran, `revealWithoutJump`, se mesure dans le navigateur.)
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import {
  acceptNamed,
  hiveServer,
  invitationId,
  lea,
  nora,
  refusal,
  refuseNamed,
  resetHiveMocks,
  shown,
  T,
  visitedPaths,
} from './Hives.testkit'
import { HivesScreen } from './HivesScreen'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHiveMocks('/hives')
  mockSession({ user: { id: lea.id, name: lea.name } })
})

const ACCEPT = new RegExp(`^/v1/hive-invitations/${invitationId}/accept$`)
const REFUSE = new RegExp(`^/v1/hive-invitations/${invitationId}$`)

const openTab = async () => {
  await renderWithProviders(
    <ToastProvider>
      <HivesScreen />
    </ToastProvider>,
  )
  await waitFor(() => expect(shown(T.intro)).toBe(true))
}

describe('a gesture on an invitation that fails', () => {
  it('says the invitation could not be accepted, keeps the card and opens nothing', async () => {
    hiveServer.answer('POST', ACCEPT, () => refusal(500, 'internal'))
    await openTab()

    await fireEvent.press(screen.getByRole('button', { name: acceptNamed('Atelier IA') }))

    await waitFor(() => expect(shown(fr.t(($) => $.hives.invitations.acceptError))).toBe(true))
    expect(screen.getByRole('button', { name: acceptNamed('Atelier IA') })).toBeTruthy()
    expect(visitedPaths()).toEqual([])
  })

  it('asks to sign in again when the session expired before « Refuser »', async () => {
    hiveServer.answer('DELETE', REFUSE, () => refusal(401, 'unauthorized'))
    await openTab()

    await fireEvent.press(screen.getByRole('button', { name: refuseNamed(nora.name) }))

    await waitFor(() => expect(shown(fr.t(($) => $.errors.unauthorized))).toBe(true))
    // Pas la phrase générale de la carte : la raison est connue.
    expect(shown(fr.t(($) => $.hives.invitations.refuseError))).toBe(false)
    expect(shown(T.refused)).toBe(false)
  })
})
