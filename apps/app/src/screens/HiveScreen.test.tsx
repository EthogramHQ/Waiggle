// Tests de la page d'une ruche (R10, docs/scenarios/refonte.md, « La page d'une ruche »,
// « Quitter une ruche ») : le haut (« Ma ruche », le nom, « 4 membres », « Inviter » selon le droit),
// les trois onglets et l'adresse (`?tab=`), l'épingle, « … cherche des testeurs » et « Tester » par
// la page d'avertissement, l'actualité, les projets, les membres, le menu « … » (réglages pour
// l'animateur, « Signaler la ruche », « Quitter la ruche »), la fenêtre « Quitter » et qui peut
// ouvrir la page.
//
// Ce que ces tests supposent de l'écran (plan R10, UI-C2, « Ce qui change au plan » 12 à 16 ; à
// corriger si le code en décide autrement) :
// - `HiveScreen({ id })`, monté par `app/hives/[id].tsx` ; il lit GET /v1/hives/<id>, puis
//   l'actualité, les projets et les membres de la ruche ;
// - les onglets sont des `tab` (`ui/Tabs`) ; l'onglet vient de `?tab=activity|projects|members`, lu
//   après `useHydrated()` ; changer d'onglet passe par `router.setParams` ou `router.replace`,
//   jamais par une nouvelle entrée d'historique ;
// - « Tester » passe par `useOpenDemo` (`/out?url=…&project=…`) ; « Signaler la ruche » ouvre
//   `/report?kind=hive&id=<id>` ; « Réglages de la ruche » ouvre `/hives/<id>/settings` ;
// - le reste est dans `Hives.testkit.tsx` (faux serveur, routeur, textes).
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { passTapGuard } from '../testing/dialog'
import { leaMe } from '../testing/fixtures'
import { sevenDaySuspension } from '../testing/moderation'
import { reportsOpened } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { HiveScreen } from './HiveScreen'
import {
  animatorPage,
  biscotte,
  chooseInMenu,
  control,
  fullPage,
  getControl,
  heldReply,
  hiveId,
  hiveServer,
  isSelected,
  lea,
  membersAndInvited,
  membersLeaAnimator,
  membersText,
  memo,
  mockNav,
  myHiveNamed,
  odile,
  pageMenu,
  papiJean,
  pinnedBy,
  planDeTable,
  projectsSpoken,
  pushed,
  quitSuccessor,
  quitTitle,
  readyPage,
  removeNamed,
  removeTitle,
  replaced,
  resetHiveMocks,
  seekingOne,
  shown,
  T,
  tab,
  testNamed,
  visitedPaths,
} from './Hives.testkit'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())
// La page hydratée (web) : un test la laisse « pas encore hydratée » pour l'onglet d'avant.
let mockHydrated = true
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => mockHydrated,
}))

const path = `/hives/${hiveId}`

