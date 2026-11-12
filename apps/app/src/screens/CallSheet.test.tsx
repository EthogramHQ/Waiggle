// Tests de la feuille « Nouvel appel » (R7b, docs/scenarios/refonte.md, « Les appels à tester ») :
// ce qu'elle montre (en-tête du projet, exemple, aides de la relecture juridique J8), « Envoyer »
// jamais grisé, la photo envoyée d'abord puis citée, la double tape, les refus de l'API (5 appels
// par jour, photo perdue), les sorties (Annuler, Échap, voile, Retour du navigateur) qui gardent le
// brouillon, « Effacer le brouillon », et qui peut l'ouvrir.
//
// Ce que ces tests supposent de l'écran (plan R7b, U3a ; à corriger si le code en décide autrement) :
// - `CallSheet({ id })`, montée par `app/projects/[id]/testers/new-call.tsx`, ouverte par
//   `useRouteSheet` sur sa propre adresse, fermée par `router.back()` (ou `replace` vers le coin) ;
// - la photo se choisit par `media/pick` (`pickImage` ou `pickVisuals`) et part par
//   `useUploadTesterMedia(id, 'call')` : POST …/testers/media, champ `kind=call` ; l'appel cite son
//   identifiant (`photoId`) ;
// - fermer garde le brouillon sans question (décision 5 de Louis) : aucune fenêtre « Abandonner » ;
// - le reste est dans `TestersCorner.testkit.tsx` (faux serveur, routeur, textes).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { clearAllDrafts } from '../testers/drafts'
import { passTapGuard } from '../testing/dialog'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { CallSheet } from './CallSheet'
import {
  audience,
  control,
  cornerPath,
  deferred,
  departures,
  formField,
  getControl,
  id,
  ines,
  lea,
  mockPick,
  mockServer,
  navigatorRemoves,
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

beforeEach(() => {
  resetCornerMocks(`${cornerPath}/new-call`)
  clearAllDrafts()
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

const CALLS = /^\/v1\/projects\/[^/]+\/calls$/
const RATE_LIMITED = fr.t(($) => $.errors.rateLimited)
const MEDIA = /^\/v1\/projects\/[^/]+\/testers\/media$/
const sentCalls = () => mockServer.received('POST', CALLS).map((one) => one.body)

/** Ouvre la feuille et attend son champ, puis la fin de la garde des tapes. */
const openSheet = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <CallSheet id={id} />
    </ToastProvider>,
  )
  await screen.findByLabelText(containing(T.callField))
  await passTapGuard()
  return view
}

const field = () => screen.getByLabelText(containing(T.callField))
const write = (text: string) => fireEvent.changeText(field(), text)
const send = () => fireEvent.press(screen.getByRole('button', { name: T.callSend }))

/** Ajoute une photo par « Ajouter une photo » et attend son envoi. */
const addPhoto = async (name: string) => {
  const before = mockServer.received('POST', MEDIA).length
  mockPick.next = [picked(name)]
  await fireEvent.press(getControl(/^Ajouter/))
  await waitFor(() => expect(mockServer.received('POST', MEDIA)).toHaveLength(before + 1))
}

/** Ferme la feuille, puis la rouvre (le brouillon vit en mémoire, hors de l'écran). */
const reopen = async (view: { unmount: () => void | Promise<void> }) => {
  await view.unmount()
  return openSheet()
}

// --- Ce que la feuille montre ---

describe('the sheet « Nouvel appel »', () => {
  it('opens with « Annuler » and « Envoyer »', async () => {
    await openSheet()

    expect(screen.getByRole('header', { name: T.callSheet })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.callCancel })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.callSend })).toBeTruthy()
  })

  it('shows the project and « Pour tes 12 testeurs » at the top', async () => {
    await openSheet()

    expect(shown(project.title)).toBe(true)
    expect(shown(audience(12))).toBe(true)
  })

  it('offers the example of the scenario in the empty field', async () => {
    await openSheet()

    expect(field().props.placeholder).toBe(fr.t(($) => $.project.testers.calls.placeholder))
  })

  it('warns the author not to quote a tester feedback in a call', async () => {
    await openSheet()

    expect(shown(fr.t(($) => $.project.testers.calls.hint))).toBe(true)
  })

  it('shows the image-rights hint under the photo of a new call', async () => {
    await openSheet()
    await addPhoto('scores')

    expect(shown(fr.t(($) => $.project.testers.calls.photoConsent))).toBe(true)
  })

  it('counts the 500 characters of the call', async () => {
    await openSheet()

    expect(field().props.maxLength ?? 500).toBeLessThanOrEqual(500)
    await write('a'.repeat(510))
    await send()
    // Au-delà de 500, rien ne part : l'écran coupe ou refuse.
    for (const body of sentCalls())
      expect((body as { text: string }).text.length).toBeLessThanOrEqual(500)
  })
})

