// Tests d'une partie retirée seule par la modération, vue par son auteur, hors de la page du projet
// (R9, 7d ; docs/scenarios/refonte.md, « Les parties » et « Retirer une partie », décision L2 de
// Louis du 13/11/2026) : une photo d'une mise à jour (`ui/UpdateEntry`), la capture d'un retour du
// coin des testeurs (`TesterThreadView`), la photo d'un appel à tester (le coin, `CallCard`).
//
// Ce que ces tests supposent du code (plan de R9, « Appli », UI-D2) :
// - chaque partie de `removedParts` (mise à jour, message, appel) se montre à son auteur dans un
//   `ui/RemovedPart` : un groupe nommé par son titre (`removal.part.titles.photo`, `capture`,
//   `callPhoto`), avec le fondement, l'explication, la date absolue, « Pour contester : » et
//   l'adresse de contact écrite (un lien `mailto:` dont l'objet nomme la décision, J12), et la
//   justice ; « Remplacer » et « Supprimer » restent au choix de l'écran (aucun n'est attendu ici) ;
// - le contrat ne remplit `removedParts` que pour l'auteur ; pour tout autre membre, la photo n'est
//   plus là, et rien ne dit qu'elle a existé.
//
// La promesse d'anonymat d'un message du fil (`report.anonymityThread`, jur-P5) se lit sur la
// feuille « Signaler » : ReportSheet.test.tsx, « the anonymity promise of a message of a testers
// thread ». Ici, le témoin que « Signaler » d'un message ouvre bien cette feuille pour un message.
import { contactEmail } from '@ruche/brand'
import type { ProjectUpdate } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import { Linking } from 'react-native'
import { clearAllDrafts } from '../testers/drafts'
import { photoRemoval, removedPhotoPart } from '../testing/moderation'
import { reportsOpened } from '../testing/navigation'
import { photo } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { rocketUpdate } from '../testing/updates'
import type { ImageSource } from '../ui/image'
import { ToastProvider } from '../ui/theme/toast'
import { UpdateEntry } from '../ui/UpdateEntry'
import {
  callNo,
  calls,
  id,
  ines,
  lea,
  media,
  messageMenu,
  messageOf,
  mockNav,
  mockServer,
  resetCornerMocks,
} from './TestersCorner.testkit'
import { TestersCornerScreen } from './TestersCornerScreen'
import { TesterThreadView } from './TesterThreadView'

const kit = () => require('./TestersCorner.testkit') as typeof import('./TestersCorner.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le réseau du coin passe par le faux serveur du kit (les vrais hooks tournent dessus).
jest.mock('../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(async () => null) }))
jest.mock('expo-router', () => kit().mockExpoRouter())
// Le coin attend la page hydratée pour lire son onglet : ici, elle l'est.
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => true,
}))

let openURL: jest.SpyInstance

beforeEach(() => {
  resetCornerMocks()
  clearAllDrafts()
  mockSession({ user: { id: lea.id, name: lea.name } })
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
  openURL.mockClear()
})
afterEach(() => openURL.mockRestore())

// --- Les aides ---

const T = {
  updatePhoto: fr.t(($) => $.removal.part.titles.photo, { n: 2 }),
  capture: fr.t(($) => $.removal.part.titles.capture),
  callPhoto: fr.t(($) => $.removal.part.titles.callPhoto),
  illegal: fr.t(($) => $.removal.grounds.illegal),
  explanation: fr.t(($) => $.removal.explanation, { explanation: photoRemoval.explanation }),
  contestLead: fr.t(($) => $.removal.part.contestLead),
  court: fr.t(($) => $.removal.part.court),
  banner: fr.t(($) => $.removal.banner),
}

/** La notice d'une partie retirée : le groupe nommé par son titre. */
// Cherché par son nom, puis son rôle vérifié : getByRole exigerait une vue accessible, qui sur iOS
// cacherait à VoiceOver le lien de la notice (comme RemovedPart.test.tsx).
const part = (title: string) => {
  const found = screen.getByLabelText(title)
  expect(found.props.role ?? found.props.accessibilityRole).toBe('group')
  return within(found)
}

/** Vrai si ce texte est écrit dans la notice, blancs de la typographie française compris. */
const inPart = (title: string, text: string) =>
  part(title).queryAllByText(containing(text)).length > 0

