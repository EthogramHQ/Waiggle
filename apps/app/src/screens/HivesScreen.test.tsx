// Tests de l'onglet Ruches (R10, docs/scenarios/refonte.md, « L'onglet Ruches ») : « Mes ruches »
// remplace « Les ruches arrivent bientôt » (la page d'avant R10 disparaît, « Ménage ») ; chaque
// ruche a sa ligne, nommée « Famille, 4 membres, animée par Papi Jean, 2 nouveautés » ; les
// invitations reçues au-dessus, avec « Rejoindre la ruche » et « Refuser » ; l'état vide avec la
// mascotte ; « Créer une ruche » en haut, grisé avec sa raison au-delà des limites, absent pour un
// membre suspendu ; l'invitation qui n'est plus valable.
//
// Ce que ces tests supposent de l'écran (plan R10, UI-C1 ; à corriger si le code en décide
// autrement) : `HivesScreen()`, monté par `app/hives.tsx`, lit GET /v1/hives ; une ligne ouvre
// `/hives/<id>` ; « Créer une ruche » ouvre `/hives/new` ; accepter ouvre la page de la ruche. Le
// reste est dans `Hives.testkit.tsx` (faux serveur, routeur, textes).
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { suspendedMe } from '../testing/fixtures'
import { reportsOpened } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import {
  acceptNamed,
  amis,
  atelierId,
  control,
  famille,
  getControl,
  heldReply,
  hiveServer,
  invitationId,
  invitationLine,
  invitationMore,
  invitationReport,
  lea,
  manyHives,
  mockNav,
  nora,
  refusal,
  refuseNamed,
  resetHiveMocks,
  rowName,
  shown,
  T,
  visitedPaths,
} from './Hives.testkit'
import { HivesScreen } from './HivesScreen'

