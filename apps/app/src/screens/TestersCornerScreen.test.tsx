// Tests de la page « Le coin des testeurs » d'un projet (R7b, docs/scenarios/refonte.md, « Le coin
// des testeurs », « Les appels à tester », « Les retours », « Retirer et quitter ») : qui y entre,
// « 12 testeurs » et la liste de l'auteur, retirer un testeur, quitter les testeurs, les onglets et
// l'adresse (`?tab=`), l'onglet « Appels », l'onglet « Retours » (auteur, testeur, ancien testeur),
// le coin fermé et les deux colonnes sur ordinateur.
//
// Ce que ces tests supposent de l'écran (plan R7b, U4, ui-B1, B6, B8, B9 ; à corriger si le code
// en décide autrement) :
// - `TestersCornerScreen({ id, member? })`, monté par `app/projects/[id]/testers/index.tsx` ;
//   `member` (donné par `threads/[member]` sur ordinateur) ouvre le fil de ce testeur à droite de
//   la liste, une fois la page hydratée ;
// - l'onglet vient de `?tab=calls|feedback` (`useLocalSearchParams`), lu après `useHydrated()` ; un
//   onglet inconnu ouvre « Appels » ; changer d'onglet passe par `router.setParams` ou
//   `router.replace`, jamais par une nouvelle entrée d'historique ;
// - les onglets sont des `tab` (`ui/Tabs`), les filtres « À traiter » / « Réglés » des `radio`
//   (`ui/Segmented`, nom lu « À traiter, 3 fils ») ;
// - le reste est dans `TestersCorner.testkit.tsx` (faux serveur, routeur, textes).
import { palettes } from '@ruche/brand'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { clearAllDrafts } from '../testers/drafts'
import { passTapGuard } from '../testing/dialog'
import { reportsOpened } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusAndReveal, focusWithoutScroll, moveReaderTo } from '../ui/focus'
import { ToastProvider } from '../ui/theme/toast'
import {
  authorCorner,
  callMenu,
  callNo,
  calls,
  control,
  cornerPath,
  deferred,
  filterName,
  focusedLabels,
  formerCorner,
  getControl,
  id,
  ines,
  lea,
  mockNav,
  mockServer,
  openThreads,
  project,
  pushed,
  removeBody,
  removeTitle,
  replaced,
  resetCornerMocks,
  sam,
  settledThreads,
  showMore,
  shown,
  T,
  testerCorner,
  testerCount,
  testerMenu,
  testers,
  threadOf,
} from './TestersCorner.testkit'
import { TestersCornerScreen } from './TestersCornerScreen'

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
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
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
// La page hydratée (web) : un test la laisse « pas encore hydratée » pour la mise en page d'avant.
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))

let restoreWindow: (() => void) | null = null

beforeEach(() => {
  resetCornerMocks()
  clearAllDrafts()
  mockHydrated = true
  // Léa, l'autrice ; un test pose Inès (testeuse) ou Max (un autre membre).
  mockSession({ user: { id: lea.id, name: lea.name } })
  for (const fn of [focusWithoutScroll, focusAndReveal, moveReaderTo]) jest.mocked(fn).mockClear()
})
afterEach(() => {
  restoreWindow?.()
  restoreWindow = null
})

// --- Les aides ---

const seenBy = (member: { id: string; name: string }) =>
  mockSession({ user: { id: member.id, name: member.name } })

/** Le coin vu par Inès, testeuse (son fil : son retour et la réponse de Léa). */
const seenByInes = () => {
  seenBy(ines)
  mockServer.corner = testerCorner
  mockServer.project = { ...project, isMine: false, isTester: true, testerCount: null }
  mockServer.setThread(
    ines.id,
    kit()
      .inesThread('tester')
      .map((one) => one),
  )
}

/** Ouvre la page et attend le titre du coin. */
const openCorner = async (member?: string) => {
  const view = await renderWithProviders(
    <ToastProvider>
      <TestersCornerScreen id={id} {...(member ? { member } : {})} />
    </ToastProvider>,
  )
  await waitFor(() => expect(shown(project.title)).toBe(true))
  return view
}

const tab = (name: string) => screen.getByRole('tab', { name })
const isSelected = (name: string) => {
  const found = tab(name)
  return Boolean(found.props.accessibilityState?.selected ?? found.props['aria-selected'] ?? false)
}

const focused = () => focusedLabels(focusWithoutScroll, focusAndReveal, moveReaderTo)

/** Ouvre le menu « … » nommé `menu`, puis touche son choix `item`. */
const chooseInMenu = async (menu: string, item: string) => {
  await fireEvent.press(screen.getByRole('button', { name: menu }))
  await fireEvent.press(await screen.findByRole('menuitem', { name: item }))
}

const dialogTitled = (title: string) => screen.queryByRole('header', { name: title })

