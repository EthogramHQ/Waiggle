// Tests de la page « Catégories » de la Modération (tranche R6b, /moderation/categories ; scénario
// docs/scenarios/refonte.md, « Ranger les « Autre » »). Un administrateur y voit, onglet
// « À ranger », les projets visibles des membres classés « Autre », du plus ancien au plus récent,
// et range chacun dans une catégorie (un seul choix, « Autre » exclue). Une carte rangée garde sa
// place et dit où. L'onglet « Catégories » liste les catégories avec leur nombre de projets, et
// « Nouvelle catégorie » (noms en français et en anglais, une icône choisie dans une grille) en crée
// une, placée juste avant « Autre ». « Changements récents », en bas, dit qui a fait quoi. Un
// administrateur ne range pas son propre projet (403 `own_project`). Pour tout autre visiteur, la
// page n'existe pas.
//
// L'écran attendu : `ModerationCategoriesScreen` (sans propriété), dans
// `src/screens/ModerationCategoriesScreen.tsx` ; ses cartes (`ui/UncategorizedCard`,
// `ui/CatalogueChangeRow`) et la grille d'icônes (`ui/IconGrid`) ont leurs propres tests. Le réseau
// est remplacé au plus bas (`fetch`, voir `ModerationCatalogue.testkit.tsx`).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { createRef } from 'react'
import { Platform, View } from 'react-native'
import { birdhouseProject, knitProject, recategorizeChange } from '../testing/catalogue'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import {
  cardOf,
  catalogueServer,
  heldReply,
  installCatalogueServer,
  layerOf,
  pressableIn,
  refusal,
  scrimOf,
  shownInOrder,
  spokenName,
} from './ModerationCatalogue.testkit'
import { ModerationCategoriesScreen } from './ModerationCategoriesScreen'
import { lendContains, lendPage, watchFocus } from './ProjectComments.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// La langue du téléphone en français : sur le web aussi, la page s'écrit en français.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
// `apiFetch` joint sur mobile le cookie gardé par Better Auth : ici, aucun.
jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue(null) },
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation/categories',
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useNavigation: () => ({ addListener: () => () => {} }),
  useLocalSearchParams: () => ({}),
}))

// --- Les textes ---

const t = fr.t.bind(fr)
const TITLE = t(($) => $.moderation.categories.title)
const TAB_UNCATEGORIZED = t(($) => $.moderation.categories.tabUncategorized)
const TAB_CATEGORIES = t(($) => $.moderation.categories.tabCategories)
const FILE = t(($) => $.moderation.categories.sort)
const FILE_ACTION = t(($) => $.moderation.categories.sortAction)
const CHOICE = t(($) => $.moderation.categories.sortChoice)
const CREATE = t(($) => $.moderation.categories.create)
const CREATE_TITLE = t(($) => $.moderation.categories.createTitle)
const CREATE_ACTION = t(($) => $.moderation.categories.createAction)
const NAME_FR = t(($) => $.moderation.categories.nameFr)
const NAME_EN = t(($) => $.moderation.categories.nameEn)
const CANCEL = t(($) => $.moderation.categories.cancel)
const CLOSE = t(($) => $.common.close)
const ABANDON = t(($) => $.project.form.abandonEdit)
const KEEP_EDITING = t(($) => $.project.form.keepEditing)
const FLOWER = t(($) => $.moderation.categories.iconName.flower)
const NOT_FOUND_WAY_OUT = 'Retour à l’accueil'
const sortTitle = (title: string) => t(($) => $.moderation.categories.sortTitle, { title })
const filedInto = (category: string) => t(($) => $.moderation.categories.sorted, { category })

const BIRDHOUSE = birdhouseProject.title
const KNIT = knitProject.title

// --- Aides ---

const probe = createRef<View>()

/** Ouvre la page, en attendant les projets à ranger (le témoin de chaque test). */
const openCategories = async () => {
  await renderWithProviders(
    <>
      <View ref={probe} />
      <ModerationCategoriesScreen />
    </>,
  )
  await screen.findByText(containing(BIRDHOUSE))
}