/** Ce que toute notice d'une partie retirée dit (DSA, article 17 ; décision L2). */
const expectFullNotice = (title: string) => {
  expect(inPart(title, T.illegal)).toBe(true)
  expect(inPart(title, T.explanation)).toBe(true)
  // La date absolue (12 novembre), jamais relative : la notice se relit longtemps après.
  expect(part(title).queryAllByText(/Retiré le .*12 nov/).length).toBeGreaterThan(0)
  expect(inPart(title, T.contestLead)).toBe(true)
  expect(inPart(title, contactEmail)).toBe(true)
  expect(inPart(title, T.court)).toBe(true)
}

/** Touche le lien de contact de la notice et rend l'objet de l'e-mail préparé. */
const contestSubject = async (title: string) => {
  const link = part(title)
    .queryAllByRole('link')
    .find((one) => {
      const name = String(one.props.accessibilityLabel ?? '')
      return name === contactEmail || name === fr.t(($) => $.notifications.contest)
    })
  if (!link) throw new Error(`no contact link in « ${title} »`)
  await fireEvent.press(link)
  const url = String(openURL.mock.calls.at(-1)?.[0] ?? '')
  expect(url.startsWith(`mailto:${contactEmail}?subject=`)).toBe(true)
  return decodeURIComponent(url.split('?subject=')[1] ?? '')
}

// --- Une photo d'une mise à jour ---

const toSource = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null)

/** Une mise à jour à deux photos, sans avant / après ; la 2e est retirée seule. */
const nightPhoto = photo('77777777-7777-4777-8777-777777777777', 1600, 900, 'Le balcon de nuit')
const twoPhotos: ProjectUpdate = {
  ...rocketUpdate,
  beforeAfter: false,
  photos: [rocketUpdate.photos[0] ?? nightPhoto, nightPhoto],
}
const withRemovedPhoto: ProjectUpdate = {
  ...twoPhotos,
  removedParts: [removedPhotoPart(nightPhoto.id)],
}

describe('a photo of an update removed by the moderation', () => {
  it('shows its author the ground, the explanation, the date and Contester', async () => {
    await renderWithProviders(
      <UpdateEntry update={withRemovedPhoto} toSource={toSource} onDelete={() => {}} />,
    )

    expectFullNotice(T.updatePhoto)
  })

  it('opens mailto with a subject naming the decision', async () => {
    await renderWithProviders(
      <UpdateEntry update={withRemovedPhoto} toSource={toSource} onDelete={() => {}} />,
    )

    const subject = await contestSubject(T.updatePhoto)
    expect(subject).toMatch(/^Contestation/)
    expect(subject).toContain('photo 2')
  })

  it('keeps the rest of the update readable around the notice', async () => {
    await renderWithProviders(
      <UpdateEntry update={withRemovedPhoto} toSource={toSource} onDelete={() => {}} />,
    )

    expect(screen.getByText(rocketUpdate.title ?? '')).toBeTruthy()
    expect(inPart(T.updatePhoto, T.illegal)).toBe(true)
  })

  it('shows nothing of it to another member, as the API gives the update to others', async () => {
    const forOthers: ProjectUpdate = { ...twoPhotos, photos: twoPhotos.photos.slice(0, 1) }
    await renderWithProviders(
      <UpdateEntry update={forOthers} toSource={toSource} onReport={() => {}} />,
    )

    // Témoin : la mise à jour est là, avec « Signaler cette mise à jour ».
    expect(screen.getByText(rocketUpdate.title ?? '')).toBeTruthy()
    expect(screen.queryByLabelText(T.updatePhoto)).toBeNull()
    expect(screen.queryAllByText(containing(T.banner))).toHaveLength(0)
    expect(screen.queryAllByText(containing(contactEmail))).toHaveLength(0)
  })
})

// --- La capture d'un retour, dans le fil du coin des testeurs ---

/** Le retour d'Inès, avec sa capture : retirée seule, elle la voit encore, avec la notice. */
const capture = media(2)
const feedbackWithCapture = (mine: boolean, removed: boolean) =>
  messageOf(1, {
    kind: 'feedback',
    sender: 'tester',
    outcome: 'partly',
    device: 'phone',
    text: 'Le score repart à zéro au niveau 3.',
    // Pour tout autre que son autrice, l'API ne donne plus la capture retirée.
    capture: removed && !mine ? null : capture,
    removedParts: removed && mine ? [removedPhotoPart(capture.id)] : [],
    mine,
  })