beforeEach(() => {
  resetHiveMocks(path, { id: hiveId })
  mockHydrated = true
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

/** Ouvre la page de Famille et attend son nom. */
const openHive = async (id = hiveId) => {
  const view = await renderWithProviders(
    <ToastProvider>
      <HiveScreen id={id} />
    </ToastProvider>,
  )
  await waitFor(() => expect(shown(T.tabsLabel) || shown(T.activityTab)).toBe(true))
  return view
}

/** Léa anime la ruche. */
const asAnimator = () => {
  hiveServer.pages.set(hiveId, animatorPage)
  hiveServer.members.set(hiveId, membersLeaAnimator)
}

const MENU = pageMenu('Famille')
const LEAVE = new RegExp(`^/v1/hives/${hiveId}/members/${lea.id}$`)

/** Ouvre la fenêtre « Quitter la ruche Famille ? » par le menu de la page. */
const openQuit = async () => {
  await chooseInMenu(MENU, T.leave)
  await screen.findByRole('header', { name: quitTitle('Famille') })
  await passTapGuard()
}

// --- Le haut ---

describe('the top of a hive page', () => {
  it('reads « Ruche Famille » without « Ma ruche », « 4 membres » and offers « Inviter »', async () => {
    await openHive()

    // R11 (« Moins de mots », U4) : « Ma ruche » quitte l'écran ; le nom lu devient « Ruche Famille ».
    // Le texte est écrit en clair : sa clé disparaîtra avec lui.
    expect(screen.queryByText('Ma ruche')).toBeNull()
    expect(shown(myHiveNamed('Famille'))).toBe(true)
    expect(myHiveNamed('Famille')).toBe('Ruche Famille')
    // Ni la phrase du récap du dimanche (colonne de droite d'ordinateur).
    expect(shown(T.desktopNote)).toBe(false)
    expect(shown('Famille')).toBe(true)
    expect(shown(membersText(4))).toBe(true)
    expect(getControl(T.invite)).not.toBeDisabled()
  })

  it('opens the invite sheet from « Inviter »', async () => {
    await openHive()

    await fireEvent.press(getControl(T.invite))

    expect(visitedPaths()).toContain(`/hives/${hiveId}/invite`)
  })

  it('greys "Inviter" and says why when the hive is full', async () => {
    hiveServer.pages.set(hiveId, fullPage)
    await openHive()

    expect(shown(membersAndInvited(46, 4))).toBe(true)
    expect(getControl(T.invite)).toBeDisabled()
    expect(shown(T.full)).toBe(true)
    await fireEvent.press(getControl(T.invite))
    expect(visitedPaths()).not.toContain(`/hives/${hiveId}/invite`)
  })

  it('says only the animator invites, without an active « Inviter », when they kept that right', async () => {
    hiveServer.pages.set(hiveId, { ...hiveServerPage(), invite: 'animatorOnly' })
    await openHive()

    expect(shown(T.animatorOnly)).toBe(true)
    const invite = control(T.invite)
    if (invite) expect(invite).toBeDisabled()
  })

  it('opens a hive just created on « Ta ruche est prête » and « Inviter des proches »', async () => {
    hiveServer.pages.set(readyPage.summary.id, readyPage)
    mockNav.params = { id: readyPage.summary.id }
    await openHive(readyPage.summary.id)

    await waitFor(() => expect(shown(T.readyTitle)).toBe(true))
    await fireEvent.press(getControl(T.readyAction))
    expect(visitedPaths()).toContain(`/hives/${readyPage.summary.id}/invite`)
  })
})

/** La page de membre d'origine (le faux serveur en garde une copie à chaque test). */
const hiveServerPage = () => {
  const page = hiveServer.pages.get(hiveId)
  if (!page) throw new Error('no page for Famille')
  return page
}

// --- Les onglets et l'adresse ---

describe('the tabs and the address', () => {
  it('shows Actualité, Projets and Membres in a named tab list', async () => {
    await openHive()

    expect(screen.getByLabelText(T.tabsLabel)).toBeTruthy()
    expect(tab(T.activityTab)).toBeTruthy()
    expect(tab(projectsSpoken(5))).toBeTruthy()
    expect(tab(T.membersTab)).toBeTruthy()
  })

  it('reads the projects tab as "Projets, 5 projets"', async () => {
    await openHive()

    expect(screen.getByRole('tab', { name: projectsSpoken(5) })).toBeTruthy()
    // « Projets · 5 » se voit ; à l'oreille, le point médian ne se lit pas.
    expect(shown(fr.t(($) => $.hives.page.projectsCount, { count: 5 }))).toBe(true)
  })

  it('opens the tab given by the address once hydrated, Activité otherwise', async () => {
    // Avant l'hydratation, la page pré-rendue ne sait pas l'adresse : Actualité.
    mockHydrated = false
    mockNav.params = { id: hiveId, tab: 'members' }
    const view = await openHive()
    await waitFor(() => expect(tab(T.activityTab)).toBeTruthy())
    expect(isSelected(T.activityTab)).toBe(true)
    expect(isSelected(T.membersTab)).toBe(false)

    // Une fois hydratée, l'onglet de l'adresse.
    mockHydrated = true
    await view.rerender(
      <ToastProvider>
        <HiveScreen id={hiveId} />
      </ToastProvider>,
    )
    await waitFor(() => expect(isSelected(T.membersTab)).toBe(true))
  })

  it('opens Actualité for an unknown tab in the address', async () => {
    mockNav.params = { id: hiveId, tab: 'nimporte' }
    await openHive()

    await waitFor(() => expect(isSelected(T.activityTab)).toBe(true))
  })

  it('changes tab without a history entry', async () => {
    await openHive()

    await fireEvent.press(tab(projectsSpoken(5)))

    await waitFor(() => expect(isSelected(projectsSpoken(5))).toBe(true))
    const setParams = mockNav.router.setParams.mock.calls.map(([params]) => params)
    expect(
      setParams.some((params) => params?.tab === 'projects') ||
        replaced().some((one) => one.includes('tab=projects')),
    ).toBe(true)
    expect(pushed()).toEqual([])
  })
})

// --- L'épingle, les testeurs, l'actualité, les projets ---

describe('the content of the hive', () => {
  it('shows the pinned project first, with « Épinglé par Papi Jean »', async () => {
    await openHive()

    expect(shown(pinnedBy(papiJean.name))).toBe(true)
    expect(shown(planDeTable.title)).toBe(true)
  })

  it('shows « Papi Jean cherche des testeurs » with the project that calls for testers', async () => {
    await openHive()

    expect(shown(seekingOne(papiJean.name))).toBe(true)
    expect(shown(memo.title)).toBe(true)
  })

  it('sends "Tester" through the outside-link warning', async () => {
    await openHive()

    await fireEvent.press(getControl(testNamed(memo.title)))

    const out = pushed().filter((one) => one.startsWith('/out'))
    expect(out).toHaveLength(1)
    const params = new URLSearchParams(out[0]?.slice('/out?'.length))
    expect(params.get('url')).toBe(memo.demoUrl)
    expect(params.get('project')).toBe(memo.id)
  })

  it('lists the activity of the members, with « Réservé à Famille » on a reserved project', async () => {
    await openHive()

    await waitFor(() => expect(shown(biscotte.title)).toBe(true))
    expect(shown(fr.t(($) => $.hives.page.reserved, { hive: 'Famille' }))).toBe(true)
  })

  it('shows the projects reserved to the hive in the projects tab', async () => {
    await openHive()

    await fireEvent.press(tab(projectsSpoken(5)))

    await waitFor(() =>
      expect(hiveServer.received('GET', /\/v1\/hives\/[^/]+\/projects$/)).not.toHaveLength(0),
    )
    expect(shown(planDeTable.title)).toBe(true)
    expect(shown(biscotte.title)).toBe(true)
  })

  it('says the hive could not load when the API fails', async () => {
    hiveServer.answer('GET', new RegExp(`^/v1/hives/${hiveId}$`), () => ({
      status: 500,
      body: { error: { code: 'internal', message: 'x' } },
    }))
    await renderWithProviders(<HiveScreen id={hiveId} />)

    await waitFor(() => expect(shown(fr.t(($) => $.hives.page.loadError))).toBe(true))
  })
})

// --- Les membres ---

describe('the members tab', () => {
  const openMembers = async () => {
    mockNav.params = { id: hiveId, tab: 'members' }
    await openHive()
    await waitFor(() => expect(isSelected(T.membersTab)).toBe(true))
    await waitFor(() => expect(shown(odile.name)).toBe(true))
  }

  it('lists the members with « Animateur » and without « toi », the phrase of the animator and « Inviter un proche »', async () => {
    await openMembers()

    expect(shown(papiJean.name)).toBe(true)
    expect(shown(fr.t(($) => $.hives.page.animator))).toBe(true)
    // R11 (« Moins de mots ») : la ligne du membre se reconnaît à son nom et sa photo ; « toi » et
    // « @pseudo · toi » quittent l'écran (textes en clair : leurs clés disparaîtront avec eux).
    expect(screen.queryByText('toi')).toBeNull()
    expect(screen.queryByText(/·\s*toi$/)).toBeNull()
    expect(shown(T.membersPhrase)).toBe(true)
    expect(getControl(T.inviteOne)).toBeTruthy()
  })

  it('offers « Ne pas me proposer aux autres » and « Quitter la ruche » at the bottom', async () => {
    await openMembers()

    expect(screen.getByRole('switch', { name: T.hideFromSuggestions })).toBeTruthy()
    expect(getControl(T.leave)).toBeTruthy()
  })

  it('offers no « Retirer » to a member who does not animate the hive', async () => {
    await openMembers()

    expect(control(removeNamed(odile.name))).toBeNull()
  })

  it('lets the animator remove a member after a confirmation', async () => {
    asAnimator()
    await openMembers()

    await fireEvent.press(getControl(removeNamed(odile.name)))
    expect(await screen.findByRole('header', { name: removeTitle(odile.name) })).toBeTruthy()
    expect(shown(T.removeBody)).toBe(true)
    // Rien ne part avant la confirmation.
    const REMOVE = new RegExp(`^/v1/hives/${hiveId}/members/${odile.id}$`)
    expect(hiveServer.received('DELETE', REMOVE)).toHaveLength(0)
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.remove }))

    await waitFor(() => expect(hiveServer.received('DELETE', REMOVE)).toHaveLength(1))
  })

  // R10 (plan, « À couvrir par un test plus tard ») : l'API refuse à un compte suspendu d'inviter,
  // de retirer un membre et d'épingler (403 `suspended`) ; la page ne les propose donc pas, comme
  // les autres écrans retirent les actions d'un compte suspendu (`useSuspension`).
  it('hides invite, remove and pin from a suspended animator', async () => {
    asAnimator()
    hiveServer.me = { ...leaMe, suspension: sevenDaySuspension }
    await openMembers()
    await waitFor(() => expect(hiveServer.received('GET', /^\/v1\/me$/)).not.toHaveLength(0))

    await waitFor(() => expect(control(removeNamed(odile.name))).toBeNull())
    expect(control(T.inviteOne)).toBeNull()
    expect(control(T.invite)).toBeNull()
    // Témoin : quitter la ruche reste permis à un compte suspendu.
    expect(getControl(T.leave)).toBeTruthy()

    await fireEvent.press(tab(projectsSpoken(5)))
    await waitFor(() => expect(shown(biscotte.title)).toBe(true))
    expect(control(fr.t(($) => $.hives.page.projectMenu, { title: biscotte.title }))).toBeNull()
  })
})

