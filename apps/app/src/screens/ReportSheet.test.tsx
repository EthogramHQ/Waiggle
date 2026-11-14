// Tests de la feuille « Signaler » (R9, scénario « Signaler, dans une feuille », planches
// `R9-Signaler`, `R9-Signaler-Partie`, `R9-Signaler-Danger`, `R9-Signaler-Envoye`,
// `R9-Signaler-Etats`). Elle remplace la page « Signaler » de 7a : Malik signale « Météo », le projet
// d'Inès. La feuille rappelle ce qui est signalé, demande d'abord « Quelle partie ? » (« Tout le
// projet » choisi d'avance), puis « Qu'est-ce qui ne va pas ? » (huit motifs, une précision), propose
// « Bloquer aussi » avant l'envoi, puis remercie. Les comportements de la page de 7a qui valent
// encore sont repris ici (motifs, précision, refus de l'API, blocage, fil des testeurs).
//
// L'interface attendue :
// - `screens/ReportSheet.tsx` : `ReportSheet({ kind, id }: { kind: string; id: string })`, les
//   paramètres bruts de l'adresse `/report?kind=…&id=…` (app/report.tsx), comme la page de 7a ;
// - `reports/api.ts` (remplacé ici) : `useReportTarget(target | null)`, `getReportTarget(target)` qui
//   rend un `ReportTargetPreview` (avec `head`, `parts`, `reportedByMe`, `remainingToday`) ou lève
//   une `ApiError`, et `sendReport(report: CreateReport)` qui rend un `ApiResult` ;
// - `blocks/api.ts` (remplacé ici) : `useBlock().block(memberId)`, qui rend un `ApiResult` ;
// - `reports/parts.ts` (vrai) : les choix de « Quelle partie ? » ;
// - la fenêtre de blocage (`blocks/BlockDialog`, vraie) : « Bloquer » et « Annuler ».
import { contactEmail } from '@ruche/brand'
import {
  REPORTS_PER_DAY,
  type ReportPartField,
  type ReportTarget,
  type ReportTargetPreview,
} from '@ruche/contracts'
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { useBlock } from '../blocks/api'
import { getReportTarget, sendReport } from '../reports/api'
import { labelOf } from '../testing/arrivedFocus'
import { passTapGuard } from '../testing/dialog'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ReportSheet } from './ReportSheet'

// --- La navigation ---

type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

/** Le faux routeur et le faux `useNavigation()` (ses écouteurs `beforeRemove`). */
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
  listeners: new Set<(event: BeforeRemove) => void>(),
  navigation: {
    addListener: jest.fn((_type: string, listener: (event: BeforeRemove) => void) => {
      mockNav.listeners.add(listener)
      return () => mockNav.listeners.delete(listener)
    }),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  params: {} as Record<string, string>,
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../blocks/api', () => ({ useBlock: jest.fn() }))
// La lecture de la cible passe par un vrai React Query, autour d'une fausse lecture ; l'envoi est
// une fausse fonction dont le test choisit la réponse.
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
  // L'adresse de la feuille : elle ne s'ouvre que sur sa propre adresse (`useRouteSheet`).
  usePathname: () => '/report',
  useNavigation: () => mockNav.navigation,
  useLocalSearchParams: () => mockNav.params,
  useGlobalSearchParams: () => mockNav.params,
  useSegments: () => [],
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))
// Le focus posé par la feuille passe par les outils de `ui/focus` : on les écoute.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

// --- Les données : « Météo », le projet d'Inès ; le commentaire de Sam ; un message du coin ---

const projectId = '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b'
const commentId = 'c0d1e2f3-0415-4a26-8b37-48596a7b8c9d'
const messageId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'
const photo1 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const photo2 = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const thumbOf = (id: string) => ({
  url: `https://media.example.com/${id}.webp`,
  thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
})

type PreviewPart = ReportTargetPreview['parts'][number]
const textPart = (field: ReportPartField): PreviewPart => ({
  field,
  mediaId: null,
  position: null,
  thumb: null,
  reportedByMe: false,
})
const mediaPart = (field: ReportPartField, mediaId: string, position: number): PreviewPart => ({
  field,
  mediaId,
  position,
  thumb: thumbOf(mediaId),
  reportedByMe: false,
})

const ines = {
  id: 'u-ines',
  name: 'Inès Haddad',
  handle: 'ines_haddad',
  isBlocked: false,
  isAdmin: false,
}
const sam = { id: 'u-sam', name: 'Sam Petit', handle: 'sam', isBlocked: false, isAdmin: false }

