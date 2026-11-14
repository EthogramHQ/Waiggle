// Tests de « Qui peut le voir ? » quand on est membre d'une ruche (R10, docs/scenarios/refonte.md,
// « Un projet réservé à une ruche », « Le choisir » ; F-Pub6) : les trois choix « Membres de
// Waiggle », « Une ruche » et « Privé » ; le choix de la ruche parmi les siennes ; la phrase du bas
// (« Seuls les membres de Famille verront ce projet. ») ; un envoi sans ruche refusé ; un membre sans
// ruche qui ne voit pas « Une ruche ».
//
// Ce que ces tests supposent de l'écran (plan R10, UI-E1, « Ce qui change au plan » 17, « API au
// contrat » `projects/form.ts` ; à corriger si le code en décide autrement, en le disant) :
// - la feuille de publication et de modification (`ProjectFormScreen`) porte le choix ; ses
//   ruches viennent de GET /v1/hives (`MyHives`, lu par `useMyHives`) ;
// - « Une ruche » est un `radio` de « Qui peut le voir ? », comme « Privé » ; la ruche se choisit
//   ensuite par `Choices` (un `radiogroup` nommé « Quelle ruche ? », un `radio` par ruche) ;
// - un envoi avec « Une ruche » sans ruche ne part pas : la phrase `hiveRequired` s'écrit sous le
//   choix de la ruche ;
// - ce qui part : `visibility: 'hive'` et `hiveId` ensemble (le contrat les refuse l'un sans l'autre) ;
// - la phrase compare l'audience **et** la ruche à l'enregistré : déplacer un projet vers une autre
//   ruche parle au futur (`audienceHive`) tant que ce n'est pas enregistré, au présent
//   (`audienceHiveEdit`) pour la ruche enregistrée.
// Les outils (faux serveur `api/client`, faux routeur) sont ceux de ProjectFormScreen.testkit.tsx.
import type { MyHives, Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { fr } from '../testing/text'
import { amis, amisId, famille, hiveId, myHives } from './Hives.testkit'
import {
  chooseCategories,
  fillIn,
  mockServer,
  NEW_ID,
  openEditForm,
  openNewForm,
  recipesProject,
  resetAll,
  shown,
  TEXT,
} from './ProjectFormScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le réseau : le faux serveur du testkit (voir son en-tête).
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
jest.mock('../media/pick', () => ({
  ...jest.requireActual('../media/pick'),
  pickVisuals: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockPick.pickVisuals(...(args as [never, never, never])),
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

// Le testkit oublie les focus passés à chaque test : des espions qui appellent les vrais outils.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

const HIVE = {
  choice: fr.t(($) => $.project.form.hive),
  which: fr.t(($) => $.project.form.hiveChoice),
  required: fr.t(($) => $.project.form.hiveRequired),
  future: (hive: string) => fr.t(($) => $.project.form.audienceHive, { hive }),
  present: (hive: string) => fr.t(($) => $.project.form.audienceHiveEdit, { hive }),
}

/** Les ruches de Léa, telles que GET /v1/hives les rend (Famille, Amis du jeudi). */
let mine: MyHives
beforeEach(() => {
  resetAll()
  mine = myHives
  mockServer.answer('GET', /^\/v1\/hives$/, () => ({ ok: true, data: mine }))
})

const createdBodies = () => mockServer.received('POST', /^\/v1\/projects$/).map((one) => one.body)
const PROJECT_PATH = new RegExp(`^/v1/projects/${recipesProject.id}$`)
const savedBodies = () => mockServer.received('PATCH', PROJECT_PATH).map((one) => one.body)

/** Le choix « Une ruche » de « Qui peut le voir ? » (nommé par son libellé, son aide suit). */
const hiveAudience = () => screen.findByRole('radio', { name: new RegExp(`^${HIVE.choice}`) })
/** Le groupe « Quelle ruche ? » et le choix d'une ruche dedans. */
const hiveGroup = () => screen.getByLabelText(HIVE.which)
const hiveRadio = (name: string) => within(hiveGroup()).getByRole('radio', { name })

/** Le plan de table de Léa, déjà enregistré « réservé à Famille ». */
const reservedToFamille: Project = {
  ...recipesProject,
  visibility: 'hive',
  hive: { id: hiveId, name: 'Famille' },
}

describe('« Qui peut le voir ? » for a member of a hive (R10)', () => {
  it('offers « Membres de Waiggle », « Une ruche » and « Privé »', async () => {
    await openNewForm()

    expect(await hiveAudience()).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: new RegExp(`^${fr.t(($) => $.project.form.members)}`) }),
    ).toBeTruthy()
    expect(screen.getByRole('radio', { name: /^Privé/ })).toBeTruthy()
  })

  it('hides "Une ruche" from a member without any hive', async () => {
    mine = { hives: [], invitations: [], createdCount: 0 }
    await openNewForm()

    // Témoin : « Privé » est là, et les ruches ont été lues.
    expect(screen.getByRole('radio', { name: /^Privé/ })).toBeTruthy()
    await waitFor(() =>
      expect(mockServer.received('GET', /^\/v1\/hives$/).length).toBeGreaterThan(0),
    )
    expect(screen.queryByRole('radio', { name: new RegExp(`^${HIVE.choice}`) })).toBeNull()
    expect(screen.queryByLabelText(HIVE.which)).toBeNull()
  })

  it('lets her choose among her hives once « Une ruche » is chosen', async () => {
    await openNewForm()
    expect(screen.queryByLabelText(HIVE.which)).toBeNull()

    await fireEvent.press(await hiveAudience())

    expect(hiveRadio(famille.name ?? '')).toBeTruthy()
    expect(hiveRadio(amis.name ?? '')).toBeTruthy()
  })

  it('says only the members of the chosen hive will see the project', async () => {
    await openNewForm()

    await fireEvent.press(await hiveAudience())
    await fireEvent.press(hiveRadio('Famille'))

    expect(shown(HIVE.future('Famille'))).toBe(true)
    expect(shown(TEXT.audienceMembers)).toBe(false)
  })

  it('publishes a project reserved to the chosen hive, the hive sent with its visibility', async () => {
    mockServer.answer('POST', /^\/v1\/projects$/, () => ({
      ok: true,
      data: { ...reservedToFamille, id: NEW_ID },
    }))
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(await hiveAudience())
    await fireEvent.press(hiveRadio('Famille'))
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(createdBodies()).toHaveLength(1))
    expect(createdBodies()[0]).toEqual(
      expect.objectContaining({ visibility: 'hive', hiveId: hiveId }),
    )
  })

  it('marks the hive choice invalid when sent without a hive', async () => {
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(await hiveAudience())
    // Témoin : avant l'envoi, aucune phrase d'erreur.
    expect(shown(HIVE.required)).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    expect(await screen.findByText(new RegExp(HIVE.required.replace(/\s+/g, '\\s+')))).toBeTruthy()
    expect(hiveGroup()).toBeTruthy()
    expect(createdBodies()).toHaveLength(0)
  })

  it('takes the error away once a hive is chosen, and then publishes', async () => {
    mockServer.answer('POST', /^\/v1\/projects$/, () => ({
      ok: true,
      data: { ...reservedToFamille, id: NEW_ID, hive: { id: amisId, name: 'Amis du jeudi' } },
    }))
    await openNewForm()
    await fillIn()
    await chooseCategories('science')
    await fireEvent.press(await hiveAudience())
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))
    await waitFor(() => expect(shown(HIVE.required)).toBe(true))

    await fireEvent.press(hiveRadio('Amis du jeudi'))
    expect(shown(HIVE.required)).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    await waitFor(() => expect(createdBodies()).toHaveLength(1))
    expect(createdBodies()[0]).toEqual(
      expect.objectContaining({ visibility: 'hive', hiveId: amisId }),
    )
  })
})