/** Le texte de chaque appel, dans l'ordre de la page. */
const callOrder = () =>
  calls
    .map((call) => ({ call, at: screen.queryAllByText(call.text)[0] }))
    .filter((one) => one.at)
    .map((one) => one.call.text)

// --- Qui entre dans le coin ---

describe('who enters the testers corner', () => {
  it('opens with « Retour », the project title and the tabs « Appels » and « Retours »', async () => {
    await openCorner()

    expect(getControl(/^Retour$/)).toBeTruthy()
    expect(shown(project.title)).toBe(true)
    expect(screen.getByRole('tab', { name: T.calls })).toBeTruthy()
    expect(screen.getByRole('tab', { name: T.feedback })).toBeTruthy()
    expect(mockServer.received('GET', /\/testers$/)).not.toHaveLength(0)
  })

  it('shows the page not found to another member', async () => {
    seenBy({ id: 'u2', name: 'Max' })
    mockServer.corner = null
    mockServer.project = { ...project, isMine: false }
    await renderWithProviders(<TestersCornerScreen id={id} />)

    expect(await screen.findByText(containing(T.notFound))).toBeTruthy()
    // Témoin : rien du coin ne paraît, ni les onglets ni les appels.
    expect(screen.queryByRole('tab', { name: T.calls })).toBeNull()
    expect(shown(calls[0]?.text ?? '')).toBe(false)
  })

  it('shows the page not found to a visitor', async () => {
    mockSession(null)
    mockServer.corner = null
    await renderWithProviders(<TestersCornerScreen id={id} />)

    await waitFor(() =>
      expect(shown(T.notFound) || pushed().length + replaced().length > 0).toBe(true),
    )
    expect(screen.queryByRole('tab', { name: T.calls })).toBeNull()
  })

  it('shows the page not found to a tester while the corner is closed', async () => {
    seenBy(ines)
    // Projet retiré, privé ou auteur suspendu : l'API répond 404 aux testeurs.
    mockServer.corner = null
    mockServer.project = { ...project, isMine: false, isTester: true }
    await renderWithProviders(<TestersCornerScreen id={id} />)

    expect(await screen.findByText(containing(T.notFound))).toBeTruthy()
  })

  it('says the corner could not load, with « Réessayer », when the API fails', async () => {
    mockServer.answer('GET', /\/testers$/, () => ({ ok: false, error: 'internal' }))
    await renderWithProviders(<TestersCornerScreen id={id} />)

    await waitFor(() => expect(shown(T.cornerLoadError)).toBe(true))
    expect(getControl(T.retry)).toBeTruthy()
  })
})

// --- « 12 testeurs » et la liste ---

