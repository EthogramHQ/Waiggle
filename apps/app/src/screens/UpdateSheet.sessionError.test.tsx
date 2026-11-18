// Tests de la feuille « Nouvelle mise à jour » quand la session ne se lit pas (R16, scénario « Les
// squelettes » : « même page quand la session ne se vérifie pas ») : comme avant R16, la feuille
// reste une feuille, et dit son erreur dedans (« Impossible de charger », Réessayer), au lieu de la
// page d'erreur de la garde sur toute la fenêtre. « Réessayer » relit la session ; rien n'est
// demandé à l'API tant qu'elle n'est pas lue (relecture de sécurité de la PR #62, S1).
import { fireEvent, screen } from '@testing-library/react-native'
import { useSession } from '../accounts/api'
import { request } from '../api/client'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { UpdateSheet } from './UpdateSheet'

const { id: mockId } = recipesProject
const id = mockId

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Rien ne part sur le réseau : une demande serait une faute (le test le vérifie).
jest.mock('../api/client', () => ({
  request: jest.fn(() => new Promise(() => {})),
  requestWithoutBody: jest.fn(() => new Promise(() => {})),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  dismiss: jest.fn(),
  setParams: jest.fn(),
  // Une page d'avant : la feuille ne pose pas la page du projet dessous.
  canGoBack: jest.fn(() => true),
  canDismiss: jest.fn(() => true),
}
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  // L'adresse de la feuille : `useRouteSheet` ne l'ouvre que sur sa propre adresse.
  usePathname: () => `/projects/${mockId}/update`,
  useNavigation: () => ({
    addListener: () => () => {},
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  }),
  useLocalSearchParams: () => ({ id: mockId }),
  useGlobalSearchParams: () => ({ id: mockId }),
  useSegments: () => [],
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))

/** La lecture de la session échoue (trop de demandes) ; renvoie sa relecture. */
const failSessionRead = () => {
  const refetch = jest.fn().mockResolvedValue(undefined)
  jest.mocked(useSession).mockReturnValue({
    data: null,
    isPending: false,
    error: { status: 429 },
    refetch,
  } as unknown as ReturnType<typeof useSession>)
  return refetch
}

const T = {
  sheetTitle: fr.t(($) => $.project.updates.sheetTitle),
  errorTitle: fr.t(($) => $.states.errorTitle),
  loadError: fr.t(($) => $.account.loadError),
  retry: fr.t(($) => $.common.retry),
  back: fr.t(($) => $.states.back),
  signIn: fr.t(($) => $.home.signIn),
}

const open = () =>
  renderWithProviders(
    <ToastProvider>
      <UpdateSheet id={id} />
    </ToastProvider>,
  )

beforeEach(() => {
  jest.mocked(request).mockClear()
})

describe('the sheet « Nouvelle mise à jour », when the session cannot be read (R16)', () => {
  it('says so inside the sheet, and its retry reads the session again', async () => {
    const refetch = failSessionRead()
    await open()

    // La feuille, sous son titre, et l'erreur dedans.
    expect(await screen.findByRole('header', { name: T.sheetTitle })).toBeTruthy()
    expect(screen.getByRole('header', { name: T.errorTitle })).toBeTruthy()
    expect(screen.getByText(T.loadError)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: T.retry }))
    expect(refetch).toHaveBeenCalledTimes(1)

    // Ni « Revenir » (la page d'erreur de la garde), ni « Me connecter », ni aucune demande.
    expect(screen.queryByRole('button', { name: T.back })).toBeNull()
    expect(screen.queryByRole('button', { name: T.signIn })).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('shows the form once the session is read again', async () => {
    // Témoin : la même feuille, une fois la session lue, attend le profil (jamais l'erreur).
    failSessionRead()
    const view = await open()
    expect(await screen.findByRole('header', { name: T.errorTitle })).toBeTruthy()

    mockSession({ user: { id: 'u1', name: 'Léa' } })
    await view.rerender(
      <ToastProvider>
        <UpdateSheet id={id} />
      </ToastProvider>,
    )

    expect(screen.getByRole('header', { name: T.sheetTitle })).toBeTruthy()
    expect(screen.queryByRole('header', { name: T.errorTitle })).toBeNull()
    expect(request).toHaveBeenCalled()
  })
})