/** Le fil d'Inès, lu par `reader` ; il attend le texte du retour. */
const openThread = async (reader: 'author' | 'tester') => {
  await renderWithProviders(
    <ToastProvider>
      <TesterThreadView
        projectId={id}
        testerId={ines.id}
        memberId={reader === 'tester' ? ines.id : lea.id}
        reader={reader}
        authorName={lea.name}
        testerName={ines.name}
        readOnly={null}
        closed={false}
      />
    </ToastProvider>,
  )
  await screen.findByText(containing('Le score repart à zéro au niveau 3.'))
}

describe('the capture of a feedback removed by the moderation', () => {
  it('shows the tester who sent it the ground, the explanation, the date and Contester', async () => {
    mockSession({ user: { id: ines.id, name: ines.name } })
    mockServer.setThread(ines.id, [feedbackWithCapture(true, true)])
    await openThread('tester')

    expectFullNotice(T.capture)
  })

  it('opens mailto with a subject naming the decision', async () => {
    mockSession({ user: { id: ines.id, name: ines.name } })
    mockServer.setThread(ines.id, [feedbackWithCapture(true, true)])
    await openThread('tester')

    const subject = await contestSubject(T.capture)
    expect(subject).toMatch(/^Contestation/)
    expect(subject).toContain('capture')
  })

  it('shows nothing of it to the author of the project, as the API gives the message to her', async () => {
    mockServer.setThread(ines.id, [feedbackWithCapture(false, true)])
    await openThread('author')

    // Témoin : le retour est là, sans capture ni notice.
    expect(screen.queryByLabelText(T.capture)).toBeNull()
    expect(screen.queryAllByText(containing(T.banner))).toHaveLength(0)
    expect(screen.queryAllByText(containing(contactEmail))).toHaveLength(0)
  })

  it('opens the report sheet for a message from « Signaler », where the other may guess (jur-P5)', async () => {
    mockServer.setThread(ines.id, [feedbackWithCapture(false, false)])
    await openThread('author')

    await fireEvent.press(
      screen.getByRole('button', { name: messageMenu('Le score repart à zéro au niveau 3.') }),
    )
    await fireEvent.press(
      await screen.findByRole('menuitem', {
        name: fr.t(($) => $.project.testers.thread.report),
      }),
    )

    // Témoin (passe avant R9) : la feuille s'ouvre pour un message, où elle dit que l'autre peut
    // deviner (ReportSheet.test.tsx).
    expect(reportsOpened(mockNav.router.push)).toContainEqual(
      expect.objectContaining({ kind: 'message', id: feedbackWithCapture(false, false).id }),
    )
  })
})

// --- La photo d'un appel à tester, dans le coin ---

describe('the photo of a call removed by the moderation', () => {
  it('shows the author of the call the ground, the explanation, the date and Contester', async () => {
    const [first, second] = calls
    if (!first || !second?.photo) throw new Error('fixtures')
    mockServer.callPages = new Map([
      [
        '',
        {
          items: [first, { ...second, removedParts: [removedPhotoPart(second.photo.id)] }],
          nextCursor: null,
        },
      ],
    ])
    await renderWithProviders(
      <ToastProvider>
        <TestersCornerScreen id={id} />
      </ToastProvider>,
    )
    await screen.findByText(containing(second.text))

    expectFullNotice(T.callPhoto)
  })

  it('shows nothing of it to a tester, as the API gives the call to testers', async () => {
    mockSession({ user: { id: ines.id, name: ines.name } })
    mockServer.corner = kit().testerCorner
    mockServer.project = { ...mockServer.project, isMine: false, isTester: true }
    const call = callNo(2, 'Le nouveau tableau des scores est en ligne.')
    mockServer.callPages = new Map([['', { items: [call], nextCursor: null }]])
    await renderWithProviders(
      <ToastProvider>
        <TestersCornerScreen id={id} />
      </ToastProvider>,
    )

    // Témoin : l'appel est là, sans photo ni notice.
    expect(await screen.findByText(containing(call.text))).toBeTruthy()
    expect(screen.queryByLabelText(T.callPhoto)).toBeNull()
    expect(screen.queryAllByText(containing(contactEmail))).toHaveLength(0)
  })
})