describe('« 12 testeurs » and the list of testers', () => {
  it('shows the author « 12 testeurs » as a button that opens the list', async () => {
    await openCorner()

    const count = screen.getByRole('button', { name: new RegExp(`^${testerCount(12)}`) })
    // Repliée d'abord : aucun nom de testeur.
    expect(shown(testers[0]?.name ?? '')).toBe(false)
    await fireEvent.press(count)

    expect(await screen.findByText(ines.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: testerMenu(ines.name) })).toBeTruthy()
  })

  it('lists the four most recent testers first, then « Afficher les 8 autres »', async () => {
    await openCorner()
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${testerCount(12)}`) }))

    for (const tester of testers.slice(0, 4))
      expect(await screen.findByText(tester.name)).toBeTruthy()
    expect(shown(testers[4]?.name ?? '')).toBe(false)
    await fireEvent.press(getControl(showMore(8)))

    for (const tester of testers) expect(await screen.findByText(tester.name)).toBeTruthy()
  })

  it('shows « 12 testeurs » as plain text to a tester, without the list', async () => {
    seenByInes()
    await openCorner()

    expect(await screen.findByText(testerCount(12))).toBeTruthy()
    expect(screen.queryByRole('button', { name: new RegExp(`^${testerCount(12)}`) })).toBeNull()
    // Les testeurs ne se voient pas entre eux.
    expect(shown(sam.name)).toBe(false)
    expect(screen.queryByRole('button', { name: testerMenu(sam.name) })).toBeNull()
  })
})

// --- Retirer un testeur ---

describe('removing a tester', () => {
  const openList = async () => {
    await openCorner()
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${testerCount(12)}`) }))
    await screen.findByText(ines.name)
  }

  it('names the member, never « Elle », in the removal confirmation', async () => {
    await openList()
    await chooseInMenu(testerMenu(ines.name), T.remove)

    expect(await screen.findByRole('header', { name: removeTitle(ines.name) })).toBeTruthy()
    expect(shown(removeBody(ines.name))).toBe(true)
    expect(screen.queryAllByText(/\bElle\b/)).toHaveLength(0)
  })

  it('says in the remove dialog that the removal is silent and final', async () => {
    await openList()
    await chooseInMenu(testerMenu(ines.name), T.remove)

    await screen.findByRole('header', { name: removeTitle(ines.name) })
    // Le texte du scénario, mot pour mot : aucune notification, définitif, retours gardés.
    expect(shown(removeBody(ines.name))).toBe(true)
  })

  it('removes the tester once confirmed, with DELETE at …/testers/<member>', async () => {
    await openList()
    await chooseInMenu(testerMenu(ines.name), T.remove)
    await screen.findByRole('header', { name: removeTitle(ines.name) })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.removeConfirm }))

    await waitFor(() =>
      expect(mockServer.received('DELETE', new RegExp(`/testers/${ines.id}$`))).toHaveLength(1),
    )
    await waitFor(() => expect(screen.queryByText(ines.name)).toBeNull())
  })

  it('removes nobody when the dialog is cancelled', async () => {
    await openList()
    await chooseInMenu(testerMenu(ines.name), T.remove)
    await screen.findByRole('header', { name: removeTitle(ines.name) })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: kit().T.callCancel }))

    await waitFor(() => expect(dialogTitled(removeTitle(ines.name))).toBeNull())
    expect(mockServer.received('DELETE', /\/testers\/[^/]+$/)).toHaveLength(0)
    expect(screen.getByText(ines.name)).toBeTruthy()
  })

  it('moves the focus to the next tester after « Retirer » and reads « 11 testeurs »', async () => {
    await openList()
    await chooseInMenu(testerMenu(ines.name), T.remove)
    await screen.findByRole('header', { name: removeTitle(ines.name) })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.removeConfirm }))

    await waitFor(() => expect(shown(testerCount(11))).toBe(true))
    // Inès partie, le focus va au testeur suivant, Sam (sa ligne ou son menu « … »).
    await waitFor(() => expect(focused().at(-1)).toMatch(new RegExp(sam.name)))
  })

  it('sends one removal on a double tap on « Retirer »', async () => {
    const answer = deferred<{ ok: false; error: 'internal' }>()
    mockServer.answer('DELETE', new RegExp(`/testers/${ines.id}$`), () => answer.promise)
    await openList()
    await chooseInMenu(testerMenu(ines.name), T.remove)
    await screen.findByRole('header', { name: removeTitle(ines.name) })
    await passTapGuard()
    const confirm = screen.getByRole('button', { name: T.removeConfirm })

    await fireEvent.press(confirm)
    await fireEvent.press(confirm)

    expect(mockServer.received('DELETE', new RegExp(`/testers/${ines.id}$`))).toHaveLength(1)
    await act(async () => answer.resolve({ ok: false, error: 'internal' }))
  })
})

// --- Quitter les testeurs ---

describe('quitting the testers from the corner', () => {
  it('offers « Quitter les testeurs » in the menu of the corner, to a tester only', async () => {
    seenByInes()
    await openCorner()

    await fireEvent.press(screen.getByRole('button', { name: T.cornerMenu }))
    expect(await screen.findByRole('menuitem', { name: T.quit })).toBeTruthy()
  })

  it('never offers « Quitter les testeurs » to the author', async () => {
    await openCorner()

    const menu = screen.queryByRole('button', { name: T.cornerMenu })
    if (menu) await fireEvent.press(menu)
    expect(screen.queryByRole('menuitem', { name: T.quit })).toBeNull()
  })

  it('asks before quitting, saying the feedback stays readable by the author', async () => {
    seenByInes()
    await openCorner()
    await chooseInMenu(T.cornerMenu, T.quit)

    expect(await screen.findByRole('header', { name: T.quitTitle })).toBeTruthy()
    expect(shown(fr.t(($) => $.project.testers.quitBody, { name: lea.name }))).toBe(true)
    // Rien ne part avant la confirmation.
    expect(mockServer.received('DELETE', /\/testers$/)).toHaveLength(0)
  })

  it('takes the member back to the project page after « Quitter les testeurs », focus on « Rejoindre les testeurs »', async () => {
    seenByInes()
    await openCorner()
    await chooseInMenu(T.cornerMenu, T.quit)
    await screen.findByRole('header', { name: T.quitTitle })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.quitConfirm }))

    await waitFor(() => expect(mockServer.received('DELETE', /\/testers$/)).toHaveLength(1))
    // La page du coin lui devient introuvable : on la remplace par celle du projet (pas d'entrée
    // d'historique qui y ramènerait), où « Rejoindre les testeurs » reçoit le focus.
    // ?focus=join : la page du projet pose le focus sur « Rejoindre les testeurs » (décision du 11/11).
    await waitFor(() => expect(replaced()).toContain(`/projects/${id}?focus=join`))
    expect(pushed().filter((path) => path.startsWith(cornerPath))).toEqual([])
  })
})

// --- Les onglets et l'adresse ---