const projectTarget: ReportTarget = { kind: 'project', id: projectId }
/** Ce que rend GET /v1/reports/target pour « Météo » (ReportTargetPreview). */
const meteo: ReportTargetPreview = {
  target: projectTarget,
  text: 'Météo · La pluie heure par heure',
  projectId,
  author: ines,
  head: { title: 'Météo', authorName: 'Inès Haddad', image: thumbOf(photo1) },
  parts: [
    textPart('title'),
    textPart('pitch'),
    textPart('description'),
    textPart('category'),
    textPart('tools'),
    textPart('demoUrl'),
    mediaPart('cover', photo1, 1),
    mediaPart('photo', photo1, 1),
    mediaPart('photo', photo2, 2),
    textPart('prompt'),
  ],
  reportedByMe: false,
  remainingToday: REPORTS_PER_DAY,
}

const commentTarget: ReportTarget = { kind: 'comment', id: commentId }
const commentText = 'Envoie-moi le code de ta carte, je te débloque la version pro.'
/** Le commentaire de Sam : pas de partie, la feuille commence au motif. */
const samComment: ReportTargetPreview = {
  target: commentTarget,
  text: commentText,
  projectId,
  author: sam,
  head: { title: null, authorName: 'Sam Petit', image: null },
  parts: [],
  reportedByMe: false,
  remainingToday: REPORTS_PER_DAY,
}

// --- Les textes ---

const T = {
  titleProject: fr.t(($) => $.report.project),
  titleComment: fr.t(($) => $.report.comment),
  titleMember: fr.t(($) => $.report.member),
  partQuestion: fr.t(($) => $.report.partQuestion),
  reasonQuestion: fr.t(($) => $.report.reasonLabel),
  continue: fr.t(($) => $.report.continue),
  stepBack: fr.t(($) => $.report.stepBack),
  cancel: fr.t(($) => $.report.cancel),
  close: fr.t(($) => $.report.close),
  submit: fr.t(($) => $.report.submit),
  details: fr.t(($) => $.report.details),
  detailsHint: fr.t(($) => $.report.detailsHint),
  illegalDetails: fr.t(($) => $.report.illegalDetails),
  illegalRequired: fr.t(($) => $.report.illegalRequired),
  reasonRequired: fr.t(($) => $.report.reasonRequired),
  danger: fr.t(($) => $.report.danger),
  anonymity: fr.t(($) => $.report.anonymity),
  goodFaith: fr.t(($) => $.report.goodFaith),
  sentTitle: fr.t(($) => $.report.sentTitle),
  sentBody: fr.t(($) => $.report.sentBody),
  gone: fr.t(($) => $.report.gone),
  alreadyPart: fr.t(($) => $.report.alreadyReportedPart),
  alreadyWhole: fr.t(($) => $.report.alreadyReportedWhole),
  ownProject: fr.t(($) => $.report.own.project),
  ownEdit: fr.t(($) => $.report.own.edit),
  limitedLead: fr.t(($) => $.report.limitedLead, { max: REPORTS_PER_DAY }),
  alsoBlock: fr.t(($) => $.report.alsoBlockNamed, { name: ines.name, handle: ines.handle }),
  alsoBlocked: fr.t(($) => $.report.alsoBlocked, { name: ines.name }),
  blockFailed: fr.t(($) => $.report.blockFailed, { name: ines.name }),
  discardTitle: fr.t(($) => $.report.discard.title),
  discardKeep: fr.t(($) => $.report.discard.keep),
  discardConfirm: fr.t(($) => $.report.discard.confirm),
  blockConfirm: fr.t(($) => $.block.confirm),
  blockCancel: fr.t(($) => $.block.cancel),
  alsoReport: fr.t(($) => $.block.alsoReport),
  photoExample: fr.t(($) => $.report.detailsExample.photo),
  otherExample: fr.t(($) => $.report.detailsExample.other),
}

/** Les huit motifs, dans l'ordre du contrat (ReportReason). */
const reasonLabels = [
  'Contenu illégal',
  'Harcèlement ou haine',
  'Contenu sexuel ou violent',
  'Arnaque ou spam',
  'Usurpation d’identité',
  'Une photo ou une information sur moi sans mon accord',
  'Lien, démo ou prompt dangereux',
  'Autre chose',
]

// --- Les aides ---

const mockBlock = jest.fn()

beforeEach(() => {
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockNav.router.canGoBack.mockImplementation(() => true)
  mockNav.listeners.clear()
  mockNav.params = {}
  mockSession({ user: { id: 'u-malik', name: 'Malik' } })
  jest.mocked(getReportTarget).mockReset().mockResolvedValue(meteo)
  jest
    .mocked(sendReport)
    .mockReset()
    .mockResolvedValue({ ok: true, data: { id: '0f1e2d3c-4b5a-4968-8776-655443322110' } })
  mockBlock.mockReset().mockResolvedValue({ ok: true, data: null })
  jest
    .mocked(useBlock)
    .mockReset()
    .mockReturnValue({ block: mockBlock } as unknown as ReturnType<typeof useBlock>)
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})