describe('editing a project reserved to a hive (R10)', () => {
  it('opens with « Une ruche » and its hive checked, and speaks in the present', async () => {
    await openEditForm(reservedToFamille)

    await waitFor(async () => expect(await hiveAudience()).toBeChecked())
    expect(hiveRadio('Famille')).toBeChecked()
    expect(shown(HIVE.present('Famille'))).toBe(true)
  })

  it('speaks in the future after moving a saved project to another hive', async () => {
    await openEditForm(reservedToFamille)
    await waitFor(async () => expect(await hiveAudience()).toBeChecked())

    await fireEvent.press(hiveRadio('Amis du jeudi'))

    expect(shown(HIVE.future('Amis du jeudi'))).toBe(true)
    expect(shown(HIVE.present('Amis du jeudi'))).toBe(false)
    expect(shown(HIVE.present('Famille'))).toBe(false)
    // Revenir à la ruche enregistrée : de nouveau le présent.
    await fireEvent.press(hiveRadio('Famille'))
    expect(shown(HIVE.present('Famille'))).toBe(true)
  })

  it('saves the move to another hive with its visibility', async () => {
    await openEditForm(reservedToFamille)
    await waitFor(async () => expect(await hiveAudience()).toBeChecked())

    await fireEvent.press(hiveRadio('Amis du jeudi'))
    await fireEvent.press(screen.getByRole('button', { name: TEXT.save }))

    await waitFor(() => expect(savedBodies()).toHaveLength(1))
    expect(savedBodies()[0]).toEqual(
      expect.objectContaining({ visibility: 'hive', hiveId: amisId }),
    )
  })
})