describe('the tabs and the address', () => {
  it('opens « Appels » by default', async () => {
    await openCorner()

    expect(isSelected(T.calls)).toBe(true)
    expect(isSelected(T.feedback)).toBe(false)
  })

  it('opens « Retours » from ?tab=feedback once hydrated, and an unknown tab falls back to « Appels »', async () => {
    mockNav.params = { id, tab: 'feedback' }
    const view = await openCorner()

    await waitFor(() => expect(isSelected(T.feedback)).toBe(true))
    mockNav.params = { id, tab: 'nimporte' }
    await view.rerender(
      <ToastProvider>
        <TestersCornerScreen id={id} />
      </ToastProvider>,
    )
    await waitFor(() => expect(isSelected(T.calls)).toBe(true))
  })

  it('keeps « Appels » until the page is hydrated, even with ?tab=feedback', async () => {
    mockHydrated = false
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()

    expect(isSelected(T.feedback)).toBe(false)
  })

  it('changes tab without adding a browser history entry', async () => {
    await openCorner()

    await fireEvent.press(tab(T.feedback))

    await waitFor(() => expect(isSelected(T.feedback)).toBe(true))
    const setParams = mockNav.router.setParams.mock.calls.map(([params]) => params)
    expect(
      setParams.some((params) => params?.tab === 'feedback') ||
        replaced().some((path) => path.includes('tab=feedback')),
    ).toBe(true)
    expect(pushed()).toEqual([])
  })
})

// --- L'onglet « Appels » ---

describe('the tab « Appels »', () => {
  it('shows the calls from the newest to the oldest, with « Lancer un appel » for the author', async () => {
    await openCorner()

    await screen.findByText(calls[0]?.text ?? '')
    expect(callOrder()).toEqual(calls.map((call) => call.text))
    expect(getControl(T.launch)).toBeTruthy()
  })

  it('opens the sheet « Nouvel appel » from « Lancer un appel »', async () => {
    await openCorner()

    await fireEvent.press(getControl(T.launch))

    expect(pushed()).toContain(`${cornerPath}/new-call`)
  })

  it('shows the calls to a tester, without « Lancer un appel »', async () => {
    seenByInes()
    await openCorner()

    expect(await screen.findByText(calls[0]?.text ?? '')).toBeTruthy()
    expect(control(T.launch)).toBeNull()
  })

  it('names the call photo and the feedback capture', async () => {
    seenByInes()
    await openCorner()

    // La photo d'un appel : par la description que l'auteur a écrite.
    expect(await screen.findByLabelText(calls[1]?.photo?.description ?? '')).toBeTruthy()
    // La capture de son retour : une phrase fixe, jamais une description (juridique J8).
    await fireEvent.press(tab(T.feedback))
    expect(await screen.findByLabelText(T.captureNameMine)).toBeTruthy()
  })

  it('deletes a call of the author once confirmed', async () => {
    await openCorner()
    const call = calls[0]
    if (!call) throw new Error('a call expected')
    await screen.findByText(call.text)
    await chooseInMenu(callMenu(call.text), T.callDelete)
    await screen.findByRole('header', { name: T.callDeleteTitle })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.callDeleteConfirm }))

    await waitFor(() =>
      expect(mockServer.received('DELETE', new RegExp(`/calls/${call.id}$`))).toHaveLength(1),
    )
    await waitFor(() => expect(screen.queryByText(call.text)).toBeNull())
  })

  it('lets a tester report a call, never delete it', async () => {
    seenByInes()
    await openCorner()
    const call = calls[0]
    if (!call) throw new Error('a call expected')
    await screen.findByText(call.text)
    await fireEvent.press(screen.getByRole('button', { name: callMenu(call.text) }))

    expect(screen.queryByRole('menuitem', { name: T.callDelete })).toBeNull()
    await fireEvent.press(await screen.findByRole('menuitem', { name: T.report }))
    await waitFor(() =>
      expect(reportsOpened(mockNav.router.push, mockNav.router.navigate)).toEqual([
        expect.objectContaining({ kind: 'call', id: call.id }),
      ]),
    )
  })

  it('loads the next calls and moves the focus to the first new one', async () => {
    const older = callNo(7, 'Un appel plus ancien, de la semaine dernière.')
    mockServer.callPages.set('', { items: calls, nextCursor: 'p2' })
    mockServer.callPages.set('p2', { items: [older], nextCursor: null })
    await openCorner()
    await screen.findByText(calls[0]?.text ?? '')

    await fireEvent.press(getControl(T.callMore))

    expect(await screen.findByText(older.text)).toBeTruthy()
    expect(mockServer.received('GET', /\/calls$/).map((one) => one.query.get('cursor'))).toContain(
      'p2',
    )
    await waitFor(() => expect(focused().at(-1)).toMatch(/Un appel plus ancien/))
  })

  it('says there is no call yet, and invites the author to launch the first', async () => {
    mockServer.callPages.set('', { items: [], nextCursor: null })
    await openCorner()

    await waitFor(() => expect(shown(T.callEmptyAuthor)).toBe(true))
  })

  it('says there is no call yet to a tester', async () => {
    seenByInes()
    mockServer.callPages.set('', { items: [], nextCursor: null })
    await openCorner()

    await waitFor(() => expect(shown(T.callEmpty)).toBe(true))
    expect(shown(T.callEmptyAuthor)).toBe(false)
  })
})

