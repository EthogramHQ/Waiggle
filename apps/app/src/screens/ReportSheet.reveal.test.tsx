// Tests de la feuille « Signaler » après la relecture de design de R9 :
// - un envoi refusé avant de partir (pas de motif, ou « Contenu illégal » sans précision) se voit :
//   le message « Choisis un motif », ou le champ de la précision, reçoit le focus **et** vient dans
//   la zone qui défile (`focusAndReveal`), au lieu de rester sous le pied collé de la feuille ;
// - un seul bouton « Fermer » par étape : quand le pied a déjà son « Fermer » (« Merci », la limite
//   du jour, « déjà signalé »), la croix de la tête n'est pas dessinée.
// Les données et les simulations reprennent celles de `ReportSheet.test.tsx`, en plus court.
import { REPORTS_PER_DAY, type ReportTargetPreview } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useBlock } from '../blocks/api'
import { getReportTarget, sendReport } from '../reports/api'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal } from '../ui/focus'
import { ReportSheet } from './ReportSheet'

const mockNav = {
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  },
  navigation: {
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../blocks/api', () => ({ useBlock: jest.fn() }))
jest.mock('../reports/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getReportTarget = jest.fn()
  return {
    getReportTarget,
    sendReport: jest.fn(),
    useReportTarget: (target: { kind: string; id: string } | null) =>
      useQuery({
        queryKey: ['report-target', target?.kind, target?.id],
        queryFn: () => getReportTarget(target),
        enabled: target !== null,
      }),
  }
})
jest.mock('expo-router', () => ({
  useRouter: () => mockNav.router,
  usePathname: () => '/report',
  useNavigation: () => mockNav.navigation,
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useSegments: () => [],
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))
// Le focus posé par la feuille, et ce qu'elle fait venir dans l'écran : on écoute `focusAndReveal`.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return { ...actual, focusAndReveal: jest.fn(actual.focusAndReveal) }
})

const projectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
const sam = { id: 'u-sam', name: 'Sam Petit', handle: 'sam', isBlocked: false, isAdmin: false }
/** Le commentaire de Sam : pas de partie, la feuille commence au motif. */
const samComment: ReportTargetPreview = {
  target: { kind: 'comment', id: 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d' },
  text: 'Envoie-moi le code de ta carte, je te débloque la version pro.',
  projectId,
  author: sam,
  head: { title: null, authorName: 'Sam Petit', image: null },
  parts: [],
  reportedByMe: false,
  remainingToday: REPORTS_PER_DAY,
}

const T = {
  title: fr.t(($) => $.report.comment),
  submit: fr.t(($) => $.report.submit),
  close: fr.t(($) => $.report.close),
  illegalDetails: fr.t(($) => $.report.illegalDetails),
  illegalRequired: fr.t(($) => $.report.illegalRequired),
  reasonRequired: fr.t(($) => $.report.reasonRequired),
  sentTitle: fr.t(($) => $.report.sentTitle),
  limitedLead: fr.t(($) => $.report.limitedLead, { max: REPORTS_PER_DAY }),
}

beforeEach(() => {
  mockSession({ user: { id: 'u-malik', name: 'Malik' } })
  jest.mocked(getReportTarget).mockReset().mockResolvedValue(samComment)
  jest
    .mocked(sendReport)
    .mockReset()
    .mockResolvedValue({ ok: true, data: { id: '0f1e2d3c-4b5a-4968-8776-655443322110' } })
  jest
    .mocked(useBlock)
    .mockReset()
    .mockReturnValue({ block: jest.fn() } as unknown as ReturnType<typeof useBlock>)
  jest.mocked(focusAndReveal).mockClear()
})

const openSheet = async (preview: ReportTargetPreview = samComment) => {
  jest.mocked(getReportTarget).mockResolvedValue(preview)
  await renderWithProviders(<ReportSheet kind={preview.target.kind} id={preview.target.id} />)
  await screen.findByRole('header', { name: T.title })
  await passTapGuard()
}
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }))
const choose = (label: string) =>
  fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${label}`) }))
/** Les noms de ce que la feuille a fait venir dans l'écran, dans l'ordre. */
const revealed = () => jest.mocked(focusAndReveal).mock.calls.map(([node]) => labelOf(node) ?? '')

describe('a report stopped before it leaves', () => {
  it('brings « Choisis un motif » into view, not only the focus', async () => {
    await openSheet()

    // Témoin : rien n'a été amené avant l'envoi.
    expect(revealed()).toEqual([])
    await press(T.submit)

    expect(await screen.findByText(containing(T.reasonRequired))).toBeTruthy()
    expect(revealed().at(-1)).toContain(T.reasonRequired)
    expect(sendReport).not.toHaveBeenCalled()
  })

  it('puts the focus in the precision of an illegal content and brings it into view', async () => {
    await openSheet()

    await choose('Contenu illégal')
    await passTapGuard()
    await press(T.submit)

    expect(await screen.findByText(containing(T.illegalRequired))).toBeTruthy()
    // Le champ lui-même (sa saisie, nommée par son libellé) : on y tape aussitôt.
    expect(revealed().at(-1)).toBe(T.illegalDetails)
    expect(sendReport).not.toHaveBeenCalled()
  })
})

describe('one « Fermer » per step', () => {
  it('has a single « Fermer » once the report is sent', async () => {
    await openSheet()

    await choose('Arnaque ou spam')
    await passTapGuard()
    await press(T.submit)

    expect(await screen.findByText(containing(T.sentTitle))).toBeTruthy()
    expect(screen.getAllByRole('button', { name: T.close })).toHaveLength(1)
  })

  it('has a single « Fermer » when the day’s limit is reached', async () => {
    await openSheet({ ...samComment, remainingToday: 0 })

    expect(await screen.findByText(containing(T.limitedLead))).toBeTruthy()
    expect(screen.getAllByRole('button', { name: T.close })).toHaveLength(1)
  })

  it('keeps the cross while the form is filled (its footer sends, it does not close)', async () => {
    await openSheet()

    // Témoin : à l'étape du motif, « Annuler » et « Envoyer » ; la tête garde de quoi fermer.
    expect(screen.getByRole('button', { name: T.submit })).toBeTruthy()
    expect(
      screen.queryAllByRole('button', { name: fr.t(($) => $.report.cancel) }).length +
        screen.queryAllByRole('button', { name: T.close }).length,
    ).toBeGreaterThan(0)
  })
})