// --- Le menu de la page ---

describe('the menu of the page', () => {
  it('opens the report sheet for the hive from the page menu', async () => {
    await openHive()

    await chooseInMenu(MENU, T.report)

    expect(reportsOpened(mockNav.router.push, mockNav.router.navigate)).toEqual([
      expect.objectContaining({ kind: 'hive', id: hiveId }),
    ])
  })

  it('lists the hive settings in the page menu for the animator only', async () => {
    asAnimator()
    await openHive()

    await chooseInMenu(MENU, T.settings)
    expect(visitedPaths()).toContain(`/hives/${hiveId}/settings`)
  })

  it('never lists the hive settings in the page menu of a simple member', async () => {
    // Témoin : le menu a « Signaler la ruche ».
    await openHive()
    await fireEvent.press(screen.getByRole('button', { name: MENU }))
    expect(await screen.findByRole('menuitem', { name: T.report })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: T.settings })).toBeNull()
  })
})

// --- Quitter la ruche ---

describe('leaving the hive', () => {
  it('asks before leaving: reserved projects become private', async () => {
    await openHive()
    await openQuit()

    expect(shown(T.quitBody)).toBe(true)
    expect(hiveServer.received('DELETE', LEAVE)).toHaveLength(0)
  })

  it('tells a member leaving a hive that their comments on its reserved projects stay readable', async () => {
    await openHive()
    await openQuit()

    expect(shown(T.quitComments)).toBe(true)
  })

  it('tells the animator who will take over before leaving', async () => {
    asAnimator()
    await openHive()
    await openQuit()

    expect(shown(quitSuccessor(papiJean.name))).toBe(true)
    expect(shown(T.quitLast)).toBe(false)
  })

  it('tells the last member that leaving deletes the hive', async () => {
    hiveServer.pages.set(readyPage.summary.id, readyPage)
    mockNav.params = { id: readyPage.summary.id }
    await openHive(readyPage.summary.id)
    await chooseInMenu(pageMenu('Famille'), T.leave)
    await screen.findByRole('header', { name: quitTitle('Famille') })

    expect(shown(T.quitLast)).toBe(true)
  })

  it('leaves once on a double tap, then leaves the page', async () => {
    const held = heldReply()
    hiveServer.answer('DELETE', LEAVE, () => held.reply)
    await openHive()
    await openQuit()

    await fireEvent.press(screen.getByRole('button', { name: T.quit }))
    await fireEvent.press(screen.getByRole('button', { name: T.quit }))
    expect(hiveServer.received('DELETE', LEAVE)).toHaveLength(1)

    await held.release({ status: 204 })
    await waitFor(() => expect(visitedPaths()).toContain('/hives'))
  })
})

// --- Qui peut ouvrir la page ---

describe('who can open the page', () => {
  it('answers like a page that does not exist to a member who is not in the hive', async () => {
    hiveServer.pages.delete(hiveId)
    await renderWithProviders(<HiveScreen id={hiveId} />)

    await waitFor(() => expect(shown(T.notFound)).toBe(true))
    // Témoin : rien de la ruche ne paraît, ni ses onglets ni ses membres.
    expect(screen.queryByRole('tab', { name: T.activityTab })).toBeNull()
    expect(shown(odile.name)).toBe(false)
  })
})
