// Tests du fil d'un testeur vu par l'auteur (R7b, docs/scenarios/refonte.md, « Les retours », « Réglé
// dans la v1.3 », « Retirer et quitter ») : la page `/projects/<id>/testers/threads/<testerId>`, ses
// bulles du plus ancien au plus récent, l'issue, l'appareil et la capture d'un retour, les menus
// (supprimer le sien, signaler celui de l'autre, « Marquer comme réglé » / « Remettre à traiter »),
// « Afficher les précédents », le compositeur et son brouillon, la lecture seule (ancien testeur,
// coin fermé), et le coin à côté sur ordinateur.
//
// Ce que ces tests supposent de l'écran (plan R7b, U5, ui-B1, B2, B8, A2, A9 ; à corriger si le code
// en décide autrement) :
// - `TesterThreadScreen({ id, member })`, monté par `app/projects/[id]/testers/threads/[member].tsx` ;
//   il montre `TesterThreadView` (partagé avec l'onglet « Retours » du testeur) ; sur ordinateur, une
//   fois la page hydratée, il rend le coin et ce fil à droite (ui-B1) ;
// - le nom du testeur et son état (actuel ou ancien) viennent de l'API (la liste des fils ou le
//   coin : le faux serveur rend les deux) ;
// - le compositeur est `CommentComposer` (ui-B2) : champ nommé « Répondre à Inès Martin », bouton
//   « Envoyer la réponse » ; son brouillon passe par `testers/drafts.ts` ;
// - le reste est dans `TestersCorner.testkit.tsx` (faux serveur, routeur, textes).
import { nameOf } from '@ruche/i18n'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { ScrollView } from 'react-native'
import { clearAllDrafts } from '../testers/drafts'
import { passTapGuard } from '../testing/dialog'
import { reportsOpened } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import {
  authorCorner,
  closedFormer,
  control,
  deferred,
  deviceName,
  focusedLabels,
  getControl,
  id,
  ines,
  inesThread,
  lea,
  messageMenu,
  messageOf,
  mockNav,
  mockServer,
  openThreads,
  outcomeName,
  project,
  replyTo,
  resetCornerMocks,
  settledIn,
  shown,
  T,
  testers,
  threadOf,
} from './TestersCorner.testkit'
import { TesterThreadScreen } from './TesterThreadScreen'

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
jest.mock('../profile/api', () => ({ getMe: jest.fn(async () => null) }))
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

const threadPath = `/projects/${id}/testers/threads/${ines.id}`
let restoreWindow: (() => void) | null = null

beforeEach(() => {
  resetCornerMocks(threadPath)
  clearAllDrafts()
  mockNav.params = { id, member: ines.id }
  mockSession({ user: { id: lea.id, name: lea.name } })
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})
afterEach(() => {
  restoreWindow?.()
  restoreWindow = null
})

// --- Les aides ---

const [feedback, authorReply, testerReply] = inesThread('author')
if (!feedback?.text || !authorReply?.text || !testerReply?.text) throw new Error('fixtures')

/** Ouvre le fil d'Inès et attend son retour. */
const openThread = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <TesterThreadScreen id={id} member={ines.id} />
    </ToastProvider>,
  )
  await screen.findByText(containing(feedback.text ?? ''))
  return view
}

const focused = () => focusedLabels(focusWithoutScroll, focusAndReveal, moveReaderTo)

const chooseInMenu = async (menu: string, item: string) => {
  await fireEvent.press(screen.getByRole('button', { name: menu }))
  await fireEvent.press(await screen.findByRole('menuitem', { name: item }))
}

/** Le champ du compositeur (« Répondre à Inès Martin »), ou null. */
const composer = () => screen.queryByLabelText(containing(replyTo(ines.name)))

/** L'ordre des textes à l'écran : la position de chacun dans la suite des textes affichés. */
const orderOf = (...texts: string[]) => {
  const all = screen.getAllByText(/.+/).map((node) => {
    const children = node.props.children
    return typeof children === 'string' ? children : ''
  })
  return texts.map((text) => all.findIndex((one) => one.includes(text)))
}

