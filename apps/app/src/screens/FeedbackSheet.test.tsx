// Tests de la feuille « Ton retour » (R7b, docs/scenarios/refonte.md, « Les retours ») : « Ça a
// marché ? » (obligatoire), « Sur quoi ? » (facultatif, vidé par « Effacer »), le texte et la
// capture facultatifs, les aides (capture, confidentialité), « Envoyer » jamais grisé et le focus
// après un envoi sans issue, la double tape, les refus de l'API (30 messages par jour, capture
// perdue), les sorties qui gardent le brouillon, « Effacer le brouillon », et qui peut l'ouvrir.
//
// Ce que ces tests supposent de l'écran (plan R7b, U3b, ui-A4, A12, B8, B10 ; à corriger si le code
// en décide autrement) :
// - `FeedbackSheet({ id })`, montée par `app/projects/[id]/testers/new-feedback.tsx`, ouverte par
//   `useRouteSheet` sur sa propre adresse ; le retour part par POST
//   /v1/projects/{id}/threads/{testerId}/messages, `testerId` étant le membre connecté ;
// - « Ça a marché ? » et « Sur quoi ? » sont des `Choices` (`radiogroup` nommé par la question,
//   `radio` nommé par le choix) ; « Sur quoi ? » a `clearLabel` « Effacer » ;
// - la capture part par `useUploadTesterMedia(id, 'capture')` (champ `kind=capture`) ;
// - le focus passe par les outils de `ui/focus`, que ces tests espionnent ;
// - le reste est dans `TestersCorner.testkit.tsx` (faux serveur, routeur, textes).
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { clearAllDrafts } from '../testers/drafts'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import { FeedbackSheet } from './FeedbackSheet'
import {
  control,
  cornerPath,
  deferred,
  departures,
  deviceName,
  focusedLabels,
  formField,
  getControl,
  id,
  ines,
  lea,
  mockPick,
  mockServer,
  navigatorRemoves,
  outcomeName,
  picked,
  pressEscape,
  pressScrim,
  project,
  refusedSheet,
  resetCornerMocks,
  shown,
  T,
  testerCorner,
} from './TestersCorner.testkit'

const kit = () => require('./TestersCorner.testkit') as typeof import('./TestersCorner.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
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
jest.mock('../media/pick', () => kit().mockMediaPick())
jest.mock('expo-router', () => kit().mockExpoRouter())
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    focusAndReveal: jest.fn(actual.focusAndReveal),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

beforeEach(() => {
  resetCornerMocks(`${cornerPath}/new-feedback`)
  clearAllDrafts()
  // Inès, testeuse du projet de Léa.
  mockSession({ user: { id: ines.id, name: ines.name } })
  mockServer.corner = testerCorner
  mockServer.project = { ...project, isMine: false, isTester: true, testerCount: null }
  mockServer.setThread(ines.id, [])
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})

// --- Les aides ---

const MESSAGES = new RegExp(`^/v1/projects/[^/]+/threads/${ines.id}/messages$`)
const MEDIA = /^\/v1\/projects\/[^/]+\/testers\/media$/
const sentFeedback = () => mockServer.received('POST', MESSAGES).map((one) => one.body)

/** Ouvre la feuille et attend « Ça a marché ? », puis la fin de la garde des tapes. */
const openSheet = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <FeedbackSheet id={id} />
    </ToastProvider>,
  )
  await screen.findByLabelText(T.outcome)
  await passTapGuard()
  return view
}

const reopen = async (view: { unmount: () => void | Promise<void> }) => {
  await view.unmount()
  return openSheet()
}

const choose = (name: string) => fireEvent.press(screen.getByRole('radio', { name }))
const isChecked = (name: string) => {
  const radio = screen.getByRole('radio', { name })
  return Boolean(radio.props['aria-checked'] ?? radio.props.accessibilityState?.checked)
}
const textField = () => screen.getByLabelText(containing(T.feedbackText))
const send = () => fireEvent.press(screen.getByRole('button', { name: T.feedbackSubmit }))
const focused = () => focusedLabels(focusWithoutScroll, focusAndReveal, moveReaderTo)

/** Ajoute une capture et attend son envoi. */
const addCapture = async (name: string) => {
  const before = mockServer.received('POST', MEDIA).length
  mockPick.next = [picked(name)]
  await fireEvent.press(getControl(/^Ajouter/))
  await waitFor(() => expect(mockServer.received('POST', MEDIA)).toHaveLength(before + 1))
}

// --- Ce que la feuille montre ---