// --- L'onglet « Retours », pour l'auteur ---

describe('the tab « Retours » of the author', () => {
  const openFeedback = async (member?: string) => {
    mockNav.params = { id, tab: 'feedback' }
    const view = await openCorner(member)
    await screen.findByText(ines.name)
    return view
  }

  it('shows a thread per tester, the newest first, with the filters « À traiter » and « Réglés »', async () => {
    await openFeedback()

    const names = openThreads.map((thread) => thread.tester.name)
    for (const name of names) expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(screen.getByLabelText(filterName('open', 3))).toBeTruthy()
    expect(screen.getByLabelText(filterName('settled', 1))).toBeTruthy()
    expect(mockServer.received('GET', /\/threads$/)[0]?.query.get('state') ?? 'open').toBe('open')
  })

  it('marks the unread thread in the name of its row', async () => {
    await openFeedback()

    const unread = fr.t(($) => $.project.testers.thread.rowName, { name: ines.name })
    expect(control(new RegExp(`^${unread}`))).toBeTruthy()
    // Témoin : le fil de Sam, lu, ne le dit pas.
    expect(
      control(new RegExp(`^${fr.t(($) => $.project.testers.thread.rowName, { name: sam.name })}`)),
    ).toBeNull()
  })

  it('says « Ne teste plus » on the thread of a former tester', async () => {
    await openFeedback()

    const former = openThreads[2]?.tester.name ?? ''
    expect(shown(former)).toBe(true)
    expect(shown(T.former)).toBe(true)
  })

  it('opens the thread of a tester from its row', async () => {
    await openFeedback()

    await fireEvent.press(getControl(new RegExp(`^${ines.name}`)))

    expect(pushed()).toContain(`${cornerPath}/threads/${ines.id}`)
  })

  it('shows the settled threads under « Réglés »', async () => {
    await openFeedback()

    await fireEvent.press(screen.getByLabelText(filterName('settled', 1)))

    expect(await screen.findByText(settledThreads[0]?.tester.name ?? '')).toBeTruthy()
    expect(mockServer.received('GET', /\/threads$/).map((one) => one.query.get('state'))).toContain(
      'settled',
    )
  })

  it('keeps the « À traiter » / « Réglés » filter when the list is empty or fails', async () => {
    mockServer.answer('GET', /\/threads$/, (sent) =>
      sent.query.get('state') === 'settled'
        ? { ok: false, error: 'internal' }
        : { ok: true, data: { items: openThreads, nextCursor: null, counts: mockServer.counts } },
    )
    await openFeedback()

    await fireEvent.press(screen.getByLabelText(filterName('settled', 1)))

    await waitFor(() => expect(shown(T.listLoadError)).toBe(true))
    const settled = screen.getByLabelText(filterName('settled', 1))
    expect(settled.props['aria-checked'] ?? settled.props.accessibilityState?.checked).toBe(true)
    expect(screen.getByLabelText(filterName('open', 3))).toBeTruthy()
  })

  it('says there is nothing to handle, the filters still there, when « À traiter » is empty', async () => {
    mockServer.threadPages.open.set('', { items: [], nextCursor: null })
    mockServer.counts = { open: 0, settled: 1 }
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()

    await waitFor(() => expect(shown(T.emptyOpen)).toBe(true))
    expect(screen.getByLabelText(filterName('open', 0))).toBeTruthy()
    expect(screen.getByLabelText(filterName('settled', 1))).toBeTruthy()
  })

  it('never shows the threads of the author to a tester', async () => {
    seenByInes()
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()

    await waitFor(() => expect(getControl(T.sendFeedback)).toBeTruthy())
    expect(mockServer.received('GET', /\/threads$/)).toHaveLength(0)
    expect(screen.queryByLabelText(filterName('open', 3))).toBeNull()
  })
})

// --- L'onglet « Retours », pour un testeur ---

