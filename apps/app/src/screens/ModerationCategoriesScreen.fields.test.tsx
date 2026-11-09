// Corrections de la relecture de R6b sur la page « Catégories » de la Modération : une catégorie
// sans nom ni icône dit ce qui manque sous chaque champ (des-C3, ui-C2) ; la règle du sujet est
// l'aide du champ « Nom en français » (jur-J6) ; une catégorie sans projet dit « Aucun projet pour
// l'instant » (ui-S1) ; les onglets portent un nom qui dit le choix, pas le titre de la page
// (ui-S3). Un fichier à part : celui de la page (`ModerationCategoriesScreen.test.tsx`) est le test
// d'origine de la tranche.
import { fireEvent, screen } from '@testing-library/react-native'
import { View } from 'react-native'
import { categoryList } from '../testing/categories'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { catalogueServer, installCatalogueServer, refusal } from './ModerationCatalogue.testkit'
import { ModerationCategoriesScreen } from './ModerationCategoriesScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue(null) },
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation/categories',
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useNavigation: () => ({ addListener: () => () => {} }),
  useLocalSearchParams: () => ({}),
}))

const t = fr.t.bind(fr)
const TAB_CATEGORIES = t(($) => $.moderation.categories.tabCategories)
const CREATE = t(($) => $.moderation.categories.create)
const CREATE_ACTION = t(($) => $.moderation.categories.createAction)
const NAME_FR = t(($) => $.moderation.categories.nameFr)
const NAME_EN = t(($) => $.moderation.categories.nameEn)
const FLOWER = t(($) => $.moderation.categories.iconName.flower)
const HINT = t(($) => $.moderation.categories.createHint)

beforeEach(() => {
  installCatalogueServer()
  mockSession({ user: { id: catalogueServer.me.id, name: catalogueServer.me.name } })
})

/** Ouvre la page, l'onglet « Catégories », puis « Nouvelle catégorie ». */
const openCreate = async () => {
  await renderWithProviders(<ModerationCategoriesScreen />)
  await fireEvent.press(await screen.findByRole('radio', { name: TAB_CATEGORIES }))
  await fireEvent.press(await screen.findByRole('button', { name: CREATE }))
  await screen.findByLabelText(NAME_FR)
}

describe('« Nouvelle catégorie », a missing answer', () => {
  it('says under each empty name, and under the grid, what is missing', async () => {
    await openCreate()
    expect(screen.queryByText(t(($) => $.moderation.categories.nameFrRequired))).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACTION }))

    expect(screen.getByText(t(($) => $.moderation.categories.nameFrRequired))).toBeTruthy()
    expect(screen.getByText(t(($) => $.moderation.categories.nameEnRequired))).toBeTruthy()
    expect(screen.getByText(t(($) => $.moderation.categories.iconRequired))).toBeTruthy()
    expect(catalogueServer.received('POST', /^\/v1\/moderation\/categories$/)).toHaveLength(0)
  })

  it('takes a phrase away as soon as its field is filled', async () => {
    await openCreate()
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACTION }))

    await fireEvent.changeText(screen.getByLabelText(NAME_FR), 'Jardinage')
    await fireEvent.changeText(screen.getByLabelText(NAME_EN), 'Gardening')
    await fireEvent.press(screen.getByLabelText(FLOWER))

    expect(screen.queryByText(t(($) => $.moderation.categories.nameFrRequired))).toBeNull()
    expect(screen.queryByText(t(($) => $.moderation.categories.nameEnRequired))).toBeNull()
    expect(screen.queryByText(t(($) => $.moderation.categories.iconRequired))).toBeNull()
  })

  it('adds no « required » phrase to a name the API refused as taken', async () => {
    catalogueServer.answer('POST', /^\/v1\/moderation\/categories$/, () =>
      refusal(409, 'category_name_taken'),
    )
    await openCreate()
    await fireEvent.changeText(screen.getByLabelText(NAME_FR), 'Jardinage')
    await fireEvent.changeText(screen.getByLabelText(NAME_EN), 'Gardening')
    await fireEvent.press(screen.getByLabelText(FLOWER))
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACTION }))

    expect(await screen.findByText(t(($) => $.errors.categoryNameTaken))).toBeTruthy()
    expect(screen.queryByText(t(($) => $.moderation.categories.nameFrRequired))).toBeNull()
    expect(screen.queryByText(t(($) => $.moderation.categories.iconRequired))).toBeNull()
  })

  it('gives the rule of the subject as the hint of the French name, not as a paragraph before it', async () => {
    await openCreate()
    // La règle du sujet est l'aide du champ (lue avec lui), pas un texte posé avant lui : elle
    // vient après le champ « Nom en français » et avant « Nom en anglais » dans l'ordre de lecture.
    const texts = JSON.stringify(screen.toJSON())
    expect(texts.indexOf(HINT)).toBeGreaterThan(texts.indexOf(NAME_FR))
    expect(texts.indexOf(HINT)).toBeLessThan(texts.indexOf(NAME_EN))
  })
})

describe('the categories tab', () => {
  it('says « Aucun projet pour l’instant » for a category without project, never « 0 projet »', async () => {
    catalogueServer.categories = categoryList('fr', { cooking: 0, animals: 1, other: 2 })
    await renderWithProviders(
      <>
        <View />
        <ModerationCategoriesScreen />
      </>,
    )
    await fireEvent.press(await screen.findByRole('radio', { name: TAB_CATEGORIES }))

    // Plusieurs catégories neuves : autant de lignes que de catégories sans projet.
    expect((await screen.findAllByText(t(($) => $.tools.noProjects))).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^0 projet/)).toBeNull()
  })

  it('names its tab group by the choice it makes, not by the title of the page', async () => {
    await renderWithProviders(<ModerationCategoriesScreen />)

    // Le groupe n'est pas « accessible » : on le retrouve par son nom (getByLabelText).
    const group = await screen.findByLabelText(t(($) => $.moderation.categories.tabsLabel))
    expect(group.props.accessibilityRole).toBe('radiogroup')
    // Le groupe n'a plus le nom de la page.
    expect(group.props.accessibilityLabel).not.toBe(t(($) => $.moderation.categories.title))
  })
})
