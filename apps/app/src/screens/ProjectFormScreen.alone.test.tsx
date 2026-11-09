// La feuille de publication ouverte sans page d'avant (relecture du plan R6a, ui-I1) : une adresse
// tapée, un lien ouvert dans un onglet neuf. La route est une fenêtre transparente : sans page
// dessous, la feuille pose elle-même le fil sous elle, et « Annuler » mène au fil. Les outils
// communs sont dans `ProjectFormScreen.testkit.tsx` ; les `jest.mock` sont ceux de
// `ProjectFormScreen.test.tsx` (un `jest.mock` ne se partage pas), plus un faux fil.
import { fireEvent, screen } from '@testing-library/react-native'
import { destinations, mockNav, openNewForm, resetAll, TEXT } from './ProjectFormScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockClient.request(...(args as [never, never, never])),
  requestWithoutBody: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockClient.requestWithoutBody(...(args as [never, never])),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('expo-router', () => {
  const kit = () =>
    require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
  return {
    useRouter: () => kit().mockNav.router,
    usePathname: () => kit().mockNav.pathname,
    useNavigation: () => kit().mockNav.navigation,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    useSegments: () => [],
    useFocusEffect: () => {},
  }
})
// Le testkit remet à zéro les espions du focus avant chaque test : ils doivent exister.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})
// Le fil lui-même a ses tests (HomeScreen.*.test.tsx) : ici, un texte qui dit qu'il est là.
jest.mock('./HomeScreen', () => ({
  HomeScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native')
    return <Text>Le fil, dessous</Text>
  },
}))

beforeEach(() => resetAll())

describe('ProjectFormScreen, opened without a page before it', () => {
  it('draws the feed under the sheet when there is no history', async () => {
    mockNav.router.canGoBack.mockImplementation(() => false)
    await openNewForm()

    expect(screen.getByText('Le fil, dessous')).toBeTruthy()
    expect(screen.getByLabelText(TEXT.newTitle)).toBeTruthy()
  })

  it('leaves the page before it in place when there is one (témoin)', async () => {
    await openNewForm()

    expect(screen.queryByText('Le fil, dessous')).toBeNull()
    expect(screen.getByLabelText(TEXT.newTitle)).toBeTruthy()
  })

  it('goes to the feed on « Annuler » when there is no history', async () => {
    mockNav.router.canGoBack.mockImplementation(() => false)
    await openNewForm()

    await fireEvent.press(screen.getByRole('button', { name: TEXT.cancel }))

    expect(destinations()).toEqual(['/'])
    expect(mockNav.router.back).not.toHaveBeenCalled()
  })
})