describe('the tab « Retours » of a tester', () => {
  const openAsInes = async () => {
    seenByInes()
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()
  }

  it('shows the tester his only thread with the author, and « Envoyer un retour »', async () => {
    await openAsInes()

    expect(await screen.findByText(containing('Le score repart à zéro au niveau 3.'))).toBeTruthy()
    expect(screen.getByText(containing('Merci Inès, je regarde ce soir.'))).toBeTruthy()
    expect(getControl(T.sendFeedback)).toBeTruthy()
    expect(
      mockServer.received('GET', new RegExp(`/threads/${ines.id}/messages$`)),
    ).not.toHaveLength(0)
  })

  it('opens the sheet « Ton retour » from « Envoyer un retour »', async () => {
    await openAsInes()

    await fireEvent.press(await screen.findByRole('button', { name: T.sendFeedback }))

    expect(pushed()).toContain(`${cornerPath}/new-feedback`)
  })

  it('shows only « Envoyer un retour » to a tester who has not written yet', async () => {
    seenByInes()
    mockServer.setThread(ines.id, [])
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()

    expect(await screen.findByRole('button', { name: T.sendFeedback })).toBeTruthy()
    // Pas de compositeur tant qu'il n'y a rien à quoi répondre.
    expect(screen.queryByLabelText(kit().replyTo(lea.name))).toBeNull()
    expect(screen.queryByRole('button', { name: T.replyLabel })).toBeNull()
  })

  it('offers the composer « Répondre à Léa » under a thread that has messages', async () => {
    await openAsInes()

    expect(await screen.findByLabelText(containing(kit().replyTo(lea.name)))).toBeTruthy()
  })

  // R7b, K12 (correction 14) : sur téléphone, le compositeur collé au pied de l'écran, hors de la
  // zone qui défile, comme dans le fil de l'auteur ; « Envoyer un retour » reste dans le fil.
  it('pins the composer to the foot of the screen on a phone, « Envoyer un retour » in the thread', async () => {
    await openAsInes()

    const field = await screen.findByLabelText(containing(kit().replyTo(lea.name)))
    expect(insideScroller(field)).toBe(false)
    expect(insideScroller(getControl(T.sendFeedback))).toBe(true)
  })

  it('shows one honey action at a time to a tester who has written', async () => {
    await openAsInes()
    await screen.findByLabelText(containing(kit().replyTo(lea.name)))

    // La règle (une seule action miel), pas la couleur choisie : au plus un fond miel, actif ou non.
    const honey = (element: ReturnType<typeof screen.getByRole>) => {
      const background = StyleSheet.flatten(element.props.style)?.backgroundColor
      return background === palettes.day.honey || background === palettes.day.honeyDisabled
    }
    expect(screen.getAllByRole('button').filter(honey)).toHaveLength(1)
  })

  it('keeps « Envoyer un retour » in honey for a tester who has not written yet', async () => {
    seenByInes()
    mockServer.setThread(ines.id, [])
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()

    const send = await screen.findByRole('button', { name: T.sendFeedback })
    expect(StyleSheet.flatten(send.props.style)?.backgroundColor).toBe(palettes.day.honey)
  })
})

/** Vrai si l'élément est dans la zone qui défile de l'écran (un ScrollView le contient). */
const insideScroller = (element: unknown) => {
  let node = element as { type: unknown; parent: unknown } | null
  while (node) {
    if (node.type === 'RCTScrollView') return true
    node = node.parent as typeof node
  }
  return false
}

// --- L'ancien testeur ---

describe('a former tester', () => {
  it('shows a former tester only « Retours », his thread in read only, and a sentence that says so', async () => {
    seenBy(ines)
    mockServer.corner = formerCorner
    mockServer.project = { ...project, isMine: false, isTester: false, testerCount: null }
    mockServer.setThread(ines.id, kit().inesThread('tester'))
    await openCorner()

    expect(await screen.findByText(containing('Le score repart à zéro au niveau 3.'))).toBeTruthy()
    expect(shown(T.formerTester)).toBe(true)
    expect(screen.queryByRole('tab', { name: T.calls })).toBeNull()
    expect(control(T.sendFeedback)).toBeNull()
    expect(screen.queryByLabelText(containing(kit().replyTo(lea.name)))).toBeNull()
    expect(mockServer.received('GET', /\/calls$/)).toHaveLength(0)
    expect(shown(testerCount(12))).toBe(false)
  })
})

// --- Le coin fermé ---