/** Le fil d'Inès devenue ancienne testeuse (partie, retirée ou bloquée). */
const inesHasLeft = () => {
  mockServer.corner = {
    ...authorCorner,
    testers: testers.filter((one) => one.id !== ines.id),
    testerCount: 11,
  }
  mockServer.threadPages.open.set('', {
    items: [threadOf(ines, { unread: false }, false), ...openThreads.slice(1)],
    nextCursor: null,
  })
}

// --- Ce que le fil montre ---

describe('the thread of a tester', () => {
  it('shows the messages from the oldest to the newest', async () => {
    await openThread()

    const [first, second, third] = orderOf(
      feedback.text ?? '',
      authorReply.text ?? '',
      testerReply.text ?? '',
    )
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(second ?? -1)
    expect(second).toBeLessThan(third ?? -1)
  })

  it('names the tester in the heading of the thread, with the project', async () => {
    await openThread()

    expect(screen.getByRole('header', { name: ines.name })).toBeTruthy()
    expect(shown(project.title)).toBe(true)
  })

  it('reads the outcome as « Ça a marché : En partie »', async () => {
    await openThread()

    const spoken = fr.t(($) => $.project.testers.feedback.outcomeSpoken, {
      outcome: outcomeName('partly'),
    })
    expect(screen.getAllByLabelText(containing(spoken)).length).toBeGreaterThan(0)
  })

  it('shows the device of a feedback', async () => {
    await openThread()

    expect(shown(deviceName('phone'))).toBe(true)
  })

  it('names the capture of a feedback by a fixed sentence', async () => {
    await openThread()

    const name = fr.t(($) => $.project.testers.feedback.captureName, {
      nameOf: nameOf('fr', ines.name),
    })
    expect(screen.getByLabelText(name)).toBeTruthy()
  })

  it('describes each message menu by the message text', async () => {
    await openThread()

    for (const message of [feedback, authorReply, testerReply])
      expect(screen.getByRole('button', { name: messageMenu(message.text ?? '') })).toBeTruthy()
  })

  it('marks the thread as read once shown', async () => {
    await openThread()

    await waitFor(() =>
      expect(mockServer.received('POST', new RegExp(`/threads/${ines.id}/read$`))).toHaveLength(1),
    )
  })

  it('shows the page not found when the API does not know the thread', async () => {
    mockServer.answer('GET', /\/messages$/, () => ({ ok: false, error: 'notFound' }))
    mockServer.corner = null
    await renderWithProviders(<TesterThreadScreen id={id} member={ines.id} />)

    expect(await screen.findByText(containing(T.notFound))).toBeTruthy()
  })
})

// --- Les menus des messages ---