/** La carte d'un projet à ranger, par son titre (elle porte « Ranger… » ou « Rangé dans… »). */
const card = (title: string) => cardOf(title, /^(Ranger dans une catégorie|Rangé dans .+)$/)

/** La feuille ouverte, retrouvée par son titre (elle en porte le nom). */
const sheet = (title: string) => within(screen.getByLabelText(title))

/** Ouvre « Ranger dans une catégorie » sur la carte de la cabane à oiseaux. */
const openFiling = async () => {
  await openCategories()
  await fireEvent.press(card(BIRDHOUSE).getByRole('button', { name: FILE }))
  return sheet(sortTitle(BIRDHOUSE))
}

const filings = () => catalogueServer.received('POST', /^\/v1\/moderation\/projects\//)

/** Ouvre l'onglet « Catégories » et la feuille « Nouvelle catégorie ». */
const openCreate = async () => {
  await openCategories()
  await fireEvent.press(screen.getByRole('radio', { name: TAB_CATEGORIES }))
  await fireEvent.press(await screen.findByRole('button', { name: CREATE }))
  await screen.findByLabelText(NAME_FR)
}

const fillCreate = async () => {
  await fireEvent.changeText(screen.getByLabelText(NAME_FR), 'Jardinage')
  await fireEvent.changeText(screen.getByLabelText(NAME_EN), 'Gardening')
  await fireEvent.press(screen.getByLabelText(FLOWER))
}

const createOpen = () => screen.queryByLabelText(NAME_FR) !== null
const creations = () => catalogueServer.received('POST', /^\/v1\/moderation\/categories$/)

const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

beforeEach(() => {
  installCatalogueServer()
  mockSession({ user: { id: catalogueServer.me.id, name: catalogueServer.me.name } })
  mockPush.mockReset()
  mockNavigate.mockReset()
})

describe('who sees the categories page', () => {
  it('shows an administrator the projects to file, oldest first', async () => {
    await openCategories()

    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy()
    expect(screen.getByRole('radio', { name: TAB_UNCATEGORIZED, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: TAB_CATEGORIES, checked: false })).toBeTruthy()
    const titles = new RegExp(
      `^(${[BIRDHOUSE, KNIT].map((one) => containing(one).source).join('|')})$`,
    )
    expect(shownInOrder(titles)).toEqual([BIRDHOUSE, KNIT])
    expect(card(BIRDHOUSE).getByText(containing(birdhouseProject.pitch))).toBeTruthy()
  })

  it('opens a project from its card', async () => {
    await openCategories()

    await fireEvent.press(pressableIn(card(BIRDHOUSE), containing(BIRDHOUSE)))

    const opened = [...mockPush.mock.calls, ...mockNavigate.mock.calls].map(([href]) =>
      pathOf(href),
    )
    expect(opened).toEqual([`/projects/${birdhouseProject.id}`])
  })

  it('says « not found » to a member who is not an administrator, and shows none of the projects', async () => {
    catalogueServer.me = leaMe
    mockSession({ user: { id: leaMe.id, name: leaMe.name } })
    await renderWithProviders(<ModerationCategoriesScreen />)

    expect(await screen.findByRole('button', { name: NOT_FOUND_WAY_OUT })).toBeTruthy()
    expect(screen.queryByText(containing(BIRDHOUSE))).toBeNull()
    expect(screen.queryByRole('radio', { name: TAB_UNCATEGORIZED })).toBeNull()
  })

  it('says « not found » when the API does not know the page (a revoked administrator)', async () => {
    catalogueServer.answer('GET', /^\/v1\/moderation\//, () => refusal(404, 'not_found'))
    await renderWithProviders(<ModerationCategoriesScreen />)

    expect(await screen.findByRole('button', { name: NOT_FOUND_WAY_OUT })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('says when there is no project to file', async () => {
    catalogueServer.uncategorized = []
    await renderWithProviders(<ModerationCategoriesScreen />)

    expect(
      await screen.findByText(containing(t(($) => $.moderation.categories.emptyUncategorized))),
    ).toBeTruthy()
  })
})

describe('filing a project', () => {
  it('files a project through a single-choice radiogroup of categories', async () => {
    const filing = await openFiling()

    // Un groupe à un seul choix, nommé « La catégorie », sans « Autre ».
    expect(filing.getByLabelText(CHOICE).props.accessibilityRole).toBe('radiogroup')
    expect(filing.getByLabelText('Animaux')).toBeTruthy() // témoin
    expect(filing.queryByLabelText('Autre')).toBeNull()

    await fireEvent.press(filing.getByLabelText('Cuisine'))
    await fireEvent.press(filing.getByLabelText('Animaux'))
    expect(filing.getByLabelText('Animaux')).toBeChecked()
    expect(filing.getByLabelText('Cuisine')).not.toBeChecked()

    await fireEvent.press(filing.getByRole('button', { name: FILE_ACTION }))

    await waitFor(() => expect(card(BIRDHOUSE).getByText(filedInto('Animaux'))).toBeTruthy())
    expect(filings().map((one) => [one.path, one.body])).toEqual([
      [`/v1/moderation/projects/${birdhouseProject.id}/category`, { category: 'animals' }],
    ])
    // La carte rangée garde sa place, sans son bouton ; l'autre carte garde le sien.
    expect(card(BIRDHOUSE).queryByRole('button', { name: FILE })).toBeNull()
    expect(card(KNIT).getByRole('button', { name: FILE })).toBeTruthy()
    const titles = new RegExp(
      `^(${[BIRDHOUSE, KNIT].map((one) => containing(one).source).join('|')})$`,
    )
    expect(shownInOrder(titles)).toEqual([BIRDHOUSE, KNIT])
  })

  it('files a project once when « Ranger » is tapped twice 700 ms apart', async () => {
    const held = heldReply()
    catalogueServer.answer('POST', /\/category$/, () => held.reply)
    const filing = await openFiling()
    await fireEvent.press(filing.getByLabelText('Animaux'))
    const action = filing.getByRole('button', { name: FILE_ACTION })

    await fireEvent.press(action)
    await pause(700)
    await fireEvent.press(action)

    expect(filings()).toHaveLength(1)
    await act(async () => held.release())
  })

  it('reads a 400 unknown_category in the sheet', async () => {
    catalogueServer.answer('POST', /\/category$/, () => refusal(400, 'unknown_category'))
    const filing = await openFiling()
    await fireEvent.press(filing.getByLabelText('Animaux'))

    await fireEvent.press(filing.getByRole('button', { name: FILE_ACTION }))

    expect(await screen.findByText(containing(t(($) => $.errors.unknownCategory)))).toBeTruthy()
    expect(screen.getByLabelText(sortTitle(BIRDHOUSE))).toBeTruthy()
    expect(screen.queryByText(filedInto('Animaux'))).toBeNull()
  })

  it('reads a 403 own_project: an administrator does not file her own project', async () => {
    catalogueServer.answer('POST', /\/category$/, () => refusal(403, 'own_project'))
    const filing = await openFiling()
    await fireEvent.press(filing.getByLabelText('Animaux'))

    await fireEvent.press(filing.getByRole('button', { name: FILE_ACTION }))

    expect(await screen.findByText(containing(t(($) => $.errors.ownProject)))).toBeTruthy()
    expect(screen.queryByText(filedInto('Animaux'))).toBeNull()
  })

  describe('on the web, with the keyboard', () => {
    let returnPage: () => void = () => {}
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web')
      returnPage = lendPage()
    })
    afterEach(() => returnPage())

    it('gives focus back to « Ranger dans une catégorie » when the sheet is closed', async () => {
      const filing = await openFiling()
      const restoreContains = lendContains(probe)
      const focus = watchFocus(probe)
      try {
        await fireEvent.press(filing.getByRole('button', { name: CANCEL }))

        await waitFor(() => expect(screen.queryByLabelText(sortTitle(BIRDHOUSE))).toBeNull())
        await waitFor(() => expect(spokenName(focus.last() as never)).toBe(FILE))
      } finally {
        focus.restore()
        restoreContains()
      }
    })
  })
})

describe('the categories tab', () => {
  it('lists the categories with their number of projects, and offers « Nouvelle catégorie »', async () => {
    await openCategories()

    await fireEvent.press(screen.getByRole('radio', { name: TAB_CATEGORIES }))

    expect(await screen.findByText('Cuisine')).toBeTruthy()
    expect(screen.getByText(t(($) => $.moderation.categories.projects, { count: 2 }))).toBeTruthy()
    expect(screen.getByText(t(($) => $.moderation.categories.projects, { count: 1 }))).toBeTruthy()
    expect(screen.getByRole('button', { name: CREATE })).toBeTruthy()
  })

  it('creates « Jardinage » with an icon chosen in a grid, and shows it just before « Autre »', async () => {
    await openCreate()
    expect(screen.getByLabelText(CREATE_TITLE)).toBeTruthy()
    // L'aide de la relecture juridique (jur-T15) : une catégorie décrit un sujet, jamais une personne.
    expect(screen.getByText(containing(t(($) => $.moderation.categories.createHint)))).toBeTruthy()

    await fillCreate()
    expect(screen.getByLabelText(FLOWER)).toBeChecked()
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACTION }))

    await waitFor(() => expect(createOpen()).toBe(false))
    expect(creations().map((one) => one.body)).toEqual([
      { nameFr: 'Jardinage', nameEn: 'Gardening', icon: 'flower' },
    ])
    await waitFor(() =>
      expect(shownInOrder(/^(Sciences et espace|Jardinage|Autre)$/)).toEqual([
        'Sciences et espace',
        'Jardinage',
        'Autre',
      ]),
    )
  })

  it('reads a 409 category_name_taken, and keeps what was typed', async () => {
    catalogueServer.answer('POST', /^\/v1\/moderation\/categories$/, () =>
      refusal(409, 'category_name_taken'),
    )
    await openCreate()
    await fillCreate()

    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACTION }))

    expect(await screen.findByText(containing(t(($) => $.errors.categoryNameTaken)))).toBeTruthy()
    expect(createOpen()).toBe(true)
    expect(screen.getByLabelText(NAME_FR)).toHaveDisplayValue('Jardinage')
  })

  it('asks before dropping a modified form, and refuses to close while saving', async () => {
    await openCreate()
    await fireEvent.changeText(screen.getByLabelText(NAME_FR), 'Jardin')

    for (const close of [
      () => fireEvent.press(screen.getByRole('button', { name: CANCEL })),
      () => act(async () => layerOf(screen.getByLabelText(NAME_FR)).props.onRequestClose()),
    ]) {
      await close()
      expect(screen.getAllByText(ABANDON).length).toBeGreaterThan(0)
      await passTapGuard()
      await fireEvent.press(screen.getByRole('button', { name: KEEP_EDITING }))
      expect(screen.getByLabelText(NAME_FR)).toHaveDisplayValue('Jardin')
    }

    const held = heldReply()
    catalogueServer.answer('POST', /^\/v1\/moderation\/categories$/, () => held.reply)
    await fillCreate()
    await fireEvent.press(screen.getByRole('button', { name: CREATE_ACTION }))
    await act(async () => layerOf(screen.getByLabelText(NAME_FR)).props.onRequestClose())
    await fireEvent.press(screen.getByRole('button', { name: CANCEL }))
    await fireEvent.press(
      within(layerOf(screen.getByLabelText(NAME_FR))).getByRole('button', { name: CLOSE }),
    )
    await fireEvent.press(scrimOf(layerOf(screen.getByLabelText(NAME_FR))))

    expect(createOpen()).toBe(true)
    expect(screen.queryByText(ABANDON)).toBeNull()
    expect(creations()).toHaveLength(1)
    await act(async () =>
      held.release({
        status: 201,
        body: { code: 'jardinage', name: 'Jardinage', icon: 'flower', projectCount: 0 },
      }),
    )
  })
})

describe('the recent changes', () => {
  it('shows who did what at the bottom of the page', async () => {
    catalogueServer.changes = [recategorizeChange]
    await openCategories()

    expect(
      await screen.findByRole('header', { name: t(($) => $.moderation.catalogue.changes) }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        containing(
          t(($) => $.moderation.catalogue.change.project_recategorize, {
            admin: 'Nora Benali',
            project: 'Le carnet des hérissons',
            category: 'Animaux',
          }),
        ),
      ),
    ).toBeTruthy()
  })
})