/** Ouvre la feuille sur cette cible, attend son titre, puis la fin de la garde des tapes. */
const openSheet = async (
  preview: ReportTargetPreview = meteo,
  title: string = preview.target.kind === 'comment' ? T.titleComment : T.titleProject,
) => {
  jest.mocked(getReportTarget).mockResolvedValue(preview)
  const view = await renderWithProviders(
    <ReportSheet kind={preview.target.kind} id={preview.target.id} />,
  )
  await screen.findByRole('header', { name: title })
  await passTapGuard()
  return view
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const press = (name: string | RegExp) => fireEvent.press(button(name))
/** Un choix d'une liste (partie ou motif) ; son nom commence par son libellé. */
const radio = (label: string) => screen.getByRole('radio', { name: new RegExp(`^${label}`) })
const choose = (label: string) => fireEvent.press(radio(label))
const isChecked = (label: string) => {
  const found = radio(label)
  return Boolean(found.props['aria-checked'] ?? found.props.accessibilityState?.checked)
}
const radioLabels = () =>
  screen.getAllByRole('radio').map((one) => String(one.props.accessibilityLabel ?? ''))
const detailsField = () => screen.getByLabelText(containing(T.details))
/** Vrai si ce texte est à l'écran, blancs de la typographie française compris. */
const shown = (text: string) => screen.queryAllByText(containing(text)).length > 0

/** De « Quelle partie ? » au motif. */
const toReason = async (part?: string) => {
  if (part) await choose(part)
  await press(T.continue)
  await screen.findByText(containing(T.reasonQuestion))
}
/** Choisit un motif et envoie (sur la feuille de « Météo », depuis la première étape). */
const reportWith = async (reason: string, part?: string) => {
  await toReason(part)
  await choose(reason)
  await passTapGuard()
  await press(T.submit)
}

/** Toutes les fois où la feuille a demandé à partir (retour, remplacement, autre page). */
const navigations = () =>
  (['push', 'replace', 'navigate', 'back', 'dismiss', 'dismissTo'] as const).reduce(
    (count, name) => count + mockNav.router[name].mock.calls.length,
    0,
  )

/** Rejoue un `beforeRemove` (le Retour du navigateur, le geste de retour) ; rend l'événement. */
const navigatorRemoves = async (): Promise<BeforeRemove> => {
  const event: BeforeRemove = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }
  await act(async () => {
    for (const listener of mockNav.listeners) listener(event)
  })
  return event
}
const asking = () => screen.queryByRole('header', { name: T.discardTitle }) !== null

/** Le texte des vues qui ont reçu le focus par les outils de `ui/focus`, dans l'ordre. */
const focused = (): string[] =>
  [focusWithoutScroll, focusAndReveal, moveReaderTo]
    .flatMap((fn) => {
      const { calls, invocationCallOrder } = jest.mocked(fn).mock
      return calls.map(([node], index) => ({ node, order: invocationCallOrder[index] ?? 0 }))
    })
    .sort((a, b) => a.order - b.order)
    .map(({ node }) => labelOf(node) ?? '')