describe('the sheet « Ton retour »', () => {
  it('opens with « Ça a marché ? », « Sur quoi ? », the text and the capture', async () => {
    await openSheet()

    expect(screen.getByRole('header', { name: T.feedbackSheet })).toBeTruthy()
    for (const code of ['yes', 'partly', 'no'] as const)
      expect(screen.getByRole('radio', { name: outcomeName(code) })).toBeTruthy()
    for (const code of ['phone', 'computer', 'tablet'] as const)
      expect(screen.getByRole('radio', { name: deviceName(code) })).toBeTruthy()
    expect(screen.getByLabelText(T.device)).toBeTruthy()
    expect(textField()).toBeTruthy()
    expect(getControl(/^Ajouter/)).toBeTruthy()
    expect(screen.getByRole('button', { name: T.feedbackCancel })).toBeTruthy()
  })

  it('offers the example of the scenario in the empty text', async () => {
    await openSheet()

    expect(textField().props.placeholder).toBe(fr.t(($) => $.project.testers.feedback.placeholder))
  })

  it('reminds the tester to remove personal details of others from a capture', async () => {
    await openSheet()

    expect(shown(T.captureHint)).toBe(true)
  })

  it('says that no other member reads the feedback, and that the author is told', async () => {
    await openSheet()

    expect(shown(fr.t(($) => $.project.testers.feedback.privacy, { name: lea.name }))).toBe(true)
  })

  it('shows the project thumb, title and « Effacer le brouillon » in the sheet head', async () => {
    const view = await openSheet()
    await choose(outcomeName('yes'))
    await reopen(view)

    expect(shown(project.title)).toBe(true)
    expect(
      shown(fr.t(($) => $.project.testers.feedback.byAuthor, { nameOf: nameOf('fr', lea.name) })),
    ).toBe(true)
    expect(getControl(T.clearDraft)).toBeTruthy()
  })
})

// --- Envoyer ---

