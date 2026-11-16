// Tests du choix « Public » de « Qui peut le voir ? » (tranche R12, docs/scenarios/refonte.md,
// « Rendre un projet public », F-Pub6, planches R6-Modifier et R12-Qui-Peut-Voir) : l'ordre des
// choix (« Membres de Waiggle », « Une ruche », « Public », « Privé ») ; l'aide de « Public »
// (« Visible par tous, et trouvable sur Google », mot pour mot) ; la phrase du bas, qui dit que tout
// le monde le verra et que les moteurs de recherche peuvent le montrer encore quelque temps ;
// aucune fenêtre de confirmation en plus ; le code `web` envoyé à l'API (`public` veut déjà dire
// « Membres ») ; un membre suspendu, à qui la feuille reste fermée, ne peut pas le rendre public.
//
// Ce que ces tests supposent de l'écran (plan R12, UI-E et « Choix de la session » 1 ; à corriger
// si le code en décide autrement, en le disant) :
// - « Public » est un `radio` de « Qui peut le voir ? », nommé par son libellé (son aide suit) ;
// - l'audience de l'appli pour `web` est libre ; ce qui part au serveur est `visibility: 'web'` ;
// - la phrase du bas est `project.form.audienceWeb`, à la publication comme à la modification
//   (une seule phrase, rapport des textes de R12).
// Les outils (faux serveur `api/client`, faux routeur) sont ceux de ProjectFormScreen.testkit.tsx.
import type { Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { suspendedMe } from '../testing/fixtures'
import { containing, fr } from '../testing/text'
import { myHives } from './Hives.testkit'
import {
  chooseCategories,
  fillIn,
  mockServer,
  NEW_ID,
  openEditForm,
  openNewForm,
  openNewSheet,
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
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

const WEB = {
  choice: fr.t(($) => $.project.form.web),
  hint: fr.t(($) => $.project.form.webHint),
  sentence: fr.t(($) => $.project.form.audienceWeb),
  members: fr.t(($) => $.project.form.members),
  hive: fr.t(($) => $.project.form.hive),
  private: fr.t(($) => $.project.form.private),
}

/** Le nom d'un choix commence par son libellé ; son aide peut suivre. */
const startsWith = (label: string) => new RegExp(`^${label.replace(/\s+/g, '\\s+')}`)
const webChoice = () => screen.findByRole('radio', { name: startsWith(WEB.choice) })

/** Les choix de « Qui peut le voir ? », dans l'ordre de l'écran, ramenés à leur libellé. */
const audienceOrder = () => {
  const labels = [WEB.members, WEB.hive, WEB.choice, WEB.private]
  return screen
    .getAllByRole('radio')
    .map((radio) => String(radio.props.accessibilityLabel ?? ''))
    .map((name) => labels.find((label) => startsWith(label).test(name)))
    .filter((label) => label !== undefined)
}

const PROJECT_PATH = new RegExp(`^/v1/projects/${recipesProject.id}$`)
const createdBodies = () => mockServer.received('POST', /^\/v1\/projects$/).map((one) => one.body)
const savedBodies = () => mockServer.received('PATCH', PROJECT_PATH).map((one) => one.body)

/** « Décollage ! » déjà public : le plan de table de Léa, enregistré `web`. */
const publicProject: Project = { ...recipesProject, visibility: 'web', hive: null }

beforeEach(resetAll)

describe('« Public » in « Qui peut le voir ? » (R12)', () => {
  it('offers « Membres de Waiggle », « Public » and « Privé », in this order', async () => {
    await openNewForm()
    await webChoice()

    expect(audienceOrder()).toEqual([WEB.members, WEB.choice, WEB.private])
  })

  it('puts « Public » after « Une ruche » for a member of a hive', async () => {
    mockServer.answer('GET', /^\/v1\/hives$/, () => ({ ok: true, data: myHives }))
    await openNewForm()
    await screen.findByRole('radio', { name: startsWith(WEB.hive) })

    expect(audienceOrder()).toEqual([WEB.members, WEB.hive, WEB.choice, WEB.private])
  })

  it('says under « Public » « Visible par tous, et trouvable sur Google », word for word', async () => {
    await openNewForm()
    await webChoice()

    expect(WEB.hint).toBe('Visible par tous, et trouvable sur Google') // témoin du texte
    expect(shown(WEB.hint)).toBe(true)
  })

  it('says at the bottom that everyone will see it, and that search engines may keep it a while', async () => {
    await openNewForm()
    // Témoin : avant le choix, la phrase des membres.
    await waitFor(() => expect(shown(TEXT.audienceMembers)).toBe(true))
    expect(shown(WEB.sentence)).toBe(false)

    await fireEvent.press(await webChoice())

    expect(shown(WEB.sentence)).toBe(true)
    expect(shown(TEXT.audienceMembers)).toBe(false)
  })

  it('publishes a public project as `web`, without any confirmation window', async () => {
    mockServer.answer('POST', /^\/v1\/projects$/, () => ({
      ok: true,
      data: { ...publicProject, id: NEW_ID },
    }))
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(await webChoice())
    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    // Q4 : aucune fenêtre en plus, l'envoi part tout de suite.
    await waitFor(() => expect(createdBodies()).toHaveLength(1))
    expect(createdBodies()[0]).toEqual(expect.objectContaining({ visibility: 'web' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('opens a public project with « Public » checked, and the same sentence', async () => {
    mockServer.project = publicProject
    await openEditForm(publicProject)

    await waitFor(async () => expect(await webChoice()).toBeChecked())
    expect(shown(WEB.sentence)).toBe(true)
  })

  it('makes a public project visible to members only again, as `public`', async () => {
    mockServer.project = publicProject
    await openEditForm(publicProject)
    await waitFor(async () => expect(await webChoice()).toBeChecked())

    await fireEvent.press(screen.getByRole('radio', { name: startsWith(WEB.members) }))
    await fireEvent.press(screen.getByRole('button', { name: TEXT.save }))

    await waitFor(() => expect(savedBodies()).toHaveLength(1))
    expect(savedBodies()[0]).toEqual(expect.objectContaining({ visibility: 'public' }))
  })
})

describe('« Public » for a suspended member (Q6)', () => {
  it('never offers « Public » to a suspended member, who reads why the sheet is closed', async () => {
    mockServer.me = suspendedMe
    await openNewSheet()

    // Témoin : la raison de la suspension est là (la feuille ne s'ouvre pas, R9 J14).
    expect(await screen.findByText(containing(TEXT.suspended))).toBeTruthy()
    expect(screen.queryByRole('radio', { name: startsWith(WEB.choice) })).toBeNull()
  })
})