describe('the menus of the messages', () => {
  it('lets the author delete his own reply, never report it', async () => {
    await openThread()
    await fireEvent.press(screen.getByRole('button', { name: messageMenu(authorReply.text ?? '') }))

    expect(await screen.findByRole('menuitem', { name: T.messageDelete })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: T.report })).toBeNull()
  })

  it('lets the author report a message of the tester, never delete it', async () => {
    await openThread()
    await fireEvent.press(screen.getByRole('button', { name: messageMenu(testerReply.text ?? '') }))

    expect(screen.queryByRole('menuitem', { name: T.messageDelete })).toBeNull()
    await fireEvent.press(await screen.findByRole('menuitem', { name: T.report }))
    await waitFor(() =>
      expect(reportsOpened(mockNav.router.push, mockNav.router.navigate)).toEqual([
        expect.objectContaining({ kind: 'message', id: testerReply.id }),
      ]),
    )
  })

  it('deletes his own reply once confirmed', async () => {
    await openThread()
    await chooseInMenu(messageMenu(authorReply.text ?? ''), T.messageDelete)
    await screen.findByRole('header', { name: T.messageDeleteTitle })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.messageDeleteConfirm }))

    await waitFor(() =>
      expect(
        mockServer.received('DELETE', new RegExp(`/messages/${authorReply.id}$`)),
      ).toHaveLength(1),
    )
    await waitFor(() => expect(screen.queryByText(containing(authorReply.text ?? ''))).toBeNull())
  })

  it('moves the focus to the previous message after deleting one’s own', async () => {
    await openThread()
    await chooseInMenu(messageMenu(authorReply.text ?? ''), T.messageDelete)
    await screen.findByRole('header', { name: T.messageDeleteTitle })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.messageDeleteConfirm }))

    await waitFor(() => expect(screen.queryByText(containing(authorReply.text ?? ''))).toBeNull())
    // Le message d'avant est le retour d'Inès : sa bulle, ou son menu « … ».
    await waitFor(() =>
      expect(focused().at(-1)).toMatch(
        new RegExp(`${nameOf('fr', ines.name)}|${(feedback.text ?? '').slice(0, 12)}`),
      ),
    )
  })

  it('offers « Marquer comme réglé » on a feedback, never on a reply', async () => {
    await openThread()

    await fireEvent.press(screen.getByRole('button', { name: messageMenu(feedback.text ?? '') }))
    expect(await screen.findByRole('menuitem', { name: T.settle })).toBeTruthy()
  })

  it('offers no « Marquer comme réglé » on a reply of the tester', async () => {
    await openThread()

    await fireEvent.press(screen.getByRole('button', { name: messageMenu(testerReply.text ?? '') }))
    await screen.findByRole('menuitem', { name: T.report })
    expect(screen.queryByRole('menuitem', { name: T.settle })).toBeNull()
  })

  it('toggles « Marquer comme réglé » to « Remettre à traiter », « Réglé » shown under the feedback', async () => {
    await openThread()
    expect(shown(T.settled)).toBe(false)

    await chooseInMenu(messageMenu(feedback.text ?? ''), T.settle)

    await waitFor(() =>
      expect(
        mockServer.received('POST', new RegExp(`/messages/${feedback.id}/settled$`)),
      ).toHaveLength(1),
    )
    await waitFor(() => expect(shown(T.settled)).toBe(true))
    await chooseInMenu(messageMenu(feedback.text ?? ''), T.unsettle)

    await waitFor(() =>
      expect(
        mockServer.received('DELETE', new RegExp(`/messages/${feedback.id}/settled$`)),
      ).toHaveLength(1),
    )
    await waitFor(() => expect(screen.queryAllByText(new RegExp(`^${T.settled}$`))).toHaveLength(0))
  })

  it('shows « Réglé dans la v1.3 » under a feedback settled by an update', async () => {
    mockServer.setThread(ines.id, [
      {
        ...feedback,
        settled: {
          at: kit().daysAgo(0, 1),
          update: { id: kit().uuid('e', 1), version: 'v1.3', createdAt: kit().daysAgo(0, 1) },
        },
      },
      authorReply,
    ])
    await openThread()

    expect(shown(settledIn('v1.3'))).toBe(true)
  })
})

// --- Les messages précédents ---

describe('the earlier messages', () => {
  it('moves the focus to the oldest loaded message when « Afficher les précédents » disappears', async () => {
    const oldest = messageOf(0, {
      kind: 'feedback',
      outcome: 'no',
      text: 'Le tout premier essai a planté au démarrage.',
    })
    mockServer.setThread(ines.id, [feedback, authorReply, testerReply], 'p2')
    mockServer.messagePages.get(ines.id)?.set('p2', { items: [oldest], nextCursor: null })
    await openThread()

    await fireEvent.press(getControl(T.showEarlier))

    expect(await screen.findByText(containing(oldest.text ?? ''))).toBeTruthy()
    expect(control(T.showEarlier)).toBeNull()
    await waitFor(() =>
      expect(focused().at(-1)).toMatch(new RegExp(`${nameOf('fr', ines.name)}|premier essai`)),
    )
  })
})

// --- Répondre ---

