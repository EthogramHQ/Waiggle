// Tests de l'onglet Ruches avant les ruches (refonte, tranche R3 ; les ruches viennent en R10) :
// la mascotte qui fait coucou, « Les ruches arrivent bientôt » et deux phrases. La relecture
// juridique (jur-J9) ne veut ni date, ni promesse, ni « Préviens-moi » : la page ne demande rien et
// n'envoie rien.
import { screen } from '@testing-library/react-native'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { HivesScreen } from './HivesScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien : les boutons et les
// champs cherchés sont ceux de la page.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('expo-router', () => ({
  usePathname: () => '/hives',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] }

/** Tous les éléments de la page qui reçoivent du texte tapé (un champ, quel qu'il soit). */
const fields = (node: Node | string): Node[] =>
  typeof node === 'string'
    ? []
    : [
        ...(node.type === 'TextInput' || typeof node.props.onChangeText === 'function'
          ? [node]
          : []),
        ...node.children.flatMap(fields),
      ]

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(globalThis.fetch).mockClear()
})

describe('HivesScreen', () => {
  it('says that hives are coming, with the waving bee and two sentences', async () => {
    await renderWithProviders(<HivesScreen />)

    expect(screen.getByText(containing(fr.t(($) => $.hives.soonTitle)))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.hives.soonBody1)))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.hives.soonBody2)))).toBeTruthy()
    expect(
      screen.getByLabelText(
        fr.t(($) => $.mascot.wave),
        { includeHiddenElements: true },
      ),
    ).toBeTruthy()
  })

  it('asks nothing and sends nothing', async () => {
    await renderWithProviders(<HivesScreen />)

    // Témoin : la page est bien dessinée.
    expect(screen.getByText(containing(fr.t(($) => $.hives.soonTitle)))).toBeTruthy()
    // Ni champ, ni bouton, ni case : rien à remplir ni à demander (pas de « Préviens-moi »).
    expect(fields(screen.root as unknown as Node)).toEqual([])
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryAllByRole('switch')).toEqual([])
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    // Et aucune requête (fetch échoue de toute façon en test : jest.setup.ts).
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