/** Une réponse que le test donne quand il veut (un envoi en cours). */
const deferred = <V,>() => {
  let resolve: (value: V) => void = () => {}
  const promise = new Promise<V>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
type Sent = Awaited<ReturnType<typeof sendReport>>
const SENT: Sent = { ok: true, data: { id: '0f1e2d3c-4b5a-4968-8776-655443322110' } }

// --- Ce qui est signalé ---

describe('what is reported', () => {
  it('recalls the title and the author of the project, as the API gives them', async () => {
    await openSheet()

    expect(shown('Météo')).toBe(true)
    expect(shown(fr.t(($) => $.report.head.project, { nameOf: nameOf('fr', ines.name) }))).toBe(
      true,
    )
    // La cible vient de l'adresse, mais ce qu'on montre vient de l'API : un lien fabriqué ne fait
    // pas signaler autre chose que ce qu'on lit.
    expect(getReportTarget).toHaveBeenCalledWith(projectTarget)
  })

  it('titles the sheet after a comment, and names it by its author', async () => {
    await openSheet(samComment)

    expect(shown(fr.t(($) => $.report.head.comment, { nameOf: nameOf('fr', sam.name) }))).toBe(true)
  })

  it('titles the sheet after a profile', async () => {
    const member: ReportTargetPreview = {
      ...samComment,
      target: { kind: 'member', id: 'u7' },
      text: 'Lucas Martin (@lucas_martin)',
      projectId: null,
      author: {
        id: 'u7',
        name: 'Lucas Martin',
        handle: 'lucas_martin',
        isBlocked: false,
        isAdmin: false,
      },
      head: { title: null, authorName: 'Lucas Martin', image: null },
      parts: [textPart('name'), textPart('bio')],
    }
    await openSheet(member, T.titleMember)

    expect(getReportTarget).toHaveBeenCalledWith({ kind: 'member', id: 'u7' })
    expect(isChecked(fr.t(($) => $.report.whole.member))).toBe(true)
  })

  it('says the content is no longer there, with « Fermer », when the API does not give it', async () => {
    jest.mocked(getReportTarget).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<ReportSheet kind="project" id={projectId} />)

    expect(await screen.findByText(containing(T.gone))).toBeTruthy()
    expect(screen.getAllByRole('button', { name: T.close }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('says « not found » for a link that names no valid kind, without asking the API', async () => {
    await renderWithProviders(<ReportSheet kind="password" id={commentId} />)

    expect(await screen.findByText(containing(T.gone))).toBeTruthy()
    expect(getReportTarget).not.toHaveBeenCalled()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('says « not found » for an id that does not fit its kind, without asking the API', async () => {
    // Un commentaire a un identifiant uuid (ReportTarget du contrat).
    await renderWithProviders(<ReportSheet kind="comment" id="../../v1/me" />)

    expect(await screen.findByText(containing(T.gone))).toBeTruthy()
    expect(getReportTarget).not.toHaveBeenCalled()
  })

  it('asks a visitor to sign in, without asking the API', async () => {
    mockSession(null)
    await renderWithProviders(<ReportSheet kind="project" id={projectId} />)

    const signIn =
      (await screen.findAllByRole('link', { name: 'Me connecter' }).catch(() => null)) ??
      (await screen.findAllByRole('button', { name: 'Me connecter' }))
    expect(signIn.length).toBeGreaterThan(0)
    expect(getReportTarget).not.toHaveBeenCalled()
  })
})

// --- Première étape : « Quelle partie ? » ---

describe('the part step', () => {
  it('asks « Quelle partie ? » first, with « Tout le projet » chosen beforehand', async () => {
    await openSheet()

    expect(shown(T.partQuestion)).toBe(true)
    expect(isChecked('Tout le projet')).toBe(true)
    expect(isChecked('La 2e photo')).toBe(false)
    // Les motifs attendent la seconde étape.
    expect(screen.queryByRole('radio', { name: /^Arnaque ou spam/ })).toBeNull()
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
  })

  it('offers only the parts present on the page, in order, photos by their rank', async () => {
    await openSheet()

    const labels = radioLabels()
    const expected = [
      'Tout le projet',
      'Le titre',
      'Le pitch',
      'La description',
      'La catégorie',
      'Les outils',
      'Le lien de la démo',
      'La couverture',
      'La 1re photo',
      'La 2e photo',
      'Le prompt de départ',
    ]
    expect(labels).toHaveLength(expected.length)
    expected.forEach((label, i) => {
      expect(labels[i]).toMatch(new RegExp(`^${label}`))
    })
  })

  it('starts at the reason for a comment, which has no part', async () => {
    await openSheet(samComment)

    expect(shown(T.reasonQuestion)).toBe(true)
    expect(shown(T.partQuestion)).toBe(false)
    expect(screen.queryByRole('button', { name: T.continue })).toBeNull()
    // Rien avant : pas de « Retour » dans la tête.
    expect(screen.queryByRole('button', { name: T.stepBack })).toBeNull()
  })

  it('moves the focus to the reason question after Continue', async () => {
    await openSheet()

    await toReason('La 2e photo')

    expect(focused().at(-1)).toContain(T.reasonQuestion)
  })

  it('goes back to the part step from the sheet header, keeping the choice', async () => {
    await openSheet()
    await toReason('La 2e photo')

    await press(T.stepBack)

    expect(shown(T.partQuestion)).toBe(true)
    expect(isChecked('La 2e photo')).toBe(true)
    expect(isChecked('Tout le projet')).toBe(false)
    // Et le focus revient sur le choix coché (relecture du plan, ui-P5).
    expect(focused().at(-1)).toMatch(/^La 2e photo/)
  })

  it('says « already reported » right after Continue for a part this member reported', async () => {
    await openSheet({
      ...meteo,
      parts: meteo.parts.map((part) =>
        part.mediaId === photo2 && part.field === 'photo' ? { ...part, reportedByMe: true } : part,
      ),
    })

    await choose('La 2e photo')
    await press(T.continue)

    expect(await screen.findByText(containing(T.alreadyPart))).toBeTruthy()
    // Rien à envoyer : la feuille le dit avant le motif, sans rien demander à l'API.
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    expect(sendReport).not.toHaveBeenCalled()
  })

  it('says « already reported » for the whole project this member reported', async () => {
    await openSheet({ ...meteo, reportedByMe: true })

    await press(T.continue)

    expect(await screen.findByText(containing(T.alreadyWhole))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
  })

  it('goes on to the reason for another part of the same project', async () => {
    // Témoin du précédent : la 2e photo déjà signalée n'empêche pas de signaler la 1re.
    await openSheet({
      ...meteo,
      parts: meteo.parts.map((part) =>
        part.mediaId === photo2 && part.field === 'photo' ? { ...part, reportedByMe: true } : part,
      ),
    })

    await toReason('La 1re photo')

    expect(shown(T.alreadyPart)).toBe(false)
  })
})

// --- Seconde étape : le motif ---

describe('the reason step', () => {
  it('offers the eight reasons as choices, in order', async () => {
    await openSheet(samComment)

    const labels = radioLabels()
    expect(labels).toHaveLength(8)
    labels.forEach((label, i) => {
      expect(label).toMatch(new RegExp(`^${reasonLabels[i]}`))
    })
  })

  it('explains the dangerous link reason', async () => {
    await openSheet(samComment)

    expect(shown(fr.t(($) => $.report.reasonHints.dangerousLink))).toBe(true)
  })

  it('says to call 112 only for harassment, sexual or violent content and illegal content', async () => {
    await openSheet(samComment)

    expect(shown(T.danger)).toBe(false)
    for (const reason of ['Contenu illégal', 'Harcèlement ou haine', 'Contenu sexuel ou violent']) {
      await choose(reason)
      expect(shown(T.danger)).toBe(true)
    }
    for (const reason of ['Arnaque ou spam', 'Lien, démo ou prompt dangereux', 'Autre chose']) {
      await choose(reason)
      expect(shown(T.danger)).toBe(false)
    }
  })

  it('says the moderation sees who reports, and asks for good faith', async () => {
    await openSheet(samComment)

    expect(shown(T.anonymity)).toBe(true)
    expect(shown(T.goodFaith)).toBe(true)
  })

  it('offers an optional precision of 500 characters, asking for no needless personal information', async () => {
    await openSheet(samComment)

    await fireEvent.changeText(detailsField(), 'Même message sous trois projets.')

    expect(screen.getByText('32 / 500')).toBeTruthy()
    expect(shown(T.detailsHint)).toBe(true)
  })

  it('gives an example about the photo when a photo is reported', async () => {
    await openSheet()
    await toReason('La 2e photo')

    expect(detailsField().props.placeholder).toBe(T.photoExample)
  })

  it('gives a general example for the whole project', async () => {
    await openSheet()
    await toReason()

    expect(detailsField().props.placeholder).toBe(T.otherExample)
  })

  it('makes the precision required for an illegal content', async () => {
    await openSheet(samComment)

    await choose('Contenu illégal')

    expect(screen.getByLabelText(containing(T.illegalDetails))).toBeTruthy()
  })

  it('sends nothing for an illegal content without an explanation, and keeps the help', async () => {
    await openSheet(samComment)

    await choose('Contenu illégal')
    await press(T.submit)

    expect(await screen.findByText(containing(T.illegalRequired))).toBeTruthy()
    // L'aide reste lisible sous l'erreur (« À reprendre », TextField).
    expect(shown(T.detailsHint)).toBe(true)
    expect(sendReport).not.toHaveBeenCalled()

    await fireEvent.changeText(
      screen.getByLabelText(containing(T.illegalDetails)),
      'Il donne une adresse.',
    )
    await press(T.submit)
    expect(sendReport).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'illegal', details: 'Il donne une adresse.' }),
    )
  })
})

// --- L'envoi ---

describe('sending a report', () => {
  it('sends the target, the part, the reason and the precision', async () => {
    await openSheet()
    await toReason('La 2e photo')

    await choose('Harcèlement ou haine')
    await fireEvent.changeText(detailsField(), 'Une personne reconnaissable.')
    // « Envoyer » ignore les tapes juste après « Continuer » (la double tape, plus bas).
    await passTapGuard()
    await press(T.submit)

    expect(sendReport).toHaveBeenCalledTimes(1)
    expect(sendReport).toHaveBeenCalledWith({
      target: projectTarget,
      part: { field: 'photo', mediaId: photo2 },
      reason: 'harassment',
      details: 'Une personne reconnaissable.',
    })
  })

  it('sends no part for the whole project', async () => {
    await openSheet()

    await reportWith('Arnaque ou spam')

    expect(sendReport).toHaveBeenCalledTimes(1)
    const [sent] = jest.mocked(sendReport).mock.calls[0] ?? []
    expect(sent?.target).toEqual(projectTarget)
    expect(sent?.reason).toBe('scam_spam')
    expect(sent?.part).toBeUndefined()
  })

  it('never greys « Envoyer »: without a reason, it says « Choisis un motif » and moves the focus there', async () => {
    await openSheet(samComment)

    // Témoin : le message n'est pas là avant le premier essai.
    expect(shown(T.reasonRequired)).toBe(false)
    expect(button(T.submit)).not.toBeDisabled()
    await press(T.submit)

    expect(await screen.findByText(containing(T.reasonRequired))).toBeTruthy()
    expect(focused().at(-1)).toContain(T.reasonRequired)
    expect(sendReport).not.toHaveBeenCalled()
  })

  it('sends only one report for a double tap', async () => {
    const answer = deferred<Sent>()
    jest.mocked(sendReport).mockReturnValue(answer.promise)
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await press(T.submit)
    await press(T.submit)

    expect(sendReport).toHaveBeenCalledTimes(1)
    await act(async () => answer.resolve(SENT))
  })

  it('does not send when Continue is tapped twice with a reason kept from before', async () => {
    // Malik a choisi un motif, puis est revenu à « Quelle partie ? ». « Envoyer » prend la place de
    // « Continuer » : la seconde tape d'une double tape tombe dessus, avec le motif d'avant.
    await openSheet()
    await toReason()
    await choose('Arnaque ou spam')
    await press(T.stepBack)
    await passTapGuard()

    await press(T.continue)
    await press(T.submit)

    expect(sendReport).not.toHaveBeenCalled()
    // Témoin : une fois la garde passée, « Envoyer » envoie bien.
    await passTapGuard()
    await press(T.submit)
    expect(sendReport).toHaveBeenCalledTimes(1)
  })

  it('thanks the member, recalls what was reported, and closes on « Fermer »', async () => {
    await openSheet()

    await reportWith('Lien, démo ou prompt dangereux', 'La 2e photo')

    expect(await screen.findByText(containing(T.sentTitle))).toBeTruthy()
    expect(shown(T.sentBody)).toBe(true)
    const recap = fr.t(($) => $.report.sentRecap, {
      what: fr.t(($) => $.report.partOf, { part: 'La 2e photo', title: 'Météo' }),
      nameOf: nameOf('fr', ines.name),
      reason: 'Lien, démo ou prompt dangereux',
    })
    expect(shown(recap)).toBe(true)
    // Le formulaire a laissé la place au remerciement.
    expect(screen.queryByRole('button', { name: T.submit })).toBeNull()
    const closes = screen.getAllByRole('button', { name: T.close })
    const last = closes.at(-1)
    if (!last) throw new Error('no « Fermer »')
    await fireEvent.press(last)
    expect(navigations()).toBe(1)
  })
})

// --- Les refus de l'API ---

describe('a report refused by the API', () => {
  /** L'envoi refusé avec cette clé d'erreur (api/errors.ts). */
  const refuse = (error: string) =>
    jest.mocked(sendReport).mockResolvedValue({ ok: false, error } as Sent)

  it('says when the member already reported this content', async () => {
    refuse('alreadyReported')
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await press(T.submit)

    await screen.findByText(
      new RegExp(
        [fr.t(($) => $.errors.alreadyReported), T.alreadyWhole]
          .map((text) => containing(text).source)
          .join('|'),
      ),
    )
    expect(shown(T.sentTitle)).toBe(false)
  })

  it('says when the daily limit of reports is reached, with the contact address as a link', async () => {
    refuse('rateLimited')
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await press(T.submit)

    expect(await screen.findByText(containing(T.limitedLead))).toBeTruthy()
    expect(screen.getByRole('link', { name: contactEmail })).toBeTruthy()
    expect(shown(T.sentTitle)).toBe(false)
  })

  it('says when the content is no longer there', async () => {
    refuse('notFound')
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await press(T.submit)

    expect(await screen.findByText(containing(T.gone))).toBeTruthy()
    expect(shown(T.sentTitle)).toBe(false)
  })

  it('offers to sign in again, back to the report, when the session expired', async () => {
    refuse('unauthorized')
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await press(T.submit)

    expect(await screen.findByText(containing(fr.t(($) => $.states.expired)))).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: 'Me reconnecter' }))
    const { push, replace, navigate } = mockNav.router
    expect(
      visited(push, replace, navigate).some(
        (href) => href.startsWith('/sign-in?next=') && href.includes('report'),
      ),
    ).toBe(true)
  })

  it('keeps the reason and the precision chosen, to send again', async () => {
    refuse('internal')
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await fireEvent.changeText(detailsField(), 'Trois fois.')
    await press(T.submit)

    expect(await screen.findByText(containing(fr.t(($) => $.errors.internal)))).toBeTruthy()
    expect(isChecked('Arnaque ou spam')).toBe(true)
    expect(detailsField()).toHaveDisplayValue('Trois fois.')
  })

  it('says when the content was already examined and has not changed since', async () => {
    refuse('alreadyExamined')
    await openSheet(samComment)

    await choose('Arnaque ou spam')
    await press(T.submit)

    expect(await screen.findByText(containing(fr.t(($) => $.errors.alreadyExamined)))).toBeTruthy()
    expect(shown(fr.t(($) => $.errors.alreadyReported))).toBe(false)
  })
})

// --- Les cas où l'on ne signale pas, dès l'ouverture ---

describe('when there is nothing to report', () => {
  it('says the daily limit as soon as it opens, with the contact link and the 112 sentence', async () => {
    await openSheet({ ...meteo, remainingToday: 0 })

    expect(shown(T.limitedLead)).toBe(true)
    expect(screen.getByRole('link', { name: contactEmail })).toBeTruthy()
    expect(shown(T.danger)).toBe(true)
    expect(screen.getAllByRole('button', { name: T.close }).length).toBeGreaterThan(0)
    // Avant tout choix : ni partie, ni motif.
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button', { name: T.continue })).toBeNull()
  })

  it('opens on « C’est ton projet » for a link to her own content, with « Modifier » and « Fermer »', async () => {
    jest.mocked(getReportTarget).mockRejectedValue(new ApiError('ownContent'))
    await renderWithProviders(<ReportSheet kind="project" id={projectId} />)

    expect(await screen.findByText(containing(T.ownProject))).toBeTruthy()
    expect(
      screen.queryAllByRole('button', { name: containing(T.ownEdit) }).length +
        screen.queryAllByRole('link', { name: containing(T.ownEdit) }).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: T.close }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('radio')).toBeNull()
  })
})