describe('replying in the thread', () => {
  it('offers a composer named « Répondre à Inès Martin »', async () => {
    await openThread()

    expect(composer()).toBeTruthy()
    expect(screen.getByRole('button', { name: T.replyLabel })).toBeTruthy()
  })

  it('keeps the focus in the field and empties it once the reply is sent', async () => {
    await openThread()
    const field = composer()
    if (!field) throw new Error('a composer expected')
    await fireEvent(field, 'focus')
    await fireEvent.changeText(field, 'Corrigé dans la prochaine version.')
    for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: T.replyLabel }))

    await waitFor(() => expect(composer()).toHaveDisplayValue(''))
    const posts = mockServer.received('POST', new RegExp(`/threads/${ines.id}/messages$`))
    expect(posts.map((one) => one.body)).toEqual([
      { kind: 'reply', text: 'Corrigé dans la prochaine version.' },
    ])
    expect(await screen.findByText(containing('Corrigé dans la prochaine version.'))).toBeTruthy()
    // Le focus ne part pas ailleurs (ni sur la bulle envoyée, ni en haut de la page).
    expect(focused().filter((label) => !label.includes(replyTo(ines.name)))).toEqual([])
  })

  it('sends one reply on a double tap', async () => {
    const answer = deferred<{ ok: false; error: 'internal' }>()
    mockServer.answer('POST', /\/messages$/, () => answer.promise)
    await openThread()
    const field = composer()
    if (!field) throw new Error('a composer expected')
    await fireEvent.changeText(field, 'Merci !')

    await fireEvent.press(screen.getByRole('button', { name: T.replyLabel }))
    await fireEvent.press(screen.getByRole('button', { name: T.replyLabel }))

    expect(mockServer.received('POST', /\/messages$/)).toHaveLength(1)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })

  it('keeps the reply and says it could not be sent', async () => {
    mockServer.answer('POST', /\/messages$/, () => ({ ok: false, error: 'internal' }))
    await openThread()
    const field = composer()
    if (!field) throw new Error('a composer expected')
    await fireEvent.changeText(field, 'Merci !')

    await fireEvent.press(screen.getByRole('button', { name: T.replyLabel }))

    await waitFor(() => expect(shown(T.replyError)).toBe(true))
    expect(composer()).toHaveDisplayValue('Merci !')
  })

  it('keeps the reply written when the page is left and opened again', async () => {
    const view = await openThread()
    const field = composer()
    if (!field) throw new Error('a composer expected')
    await fireEvent.changeText(field, 'Un brouillon de réponse')

    await view.unmount()
    await renderWithProviders(
      <ToastProvider>
        <TesterThreadScreen id={id} member={ines.id} />
      </ToastProvider>,
    )
    await screen.findByText(containing(feedback.text ?? ''))

    expect(composer()).toHaveDisplayValue('Un brouillon de réponse')
  })
})

// --- La lecture seule ---

describe('a thread in read only', () => {
  it('shows no composer in the thread of a former tester, and says why', async () => {
    inesHasLeft()
    await openThread()

    await waitFor(() => expect(shown(closedFormer(ines.name))).toBe(true))
    expect(composer()).toBeNull()
    expect(screen.queryByRole('button', { name: T.replyLabel })).toBeNull()
  })

  it('still lets the author report a message of a former tester', async () => {
    inesHasLeft()
    await openThread()

    await fireEvent.press(screen.getByRole('button', { name: messageMenu(testerReply.text ?? '') }))
    expect(await screen.findByRole('menuitem', { name: T.report })).toBeTruthy()
  })

  it('shows no composer in a closed corner, and says why', async () => {
    mockServer.corner = { ...authorCorner, closed: true }
    await openThread()

    await waitFor(() => expect(shown(T.closedCorner) || shown(T.closedAuthor)).toBe(true))
    expect(composer()).toBeNull()
  })

  it('offers no « Marquer comme réglé » in a closed corner', async () => {
    mockServer.corner = { ...authorCorner, closed: true }
    await openThread()

    await fireEvent.press(screen.getByRole('button', { name: messageMenu(feedback.text ?? '') }))
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: T.settle })).toBeNull())
  })
})