describe('a closed corner', () => {
  const closed = { ...authorCorner, closed: true }

  it('tells the author his corner is closed, and hides « Lancer un appel »', async () => {
    mockServer.corner = closed
    await openCorner()

    await waitFor(() => expect(shown(T.closedAuthor)).toBe(true))
    expect(await screen.findByText(calls[0]?.text ?? '')).toBeTruthy()
    expect(control(T.launch)).toBeNull()
  })

  it('hides « Lancer un appel » and the composer in a closed corner and says why', async () => {
    restoreWindow = setDesktopWindow()
    mockServer.corner = closed
    mockNav.params = { id, tab: 'feedback' }
    await openCorner(ines.id)

    await waitFor(() => expect(shown(T.closedAuthor)).toBe(true))
    expect(await screen.findByText(containing('Le score repart à zéro au niveau 3.'))).toBeTruthy()
    expect(control(T.launch)).toBeNull()
    expect(screen.queryByLabelText(containing(kit().replyTo(ines.name)))).toBeNull()
  })

  it('offers no « Retirer des testeurs » in a closed corner', async () => {
    mockServer.corner = closed
    await openCorner()
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${testerCount(12)}`) }))
    await screen.findByText(ines.name)

    const menu = screen.queryByRole('button', { name: testerMenu(ines.name) })
    if (menu) await fireEvent.press(menu)
    expect(screen.queryByRole('menuitem', { name: T.remove })).toBeNull()
  })
})

// --- Sur ordinateur, deux colonnes ---

describe('on a wide window', () => {
  beforeEach(() => {
    restoreWindow = setDesktopWindow()
    mockNav.params = { id, tab: 'feedback' }
  })

  it('opens the chosen thread beside the list on a wide window, its row marked as current', async () => {
    await openCorner(ines.id)

    // Le fil d'Inès à droite, la liste des fils à gauche.
    expect(await screen.findByText(containing('Le score repart à zéro au niveau 3.'))).toBeTruthy()
    expect(screen.getAllByText(sam.name).length).toBeGreaterThan(0)
    const row = getControl(new RegExp(`^${ines.name}`))
    expect(row.props['aria-current'] ?? row.props.accessibilityState?.selected).toBeTruthy()
    const other = getControl(new RegExp(`^${sam.name}`))
    expect(
      other.props['aria-current'] ?? other.props.accessibilityState?.selected ?? false,
    ).toBeFalsy()
  })

  it('shows one column until the page is hydrated', async () => {
    mockHydrated = false
    await renderWithProviders(
      <ToastProvider>
        <TestersCornerScreen id={id} member={ines.id} />
      </ToastProvider>,
    )
    await waitFor(() => expect(shown(project.title)).toBe(true))

    // Avant l'hydratation, la page pré-rendue ne sait pas la largeur : pas de fil à côté.
    expect(screen.queryByText(containing('Le score repart à zéro au niveau 3.'))).toBeNull()
  })

  it('keeps a thread settled from the right pane in « À traiter » until the filter changes', async () => {
    const feedback = kit().inesThread('author')[0]
    if (!feedback) throw new Error('a feedback expected')
    // Une fois réglé, l'API ne compte plus Inès dans « À traiter ».
    mockServer.answer('POST', /\/settled$/, () => {
      mockServer.threadPages.open.set('', { items: openThreads.slice(1), nextCursor: null })
      mockServer.threadPages.settled.set('', {
        items: [threadOf(ines, { state: 'settled' }), ...settledThreads],
        nextCursor: null,
      })
      mockServer.counts = { open: 2, settled: 2 }
      return { ok: true, data: null }
    })
    await openCorner(ines.id)
    await screen.findByText(containing(feedback.text ?? ''))

    await chooseInMenu(kit().messageMenu(feedback.text ?? ''), T.settle)

    await waitFor(() => expect(mockServer.received('POST', /\/settled$/)).toHaveLength(1))
    // La ligne d'Inès reste sous le doigt dans « À traiter »…
    expect(getControl(new RegExp(`^${ines.name}`))).toBeTruthy()
    // … jusqu'au changement de filtre.
    await fireEvent.press(screen.getByLabelText(filterName('settled', 2)))
    await waitFor(() =>
      expect(screen.getAllByText(settledThreads[0]?.tester.name ?? '').length).toBeGreaterThan(0),
    )
    await fireEvent.press(screen.getByLabelText(filterName('open', 2)))
    await waitFor(() => expect(control(new RegExp(`^${ines.name}`))).toBeNull())
  })
})

// --- Corrections après les relectures (R7b, K5 à K9) ---

describe('the focus when the last item of a list goes (R7b, K5)', () => {
  it('moves the focus to « Lancer un appel » after deleting the only call', async () => {
    const call = calls[0]
    if (!call) throw new Error('a call expected')
    mockServer.callPages.set('', { items: [call], nextCursor: null })
    await openCorner()
    await screen.findByText(call.text)
    await chooseInMenu(callMenu(call.text), T.callDelete)
    await screen.findByRole('header', { name: T.callDeleteTitle })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.callDeleteConfirm }))

    await waitFor(() => expect(screen.queryByText(call.text)).toBeNull())
    // Plus d'appel après lui ni avant lui : le focus va à l'action qui reste, jamais nulle part.
    await waitFor(() => expect(focused().at(-1)).toBe(T.launch))
  })

  it('moves the focus to « 0 testeur » after removing the only tester', async () => {
    // Inès, seule testeuse.
    mockServer.corner = { ...authorCorner, testers: testers.slice(0, 1), testerCount: 1 }
    await openCorner()
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${testerCount(1)}`) }))
    await screen.findByText(ines.name)
    await chooseInMenu(testerMenu(ines.name), T.remove)
    await screen.findByRole('header', { name: removeTitle(ines.name) })
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.removeConfirm }))

    await waitFor(() => expect(shown(testerCount(0))).toBe(true))
    // Le bouton qui replie la liste, désormais vide, reçoit le focus.
    await waitFor(() => expect(focused().at(-1)).toBe(testerCount(0)))
  })
})