// --- Bloquer aussi, avant l'envoi ---

describe('blocking the author too', () => {
  const checkbox = () => screen.getByRole('checkbox', { name: containing(T.alsoBlock) })
  const boxChecked = () =>
    Boolean(checkbox().props['aria-checked'] ?? checkbox().props.accessibilityState?.checked)

  /** Coche « Bloquer aussi », envoie, puis attend la fin de la garde de la fenêtre de blocage. */
  const sendWithBlock = async () => {
    await toReason('La 2e photo')
    await choose('Arnaque ou spam')
    await fireEvent.press(checkbox())
    await passTapGuard()
    await press(T.submit)
    await passTapGuard()
  }

  it('offers « Bloquer aussi Inès Haddad (@ines_haddad) », never checked beforehand', async () => {
    await openSheet()
    await toReason()

    expect(checkbox()).toBeTruthy()
    expect(boxChecked()).toBe(false)
  })

  it('offers no box for an author already blocked, or a handle withheld by a block', async () => {
    await openSheet({ ...meteo, author: { ...ines, isBlocked: true } })
    await toReason()

    // Témoin : le motif est là.
    expect(screen.getByRole('radio', { name: /^Arnaque ou spam/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Bloquer aussi/ })).toBeNull()
  })

  // R9 (`ReportTargetPreview.author.isAdmin`) : on ne bloque pas un administrateur (l'API le
  // refuserait) ; la case n'est donc pas proposée, le signalement reste possible.
  it('offers no « Bloquer aussi » box when the author is an administrator', async () => {
    await openSheet({ ...meteo, author: { ...ines, isAdmin: true } })
    await toReason()

    // Témoin : le motif est là, on peut signaler.
    expect(screen.getByRole('radio', { name: /^Arnaque ou spam/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Bloquer aussi/ })).toBeNull()
  })

  it('offers no box when a block already keeps them apart, the handle withheld', async () => {
    await openSheet({ ...meteo, author: { ...ines, handle: null } })
    await toReason()

    expect(screen.getByRole('radio', { name: /^Arnaque ou spam/ })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Bloquer aussi/ })).toBeNull()
  })

  it('asks in the block window before sending, then sends and blocks on « Bloquer »', async () => {
    await openSheet()

    await sendWithBlock()

    // La fenêtre est ouverte : rien n'est encore parti.
    expect(sendReport).not.toHaveBeenCalled()
    expect(mockBlock).not.toHaveBeenCalled()
    await press(T.blockConfirm)

    expect(sendReport).toHaveBeenCalledTimes(1)
    expect(mockBlock).toHaveBeenCalledWith(ines.id)
    // Le signalement d'abord, le blocage ensuite.
    const reportOrder = jest.mocked(sendReport).mock.invocationCallOrder[0] ?? 0
    const blockOrder = mockBlock.mock.invocationCallOrder[0] ?? 0
    expect(reportOrder).toBeLessThan(blockOrder)
    expect(await screen.findByText(containing(T.sentTitle))).toBeTruthy()
    expect(shown(T.alsoBlocked)).toBe(true)
  })

  it('offers no « report too » box when blocking from a report', async () => {
    await openSheet()

    await sendWithBlock()

    // Témoin : la fenêtre de blocage est ouverte.
    expect(button(T.blockConfirm)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: containing(T.alsoReport) })).toBeNull()
  })

  it('unchecks the box and keeps the sheet open on « Annuler »', async () => {
    await openSheet()

    await sendWithBlock()
    // Deux « Annuler » : celui de la feuille, puis celui de la fenêtre, par-dessus.
    const cancels = screen.getAllByRole('button', { name: T.blockCancel })
    const last = cancels.at(-1)
    if (!last) throw new Error('no « Annuler »')
    await fireEvent.press(last)

    expect(sendReport).not.toHaveBeenCalled()
    expect(mockBlock).not.toHaveBeenCalled()
    expect(boxChecked()).toBe(false)
    expect(button(T.submit)).toBeTruthy()
    expect(navigations()).toBe(0)
  })

  it('says the report was sent but the block failed when blocking is refused', async () => {
    mockBlock.mockResolvedValue({ ok: false, error: 'internal' })
    await openSheet()

    await sendWithBlock()
    await press(T.blockConfirm)

    expect(await screen.findByText(containing(T.blockFailed))).toBeTruthy()
    expect(sendReport).toHaveBeenCalledTimes(1)
    expect(shown(T.alsoBlocked)).toBe(false)
  })

  it('still thanks after blocking even when the preview reloads as not found', async () => {
    // Relecture de l'interface 7b (ui-4), gardée : après le blocage, la cible répond 404 ; une
    // relecture (retour sur l'onglet) ne doit pas remplacer « Merci » par « introuvable ».
    const { queryClient } = await openSheet()
    await sendWithBlock()
    await press(T.blockConfirm)
    await screen.findByText(containing(T.sentTitle))

    jest.mocked(getReportTarget).mockRejectedValue(new ApiError('notFound'))
    await act(() => queryClient.refetchQueries())

    expect(jest.mocked(getReportTarget).mock.calls.length).toBeGreaterThanOrEqual(2) // témoin
    expect(shown(T.sentTitle)).toBe(true)
    expect(shown(T.alsoBlocked)).toBe(true)
    expect(shown(T.gone)).toBe(false)
  })

  it('blocks only once for a double tap on « Bloquer »', async () => {
    const answer = deferred<{ ok: true; data: null }>()
    mockBlock.mockReturnValue(answer.promise)
    await openSheet()

    await sendWithBlock()
    await press(T.blockConfirm)
    await press(T.blockConfirm).catch(() => {})

    expect(sendReport).toHaveBeenCalledTimes(1)
    expect(mockBlock).toHaveBeenCalledTimes(1)
    await act(async () => answer.resolve({ ok: true, data: null }))
  })
})