// --- Corrections après relectures (R7b, K10, K11, K13) ---

/** L'élément de liste (la bulle) qui contient ce texte : on remonte l'arbre jusqu'à lui. */
type TreeNode = { props: Record<string, unknown>; parent: TreeNode | null }
const itemOf = (text: string) => {
  let node = screen.getByText(containing(text)) as unknown as TreeNode | null
  while (node && node.props.role !== 'listitem') node = node.parent
  if (!node) throw new Error(`no list item around « ${text} »`)
  return node as unknown as Parameters<typeof within>[0]
}

const settling = fr.t(($) => $.project.testers.thread.settling)
const settleError = fr.t(($) => $.project.testers.thread.settleError)
const emptyAuthor = fr.t(($) => $.project.testers.thread.emptyAuthor)

describe('the corrections after the reviews', () => {
  it('moves the focus to the empty thread after deleting the only message of a read-only thread', async () => {
    inesHasLeft()
    mockServer.setThread(ines.id, [authorReply])
    await renderWithProviders(
      <ToastProvider>
        <TesterThreadScreen id={id} member={ines.id} />
      </ToastProvider>,
    )
    await screen.findByText(containing(authorReply.text ?? ''))
    await chooseInMenu(messageMenu(authorReply.text ?? ''), T.messageDelete)
    await screen.findByRole('header', { name: T.messageDeleteTitle })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.messageDeleteConfirm }))

    await waitFor(() => expect(screen.queryByText(containing(authorReply.text ?? ''))).toBeNull())
    // Ni message ni champ : le focus va à la phrase qui dit que le fil est vide.
    await waitFor(() => expect(focused().at(-1)).toBe(emptyAuthor))
  })

  it('opens the thread on its latest message', async () => {
    const scrollToEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd')
    scrollToEnd.mockClear()
    await openThread()

    await waitFor(() => expect(scrollToEnd).toHaveBeenCalledWith({ animated: false }))
    const calls = scrollToEnd.mock.calls.length
    // Une fois : une relecture du fil (une réponse envoyée) ne fait pas sauter la page.
    const field = composer()
    if (!field) throw new Error('a composer expected')
    await fireEvent.changeText(field, 'Corrigé.')
    await fireEvent.press(screen.getByRole('button', { name: T.replyLabel }))
    await screen.findByText(containing('Corrigé.'))
    expect(scrollToEnd.mock.calls.length).toBe(calls)
  })

  it('shows « Enregistrement… » under the feedback while « Marquer comme réglé » is sent', async () => {
    const answer = deferred<{ ok: true; data: null }>()
    mockServer.answer('POST', /\/settled$/, () => answer.promise)
    await openThread()

    await chooseInMenu(messageMenu(feedback.text ?? ''), T.settle)

    await waitFor(() =>
      expect(within(itemOf(feedback.text ?? '')).getByText(settling)).toBeTruthy(),
    )
    await act(async () => answer.resolve({ ok: true, data: null }))
    await waitFor(() => expect(shown(settling)).toBe(false))
  })

  it('shows a failed « Marquer comme réglé » next to the feedback it concerns', async () => {
    mockServer.answer('POST', /\/settled$/, () => ({ ok: false, error: 'internal' }))
    await openThread()

    await chooseInMenu(messageMenu(feedback.text ?? ''), T.settle)

    await waitFor(() =>
      expect(within(itemOf(feedback.text ?? '')).getByText(settleError)).toBeTruthy(),
    )
    // Une seule fois dans la page : plus sous tout le fil.
    expect(screen.getAllByText(settleError)).toHaveLength(1)
  })
})

// --- Sur ordinateur ---

describe('on a wide window', () => {
  it('shows the corner and its list beside the thread', async () => {
    restoreWindow = setDesktopWindow()
    await openThread()

    expect(await screen.findByRole('tab', { name: T.feedback })).toBeTruthy()
    expect(screen.getAllByText(kit().sam.name).length).toBeGreaterThan(0)
  })
})
