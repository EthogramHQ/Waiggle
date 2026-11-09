// La feuille de publication passe la visibilité du projet à « Catégorie et outils » (tranche R6b,
// jur-T3) : un « Autre » ajouté à un projet privé est dit montré à personne et pas relu ; à un projet
// que les membres voient, relu par les administrateurs. Le catalogue du faux serveur est vide : tout
// nom tapé y est un « Autre ». Les outils communs sont dans `ProjectFormScreen.testkit.tsx` ; les
// `jest.mock` sont ceux de `ProjectFormScreen.test.tsx` (un `jest.mock` ne se partage pas).
import { fireEvent, screen } from '@testing-library/react-native'
import { containing, fr } from '../testing/text'
import {
  categoryRow,
  choosePrivate,
  openNewForm,
  resetAll,
  TEXT,
} from './ProjectFormScreen.testkit'

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

const HINT = {
  members: fr.t(($) => $.project.form.otherToolsHint),
  private: fr.t(($) => $.project.form.otherToolsHintPrivate),
}

/** Ouvre « Catégorie et outils » et y ajoute « Teachable Machine » comme autre outil. */
const addOtherTool = async () => {
  await fireEvent.press(categoryRow())
  await screen.findByLabelText(TEXT.categoriesAndTools)
  await fireEvent.changeText(
    screen.getByRole('combobox', { name: fr.t(($) => $.project.form.tools) }),
    'Teachable Machine',
  )
  await fireEvent.press(
    await screen.findByRole('option', {
      name: fr.t(($) => $.project.form.addOtherTool, { name: 'Teachable Machine' }),
    }),
  )
}

beforeEach(() => resetAll())

describe('ProjectFormScreen, other tools and the visibility of the project', () => {
  it('says an other tool of a project the members see is reviewed by the administrators', async () => {
    await openNewForm()
    await addOtherTool()

    expect(screen.getByText(containing(HINT.members))).toBeTruthy()
    expect(screen.queryByText(containing(HINT.private))).toBeNull()
  })

  it('says an other tool of a private project is neither shown nor reviewed', async () => {
    await openNewForm()
    await choosePrivate()
    await addOtherTool()

    expect(screen.getByText(containing(HINT.private))).toBeTruthy()
    expect(screen.queryByText(containing(HINT.members))).toBeNull()
  })
})