// --- Envoyer ---

describe('sending a call', () => {
  it('never greys « Envoyer »: with no text, it says so under the field', async () => {
    await openSheet()

    expect(screen.getByRole('button', { name: T.callSend })).not.toBeDisabled()
    await send()

    expect(await screen.findAllByText(containing(T.callRequired))).not.toHaveLength(0)
    expect(sentCalls()).toEqual([])
    expect(departures()).toBe(0)
  })

  it('refuses a call made only of spaces', async () => {
    await openSheet()
    await write('   \n  ')
    await send()

    expect(await screen.findAllByText(containing(T.callRequired))).not.toHaveLength(0)
    expect(sentCalls()).toEqual([])
  })

  it('sends the text alone, then closes', async () => {
    await openSheet()
    await write('Essayez le niveau 3 ce week-end.')
    await send()

    await waitFor(() => expect(sentCalls()).toHaveLength(1))
    expect(sentCalls()[0]).toEqual({
      text: 'Essayez le niveau 3 ce week-end.',
      photoId: null,
      photoDescription: null,
    })
    await waitFor(() => expect(departures()).toBe(1))
  })

  it('sends the photo first, as a call photo, then cites it', async () => {
    await openSheet()
    await addPhoto('scores')
    await write('Le nouveau tableau des scores est en ligne.')
    await send()

    const upload = mockServer.received('POST', MEDIA)[0]
    expect(formField(upload?.body, 'kind')).toBe('call')
    await waitFor(() => expect(sentCalls()).toHaveLength(1))
    expect(sentCalls()[0]).toMatchObject({ photoId: kit().media(101).id })
  })

  it('sends one call on a double tap on « Envoyer »', async () => {
    const answer = deferred<{ ok: false; error: 'internal' }>()
    mockServer.answer('POST', CALLS, () => answer.promise)
    await openSheet()
    await write('Un appel')

    await send()
    await send()

    expect(sentCalls()).toHaveLength(1)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('refuses Escape, the scrim and « Annuler » while sending', async () => {
    const answer = deferred<{ ok: false; error: 'internal' }>()
    mockServer.answer('POST', CALLS, () => answer.promise)
    await openSheet()
    await write('Un appel')
    await send()

    await pressEscape(T.callSheet)
    await fireEvent.press(screen.getByRole('button', { name: T.callCancel }))
    await pressScrim()
    expect(screen.getByRole('header', { name: T.callSheet })).toBeTruthy()
    expect(departures()).toBe(0)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('says that the five calls of the day are used up, keeping the text', async () => {
    // Le quota du projet : le client lit le code `project_calls_limited` et pose `projectLimit`.
    mockServer.answer('POST', CALLS, () => ({
      ok: false,
      error: 'rateLimited',
      projectLimit: true,
    }))
    await openSheet()
    await write('Un sixième appel')
    await send()

    await waitFor(() => expect(shown(T.callLimited)).toBe(true))
    expect(shown(RATE_LIMITED)).toBe(false)
    expect(field()).toHaveDisplayValue('Un sixième appel')
    expect(departures()).toBe(0)
  })

  it('says « trop de demandes » for the member quota, not the five calls of the project', async () => {
    // Le quota du membre (20 appels en 24 h) : le même 429, sans `project_calls_limited`.
    mockServer.answer('POST', CALLS, () => ({ ok: false, error: 'rateLimited' }))
    await openSheet()
    await write('Un appel de trop')
    await send()

    await waitFor(() => expect(shown(RATE_LIMITED)).toBe(true))
    expect(shown(T.callLimited)).toBe(false)
    expect(field()).toHaveDisplayValue('Un appel de trop')
  })

  it('says the call could not be sent, keeping the text', async () => {
    mockServer.answer('POST', CALLS, () => ({ ok: false, error: 'internal' }))
    await openSheet()
    await write('Un appel')
    await send()

    await waitFor(() => expect(shown(T.callError)).toBe(true))
    expect(field()).toHaveDisplayValue('Un appel')
  })

  it('keeps the text and asks for the photo again on invalid_photo', async () => {
    mockServer.answer('POST', CALLS, () => ({ ok: false, error: 'invalidPhoto' }))
    await openSheet()
    await addPhoto('scores')
    await write('Le nouveau tableau des scores')
    await send()

    await waitFor(() => expect(shown(T.callInvalidPhoto)).toBe(true))
    expect(field()).toHaveDisplayValue('Le nouveau tableau des scores')
    // La photo perdue quitte la feuille : « Ajouter une photo » revient.
    expect(getControl(/^Ajouter/)).toBeTruthy()
  })
})

// --- Fermer et le brouillon ---

describe('leaving the sheet and its draft', () => {
  it('closes on « Annuler » without asking, and keeps the draft', async () => {
    const view = await openSheet()
    await write('Un appel à finir')

    await fireEvent.press(screen.getByRole('button', { name: T.callCancel }))

    expect(departures()).toBe(1)
    // Aucune fenêtre « Abandonner » : le brouillon est gardé sans question.
    expect(screen.queryByRole('button', { name: fr.t(($) => $.common.discard) })).toBeNull()
    await reopen(view)
    expect(field()).toHaveDisplayValue('Un appel à finir')
  })

  it('closes on Escape, keeping the draft', async () => {
    const view = await openSheet()
    await write('Un appel à finir')

    await pressEscape(T.callSheet)

    expect(departures()).toBe(1)
    await reopen(view)
    expect(field()).toHaveDisplayValue('Un appel à finir')
  })

  it('closes on the scrim, keeping the draft', async () => {
    const view = await openSheet()
    await write('Un appel à finir')

    await pressScrim()

    await waitFor(() => expect(departures()).toBe(1))
    await reopen(view)
    expect(field()).toHaveDisplayValue('Un appel à finir')
  })

  it('lets the browser back close the sheet, keeping the draft', async () => {
    const view = await openSheet()
    await write('Un appel à finir')

    const event = await navigatorRemoves()

    expect(event.preventDefault).not.toHaveBeenCalled()
    await reopen(view)
    expect(field()).toHaveDisplayValue('Un appel à finir')
  })

  it('shows « Effacer le brouillon » on a sheet opened again with a draft, and empties it', async () => {
    const view = await openSheet()
    expect(control(T.clearDraft)).toBeNull()
    await write('Un appel à finir')
    await reopen(view)

    await fireEvent.press(getControl(T.clearDraft))

    expect(field()).toHaveDisplayValue('')
    expect(control(T.clearDraft)).toBeNull()
  })

  it('forgets the draft once the call is sent', async () => {
    const view = await openSheet()
    await write('Un appel envoyé')
    await send()
    await waitFor(() => expect(sentCalls()).toHaveLength(1))

    await reopen(view)

    expect(field()).toHaveDisplayValue('')
    expect(control(T.clearDraft)).toBeNull()
  })
})

// --- Qui peut l'ouvrir ---

describe('who can open the sheet', () => {
  it('never lets a tester launch a call', async () => {
    mockSession({ user: { id: ines.id, name: ines.name } })
    mockServer.corner = testerCorner
    mockServer.project = { ...project, isMine: false, isTester: true }
    await renderWithProviders(<CallSheet id={id} />)

    await waitFor(() => expect(refusedSheet()).toBe(true))
    expect(screen.queryByRole('button', { name: T.callSend })).toBeNull()
  })
})