const kit = () => require('./Hives.testkit') as typeof import('./Hives.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses tests (TopNav.test.tsx) : ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())

beforeEach(() => {
  resetHiveMocks('/hives')
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

const ACCEPT = new RegExp(`^/v1/hive-invitations/${invitationId}/accept$`)
const REFUSE = new RegExp(`^/v1/hive-invitations/${invitationId}$`)

/**
 * Ouvre l'onglet et attend la fin du chargement : « Mes ruches », les invitations ou l'état vide.
 * R11 (« Moins de mots ») : la phrase des ruches ne reste que sous l'état vide.
 */
const openTab = async () => {
  const view = await renderWithProviders(
    <ToastProvider>
      <HivesScreen />
    </ToastProvider>,
  )
  await waitFor(() =>
    expect(shown(T.mine) || shown(T.invitationsTitle) || shown(T.emptyTitle)).toBe(true),
  )
  return view
}

/** Les lignes de ruches de la page, dans l'ordre de lecture (par leur nom lu). */
const rowsInOrder = () =>
  screen
    .queryAllByRole('link')
    .map((node) => String(node.props.accessibilityLabel ?? node.props['aria-label'] ?? ''))
    .filter((name) => / membres?, /.test(name))

const acceptButton = () => screen.getByRole('button', { name: acceptNamed('Atelier IA') })
const refuseButton = () => screen.getByRole('button', { name: refuseNamed(nora.name) })

// --- Mes ruches ---

describe('my hives', () => {
  it('shows « Mes ruches » with no sentence under the title, never the coming-soon page', async () => {
    await openTab()

    expect(shown(T.mine)).toBe(true)
    // R11 (« Moins de mots ») : plus de sous-titre sous « Ruches » quand le membre en a.
    expect(shown(T.intro)).toBe(false)
    // « Les ruches arrivent bientôt » a disparu : aucun état « bientôt » ni mascotte qui fait coucou
    // quand on a des ruches.
    expect(
      screen.queryAllByLabelText(
        fr.t(($) => $.mascot.wave),
        { includeHiddenElements: true },
      ),
    ).toHaveLength(0)
    expect(hiveServer.received('GET', /^\/v1\/hives$/)).not.toHaveLength(0)
  })

  it('reads "Famille, 4 membres, animée par Papi Jean, 2 nouveautés" on its row, and "rien de neuf" for a calm hive', async () => {
    await openTab()

    expect(screen.getByRole('link', { name: rowName(famille) })).toBeTruthy()
    expect(screen.getByRole('link', { name: rowName(amis) })).toBeTruthy()
    expect(rowName(amis)).toContain(fr.t(($) => $.hives.newsNone))
  })

  it('keeps the order of the API, from the most recently active hive to the calmest', async () => {
    hiveServer.mine = { ...hiveServer.mine, hives: [amis, famille] }
    await openTab()

    expect(rowsInOrder()).toEqual([rowName(amis), rowName(famille)])
  })

  it('opens the page of a hive from its row', async () => {
    await openTab()

    await fireEvent.press(screen.getByRole('link', { name: rowName(famille) }))

    expect(visitedPaths()).toContain(`/hives/${famille.id}`)
  })

  it('puts « Créer une ruche » above the hives, and opens the create sheet', async () => {
    await openTab()

    const create = getControl(T.create)
    const page = JSON.stringify(screen.toJSON())
    expect(page.indexOf(T.create)).toBeLessThan(page.indexOf(famille.name ?? ''))
    await fireEvent.press(create)

    expect(visitedPaths()).toContain('/hives/new')
  })

  it('says the hives could not load, without showing an empty tab', async () => {
    hiveServer.answer('GET', /^\/v1\/hives$/, () => refusal(500, 'internal'))
    await renderWithProviders(<HivesScreen />)

    await waitFor(() => expect(shown(T.loadError)).toBe(true))
    expect(shown(T.emptyTitle)).toBe(false)
  })
})

// --- Les invitations reçues ---

describe('the invitations received', () => {
  it('shows « Invitations » with their number above the hives', async () => {
    await openTab()

    expect(shown(T.invitationsTitle)).toBe(true)
    expect(shown(fr.t(($) => $.hives.invitations.count, { count: 1 }))).toBe(true)
    const page = JSON.stringify(screen.toJSON())
    expect(page.indexOf(T.invitationsTitle)).toBeLessThan(page.indexOf(famille.name ?? ''))
  })

  it('says « Nora Benali t’invite dans la ruche Atelier IA », with its two buttons and « Refuser ne prévient personne. »', async () => {
    await openTab()

    expect(shown(invitationLine(nora.name, 'Atelier IA'))).toBe(true)
    expect(acceptButton()).toBeTruthy()
    expect(refuseButton()).toBeTruthy()
    expect(shown(T.refuseHint)).toBe(true)
  })

  it('joins the hive, then opens its page', async () => {
    await openTab()

    await fireEvent.press(acceptButton())

    await waitFor(() => expect(hiveServer.received('POST', ACCEPT)).toHaveLength(1))
    await waitFor(() => expect(visitedPaths()).toContain(`/hives/${atelierId}`))
  })

  it('accepts once on a double tap', async () => {
    const held = heldReply()
    hiveServer.answer('POST', ACCEPT, () => held.reply)
    await openTab()

    await fireEvent.press(acceptButton())
    await fireEvent.press(acceptButton())

    expect(hiveServer.received('POST', ACCEPT)).toHaveLength(1)
    await held.release(refusal(500, 'internal'))
  })

  it('refuses without telling anyone, and keeps the invitation in place with « Invitation refusée. »', async () => {
    await openTab()

    await fireEvent.press(refuseButton())

    await waitFor(() => expect(hiveServer.received('DELETE', REFUSE)).toHaveLength(1))
    await waitFor(() => expect(shown(T.refused)).toBe(true))
    // Refuser n'ouvre rien et n'emmène nulle part.
    expect(visitedPaths()).toEqual([])
  })

  it('refuses once on a double tap', async () => {
    const held = heldReply()
    hiveServer.answer('DELETE', REFUSE, () => held.reply)
    await openTab()

    await fireEvent.press(refuseButton())
    await fireEvent.press(refuseButton())

    expect(hiveServer.received('DELETE', REFUSE)).toHaveLength(1)
    await held.release({ status: 204 })
  })

  it('says an expired invitation is no longer valid, with "Fermer"', async () => {
    hiveServer.answer('POST', ACCEPT, () => refusal(410, 'invitation_expired'))
    await openTab()

    await fireEvent.press(acceptButton())

    await waitFor(() => expect(shown(T.expiredTitle)).toBe(true))
    expect(shown(T.expired)).toBe(true)
    expect(getControl(T.close)).toBeTruthy()
    // Elle n'ouvre pas la page d'une ruche qui n'en veut plus.
    expect(visitedPaths()).not.toContain(`/hives/${atelierId}`)
  })

  it('opens the report sheet for the hive from the menu of an invitation', async () => {
    await openTab()

    await fireEvent.press(screen.getByRole('button', { name: invitationMore('Atelier IA') }))
    await fireEvent.press(
      await screen.findByRole('menuitem', { name: invitationReport('Atelier IA') }),
    )

    expect(reportsOpened(mockNav.router.push, mockNav.router.navigate)).toEqual([
      expect.objectContaining({ kind: 'hive', id: atelierId }),
    ])
  })
})

// --- Aucune ruche ---

describe('a member without any hive', () => {
  it('shows the mascot, the sentence that explains hives and « Créer une ruche »', async () => {
    hiveServer.mine = { hives: [], invitations: [], createdCount: 0 }
    await openTab()

    expect(screen.getAllByLabelText(/abeille/i, { includeHiddenElements: true })).not.toHaveLength(
      0,
    )
    expect(shown(T.intro)).toBe(true)
    expect(getControl(T.create)).toBeTruthy()
    // Ni ligne de ruche ni partie « Invitations ».
    expect(rowsInOrder()).toEqual([])
    expect(shown(T.invitationsTitle)).toBe(false)
  })
})

// --- Les limites ---

describe('the limits of « Créer une ruche »', () => {
  it('disables "Créer une ruche" and says why after 10 created hives', async () => {
    hiveServer.mine = {
      hives: manyHives(10, 'animator'),
      invitations: [],
      createdCount: 10,
    }
    await openTab()

    expect(getControl(T.create)).toBeDisabled()
    expect(shown(T.createdLimit)).toBe(true)
    await fireEvent.press(getControl(T.create))
    expect(visitedPaths()).not.toContain('/hives/new')
  })

  it('disables « Créer une ruche » and says why once a member is in 20 hives', async () => {
    hiveServer.mine = { hives: manyHives(20), invitations: [], createdCount: 0 }
    await openTab()

    expect(getControl(T.create)).toBeDisabled()
    expect(shown(T.joinedLimit)).toBe(true)
  })

  it('keeps « Créer une ruche » available under the limits (témoin)', async () => {
    await openTab()

    expect(getControl(T.create)).not.toBeDisabled()
    expect(shown(T.createdLimit)).toBe(false)
    expect(shown(T.joinedLimit)).toBe(false)
  })

  it('never shows « Créer une ruche » to a suspended member', async () => {
    hiveServer.me = suspendedMe
    await openTab()
    // Témoin : la page est là, ses ruches aussi.
    expect(screen.getByRole('link', { name: rowName(famille) })).toBeTruthy()

    await waitFor(() => expect(hiveServer.received('GET', /^\/v1\/me$/)).not.toHaveLength(0))
    await act(async () => {})
    expect(control(T.create)).toBeNull()
  })
})
