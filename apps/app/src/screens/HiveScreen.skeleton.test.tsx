// La page vide d'une ruche (R16, docs/scenarios/refonte.md, « La page ne bouge plus en arrivant ») :
// pendant que la session ou la page se lit, la colonne des membres a déjà autant de lignes vides
// que la ruche a de membres, si on le sait déjà (la liste des ruches, en cache) ; trois sinon.
import { screen, within } from '@testing-library/react-native'
import { myHivesQueryKey } from '../hives/api'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { ToastProvider } from '../ui/theme/toast'
import { HiveScreen } from './HiveScreen'
import { famille, hiveId, resetHiveMocks } from './Hives.testkit'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => true,
}))
// La ligne vide d'une liste et les colonnes, marquées pour être comptées (comme HiveScreen.test).
jest.mock('../ui/ListGroup', () => {
  const actual = jest.requireActual('../ui/ListGroup')
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    ...actual,
    ListRowSkeleton: (props: Record<string, unknown>) =>
      createElement(
        View,
        { testID: 'ListRowSkeleton' },
        createElement(actual.ListRowSkeleton, props),
      ),
  }
})
jest.mock('../ui/Columns', () => {
  const actual = jest.requireActual('../ui/Columns')
  const { createElement } = require('react')
  const { View } = require('react-native')
  return {
    ...actual,
    Columns: (props: Record<string, unknown>) =>
      createElement(actual.Columns, {
        ...props,
        side: createElement(View, { testID: 'columns-side' }, props.side),
      }),
  }
})

let restoreWindow: () => void
beforeEach(() => {
  resetHiveMocks(`/hives/${hiveId}`, { id: hiveId })
  restoreWindow = setDesktopWindow()
  // La session se lit encore : la garde montre la page vide de la ruche.
  mockSession(null, true)
})
afterEach(() => restoreWindow())

const page = () => (
  <ToastProvider>
    <HiveScreen id={hiveId} />
  </ToastProvider>
)
const emptyMemberRows = () =>
  within(screen.getByTestId('columns-side', { includeHiddenElements: true })).queryAllByTestId(
    'ListRowSkeleton',
    { includeHiddenElements: true },
  )

describe('the empty hive page, on a computer (R16)', () => {
  it('draws three empty member rows when nothing is known of the hive', async () => {
    await renderWithProviders(page())
    expect(emptyMemberRows()).toHaveLength(3)
  })

  it('draws as many empty member rows as the cached list of hives says, at most 12', async () => {
    const view = await renderWithProviders(page())
    for (const [memberCount, rows] of [
      [5, 5],
      [40, 12],
    ] as const) {
      view.queryClient.setQueryData(myHivesQueryKey, {
        hives: [{ ...famille, memberCount }],
        invitations: [],
        createdCount: 0,
      })
      await view.rerender(page())
      expect(emptyMemberRows()).toHaveLength(rows)
    }
  })
})
