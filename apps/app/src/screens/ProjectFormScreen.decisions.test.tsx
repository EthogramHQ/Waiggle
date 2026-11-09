// Tests des décisions de Louis du 9/11/2026 sur la feuille de publication, après les relectures de
// R6a (correcteur C7) : le membre suspendu lit dans la feuille la date de fin et le recours (jur-C1),
// la phrase d'audience ne parle au présent que de ce qui est enregistré (jur-C3), l'aperçu montre
// « Tester » seulement dessiné (design-C5), un envoi refusé faute de session propose « Me
// reconnecter », un 404 en retirant une photo dit qu'elle a déjà été retirée, et la règle du droit à
// l'image suit celles des photos (jur-S1). Les outils communs sont dans
// `ProjectFormScreen.testkit.tsx` ; les `jest.mock` sont ceux de `ProjectFormScreen.test.tsx`.
import { contactEmail } from '@ruche/brand'
import type { Project } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { suspendedMe } from '../testing/fixtures'
import { projectWithPhotos, recipesProject } from '../testing/projects'
import { setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { parisDateTime } from '../ui/parisTime'
import {
  chooseCategories,
  destinations,
  fillIn,
  type Host,
  hostsOf,
  mockServer,
  openEditForm,
  openNewForm,
  openNewSheet,
  resetAll,
  shown,
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
jest.mock('../media/pick', () => ({
  ...jest.requireActual('../media/pick'),
  pickVisuals: (...args: never[]) =>
    (
      require('./ProjectFormScreen.testkit') as typeof import('./ProjectFormScreen.testkit')
    ).mockPick.pickVisuals(...(args as [never, never, never])),
  appendImage: async (form: FormData, field: string, image: { uri: string }) => {
    form.append(field, image.uri)
  },
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

beforeEach(() => resetAll())

const DECISIONS = {
  formTitle: fr.t(($) => $.suspension.formTitle),
  details: fr.t(($) => $.suspension.details),
  contestLead: fr.t(($) => $.suspension.contestLead),
  audiencePrivate: fr.t(($) => $.project.form.audiencePrivate),
  unauthorized: fr.t(($) => $.errors.unauthorized),
  signInAgain: fr.t(($) => $.states.signIn),
  photoGone: fr.t(($) => $.project.form.photoGone),
  notFound: fr.t(($) => $.errors.notFound),
  photosRules: fr.t(($) => $.project.form.photosRules),
  photosConsent: fr.t(($) => $.project.form.photosConsent),
  test: fr.t(($) => $.explore.test),
  removePortrait: fr.t(($) => $.project.visuals.removePortrait),
}

/** La ligne forte du bandeau : la fin de la suspension, à l'heure de Paris. */
const endsLine = () => {
  const endsAt = suspendedMe.suspension?.endsAt
  if (!endsAt) throw new Error('la suspension de test a une fin')
  const end = parisDateTime(endsAt, 'fr')
  return fr.t(($) => $.suspension.headline, { date: end.date, time: end.time })
}

/** Ouvre la feuille d'un membre suspendu et attend la phrase de l'état. */
const openSuspended = async () => {
  mockServer.me = suspendedMe
  await openNewSheet()
  await screen.findByText(containing(TEXT.suspended))
}

/** Le membre suspendu lit dans la feuille quand la mesure finit, et comment la contester. */
const expectEndAndRecourse = async () => {
  // Un seul titre, celui de l'état, à la place de « Nouveau projet ».
  expect(screen.getByLabelText(DECISIONS.formTitle)).toBeTruthy()
  expect(screen.queryByText(TEXT.newTitle)).toBeNull()
  expect(screen.getAllByText(DECISIONS.formTitle)).toHaveLength(1)
  // La date de fin, dès l'ouverture (le bandeau replié) ; le recours sous « Détails ».
  expect(screen.getByText(endsLine())).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: DECISIONS.details }))
  expect(screen.getByText(DECISIONS.contestLead)).toBeTruthy()
  expect(screen.getByText(contactEmail)).toBeTruthy()
}

describe('ProjectFormScreen, a suspended member (jur-C1)', () => {
  it('tells a suspended member when it ends and how to contest, inside the sheet, on a phone', async () => {
    await openSuspended()
    await expectEndAndRecourse()
  })

  it('tells a suspended member when it ends and how to contest, inside the sheet, on a computer', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      await openSuspended()
      await expectEndAndRecourse()
    } finally {
      restoreWindow()
    }
  })
})