describe('sending a feedback', () => {
  it('never greys « Envoyer »: with no outcome, it says « Choisis Oui, En partie ou Non. »', async () => {
    await openSheet()

    expect(screen.getByRole('button', { name: T.feedbackSubmit })).not.toBeDisabled()
    await send()

    expect(await screen.findAllByText(containing(T.outcomeRequired))).not.toHaveLength(0)
    expect(sentFeedback()).toEqual([])
    expect(departures()).toBe(0)
  })

  it('focuses « Ça a marché ? », marked invalid, after sending without an outcome', async () => {
    await openSheet()
    await fireEvent.changeText(textField(), 'Le score repart à zéro.')

    await send()

    await waitFor(() => expect([T.outcome, outcomeName('yes')]).toContain(focused().at(-1)))
    expect(await screen.findAllByText(containing(T.outcomeRequired))).not.toHaveLength(0)
    // Le texte écrit reste.
    expect(textField()).toHaveDisplayValue('Le score repart à zéro.')
  })

  it('sends the outcome, the device, the text and the capture', async () => {
    await openSheet()
    await choose(outcomeName('partly'))
    await choose(deviceName('phone'))
    await fireEvent.changeText(textField(), 'Le score repart à zéro au niveau 3.')
    await addCapture('niveau-3')
    await send()

    expect(formField(mockServer.received('POST', MEDIA)[0]?.body, 'kind')).toBe('capture')
    await waitFor(() => expect(sentFeedback()).toHaveLength(1))
    expect(sentFeedback()[0]).toEqual({
      kind: 'feedback',
      outcome: 'partly',
      device: 'phone',
      text: 'Le score repart à zéro au niveau 3.',
      captureId: kit().media(101).id,
    })
    await waitFor(() => expect(departures()).toBe(1))
  })

  it('sends a feedback made of its outcome alone', async () => {
    await openSheet()
    await choose(outcomeName('yes'))
    await send()

    await waitFor(() => expect(sentFeedback()).toHaveLength(1))
    expect(sentFeedback()[0]).toEqual({
      kind: 'feedback',
      outcome: 'yes',
      device: null,
      text: null,
      captureId: null,
    })
  })

  it('clears « Sur quoi ? » with « Effacer »', async () => {
    await openSheet()
    await choose(outcomeName('no'))
    await choose(deviceName('tablet'))
    expect(isChecked(deviceName('tablet'))).toBe(true)

    await fireEvent.press(getControl(T.clearDevice))

    expect(isChecked(deviceName('tablet'))).toBe(false)
    await send()
    await waitFor(() => expect(sentFeedback()).toHaveLength(1))
    expect(sentFeedback()[0]).toMatchObject({ device: null })
  })

  it('sends one feedback on a double tap on « Envoyer »', async () => {
    const answer = deferred<{ ok: false; error: 'internal' }>()
    mockServer.answer('POST', MESSAGES, () => answer.promise)
    await openSheet()
    await choose(outcomeName('yes'))

    await send()
    await send()

    expect(sentFeedback()).toHaveLength(1)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('says that the 30 messages of the day are used up, keeping everything', async () => {
    mockServer.answer('POST', MESSAGES, () => ({ ok: false, error: 'rateLimited' }))
    await openSheet()
    await choose(outcomeName('partly'))
    await fireEvent.changeText(textField(), 'Encore un souci.')
    await send()

    await waitFor(() => expect(shown(T.feedbackLimited)).toBe(true))
    expect(isChecked(outcomeName('partly'))).toBe(true)
    expect(textField()).toHaveDisplayValue('Encore un souci.')
    expect(departures()).toBe(0)
  })

  it('says the feedback could not be sent, keeping everything', async () => {
    mockServer.answer('POST', MESSAGES, () => ({ ok: false, error: 'internal' }))
    await openSheet()
    await choose(outcomeName('yes'))
    await send()

    await waitFor(() => expect(shown(T.feedbackError)).toBe(true))
    expect(isChecked(outcomeName('yes'))).toBe(true)
  })

  it('keeps the text and asks for the capture again on invalid_photo', async () => {
    mockServer.answer('POST', MESSAGES, () => ({ ok: false, error: 'invalidPhoto' }))
    await openSheet()
    await choose(outcomeName('partly'))
    await fireEvent.changeText(textField(), 'Voir la capture.')
    await addCapture('niveau-3')
    await send()

    await waitFor(() => expect(shown(T.invalidCapture)).toBe(true))
    expect(textField()).toHaveDisplayValue('Voir la capture.')
    expect(getControl(/^Ajouter/)).toBeTruthy()
  })
})

// --- Fermer et le brouillon ---

describe('leaving the sheet and its draft', () => {
  const writeDraft = async () => {
    await choose(outcomeName('partly'))
    await choose(deviceName('phone'))
    await fireEvent.changeText(textField(), 'Un retour à finir')
  }
  const expectDraft = () => {
    expect(isChecked(outcomeName('partly'))).toBe(true)
    expect(isChecked(deviceName('phone'))).toBe(true)
    expect(textField()).toHaveDisplayValue('Un retour à finir')
  }

  it('closes on « Annuler » without asking, and keeps the draft', async () => {
    const view = await openSheet()
    await writeDraft()

    await fireEvent.press(screen.getByRole('button', { name: T.feedbackCancel }))

    expect(departures()).toBe(1)
    expect(screen.queryByRole('button', { name: fr.t(($) => $.common.discard) })).toBeNull()
    await reopen(view)
    expectDraft()
  })

  it('closes on Escape, keeping the draft', async () => {
    const view = await openSheet()
    await writeDraft()

    await pressEscape(T.feedbackSheet)

    expect(departures()).toBe(1)
    await reopen(view)
    expectDraft()
  })

  it('closes on the scrim, keeping the draft', async () => {
    const view = await openSheet()
    await writeDraft()

    await pressScrim()

    await waitFor(() => expect(departures()).toBe(1))
    await reopen(view)
    expectDraft()
  })

  it('lets the browser back close the sheet, keeping the draft', async () => {
    const view = await openSheet()
    await writeDraft()

    const event = await navigatorRemoves()

    expect(event.preventDefault).not.toHaveBeenCalled()
    await reopen(view)
    expectDraft()
  })

  it('empties the sheet with « Effacer le brouillon », without asking', async () => {
    const view = await openSheet()
    expect(control(T.clearDraft)).toBeNull()
    await writeDraft()
    await reopen(view)

    await fireEvent.press(getControl(T.clearDraft))

    expect(isChecked(outcomeName('partly'))).toBe(false)
    expect(isChecked(deviceName('phone'))).toBe(false)
    expect(textField()).toHaveDisplayValue('')
    expect(control(T.clearDraft)).toBeNull()
  })

  it('moves the focus to « Ça a marché ? » after « Effacer le brouillon »', async () => {
    const view = await openSheet()
    await writeDraft()
    await reopen(view)
    for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()

    await fireEvent.press(getControl(T.clearDraft))

    await waitFor(() => expect([T.outcome, outcomeName('yes')]).toContain(focused().at(-1)))
  })

  it('forgets the draft once the feedback is sent', async () => {
    const view = await openSheet()
    await writeDraft()
    await send()
    await waitFor(() => expect(sentFeedback()).toHaveLength(1))

    await reopen(view)

    expect(isChecked(outcomeName('partly'))).toBe(false)
    expect(textField()).toHaveDisplayValue('')
  })

  it('keeps the drafts of two members apart', async () => {
    const view = await openSheet()
    await writeDraft()
    await view.unmount()

    // Sam, sur le même appareil, ne retrouve pas le brouillon d'Inès.
    mockSession({ user: { id: kit().sam.id, name: kit().sam.name } })
    mockServer.setThread(kit().sam.id, [])
    await openSheet()

    expect(isChecked(outcomeName('partly'))).toBe(false)
    expect(textField()).toHaveDisplayValue('')
  })
})

// --- Qui peut l'ouvrir ---

describe('who can open the sheet', () => {
  it('never lets the author send a feedback on his own project', async () => {
    mockSession({ user: { id: lea.id, name: lea.name } })
    mockServer.corner = kit().authorCorner
    mockServer.project = project
    await renderWithProviders(<FeedbackSheet id={id} />)

    await waitFor(() => expect(refusedSheet()).toBe(true))
    expect(screen.queryByRole('button', { name: T.feedbackSubmit })).toBeNull()
  })

  it('never lets a former tester send a feedback', async () => {
    mockServer.corner = kit().formerCorner
    mockServer.project = { ...project, isMine: false, isTester: false, testerCount: null }
    await renderWithProviders(<FeedbackSheet id={id} />)

    await waitFor(() => expect(refusedSheet()).toBe(true))
    expect(screen.queryByRole('button', { name: T.feedbackSubmit })).toBeNull()
  })
})