// --- Les sorties de la feuille ---

describe('leaving the sheet', () => {
  it('closes at once on the browser Back when nothing is written', async () => {
    await openSheet()

    const back = await navigatorRemoves()

    expect(back.preventDefault).not.toHaveBeenCalled()
    expect(asking()).toBe(false)
  })

  it('asks « Abandon the report? » on the browser Back when a detail is written', async () => {
    await openSheet()
    await toReason()
    await fireEvent.changeText(detailsField(), 'Le lien mène à un faux site.')

    const back = await navigatorRemoves()

    expect(back.preventDefault).toHaveBeenCalled()
    expect(await screen.findByRole('header', { name: T.discardTitle })).toBeTruthy()
  })

  it('asks before closing on « Annuler » when a detail is written, and stays on « Continuer »', async () => {
    await openSheet(samComment)
    await fireEvent.changeText(detailsField(), 'Le lien mène à un faux site.')

    const [cancel] = screen.getAllByRole('button', { name: T.cancel })
    if (!cancel) throw new Error('no « Annuler »')
    await fireEvent.press(cancel)
    expect(asking()).toBe(true)
    await passTapGuard()
    await press(T.discardKeep)

    expect(asking()).toBe(false)
    expect(navigations()).toBe(0)
    expect(detailsField()).toHaveDisplayValue('Le lien mène à un faux site.')
  })

  it('closes without sending after « Abandonner »', async () => {
    await openSheet(samComment)
    await fireEvent.changeText(detailsField(), 'Le lien mène à un faux site.')
    const [cancel] = screen.getAllByRole('button', { name: T.cancel })
    if (!cancel) throw new Error('no « Annuler »')
    await fireEvent.press(cancel)
    await passTapGuard()

    await press(T.discardConfirm)

    expect(navigations()).toBe(1)
    expect(sendReport).not.toHaveBeenCalled()
  })

  it('stays open on Back while the report is sending', async () => {
    const answer = deferred<Sent>()
    jest.mocked(sendReport).mockReturnValue(answer.promise)
    await openSheet(samComment)
    await choose('Arnaque ou spam')
    await press(T.submit)

    const back = await navigatorRemoves()

    expect(back.preventDefault).toHaveBeenCalled()
    expect(screen.getByRole('header', { name: T.titleComment })).toBeTruthy()
    expect(navigations()).toBe(0)
    // Rien à abandonner : le signalement part, la feuille attend sa réponse.
    expect(asking()).toBe(false)
    await act(async () => answer.resolve(SENT))
  })
})

// --- Un message du coin des testeurs (R7b, relecture juridique J3) ---

describe('the anonymity promise of a message of a testers thread', () => {
  it('warns that the other person may guess when reporting a tester thread message', async () => {
    const message: ReportTargetPreview = {
      ...samComment,
      target: { kind: 'message', id: messageId },
      text: 'Ça plante au lancement.',
    }
    await openSheet(
      message,
      fr.t(($) => $.report.message),
    )

    expect(shown(fr.t(($) => $.report.anonymityThread, { name: sam.name }))).toBe(true)
    expect(shown(T.anonymity)).toBe(false)
  })
})