describe('the corner on a wide window, as on the board R7b-Desktop (R7b, K6 to K8)', () => {
  beforeEach(() => {
    restoreWindow = setDesktopWindow()
  })

  it('names the back button after the project on a wide window, without a second link to it', async () => {
    await openCorner()

    // « ‹ Décollage ! » : le titre du projet est le bouton du haut (planche R7b-Desktop).
    expect(getControl(project.title)).toBeTruthy()
    expect(control(/^Retour$/)).toBeNull()
    expect(screen.getAllByText(project.title)).toHaveLength(1)
  })

  it('invites to pick a thread beside the list of the threads, until one is opened', async () => {
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()
    await screen.findByText(ines.name)

    expect(await screen.findByText(fr.t(($) => $.project.testers.thread.choose))).toBeTruthy()
    // Témoin : aucun fil n'est ouvert.
    expect(screen.queryByText(containing('Le score repart à zéro au niveau 3.'))).toBeNull()
  })

  it('opens another thread from its row, asking for the focus on its heading', async () => {
    mockNav.params = { id, tab: 'feedback' }
    await openCorner(ines.id)
    await screen.findByText(containing('Le score repart à zéro au niveau 3.'))

    await fireEvent.press(getControl(new RegExp(`^${sam.name}`)))

    expect(replaced()).toContain(`${cornerPath}/threads/${sam.id}?focus=thread`)
  })

  it('moves the focus to the heading of a thread opened from a row', async () => {
    mockNav.params = { id, member: ines.id, focus: 'thread' }
    await openCorner(ines.id)
    await screen.findByText(containing('Le score repart à zéro au niveau 3.'))

    await waitFor(() => expect(focused().at(-1)).toBe(ines.name))
    // Le paramètre quitte l'adresse : recharger la page ne redéplace pas le focus.
    expect(mockNav.router.setParams).toHaveBeenCalledWith({ focus: undefined })
  })

  it('leaves the focus alone when a thread is opened by its address', async () => {
    mockNav.params = { id, member: ines.id }
    await openCorner(ines.id)
    await screen.findByText(containing('Le score repart à zéro au niveau 3.'))

    expect(focused()).not.toContain(ines.name)
  })

  it('finds a former tester beyond the first page of threads on a wide window', async () => {
    // Un identifiant qui n'est pas dans la liste du coin (t2 à t12 y sont).
    const gone = { id: 'gone-1', name: 'Nina Roux' }
    mockServer.threadPages.open.set('', { items: openThreads, nextCursor: 'p2' })
    mockServer.threadPages.open.set('p2', {
      items: [threadOf(gone, { unread: false }, false)],
      nextCursor: null,
    })
    mockServer.setThread(gone.id, kit().inesThread('author'))
    mockNav.params = { id, tab: 'feedback' }
    await openCorner(gone.id)

    expect(await screen.findByRole('header', { name: gone.name })).toBeTruthy()
    expect(shown(T.listLoadError)).toBe(false)
  })
})

describe('the states of the corner (R7b, K9)', () => {
  it('offers « Retour » when the corner could not load', async () => {
    mockServer.answer('GET', /\/testers$/, () => ({ ok: false, error: 'internal' }))
    await renderWithProviders(<TestersCornerScreen id={id} />)

    await waitFor(() => expect(shown(T.cornerLoadError)).toBe(true))
    expect(getControl(/^Retour$/)).toBeTruthy()
  })

  it('names the thread filter apart from the « Retours » tab', async () => {
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()
    await screen.findByText(ines.name)

    // Le groupe n'est pas `accessible` (ses choix le sont) : on le trouve par son nom.
    const group = screen.getByLabelText(fr.t(($) => $.project.testers.thread.filterLabel))
    expect(group.props.accessibilityRole).toBe('radiogroup')
    // Témoin : « Retours » ne nomme plus que l'onglet.
    expect(
      screen
        .queryAllByLabelText(T.feedback)
        .filter((one) => one.props.accessibilityRole === 'radiogroup'),
    ).toHaveLength(0)
  })

  it('invites the author to wait for feedback when no thread exists yet', async () => {
    mockServer.threadPages.open.set('', { items: [], nextCursor: null })
    mockServer.threadPages.settled.set('', { items: [], nextCursor: null })
    mockServer.counts = { open: 0, settled: 0 }
    mockNav.params = { id, tab: 'feedback' }
    await openCorner()

    await waitFor(() => expect(shown(fr.t(($) => $.project.testers.thread.emptyAuthor))).toBe(true))
    expect(shown(T.emptyOpen)).toBe(false)
  })
})