describe('ProjectFormScreen, the audience sentence when editing (jur-C3)', () => {
  const privateProject: Project = { ...recipesProject, visibility: 'private' }
  const members = () => fireEvent.press(screen.getByRole('radio', { name: /^Membres/ }))
  const privately = () => fireEvent.press(screen.getByRole('radio', { name: /^Privé/ }))

  it('speaks in the future for a private project switched to members, before saving', async () => {
    await openEditForm(privateProject)
    await members()

    expect(shown(TEXT.audienceMembers)).toBe(true)
    expect(shown(TEXT.audienceMembersEdit)).toBe(false)
  })

  it('speaks in the present for a private project left private', async () => {
    await openEditForm(privateProject)

    expect(shown(DECISIONS.audiencePrivate)).toBe(true)
    expect(shown(TEXT.audiencePrivateNew)).toBe(false)
  })

  it('speaks in the future for a members project switched to private, before saving', async () => {
    await openEditForm(recipesProject)
    await privately()

    expect(shown(TEXT.audiencePrivateNew)).toBe(true)
    expect(shown(DECISIONS.audiencePrivate)).toBe(false)
  })

  it('speaks in the present for a members project left to members', async () => {
    await openEditForm(recipesProject)

    expect(shown(TEXT.audienceMembersEdit)).toBe(true)
    expect(shown(TEXT.audienceMembers)).toBe(false)
  })
})

describe('ProjectFormScreen, « Tester » on the preview (design-C5)', () => {
  /** Les éléments cachés de l'aperçu qui portent ce texte. */
  const inPreview = (text: string) =>
    screen.queryAllByText(text, { includeHiddenElements: true }) as unknown as Host[]

  it('draws « Tester » on the preview once the link is valid, never as a link', async () => {
    const restoreWindow = setDesktopWindow()
    try {
      await openNewForm()
      await fillIn()
      // Témoin : sans lien, pas de « Tester ».
      expect(inPreview(DECISIONS.test)).toHaveLength(0)

      await fireEvent.changeText(screen.getByLabelText(TEXT.demoUrl), 'https://ciel-du-soir.fr')

      expect(inPreview(DECISIONS.test).length).toBeGreaterThan(0)
      // Ni lien, ni arrêt de Tab, nulle part dans la feuille (l'aperçu ne fait que montrer).
      const links = hostsOf(screen.root as unknown as Host).filter(
        (node) => node.props.accessibilityRole === 'link' || node.props.role === 'link',
      )
      expect(links).toHaveLength(0)
    } finally {
      restoreWindow()
    }
  })
})

describe('ProjectFormScreen, a publication refused for want of a session', () => {
  it('offers « Me reconnecter » next to « Connecte-toi pour continuer. »', async () => {
    mockServer.answer('POST', /^\/v1\/projects$/, async () => ({
      ok: false,
      error: 'unauthorized',
    }))
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    expect(await screen.findByText(containing(DECISIONS.unauthorized))).toBeTruthy()
    const link = screen.getByRole('link', { name: DECISIONS.signInAgain })
    await fireEvent.press(link)
    expect(destinations()).toEqual([expect.stringMatching(/^\/sign-in/)])
  })

  it('offers no sign-in link after a server error (témoin)', async () => {
    mockServer.answer('POST', /^\/v1\/projects$/, async () => ({ ok: false, error: 'internal' }))
    await openNewForm()
    await fillIn()
    await chooseCategories('science')

    await fireEvent.press(screen.getByRole('button', { name: TEXT.publish }))

    expect(await screen.findByText(containing(fr.t(($) => $.errors.internal)))).toBeTruthy()
    expect(screen.queryByRole('link', { name: DECISIONS.signInAgain })).toBeNull()
  })
})

describe('ProjectFormScreen, removing a photo already gone', () => {
  it('says the photo was already removed when the server no longer knows it', async () => {
    mockServer.answer('DELETE', /\/visuals\//, async () => ({ ok: false, error: 'notFound' }))
    await openEditForm(projectWithPhotos)

    await fireEvent.press(screen.getByRole('button', { name: 'Retirer la photo 2' }))

    expect(await screen.findByText(containing(DECISIONS.photoGone))).toBeTruthy()
    expect(shown(DECISIONS.notFound)).toBe(false)
  })

  it('says the vertical cover was already removed when the server no longer knows it', async () => {
    mockServer.answer('DELETE', /\/visuals\//, async () => ({ ok: false, error: 'notFound' }))
    await openEditForm(projectWithPhotos)

    await fireEvent.press(screen.getByRole('button', { name: DECISIONS.removePortrait }))

    await waitFor(() => expect(shown(DECISIONS.photoGone)).toBe(true))
    expect(shown(DECISIONS.notFound)).toBe(false)
  })
})

describe('ProjectFormScreen, image rights (jur-S1)', () => {
  it('says to publish a person only with their consent, under the photo rules', async () => {
    await openNewForm()

    const texts = hostsOf(screen.root as unknown as Host).flatMap((node) =>
      node.children.filter((child): child is string => typeof child === 'string'),
    )
    const rules = texts.findIndex((text) => text.includes(DECISIONS.photosRules))
    const consent = texts.findIndex((text) => text.includes(DECISIONS.photosConsent))
    expect(rules).toBeGreaterThan(-1)
    expect(consent).toBeGreaterThan(rules)
  })
})
